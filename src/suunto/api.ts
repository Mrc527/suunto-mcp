/**
 * SuuntoApi: the ActivityBackend that talks to the Suunto Cloud API (wire level: no validation,
 * no unit conversion, no windows longer than the API allows). docs/suunto-api.md section 3 has
 * the endpoints; src/suunto/http.ts has the request rules (headers, retries, errors).
 */

import type {
  ActivityBackend,
  ListRoutesQuery,
  ListWorkoutsQuery,
  SuuntoAccount,
  WireActivityEntry,
  WireDailyStatistic,
  WirePoi,
  WirePoiEnvelope,
  WirePoiInput,
  WireRecoveryEntry,
  WireRoute,
  WireSample,
  WireSleepEntry,
  WireWorkout,
  WireWorkoutList,
} from "../activity/types.js";
import { redact, UnconfirmedWriteError, UserFacingError } from "../util/errors.js";
import type { SuuntoEndpoints } from "./endpoints.js";
import { snippet, SuuntoHttp, SuuntoHttpError, SuuntoNotFoundError, type SuuntoRequest } from "./http.js";
import type { CallLimiter } from "./limiter.js";
import type { SuuntoAppKeys } from "./oauth.js";
import type { SuuntoSession } from "./session.js";

export interface SuuntoApiOptions {
  session: SuuntoSession;
  keys: SuuntoAppKeys;
  endpoints: SuuntoEndpoints;
  fetch?: typeof fetch;
  log?: (m: string) => void;
  /** Per request, default 20 s (the FIT export always gets at least 60 s). */
  timeoutMs?: number;
  /** First backoff step of the HTTP layer (tests use 0). */
  backoffMs?: number;
  /** For tests: how the HTTP layer waits between tries. */
  sleep?: (ms: number) => Promise<void>;
  /** Asked before every data request (retries included); one per process. */
  limiter?: CallLimiter;
  /** The key of the limiter's daily limit (the user id). */
  limiterKey?: string;
}

/** The FIT export can be large and slow: at least this timeout. */
export const FIT_TIMEOUT_MS = 60_000;
/** The GPX of one route: at most this many bytes are read. */
export const MAX_GPX_BYTES = 5 * 1024 * 1024;

/** A wrong workout key gives HTTP 500, not 404 (Suunto FAQ). */
const WRONG_KEY_HINT = "Suunto also answers this way for a workout key that does not exist: check the key (from suunto_list_workouts).";

/** Encode one path segment (a workout key or route id): never a slash or a dot segment. */
export function pathSegment(value: string): string {
  const v = value.trim();
  if (!v || v === "." || v === "..") throw new UserFacingError("The id is empty or not valid.");
  return encodeURIComponent(v);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A list from an answer: a plain array, or an array under one of the given keys (or a page's "content"). */
function listFrom(json: unknown, keys: readonly string[] = []): unknown[] {
  if (Array.isArray(json)) return json;
  if (isObject(json)) {
    for (const key of [...keys, "content", "payload", "items", "data"]) {
      const value = json[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/** The `error` of a Suunto envelope, or undefined when it has none. */
function envelopeError(json: unknown): { code?: string; description?: string } | undefined {
  if (!isObject(json)) return undefined;
  const err = json.error;
  if (err === null || err === undefined || err === false || err === "") return undefined;
  if (typeof err === "string") return { description: err };
  if (isObject(err)) {
    const code = typeof err.code === "string" ? err.code : undefined;
    const description = typeof err.description === "string" ? err.description : typeof err.message === "string" ? err.message : undefined;
    if (!code && !description) return undefined;
    return { ...(code ? { code } : {}), ...(description ? { description } : {}) };
  }
  return undefined;
}

/** A route object of an answer (it must have an id). */
function asRoute(value: unknown): WireRoute | undefined {
  if (!isObject(value)) return undefined;
  const id = value.id ?? value.oid ?? value._id;
  if (typeof id === "string" && id.trim()) return { ...value, id: id.trim() } as WireRoute;
  if (typeof id === "number" && Number.isFinite(id)) return { ...value, id: String(id) } as WireRoute;
  return undefined;
}

/** A POI envelope: { pointOfInterest } (also accepted: a bare POI with a point). */
function asPoiEnvelope(value: unknown): WirePoiEnvelope | undefined {
  if (!isObject(value)) return undefined;
  const inner = isObject(value.pointOfInterest) ? value.pointOfInterest : isObject(value.point) ? value : undefined;
  if (!inner || !isObject(inner.point)) return undefined;
  const point = inner.point;
  if (typeof point.x !== "number" || typeof point.y !== "number") return undefined;
  return { pointOfInterest: inner as unknown as WirePoi };
}

/**
 * The errorCode of a PointOfInterestResult: undefined for none or 0, else the code as text when it
 * is safe to show ("" when it is not).
 */
function poiErrorCode(value: unknown): string | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (typeof value === "number") return value === 0 ? undefined : String(value);
  if (typeof value === "string") {
    const v = value.trim();
    if (!v || v === "0") return undefined;
    return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
  }
  return "";
}

/** Samples of a 247 answer: entries with a timestamp and an entryData object. */
function samplesFrom<T>(json: unknown): WireSample<T>[] {
  return listFrom(json, ["samples"]).filter(
    (s): s is WireSample<T> => isObject(s) && typeof s.timestamp === "string" && isObject(s.entryData),
  );
}

export class SuuntoApi implements ActivityBackend {
  readonly kind = "suunto" as const;
  private readonly http: SuuntoHttp;

  constructor(private readonly opts: SuuntoApiOptions) {
    this.http = new SuuntoHttp({
      session: opts.session,
      keys: { subscriptionKey: opts.keys.subscriptionKey, clientSecret: opts.keys.clientSecret },
      endpoints: opts.endpoints,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.backoffMs !== undefined ? { backoffMs: opts.backoffMs } : {}),
      ...(opts.sleep ? { sleep: opts.sleep } : {}),
      ...(opts.log ? { log: opts.log } : {}),
      ...(opts.limiter ? { limiter: opts.limiter } : {}),
      ...(opts.limiterKey !== undefined ? { limiterKey: opts.limiterKey } : {}),
    });
  }

  private secrets(): string[] {
    const t = this.opts.session.storedTokens;
    return [this.opts.keys.subscriptionKey, this.opts.keys.clientSecret, t.accessToken ?? "", t.refreshToken].filter((s) => s.length > 0);
  }

  /** An error for an envelope whose `error` is set (HTTP 200 with an error inside). */
  private envelopeFailure(what: string, err: { code?: string; description?: string }): SuuntoHttpError {
    const text = snippet(redact([err.description, err.code ? `(${err.code})` : ""].filter(Boolean).join(" "), this.secrets()), 200);
    return new SuuntoHttpError("api", `Suunto answered ${what} with an error${text ? `: "${text}"` : ""}.`);
  }

  private async getJson(req: SuuntoRequest): Promise<unknown> {
    return (await this.http.json({ method: "GET", ...req })).json;
  }

  // -------------------------------------------------------------------------------------------
  // Workouts (/v3/workouts)
  // -------------------------------------------------------------------------------------------

  async listWorkouts(q: ListWorkoutsQuery): Promise<WireWorkoutList> {
    const what = "the workout list";
    const json = await this.getJson({
      path: "/v3/workouts",
      query: {
        since: q.since,
        until: q.until,
        limit: q.limit,
        offset: q.offset,
        "filter-by-modification-time": q.byModificationTime,
      },
      what,
    });
    const err = envelopeError(json);
    if (err) throw this.envelopeFailure(what, err);
    const payload = listFrom(json).filter((w): w is WireWorkout => isObject(w));
    const metadata = isObject(json) && isObject(json.metadata) ? (json.metadata as WireWorkoutList["metadata"]) : null;
    return { error: null, payload, metadata };
  }

  async getWorkout(key: string, extensions: readonly string[]): Promise<WireWorkout> {
    const what = "the workout";
    const names = extensions.map((e) => e.trim()).filter((e) => /^[A-Za-z0-9]+$/.test(e));
    const json = await this.getJson({
      path: `/v3/workouts/${pathSegment(key)}`,
      query: { extensions: names.length ? names.join(",") : undefined },
      what,
      notFound: `Suunto has no workout with the key ${key.trim()}.`,
      serverErrorHint: WRONG_KEY_HINT,
    });
    const err = envelopeError(json);
    if (err) throw this.envelopeFailure(what, err);
    const payload = isObject(json) && "payload" in json ? json.payload : json;
    if (!isObject(payload)) throw new SuuntoNotFoundError(`Suunto has no workout with the key ${key.trim()} (the answer was empty).`);
    return payload as WireWorkout;
  }

  async exportFit(key: string): Promise<Buffer> {
    const res = await this.http.binary({
      method: "GET",
      path: `/v3/workouts/${pathSegment(key)}/fit`,
      accept: "application/octet-stream",
      timeoutMs: Math.max(this.opts.timeoutMs ?? 0, FIT_TIMEOUT_MS),
      // One try of 60 s is already as long as an AI app waits for a tool: no second one.
      retryOnTimeout: false,
      what: "the FIT file of the workout",
      notFound: `Suunto has no FIT file for the workout ${key.trim()}.`,
      serverErrorHint: WRONG_KEY_HINT,
    });
    return res.data;
  }

  // -------------------------------------------------------------------------------------------
  // 24/7 data (/247samples)
  // -------------------------------------------------------------------------------------------

  /** The 247 endpoints document a required Content-Type: application/json, even on a GET. */
  private async samples<T>(kind: "activity" | "sleep" | "recovery", fromMs: number, toMs: number, what: string): Promise<WireSample<T>[]> {
    const json = await this.getJson({
      path: `/247samples/${kind}`,
      query: { from: Math.floor(fromMs), to: Math.floor(toMs) },
      headers: { "Content-Type": "application/json" },
      what,
    });
    return samplesFrom<T>(json);
  }

  activitySamples(fromMs: number, toMs: number): Promise<WireSample<WireActivityEntry>[]> {
    return this.samples<WireActivityEntry>("activity", fromMs, toMs, "the 24/7 activity samples");
  }

  sleep(fromMs: number, toMs: number): Promise<WireSample<WireSleepEntry>[]> {
    return this.samples<WireSleepEntry>("sleep", fromMs, toMs, "the sleep data");
  }

  recovery(fromMs: number, toMs: number): Promise<WireSample<WireRecoveryEntry>[]> {
    return this.samples<WireRecoveryEntry>("recovery", fromMs, toMs, "the recovery data");
  }

  async dailyStatistics(startdate: string, enddate: string): Promise<WireDailyStatistic[]> {
    const json = await this.getJson({
      path: "/247samples/daily-activity-statistics",
      query: { startdate, enddate },
      headers: { "Content-Type": "application/json" },
      what: "the daily activity statistics",
    });
    return listFrom(json).filter((s): s is WireDailyStatistic => isObject(s) && typeof s.Name === "string");
  }

  // -------------------------------------------------------------------------------------------
  // Routes (/v2/route)
  // -------------------------------------------------------------------------------------------

  async listRoutes(q: ListRoutesQuery): Promise<WireRoute[]> {
    const json = await this.getJson({
      path: "/v2/route",
      query: { page: q.page, size: q.size, sort: q.sort, since: q.since },
      what: "the route list",
    });
    return listFrom(json, ["routes"])
      .map(asRoute)
      .filter((r): r is WireRoute => !!r);
  }

  async getRoute(id: string): Promise<WireRoute> {
    const json = await this.getJson({ path: `/v2/route/${pathSegment(id)}`, what: "the route", notFound: `Suunto has no route with the id ${id.trim()}.` });
    const route = asRoute(json);
    if (!route) throw new SuuntoNotFoundError(`Suunto has no route with the id ${id.trim()} (the answer was empty).`);
    return route;
  }

  async exportRouteGpx(id: string): Promise<string> {
    const res = await this.http.text({
      method: "GET",
      path: `/v2/route/${pathSegment(id)}/export`,
      accept: "application/gpx+xml",
      maxBytes: MAX_GPX_BYTES,
      what: "the GPX of the route",
      notFound: `Suunto has no route with the id ${id.trim()}.`,
    });
    return res.text;
  }

  async importRouteGpx(gpx: string, activityIds: readonly number[]): Promise<WireRoute | undefined> {
    const ids = activityIds.filter((n) => Number.isInteger(n) && n >= 0);
    const res = await this.http.json({
      method: "POST",
      path: "/v2/route/import",
      query: { activities: ids.length ? ids.join(",") : undefined },
      body: gpx,
      contentType: "application/gpx+xml",
      what: "the route import",
    });
    // The answer body is not documented: a route, a list of routes (one per rte/trk), or nothing.
    const direct = asRoute(res.json);
    if (direct) return direct;
    for (const item of listFrom(res.json, ["routes"])) {
      const route = asRoute(item);
      if (route) return route;
    }
    return undefined;
  }

  // -------------------------------------------------------------------------------------------
  // Points of interest (/v2/poi)
  // -------------------------------------------------------------------------------------------

  async listPois(q: { limit: number; offset: number }): Promise<WirePoiEnvelope[]> {
    const json = await this.getJson({ path: "/v2/poi", query: { limit: q.limit, offset: q.offset }, what: "the points of interest" });
    return listFrom(json, ["pointsOfInterest", "pois"])
      .map(asPoiEnvelope)
      .filter((p): p is WirePoiEnvelope => !!p);
  }

  async createPoi(poi: WirePoiInput): Promise<WirePoiEnvelope> {
    const res = await this.http.json({ method: "POST", path: "/v2/poi/create", body: poi, contentType: "application/json", what: "the new point of interest" });
    // The answer is a PointOfInterestResult: { pointOfInterest, errorCode }. The meaning of the
    // error codes is not documented, so a non-zero one (or an empty pointOfInterest) is not
    // reported as saved: the user checks in the Suunto App first.
    const json = res.json;
    const code = isObject(json) ? poiErrorCode(json.errorCode) : undefined;
    if (code !== undefined) {
      throw new UnconfirmedWriteError(
        `Suunto answered the new point of interest with an error${code ? ` (code ${code})` : ""}, so it is not clear whether it was saved. Check in the Suunto App (or list the points of interest) before you try again.`,
      );
    }
    const envelope = asPoiEnvelope(json);
    if (envelope) return envelope;
    if (isObject(json) && "pointOfInterest" in json) {
      throw new UnconfirmedWriteError(
        "Suunto answered the new point of interest without the point, so it is not clear whether it was saved. Check in the Suunto App (or list the points of interest) before you try again.",
      );
    }
    // Saved (2xx), but the answer was lost or has another shape: give back what was sent.
    return { pointOfInterest: { ...poi, point: { ...poi.point } } as WirePoi };
  }

  // -------------------------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------------------------

  async account(): Promise<SuuntoAccount> {
    const session = this.opts.session;
    const username = await session.username();
    const expires = session.tokenExpiresAt;
    return { username, ...(expires ? { tokenExpiresAt: new Date(expires).toISOString() } : {}) };
  }

  async close(): Promise<void> {
    // Nothing to free: every request is a plain fetch.
  }
}
