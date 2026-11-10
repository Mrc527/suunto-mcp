/**
 * CachedBackend: a small in-memory response cache in front of a real Suunto backend
 * (docs/DESIGN.md section 4, "Rate limits").
 *
 * Suunto's Developer API allows 10 calls per minute and 200 per week for the whole service, and
 * AI apps often ask the same thing twice in one conversation. So answers are kept for a short
 * time, per backend instance (one per user), in an LRU with at most 200 entries and 20 MB:
 *
 * - workout lists: 2 minutes;
 * - a workout by key, FIT files: 30 minutes (they rarely change); a FIT file over 8 MB is never
 *   kept, since suunto_export_workout_fit refuses it anyway;
 * - 24/7 samples, sleep, recovery and daily statistics: 30 minutes for windows that end before
 *   the current hour, 2 minutes otherwise (new data arrives after every sync);
 * - routes, route GPX and points of interest: 2 minutes.
 *
 * Errors are never kept. A route import clears the route entries and a new point of interest
 * clears the POI entries, so the next list shows the new item. The demo backend is never wrapped.
 *
 * Every answer is a copy: callers may change what they get without changing the cache.
 */

import type {
  ActivityBackend,
  ListRoutesQuery,
  ListWorkoutsQuery,
  SuuntoAccount,
  WireActivityEntry,
  WireDailyStatistic,
  WirePoiEnvelope,
  WirePoiInput,
  WireRecoveryEntry,
  WireRoute,
  WireSample,
  WireSleepEntry,
  WireWorkout,
  WireWorkoutList,
} from "./types.js";

export interface CachedBackendOptions {
  /** The clock (epoch ms), for tests. */
  now?: () => number;
  /** Most entries kept (default 200). */
  maxEntries?: number;
  /** Most bytes kept, estimated (default 20 MB). */
  maxBytes?: number;
}

export const CACHE_MAX_ENTRIES = 200;
export const CACHE_MAX_BYTES = 20 * 1024 * 1024;
/** Lists, routes, POIs and 24/7 windows that reach into the current hour. */
export const SHORT_TTL_MS = 2 * 60_000;
/** A workout by key, FIT files, and 24/7 windows that ended before the current hour. */
export const LONG_TTL_MS = 30 * 60_000;
/** Binary answers larger than this are never kept: the FIT export tool refuses them (MAX_FIT_BYTES in service.ts). */
export const CACHE_MAX_BINARY_BYTES = 8 * 1024 * 1024;
/** A 24/7 window that ends at most this long before "now" ends "now" (an open window). */
export const OPEN_WINDOW_SLACK_MS = 5_000;

const HOUR_MS = 3_600_000;

/** Entries that a write makes stale are cleared by group. */
type Group = "workouts" | "samples" | "routes" | "pois";

interface Entry {
  value: unknown;
  bytes: number;
  expiresAt: number;
  group: Group;
}

/** A copy that shares nothing with the cached value (a Buffer stays a Buffer). */
function copy<T>(value: T): T {
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (typeof value !== "object" || value === null) return value;
  return structuredClone(value);
}

/** Rough memory use of a value: exact for Buffers and strings, the JSON length for the rest. */
function sizeOf(value: unknown): number {
  if (Buffer.isBuffer(value)) return value.length;
  if (typeof value === "string") return Buffer.byteLength(value);
  if (value === undefined || value === null) return 16;
  try {
    return (JSON.stringify(value)?.length ?? 16) + 16;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** "YYYY-MM-DDTHH:MM:SS" in UTC (no offset), as the daily statistics take it, in epoch ms. */
function utcNoOffsetMs(value: string): number | undefined {
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`);
  return Number.isFinite(ms) ? ms : undefined;
}

export class CachedBackend implements ActivityBackend {
  readonly kind: ActivityBackend["kind"];
  readonly inner: ActivityBackend;
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  /** Map order is the LRU order: the first entry is the least recently used. */
  private readonly entries = new Map<string, Entry>();
  /** Calls in progress, shared by identical concurrent calls. */
  private readonly inflight = new Map<string, Promise<unknown>>();
  /** Grows when a write clears a group, so an answer fetched before the write is not stored after it. */
  private readonly generation: Record<Group, number> = { workouts: 0, samples: 0, routes: 0, pois: 0 };
  private totalBytes = 0;

  constructor(inner: ActivityBackend, opts: CachedBackendOptions = {}) {
    this.inner = inner;
    this.kind = inner.kind;
    this.now = opts.now ?? Date.now;
    this.maxEntries = Math.max(0, opts.maxEntries ?? CACHE_MAX_ENTRIES);
    this.maxBytes = Math.max(0, opts.maxBytes ?? CACHE_MAX_BYTES);
  }

  /** Number of entries kept. */
  get size(): number {
    return this.entries.size;
  }

  /** Estimated bytes kept. */
  get bytes(): number {
    return this.totalBytes;
  }

  /** Forget everything. */
  clear(): void {
    this.entries.clear();
    this.inflight.clear();
    this.totalBytes = 0;
    for (const group of Object.keys(this.generation) as Group[]) this.generation[group]++;
  }

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  listWorkouts(q: ListWorkoutsQuery): Promise<WireWorkoutList> {
    const key = `listWorkouts|${q.since ?? ""}|${q.until ?? ""}|${q.limit}|${q.offset}|${q.byModificationTime}`;
    return this.cached(key, "workouts", SHORT_TTL_MS, () => this.inner.listWorkouts(q));
  }

  getWorkout(key: string, extensions: readonly string[]): Promise<WireWorkout> {
    // The same extensions in another order are the same request.
    const names = [...new Set(extensions)].sort().join(",");
    return this.cached(`getWorkout|${key}|${names}`, "workouts", LONG_TTL_MS, () => this.inner.getWorkout(key, extensions));
  }

  exportFit(key: string): Promise<Buffer> {
    return this.cached(`exportFit|${key}`, "workouts", LONG_TTL_MS, () => this.inner.exportFit(key));
  }

  activitySamples(fromMs: number, toMs: number): Promise<WireSample<WireActivityEntry>[]> {
    return this.window("activitySamples", fromMs, toMs, () => this.inner.activitySamples(fromMs, toMs));
  }

  sleep(fromMs: number, toMs: number): Promise<WireSample<WireSleepEntry>[]> {
    return this.window("sleep", fromMs, toMs, () => this.inner.sleep(fromMs, toMs));
  }

  recovery(fromMs: number, toMs: number): Promise<WireSample<WireRecoveryEntry>[]> {
    return this.window("recovery", fromMs, toMs, () => this.inner.recovery(fromMs, toMs));
  }

  dailyStatistics(startdate: string, enddate: string): Promise<WireDailyStatistic[]> {
    const end = utcNoOffsetMs(enddate);
    const ttl = end !== undefined && end < this.hourStart() ? LONG_TTL_MS : SHORT_TTL_MS;
    return this.cached(`dailyStatistics|${startdate}|${enddate}`, "samples", ttl, () => this.inner.dailyStatistics(startdate, enddate));
  }

  listRoutes(q: ListRoutesQuery): Promise<WireRoute[]> {
    return this.cached(`listRoutes|${q.page}|${q.size}|${q.sort}|${q.since ?? ""}`, "routes", SHORT_TTL_MS, () => this.inner.listRoutes(q));
  }

  getRoute(id: string): Promise<WireRoute> {
    return this.cached(`getRoute|${id}`, "routes", SHORT_TTL_MS, () => this.inner.getRoute(id));
  }

  exportRouteGpx(id: string): Promise<string> {
    return this.cached(`exportRouteGpx|${id}`, "routes", SHORT_TTL_MS, () => this.inner.exportRouteGpx(id));
  }

  listPois(q: { limit: number; offset: number }): Promise<WirePoiEnvelope[]> {
    return this.cached(`listPois|${q.limit}|${q.offset}`, "pois", SHORT_TTL_MS, () => this.inner.listPois(q));
  }

  // -------------------------------------------------------------------------------------------
  // Writes and pass-through
  // -------------------------------------------------------------------------------------------

  async importRouteGpx(gpx: string, activityIds: readonly number[]): Promise<WireRoute | undefined> {
    try {
      return await this.inner.importRouteGpx(gpx, activityIds);
    } finally {
      // Also after an error: the import may have reached Suunto, and the user is told to list
      // the routes before trying again. That list must not come from the cache.
      this.clearGroup("routes");
    }
  }

  async createPoi(poi: WirePoiInput): Promise<WirePoiEnvelope> {
    try {
      return await this.inner.createPoi(poi);
    } finally {
      // As for routes: a failed create may still have been saved.
      this.clearGroup("pois");
    }
  }

  account(): Promise<SuuntoAccount> {
    return this.inner.account();
  }

  async close(): Promise<void> {
    this.clear();
    await this.inner.close();
  }

  // -------------------------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------------------------

  /** Start of the current hour (UTC hours; every whole-hour time zone shares them). */
  private hourStart(): number {
    return Math.floor(this.now() / HOUR_MS) * HOUR_MS;
  }

  /**
   * A 24/7 window. A window that ended before the current hour is kept 30 minutes under its exact
   * bounds; one that ended earlier in the current hour 2 minutes, also under its exact bounds.
   * Only a window that ends "now" (within a few seconds; the service asks up to now - 1 ms, which
   * differs on every call) is kept under its start alone, for 2 minutes. That entry, and a request
   * for it still running, serve a later call with the same start that also ends now: they miss
   * only what arrived since they were fetched, like any entry. A window with an earlier end never
   * serves a call with a later end, and never replaces the open entry.
   */
  private window<T>(method: string, fromMs: number, toMs: number, load: () => Promise<T[]>): Promise<T[]> {
    if (toMs <= this.hourStart()) return this.cached(`${method}|${fromMs}|${toMs}`, "samples", LONG_TTL_MS, load);
    if (toMs < this.now() - OPEN_WINDOW_SLACK_MS) return this.cached(`${method}|${fromMs}|${toMs}`, "samples", SHORT_TTL_MS, load);
    return this.cached(`${method}|${fromMs}|open`, "samples", SHORT_TTL_MS, load);
  }

  private async cached<T>(key: string, group: Group, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.lookup(key);
    if (hit) return copy(hit.value as T);

    // Identical calls at the same time share one request.
    const running = this.inflight.get(key) as Promise<T> | undefined;
    if (running) return copy(await running);

    const generation = this.generation[group];
    const promise = load();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      // A write cleared this group while the call ran: the answer may be from before it.
      const current = this.generation[group] === generation;
      const tooBig = Buffer.isBuffer(value) && value.length > CACHE_MAX_BINARY_BYTES;
      if (current && !tooBig) this.store(key, { value, bytes: sizeOf(value), expiresAt: this.now() + ttlMs, group });
      return copy(value);
    } finally {
      if (this.inflight.get(key) === promise) this.inflight.delete(key);
    }
  }

  private lookup(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.remove(key, entry);
      return undefined;
    }
    // Most recently used goes to the end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  private store(key: string, entry: Entry): void {
    const old = this.entries.get(key);
    if (old) this.remove(key, old);
    if (this.maxEntries === 0 || entry.bytes > this.maxBytes) return;
    this.entries.set(key, entry);
    this.totalBytes += entry.bytes;
    this.evict();
  }

  /** Drop expired entries first, then the least recently used, until both limits hold. */
  private evict(): void {
    if (this.entries.size <= this.maxEntries && this.totalBytes <= this.maxBytes) return;
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key, entry);
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries && this.totalBytes <= this.maxBytes) break;
      this.remove(key, entry);
    }
  }

  private remove(key: string, entry: Entry): void {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
  }

  private clearGroup(group: Group): void {
    this.generation[group]++;
    for (const [key, entry] of this.entries) if (entry.group === group) this.remove(key, entry);
    // Calls in progress started before the write: new callers must not join them.
    for (const key of [...this.inflight.keys()]) if (groupOfKey(key) === group) this.inflight.delete(key);
  }
}

const GROUP_OF_METHOD: Record<string, Group> = {
  listWorkouts: "workouts",
  getWorkout: "workouts",
  exportFit: "workouts",
  activitySamples: "samples",
  sleep: "samples",
  recovery: "samples",
  dailyStatistics: "samples",
  listRoutes: "routes",
  getRoute: "routes",
  exportRouteGpx: "routes",
  listPois: "pois",
};

function groupOfKey(key: string): Group | undefined {
  return GROUP_OF_METHOD[key.slice(0, key.indexOf("|"))];
}
