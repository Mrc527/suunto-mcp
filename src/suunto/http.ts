/**
 * The HTTP layer of every Suunto data request: headers, a timeout, a few tries with backoff, size
 * limits, and errors that are safe to show (never a token, a key or a secret).
 *
 * Rules (docs/DESIGN.md section 4):
 * - every request sends Authorization: Bearer <access token>, Ocp-Apim-Subscription-Key, Accept
 *   and User-Agent suunto-mcp/<version>;
 * - HTTP 401: refresh the access token once and send the request once more (Suunto did not handle
 *   it). A 401 that is about the subscription key (an operator problem) or a rate limit is not a
 *   sign-in problem: no refresh;
 * - rate limits (429, 403 with a quota text or a Retry-After header, 401 with "RateLimitExceeded")
 *   become one error kind, "rate_limit", with the wait from Retry-After or the quota text when
 *   there is one;
 * - reads (GET) are tried again on HTTP 429, 502, 503 and 504 and on a broken connection (also
 *   while the answer is read), at most 3 tries, with backoff. Never on HTTP 500: Suunto answers a
 *   wrong workout key with 500, and every try counts against the call limit. Retry-After is
 *   honoured up to 30 s; a longer wait is not worth it, so the error comes at once. A 429 without
 *   Retry-After is not tried again either: a per-minute limit does not clear in a second;
 * - a read that timed out is tried again at most once (the request reached Suunto and counted),
 *   and never when the request says so (the FIT export: its timeout is long already);
 * - the optional CallLimiter is asked before every data request that is sent, retries included;
 * - writes are never sent again once they may have reached Suunto (a route would be added twice).
 *   A write without a clear answer fails with UnconfirmedWriteError ("check before you try
 *   again"). Only a connection that never opened is tried again;
 * - answers have a size limit (JSON 30 MB, binary 20 MB, text 5 MB by default).
 */

import { NotFoundError, redact, UnconfirmedWriteError, UserFacingError } from "../util/errors.js";
import { VERSION } from "../version.js";
import type { SuuntoEndpoints } from "./endpoints.js";
import type { CallLimiter } from "./limiter.js";

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_TRIES = 3;
/** The longest Retry-After we wait for. A longer one fails at once. */
export const MAX_RETRY_AFTER_MS = 30_000;
export const USER_AGENT = `suunto-mcp/${VERSION}`;

export const MAX_JSON_BYTES = 30 * 1024 * 1024;
export const MAX_BINARY_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_BYTES = 5 * 1024 * 1024;
/** How much of an error answer is read (enough for any error text). */
const MAX_ERROR_BYTES = 64 * 1024;

/**
 * Statuses a read is tried again on: Suunto (or its gateway) did not handle the request. Not 500:
 * Suunto answers a wrong workout key with 500, so a retry would only spend calls.
 */
const RETRY_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

/** rate_limit: Suunto's call limit for this service is reached (never a sign-in problem). */
export type SuuntoHttpErrorKind = "http" | "timeout" | "network" | "too_large" | "api" | "rate_limit";

/** A Suunto request that failed. The message is safe to show. */
export class SuuntoHttpError extends UserFacingError {
  readonly kind: SuuntoHttpErrorKind;
  /** HTTP status, when Suunto answered. */
  readonly status?: number;
  /** False when the request certainly never left this server. */
  readonly sent: boolean;

  constructor(kind: SuuntoHttpErrorKind, message: string, opts: { status?: number; sent?: boolean; cause?: unknown } = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "SuuntoHttpError";
    this.kind = kind;
    if (opts.status !== undefined) this.status = opts.status;
    this.sent = opts.sent ?? true;
  }
}

/** HTTP 404 from Suunto (a workout key or route id that does not exist). */
export class SuuntoNotFoundError extends NotFoundError {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "SuuntoNotFoundError";
  }
}

// ---------------------------------------------------------------------------------------------
// Low-level helpers (also used by oauth.ts)
// ---------------------------------------------------------------------------------------------

/** Error codes of a connection that was never opened: the request did not leave this server. */
const NOT_SENT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_NONAME",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EADDRNOTAVAIL",
  "UND_ERR_CONNECT_TIMEOUT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

function errorCodes(error: unknown, depth = 0): string[] {
  if (!error || typeof error !== "object" || depth > 4) return [];
  const e = error as { code?: unknown; cause?: unknown; errors?: unknown };
  const out: string[] = [];
  if (typeof e.code === "string") out.push(e.code);
  if (e.cause) out.push(...errorCodes(e.cause, depth + 1));
  if (Array.isArray(e.errors)) for (const inner of e.errors) out.push(...errorCodes(inner, depth + 1));
  return out;
}

/** True when a fetch error happened before anything was sent (the connection never opened). */
export function failedBeforeSending(error: unknown): boolean {
  const codes = errorCodes(error);
  return codes.length > 0 && codes.every((c) => NOT_SENT_CODES.has(c));
}

/** True for a fetch error caused by the timeout. */
export function isTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" || errorCodes(error).includes("UND_ERR_HEADERS_TIMEOUT");
}

export const realSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Backoff before try `attempt + 1`: base, 3 x base, 9 x base, plus a little jitter. */
export function backoff(base: number, attempt: number): number {
  if (base <= 0) return 0;
  const step = base * 3 ** (attempt - 1);
  return Math.round(step + Math.random() * (base / 2));
}

/** A wait for a message: "40 seconds", "3 minutes", "5 hours", "2 days". */
export function formatWait(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s <= 90) return s === 1 ? "1 second" : `${s} seconds`;
  const m = Math.ceil(s / 60);
  if (m < 120) return `${m} minutes`;
  const h = Math.ceil(m / 60);
  if (h < 48) return `${h} hours`;
  return `${Math.ceil(h / 24)} days`;
}

/**
 * The wait in an Azure API Management quota text ("Quota will be replenished in 1.02:03:04" or
 * "in 02:03:04"), in ms, or undefined.
 */
export function quotaWaitMs(text: string): number | undefined {
  const m = text.match(/replenished in (?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})/i);
  if (!m) return undefined;
  const [days, hours, minutes, seconds] = [m[1] ?? "0", m[2]!, m[3]!, m[4]!].map(Number) as [number, number, number, number];
  return (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
}

/** The Retry-After of an answer in ms (seconds or an HTTP date), or undefined. Not capped. */
export function retryAfterMs(res: Response, now: number = Date.now()): number | undefined {
  const value = res.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 1000);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, at - now);
  return undefined;
}

/** Throw the body away (frees the connection). */
export async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // Nothing to do: the body is thrown away anyway.
  }
}

/** Read a response body as text, never throwing (an empty string when it cannot be read). */
export async function readText(res: Response, maxBytes = MAX_ERROR_BYTES): Promise<string> {
  try {
    return (await readBytes(res, maxBytes, true)).toString("utf8");
  } catch {
    return "";
  }
}

/** Parse JSON text, or undefined when it is not JSON. */
export function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

class TooLarge extends Error {}

/**
 * Read a body up to `maxBytes`. With `truncate`, a longer body is cut; without, it throws
 * TooLarge (the caller turns it into a clear error). The limit protects the server's memory.
 */
async function readBytes(res: Response, maxBytes: number, truncate: boolean): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length"));
  if (!truncate && Number.isFinite(declared) && declared > maxBytes) {
    await discard(res);
    throw new TooLarge();
  }
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    if (total + chunk.length > maxBytes) {
      chunks.push(chunk.subarray(0, maxBytes - total));
      total = maxBytes;
      try {
        await reader.cancel();
      } catch {
        // The rest is not needed.
      }
      if (!truncate) throw new TooLarge();
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return Buffer.concat(chunks, total);
}

/** A short, single-line piece of text for an error message. */
export function snippet(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
}

/**
 * Suunto's own short error text of an error answer: JSON {error:{description}},
 * {error_description}, {message}, {error} (a string) or {errors:[{message}]}; plain text that is
 * not HTML. Undefined when there is none.
 */
export function errorText(body: string): string | undefined {
  const json = parseJson(body);
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const o = json as Record<string, unknown>;
    const err = o.error;
    if (err && typeof err === "object" && !Array.isArray(err)) {
      const e = err as Record<string, unknown>;
      const text = [e.description, e.message, e.code].find((v): v is string => typeof v === "string" && v.trim() !== "");
      if (text) return text;
    }
    for (const value of [o.error_description, o.message, o.Message, o.error, o.title, o.detail]) {
      if (typeof value === "string" && value.trim()) return value;
    }
    if (Array.isArray(o.errors)) {
      const first = o.errors.find((e): e is { message: string } => !!e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string");
      if (first) return first.message;
    }
    return undefined;
  }
  if (typeof json === "string" && json.trim()) return json;
  const text = body.trim();
  if (!text || text.startsWith("<") || json !== undefined) return undefined;
  return text;
}

// ---------------------------------------------------------------------------------------------
// The request helper
// ---------------------------------------------------------------------------------------------

/** What the HTTP layer needs from the session (SuuntoSession has it all). */
export interface AccessTokenSource {
  accessToken(): Promise<string>;
  refreshNow(staleToken?: string): Promise<string>;
  /** The current tokens, so they can be masked in error messages. */
  readonly storedTokens?: { refreshToken?: string; accessToken?: string };
  /** The sentence that tells the user how to connect Suunto again. */
  readonly connectAgain?: string;
}

export interface SuuntoHttpOptions {
  session: AccessTokenSource;
  /** The subscription key is sent; the client secret is only masked in errors. */
  keys: { subscriptionKey: string; clientSecret?: string };
  endpoints: Pick<SuuntoEndpoints, "apiUrl">;
  fetch?: typeof fetch;
  /** Per try. Default 20 s. */
  timeoutMs?: number;
  /** Tries in all for reads, default 3. */
  tries?: number;
  /** First backoff step in ms (default 500); it triples on each try. Tests use 0. */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (m: string) => void;
  now?: () => number;
  /** Asked before every data request that is sent (retries included). */
  limiter?: CallLimiter;
  /** The key of the limiter's daily limit (the user id). */
  limiterKey?: string;
}

export type ResponseType = "json" | "text" | "binary";

export interface SuuntoRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Path below the API base, starting with "/". Path segments must be URL-encoded already. */
  path: string;
  /** Query parameters; undefined and null values are left out. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** A string or a Buffer is sent as it is (set contentType); anything else as JSON. */
  body?: unknown;
  contentType?: string;
  /** More headers (they cannot replace Authorization or the subscription key). */
  headers?: Record<string, string>;
  /** How to read the answer. Default json. */
  responseType?: ResponseType;
  /** Accept header. Default from responseType. */
  accept?: string;
  /** Size limit of the answer. Default by responseType. */
  maxBytes?: number;
  /** Per try. Default the client's timeout. */
  timeoutMs?: number;
  /** What the request is about, for messages, for example "the workout list". */
  what?: string;
  /** Message for HTTP 404. */
  notFound?: string;
  /** A sentence added to the message of an HTTP 500 (for example: a wrong workout key gives 500). */
  serverErrorHint?: string;
  /** False: a read that timed out is not sent again (default: once). */
  retryOnTimeout?: boolean;
}

/** What send() returns: the answer, and the body of a 2xx read (read inside the retry rules). */
interface Answer {
  res: Response;
  bytes?: Buffer;
}

const isSuccess = (status: number): boolean => status >= 200 && status < 300;

export interface SuuntoResponse {
  status: number;
  headers: Headers;
  /** Lowercase media type without parameters, "" when there is none. */
  contentType: string;
  bytes: Buffer;
}

const SAFE_HEADER = /^[A-Za-z0-9-]+$/;
const RESERVED_HEADERS = new Set(["authorization", "ocp-apim-subscription-key", "user-agent", "host", "content-length"]);

function defaultAccept(type: ResponseType): string {
  if (type === "binary") return "application/octet-stream";
  if (type === "text") return "text/plain, */*";
  return "application/json";
}

function defaultMax(type: ResponseType): number {
  if (type === "binary") return MAX_BINARY_BYTES;
  if (type === "text") return MAX_TEXT_BYTES;
  return MAX_JSON_BYTES;
}

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${Math.round(mb * 10) / 10} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Messages that mean the subscription key (not the user's sign-in) was refused. */
const KEY_PROBLEM = /subscription key|subscription-key|ocp-apim/i;
/** Texts of the API gateway when the app's call quota or rate limit is used up (403 and 401). */
const RATE_LIMIT_TEXT = /quota|rate ?limit|call volume/i;

export class SuuntoHttp {
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly opts: SuuntoHttpOptions) {
    this.doFetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? realSleep;
    this.now = opts.now ?? Date.now;
  }

  /** Send a request; answers other than 2xx become errors. JSON is undefined for an empty or non-JSON body. */
  async json(req: SuuntoRequest): Promise<{ status: number; json: unknown; text: string; contentType: string }> {
    const res = await this.request({ ...req, responseType: req.responseType ?? "json" });
    const text = res.bytes.toString("utf8");
    return { status: res.status, json: parseJson(text), text, contentType: res.contentType };
  }

  async text(req: SuuntoRequest): Promise<{ status: number; text: string; contentType: string }> {
    const res = await this.request({ ...req, responseType: "text" });
    return { status: res.status, text: res.bytes.toString("utf8"), contentType: res.contentType };
  }

  async binary(req: SuuntoRequest): Promise<{ status: number; data: Buffer; contentType: string }> {
    const res = await this.request({ ...req, responseType: "binary" });
    return { status: res.status, data: res.bytes, contentType: res.contentType };
  }

  /** The full URL of a request (exported for tests and logs; it holds no secret). */
  url(req: Pick<SuuntoRequest, "path" | "query">): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query ?? {})) {
      if (value === undefined || value === null) continue;
      params.set(key, String(value));
    }
    // Lists (extensions, activities) are documented with plain commas: keep them readable.
    const qs = params.toString().replace(/%2C/gi, ",");
    return `${this.opts.endpoints.apiUrl}${req.path}${qs ? `?${qs}` : ""}`;
  }

  /** Send a request with the rules at the top of this file. Returns a 2xx answer or throws. */
  async request(req: SuuntoRequest): Promise<SuuntoResponse> {
    const session = this.opts.session;
    const first = await session.accessToken();
    let answer = await this.send(req, first);
    if (answer.res.status === 401) {
      const body = await readText(answer.res);
      if (KEY_PROBLEM.test(body)) throw this.keyRefused();
      // The gateway sometimes answers a rate limit with 401: a new token would not help.
      if (RATE_LIMIT_TEXT.test(body)) throw this.rateLimited(answer.res, body);
      // The token may have expired early or been revoked: refresh once and try once more.
      const fresh = await session.refreshNow(first);
      answer = await this.send(req, fresh);
      if (answer.res.status === 401) {
        const again = await readText(answer.res);
        if (KEY_PROBLEM.test(again)) throw this.keyRefused();
        if (RATE_LIMIT_TEXT.test(again)) throw this.rateLimited(answer.res, again);
        throw new SuuntoHttpError("http", `Suunto refused the sign-in. ${session.connectAgain ?? "Connect Suunto again."}`, { status: 401 });
      }
    }
    return this.finish(req, answer);
  }

  /**
   * Suunto's call limit for this service is reached (429, 403 with a quota text or Retry-After,
   * 401 with "RateLimitExceeded"). Never a sign-in problem: the tokens stay as they are.
   */
  private rateLimited(res: Response, body: string): SuuntoHttpError {
    const wait = retryAfterMs(res, this.now()) ?? quotaWaitMs(body);
    const when = wait !== undefined ? `Try again in ${formatWait(wait)}.` : "Try again later.";
    return new SuuntoHttpError("rate_limit", `Suunto's call limit for this service is reached (HTTP ${res.status}). ${when}`, { status: res.status });
  }

  private secrets(): string[] {
    const t = this.opts.session.storedTokens;
    return [this.opts.keys.subscriptionKey, this.opts.keys.clientSecret ?? "", t?.accessToken ?? "", t?.refreshToken ?? ""].filter((s) => s.length > 0);
  }

  private keyRefused(): SuuntoHttpError {
    return new SuuntoHttpError(
      "http",
      "Suunto refused this server's API subscription key. The operator must check SUUNTO_SUBSCRIPTION_KEY (and that the Suunto API subscription is active).",
      { status: 401 },
    );
  }

  private headers(req: SuuntoRequest, token: string): Headers {
    const type = req.responseType ?? "json";
    const h = new Headers();
    for (const [name, value] of Object.entries(req.headers ?? {})) {
      if (SAFE_HEADER.test(name) && !RESERVED_HEADERS.has(name.toLowerCase())) h.set(name, value);
    }
    h.set("Authorization", `Bearer ${token}`);
    h.set("Ocp-Apim-Subscription-Key", this.opts.keys.subscriptionKey);
    h.set("Accept", req.accept ?? defaultAccept(type));
    h.set("User-Agent", USER_AGENT);
    if (req.body !== undefined && !h.has("Content-Type")) {
      h.set("Content-Type", req.contentType ?? (typeof req.body === "string" || Buffer.isBuffer(req.body) ? "text/plain; charset=utf-8" : "application/json"));
    }
    return h;
  }

  private body(req: SuuntoRequest): string | Uint8Array | undefined {
    if (req.body === undefined) return undefined;
    if (typeof req.body === "string") return req.body;
    if (Buffer.isBuffer(req.body)) return new Uint8Array(req.body);
    return JSON.stringify(req.body);
  }

  private tooLarge(req: SuuntoRequest, max: number, status: number): SuuntoHttpError {
    return new SuuntoHttpError("too_large", `The answer from Suunto (${req.what ?? "data"}) is larger than ${megabytes(max)}, more than this server reads.`, { status });
  }

  /**
   * One request with the retry rules. Returns the last answer, whatever its status. The body of a
   * 2xx read is read here, so a connection that breaks while the answer downloads is tried again
   * like any other broken connection.
   */
  private async send(req: SuuntoRequest, token: string): Promise<Answer> {
    const method = req.method ?? "GET";
    const read = method === "GET";
    const tries = read ? Math.max(1, this.opts.tries ?? DEFAULT_TRIES) : 1;
    const timeoutMs = req.timeoutMs ?? this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const base = this.opts.backoffMs ?? 500;
    const max = req.maxBytes ?? defaultMax(req.responseType ?? "json");
    const url = this.url(req);
    const what = req.what ?? "Suunto";
    const init: RequestInit = { method, headers: this.headers(req, token) };
    const body = this.body(req);
    if (body !== undefined) init.body = body;

    // A connection that never opened may be tried again for any request: nothing was sent.
    const maxTries = Math.max(tries, DEFAULT_TRIES);
    let timeouts = 0;
    for (let attempt = 1; ; attempt++) {
      // Every request that is sent counts against Suunto's call limit, retries too.
      await this.opts.limiter?.acquire(this.opts.limiterKey ?? "");
      let res: Response | undefined;
      try {
        res = await this.doFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
        if (read && isSuccess(res.status)) return { res, bytes: await readBytes(res, max, false) };
      } catch (error) {
        if (error instanceof TooLarge) throw this.tooLarge(req, max, res?.status ?? 200);
        // With an answer, the connection broke (or timed out) while its body was read.
        const answered = res !== undefined;
        const notSent = !answered && failedBeforeSending(error);
        const timedOut = isTimeout(error);
        if (timedOut) timeouts++;
        // A timed-out read reached Suunto and counted: it is tried again at most once.
        const retryRead = read && attempt < tries && (!timedOut || (req.retryOnTimeout !== false && timeouts <= 1));
        if (notSent ? attempt < maxTries : retryRead) {
          this.opts.log?.(`Suunto ${method} ${req.path}: ${timedOut ? "timeout" : "network error"}, trying again`);
          await this.sleep(backoff(base, attempt));
          continue;
        }
        if (!read && !notSent) {
          throw new UnconfirmedWriteError(
            `Suunto did not answer, so the change may have been saved anyway. Check in the Suunto App (or list the routes or points of interest) before you try again.`,
            { cause: error },
          );
        }
        if (answered) {
          if (timedOut) throw new SuuntoHttpError("timeout", `Suunto stopped answering (${what}). Try again later.`, { cause: error });
          throw new SuuntoHttpError("network", `The connection to Suunto broke (${what}). Try again later.`, { cause: error });
        }
        if (timedOut) {
          throw new SuuntoHttpError("timeout", `Suunto did not answer within ${Math.round(timeoutMs / 1000)} s (${what}). Try again later.`, { sent: true, cause: error });
        }
        throw new SuuntoHttpError("network", `Could not reach Suunto (${what}). Check the network and try again later.`, { sent: !notSent, cause: error });
      }
      if (!read || !RETRY_STATUSES.has(res.status) || attempt >= tries) return { res };
      const after = retryAfterMs(res, this.now());
      // A long Retry-After is not worth waiting for, and a 429 without one would only fail again
      // (the per-minute limit does not clear within the backoff): the caller gets the error at once.
      if (after === undefined ? res.status === 429 : after > MAX_RETRY_AFTER_MS) return { res };
      await discard(res);
      const wait = after ?? backoff(base, attempt);
      this.opts.log?.(`Suunto ${method} ${req.path}: HTTP ${res.status}, trying again in ${Math.round(wait / 100) / 10} s`);
      await this.sleep(wait);
    }
  }

  /** Return a 2xx answer, or turn any other status into a safe error. */
  private async finish(req: SuuntoRequest, answer: Answer): Promise<SuuntoResponse> {
    const { res } = answer;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (isSuccess(res.status)) {
      if (answer.bytes !== undefined) return { status: res.status, headers: res.headers, contentType, bytes: answer.bytes };
      // A write: it was saved (2xx). When only its answer is lost, it is reported as saved without details.
      const max = req.maxBytes ?? defaultMax(req.responseType ?? "json");
      try {
        return { status: res.status, headers: res.headers, contentType, bytes: await readBytes(res, max, false) };
      } catch (error) {
        if (error instanceof TooLarge) throw this.tooLarge(req, max, res.status);
        return { status: res.status, headers: res.headers, contentType, bytes: Buffer.alloc(0) };
      }
    }
    const body = await readText(res);
    throw this.statusError(req, res, body);
  }

  /** The error of a non-2xx answer (after retries and the refresh). */
  statusError(req: SuuntoRequest, res: Response, body: string): Error {
    const status = res.status;
    const write = (req.method ?? "GET") !== "GET";
    const what = req.what ?? "the request";
    const raw = errorText(body);
    const detail = raw ? snippet(redact(raw, this.secrets()), 200) : "";
    const said = detail ? ` Suunto said: "${detail}"` : "";

    if (status === 404) return new SuuntoNotFoundError(req.notFound ?? `Suunto did not find ${what}.`);
    if (status === 400 || status === 409 || status === 422) {
      return new SuuntoHttpError("http", `Suunto says the request is not valid (${what}, HTTP ${status}).${said}`, { status });
    }
    if (status === 403) {
      // The weekly quota of the gateway also answers 403, with Retry-After and a text such as
      // "Out of call volume quota". The whole body is checked: the text can be in any field.
      if (res.headers.has("retry-after") || RATE_LIMIT_TEXT.test(body)) return this.rateLimited(res, body);
      return new SuuntoHttpError(
        "http",
        `Suunto refused ${what} (HTTP 403). This server's Suunto API subscription may not cover this data, or Suunto does not allow it for this account.`,
        { status },
      );
    }
    if (status === 429) return this.rateLimited(res, body);
    if (status === 503 && !write) {
      return new SuuntoHttpError("http", `Suunto is busy right now (HTTP 503, ${what}). Try again later.`, { status });
    }
    if (write && status >= 500) {
      return new UnconfirmedWriteError(
        `Suunto answered HTTP ${status}, so it is not clear whether the change was saved. Check in the Suunto App (or list the routes or points of interest) before you try again.`,
      );
    }
    if (status === 500 && req.serverErrorHint) {
      // Most likely a wrong key: the hint says what to check, not to repeat the same call.
      return new SuuntoHttpError("http", `Suunto could not answer (HTTP 500, ${what}). ${req.serverErrorHint}`, { status });
    }
    if (status >= 500) {
      return new SuuntoHttpError("http", `Suunto has a problem right now (HTTP ${status}, ${what}). Try again later.`, { status });
    }
    return new SuuntoHttpError("http", `Suunto answered HTTP ${status} (${what}).${said}`, { status });
  }
}
