/**
 * Suunto's OAuth 2.0 (authorization code flow) on https://cloudapi-oauth.suunto.com
 * (docs/suunto-api.md section 2):
 *
 * - authorizeUrl(): where the browser goes to sign in at Suunto and allow access;
 * - exchangeCode(): POST /oauth/token with grant_type=authorization_code (Basic auth with the
 *   client id and secret, form body). A code works once, so the exchange is never sent twice;
 * - refreshTokens(): POST /oauth/token with grant_type=refresh_token. A refresh may hand out a new
 *   refresh token: the result always holds the newest one;
 * - deauthorize(): GET /oauth/deauthorize?client_id=.. with the Bearer access token.
 *
 * The access token is a JWT with the claims "user" (the Suunto App username) and "exp". Error
 * messages never hold a code, a token or the client secret; Suunto's own error text is not shown
 * because it can echo the code or the token.
 */

import { UserFacingError } from "../util/errors.js";
import type { SuuntoEndpoints } from "./endpoints.js";
import { backoff, DEFAULT_TIMEOUT_MS, failedBeforeSending, isTimeout, parseJson, readText, realSleep, USER_AGENT } from "./http.js";
import { decodeJwt, jwtExpiresAt, jwtUsername } from "./jwt.js";

/** The app keys from the Suunto API Zone (operator settings, or the person's own in local mode). */
export interface SuuntoAppKeys {
  clientId: string;
  clientSecret: string;
  subscriptionKey: string;
}

/** What is kept between runs (encrypted in the web service, a 0600 file or memory locally). */
export interface StoredSuuntoTokens {
  refreshToken: string;
  accessToken?: string;
  /** Epoch milliseconds. */
  accessTokenExpiresAt?: number;
  /** The app the tokens were issued to (a refresh needs the same app). */
  clientId: string;
}

/**
 * - invalid_grant: Suunto refused the code or the refresh token (the user must connect again);
 * - denied: the user or Suunto refused access;
 * - bad_client: Suunto refused this server's client id or secret (an operator problem);
 * - network: Suunto could not be reached or could not answer now (try again later);
 * - unknown: anything else.
 */
export type SuuntoAuthErrorCode = "invalid_grant" | "denied" | "bad_client" | "network" | "unknown";

/** A sign-in, refresh or deauthorize problem. The message is safe to show. */
export class SuuntoAuthError extends UserFacingError {
  readonly code: SuuntoAuthErrorCode;
  /** HTTP status, when Suunto answered. */
  readonly status?: number;

  constructor(code: SuuntoAuthErrorCode, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SuuntoAuthError";
    this.code = code;
    if (options?.status !== undefined) this.status = options.status;
  }
}

export interface OAuthOptions {
  endpoints: SuuntoEndpoints;
  keys: Pick<SuuntoAppKeys, "clientId" | "clientSecret">;
  fetch?: typeof fetch;
  /** Per request, default 20 s. */
  timeoutMs?: number;
  /** The clock (epoch ms), for tests. */
  now?: () => number;
  /** First backoff step of a refresh whose connection never opened (default 500 ms; tests use 0). */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface TokenResult {
  tokens: Required<Pick<StoredSuuntoTokens, "accessToken" | "accessTokenExpiresAt">> & StoredSuuntoTokens;
  /** The Suunto App username (the access token's "user" claim). */
  username: string;
  scope?: string;
}

/**
 * The result of a refresh. The username may be missing: a refresh answer may not carry it, and
 * the caller knows it from the earlier token. The new tokens are never thrown away for that.
 */
export type RefreshResult = Omit<TokenResult, "username"> & { username?: string };

/** Access token lifetime when Suunto says nothing at all (no "exp", no expires_in): be careful. */
const FALLBACK_LIFETIME_S = 3600;

export const AUTH_MESSAGES = {
  codeRefused:
    "Suunto did not accept the sign-in (the code is expired or was used already). Start again with Connect Suunto. If it keeps happening, the redirect URI registered in the Suunto app settings may not match this server.",
  expired: "Your Suunto connection expired. Connect Suunto again.",
  badClient: "Suunto refused this server's app keys (client id or client secret). The operator must check SUUNTO_CLIENT_ID and SUUNTO_CLIENT_SECRET.",
  /** Suunto answers a sign-in with Movescount credentials like wrong app keys (FAQ): name both causes. */
  badClientSignIn:
    "Suunto refused the sign-in. Sign in on the Suunto page with your Suunto App account (not an old Movescount account) and start again with Connect Suunto. If that does not help, the operator must check SUUNTO_CLIENT_ID and SUUNTO_CLIENT_SECRET.",
  denied: "Suunto refused access. Connect Suunto again and allow access on the Suunto page.",
  network: "Could not reach Suunto to sign in. Try again later.",
  busy: "Suunto's sign-in service is busy or has a problem right now. Try again later.",
} as const;

// ---------------------------------------------------------------------------------------------
// Authorize
// ---------------------------------------------------------------------------------------------

/** The Suunto sign-in page for this app. The callback gets ?code=..&state=.. (or ?error=..). */
export function authorizeUrl(endpoints: SuuntoEndpoints, clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri });
  if (state) params.set("state", state);
  return `${endpoints.oauthUrl}/oauth/authorize?${params.toString()}`;
}

/**
 * The error of an authorize callback that came back with ?error=.. instead of a code. Suunto does
 * not document the values; "access_denied" is the OAuth standard for "the user said no".
 */
export function callbackError(error: string): SuuntoAuthError {
  const e = error.trim().toLowerCase();
  if (e === "access_denied") return new SuuntoAuthError("denied", "You did not allow access on the Suunto page, so Suunto is not connected.");
  if (e === "unauthorized_client" || e === "invalid_client") return new SuuntoAuthError("bad_client", AUTH_MESSAGES.badClient);
  if (e === "server_error" || e === "temporarily_unavailable") return new SuuntoAuthError("network", AUTH_MESSAGES.busy);
  return new SuuntoAuthError("unknown", "The Suunto sign-in did not finish. Start again with Connect Suunto.");
}

// ---------------------------------------------------------------------------------------------
// Token endpoint
// ---------------------------------------------------------------------------------------------

function basicAuth(keys: OAuthOptions["keys"]): string {
  return `Basic ${Buffer.from(`${keys.clientId}:${keys.clientSecret}`, "utf8").toString("base64")}`;
}

interface TokenAnswer {
  status: number;
  body: string;
  json: Record<string, unknown> | undefined;
}

async function tokenCall(form: Record<string, string>, opts: OAuthOptions, retryUnsent: boolean): Promise<TokenAnswer> {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sleep = opts.sleep ?? realSleep;
  const tries = retryUnsent ? 3 : 1;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(`${opts.endpoints.oauthUrl}/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: basicAuth(opts.keys),
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // Only a connection that never opened is tried again: a refresh that reached Suunto may
      // have rotated the refresh token already, and a code works only once.
      if (attempt < tries && failedBeforeSending(error)) {
        await sleep(backoff(opts.backoffMs ?? 500, attempt));
        continue;
      }
      const message = isTimeout(error) ? `Suunto did not answer the sign-in within ${Math.round(timeoutMs / 1000)} s. Try again later.` : AUTH_MESSAGES.network;
      throw new SuuntoAuthError("network", message, { cause: error });
    }
    const body = await readText(res, 256 * 1024);
    const parsed = parseJson(body);
    const json = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
    return { status: res.status, body, json };
  }
}

/** The OAuth "error" of an answer, lowercase, when it looks like an error code (never echoed raw). */
function oauthError(json: Record<string, unknown> | undefined): string {
  const e = json?.error;
  if (typeof e === "string") return e.trim().toLowerCase();
  if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") return String((e as { code: string }).code).toLowerCase();
  return "";
}

function oauthDescription(json: Record<string, unknown> | undefined): string {
  const parts = [json?.error_description, json?.message, json?.error].filter((v): v is string => typeof v === "string");
  return parts.join(" ");
}

/** OAuth error codes that mean "this request is wrong", not "the code or refresh token is dead". */
const NOT_GRANT_ERRORS: ReadonlySet<string> = new Set(["invalid_request", "unsupported_grant_type", "invalid_scope", "unsupported_response_type"]);

/** Map an error answer of the token endpoint. Suunto's text is read, never shown. */
function tokenError(answer: TokenAnswer, flow: "code" | "refresh"): SuuntoAuthError {
  const { status, json } = answer;
  const error = oauthError(json);
  const description = oauthDescription(json);
  const empty = answer.body.trim() === "";
  const refused = flow === "refresh" ? AUTH_MESSAGES.expired : AUTH_MESSAGES.codeRefused;
  // Wrong app keys answer 401 {"error":"invalid_client"}. The FAQ says a sign-in with Movescount
  // credentials gets the same "bad client credentials" answer, so after a sign-in both causes are named.
  const badClient = flow === "code" ? AUTH_MESSAGES.badClientSignIn : AUTH_MESSAGES.badClient;

  if (error === "invalid_client" || error === "unauthorized_client") return new SuuntoAuthError("bad_client", badClient, { status });
  // Spring Security answers a wrong Basic auth with 401 "unauthorized" / "Bad credentials".
  if (status === 401 && (empty || error === "unauthorized" || /bad (client )?credentials|full authentication/i.test(description))) {
    return new SuuntoAuthError("bad_client", badClient, { status });
  }
  if (error === "invalid_grant" || error === "invalid_token") return new SuuntoAuthError("invalid_grant", refused, { status });
  if (error === "access_denied" || status === 403) return new SuuntoAuthError("denied", AUTH_MESSAGES.denied, { status });
  if (error === "server_error" || error === "temporarily_unavailable") return new SuuntoAuthError("network", AUTH_MESSAGES.busy, { status });
  // A named protocol error (invalid_request, unsupported_grant_type, ...) is about the request, not
  // about the user's grant: connecting again would not help, so the connection is not ended.
  if (NOT_GRANT_ERRORS.has(error)) return new SuuntoAuthError("unknown", `The Suunto sign-in failed (HTTP ${status}). Try again later.`, { status });
  // Any other 400 or 401 means Suunto refused the code or the refresh token.
  if (status === 400 || status === 401) return new SuuntoAuthError("invalid_grant", refused, { status });
  if (status === 429 || status >= 500) return new SuuntoAuthError("network", AUTH_MESSAGES.busy, { status });
  return new SuuntoAuthError("unknown", `The Suunto sign-in failed (HTTP ${status}).`, { status });
}

/** Build the result of a 2xx token answer (the username is left out when it cannot be read). */
function tokenResult(answer: TokenAnswer, opts: OAuthOptions, previousRefreshToken: string | undefined): RefreshResult {
  const json = answer.json;
  const accessToken = typeof json?.access_token === "string" ? json.access_token.trim() : "";
  if (!accessToken) throw new SuuntoAuthError("unknown", "Suunto answered the sign-in without an access token. Try again later.", { status: answer.status });
  const newRefresh = typeof json?.refresh_token === "string" ? json.refresh_token.trim() : "";
  // Keep the newest refresh token; without a new one, the old one stays valid.
  const refreshToken = newRefresh || previousRefreshToken;
  if (!refreshToken) throw new SuuntoAuthError("unknown", "Suunto answered the sign-in without a refresh token. Try again later.", { status: answer.status });

  const payload = decodeJwt(accessToken);
  const now = (opts.now ?? Date.now)();
  const expiresIn = Number(json?.expires_in);
  const accessTokenExpiresAt =
    (payload ? jwtExpiresAt(payload) : undefined) ?? now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : FALLBACK_LIFETIME_S) * 1000;

  // The username is the "user" claim; the token answer may carry it as a field too.
  const bodyUser = typeof json?.user === "string" ? json.user.trim() : "";
  const username = (payload ? jwtUsername(payload) : undefined) ?? (bodyUser || undefined);

  const scope = typeof json?.scope === "string" && json.scope.trim() ? json.scope.trim() : Array.isArray(json?.scope) ? (json.scope as unknown[]).filter((s) => typeof s === "string").join(" ") || undefined : undefined;
  return {
    tokens: { refreshToken, accessToken, accessTokenExpiresAt, clientId: opts.keys.clientId },
    ...(username ? { username } : {}),
    ...(scope ? { scope } : {}),
  };
}

/**
 * Exchange the code of the authorize callback for tokens. `redirectUri` must be the one used for
 * the authorize URL. Never sent twice (a code works once). Throws SuuntoAuthError.
 */
export async function exchangeCode(code: string, redirectUri: string, opts: OAuthOptions): Promise<TokenResult> {
  if (!code.trim()) throw new SuuntoAuthError("invalid_grant", AUTH_MESSAGES.codeRefused);
  const answer = await tokenCall({ grant_type: "authorization_code", code: code.trim(), redirect_uri: redirectUri }, opts, false);
  if (answer.status < 200 || answer.status >= 300) throw tokenError(answer, "code");
  const result = tokenResult(answer, opts, undefined);
  // A new connection needs the username (it identifies the Suunto account).
  if (!result.username) throw new SuuntoAuthError("unknown", "Suunto answered the sign-in without a Suunto username, so this connection cannot be used. Try again later.", { status: answer.status });
  return { ...result, username: result.username };
}

/**
 * Get a new access token with a refresh token. The result holds the newest refresh token (the
 * new one when Suunto rotated it, else the one given), and the username when the answer has one.
 * Throws SuuntoAuthError; code "invalid_grant" means the refresh token no longer works (the user
 * must connect again).
 */
export async function refreshTokens(refreshToken: string, opts: OAuthOptions): Promise<RefreshResult> {
  if (!refreshToken.trim()) throw new SuuntoAuthError("invalid_grant", AUTH_MESSAGES.expired);
  const answer = await tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken.trim() }, opts, true);
  if (answer.status < 200 || answer.status >= 300) throw tokenError(answer, "refresh");
  return tokenResult(answer, opts, refreshToken.trim());
}

/**
 * Tell Suunto to disconnect this user from the app. Throws SuuntoAuthError when Suunto does not
 * confirm it (callers that remove a connection treat it as best effort).
 */
export async function deauthorize(accessToken: string, opts: OAuthOptions): Promise<void> {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${opts.endpoints.oauthUrl}/oauth/deauthorize?${new URLSearchParams({ client_id: opts.keys.clientId }).toString()}`;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SuuntoAuthError("network", "Could not reach Suunto to disconnect. Try again later.", { cause: error });
  }
  await readText(res);
  if (res.status >= 200 && res.status < 300) return;
  if (res.status === 401) throw new SuuntoAuthError("invalid_grant", "Suunto did not accept the sign-in to disconnect (it may be disconnected already).", { status: res.status });
  if (res.status === 429 || res.status >= 500) throw new SuuntoAuthError("network", "Suunto could not disconnect right now. Try again later.", { status: res.status });
  throw new SuuntoAuthError("unknown", `Suunto did not confirm the disconnect (HTTP ${res.status}).`, { status: res.status });
}
