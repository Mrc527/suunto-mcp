/**
 * The in-memory Suunto account of a demo account: a data holder (DemoActivityStore) and an
 * ActivityBackend on top of it (DemoActivityBackend). Nothing leaves the server.
 *
 * The backend behaves like the Suunto Cloud API as far as the ActivityService can tell (see
 * docs/suunto-api.md): the same wire shapes and units, the list envelope of /v3/workouts, since
 * (inclusive) and until (exclusive) on the start or the modification time, limit and offset, only
 * the extensions asked for (an unknown extension name fails the whole call), 24/7 windows of at
 * most 28 days (a longer one is refused with HTTP 400, like Suunto does), route pages, GPX import
 * and export, and POI rules (watchEnabled must be true, the type must be a PoiType). Validation
 * of user input, unit conversion and splitting long ranges belong to the ActivityService.
 *
 * Memory: the store keeps only the workout summaries, the routes and the points of interest. The
 * streams, FIT files and all 24/7 data are computed on demand (activity-data.ts).
 */

import type {
  ActivityBackend,
  ListRoutesQuery,
  ListWorkoutsQuery,
  SuuntoAccount,
  WireActivityEntry,
  WireDailyStatistic,
  WireExtension,
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
import { DAY_MS } from "../util/dates.js";
import { NotFoundError, UserFacingError } from "../util/errors.js";
import {
  DATA_DAYS,
  DEMO_TIME_ZONE,
  DEMO_USERNAME,
  DemoTimeline,
  ZoneClock,
  availableExtensions,
  demoId,
  makeRoute,
  planWorkouts,
  samplePois,
  sampleRoutes,
  workoutExtensions,
  workoutFit,
  workoutSeries,
  type DemoRoute,
  type DemoRoutePoint,
  type DemoWorkout,
  type WorkoutSeries,
} from "./activity-data.js";

// ---------------------------------------------------------------------------------------------
// Errors (shaped like the answers of the Suunto Cloud API, as src/suunto/http.ts reports them)
// ---------------------------------------------------------------------------------------------

/** A request Suunto would refuse. `status` is the HTTP status Suunto answers with. */
export class DemoSuuntoError extends UserFacingError {
  readonly kind = "http" as const;

  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DemoSuuntoError";
  }
}

/** HTTP 404 from Suunto: a route id or workout key that does not exist. */
export class DemoNotFoundError extends NotFoundError {
  readonly status = 404;

  constructor(message: string) {
    super(message);
    this.name = "DemoNotFoundError";
  }
}

/** The documented 400 text of the 247 endpoints. */
const BAD_PARAMETERS = "Something is wrong with the parameters.";

function badRequest(what: string, said: string): DemoSuuntoError {
  return new DemoSuuntoError(400, `Suunto says the request is not valid (${what}, HTTP 400). Suunto said: "${said}"`);
}

/** The 247 endpoints take at most 28 days per request. */
export const MAX_WINDOW_MS = 28 * DAY_MS;

/** Every extension name the `extensions` parameter accepts (docs/suunto-api.md 3.4, exact spelling). */
export const EXTENSION_NAMES: ReadonlySet<string> = new Set([
  "AltitudeStreamExtension",
  "BatteryLevelStreamExtension",
  "CadenceStreamExtension",
  "DepthStreamExtension",
  "DistanceDeltaStreamExtension",
  "DistanceLapExtension",
  "DiveHeaderExtension",
  "DurationLapExtension",
  "EnergyConsumptionStreamExtension",
  "EpocStreamExtension",
  "FitnessExtension",
  "HeartRateExtension",
  "HeartrateStreamExtension",
  "IBIStreamExtension",
  "IntensityExtension",
  "IntervalStreamExtension",
  "LocationStreamExtension",
  "ManualLapStreamExtension",
  "MultisportMarker",
  "PauseMarkerExtension",
  "PoolLengthExtension",
  "PowerStreamExtension",
  "RelativePerformanceLevelStreamExtension",
  "SeaLevelPressureStreamExtension",
  "SkiExtension",
  "SpeedStreamExtension",
  "StepCountDeltaStreamExtension",
  "StrokeRateStreamExtension",
  "StrokesDeltaStreamExtension",
  "SummaryExtension",
  "SwimmingHeaderExtension",
  "SwolfStreamExtension",
  "TemperatureStreamExtension",
  "VerticalLapExtension",
  "VerticalSpeedStreamExtension",
  "WeatherExtension",
  "ZappChannelsExtension",
]);

/** Valid PoiType values (docs/suunto-api.md 3.8): -1 to 47 and 64 to 77. */
export function isPoiType(type: unknown): type is number {
  return typeof type === "number" && Number.isInteger(type) && ((type >= -1 && type <= 47) || (type >= 64 && type <= 77));
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

export interface DemoActivityStoreOptions {
  /** Clock (epoch ms) for the sample data and for "now" (tests). */
  now?: () => number;
  /** The demo person's time zone (default Europe/Zurich). */
  timeZone?: string;
}

/** One demo account's Suunto data, kept in memory. */
export class DemoActivityStore {
  readonly timeZone: string;
  readonly clock: () => number;
  /** When the current sample data was made (epoch ms). */
  resetAt = 0;
  /** Local day number of the first day with data. */
  firstDay = 0;
  /** Planned workouts, oldest first (some may not be synced yet: see visibleWorkouts). */
  workouts: DemoWorkout[] = [];
  /** Routes, in the order they were made. */
  routes: DemoRoute[] = [];
  /** Points of interest, in the order they were made. */
  pois: WirePoi[] = [];
  private byKey = new Map<string, DemoWorkout>();
  private byDay = new Map<number, DemoWorkout[]>();
  /** Counter of the ids of routes and POIs added by tools. */
  private nextCounter = 0x1000000;

  constructor(opts: DemoActivityStoreOptions = {}) {
    this.clock = opts.now ?? (() => Date.now());
    this.timeZone = opts.timeZone ?? DEMO_TIME_ZONE;
    this.reset(this.clock());
  }

  now(): number {
    return this.clock();
  }

  /** Throw away every change: fresh sample data relative to `at`. */
  reset(at: number = this.clock()): void {
    this.resetAt = at;
    this.firstDay = new ZoneClock(this.timeZone).day(at) - DATA_DAYS;
    this.workouts = planWorkouts(at, this.timeZone);
    this.byKey = new Map(this.workouts.map((w) => [w.key, w]));
    this.byDay = new Map();
    for (const w of this.workouts) {
      const list = this.byDay.get(w.day) ?? [];
      list.push(w);
      this.byDay.set(w.day, list);
    }
    this.routes = sampleRoutes(at);
    this.pois = samplePois(at);
    this.nextCounter = 0x1000000;
  }

  /** Workouts synced to the Suunto cloud by now (uploaded after they ended). */
  visibleWorkouts(now: number = this.clock()): DemoWorkout[] {
    return this.workouts.filter((w) => w.createdMs <= now);
  }

  /** A synced workout by key. */
  workout(key: string, now: number = this.clock()): DemoWorkout | undefined {
    const w = this.byKey.get(key.toLowerCase());
    return w && w.createdMs <= now ? w : undefined;
  }

  /** The workouts of a local day (synced or not: the watch recorded them), by start time. */
  workoutsOfDay(day: number): readonly DemoWorkout[] {
    return this.byDay.get(day) ?? [];
  }

  /** The 24/7 data up to now, computed on demand. */
  timeline(now: number = this.clock()): DemoTimeline {
    return new DemoTimeline({ timeZone: this.timeZone, firstDay: this.firstDay, nowMs: now, workoutsOfDay: (day) => this.workoutsOfDay(day) });
  }

  /** A new unique 24-hex id (routes and POIs added by tools). */
  newId(now: number = this.clock()): string {
    return demoId(now, this.nextCounter++);
  }
}

// ---------------------------------------------------------------------------------------------
// GPX
// ---------------------------------------------------------------------------------------------

/** A route found in a GPX file: each rte and each trk is one. */
export interface ParsedGpxRoute {
  name: string;
  points: DemoRoutePoint[];
}

const XML_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function xmlText(raw: string): string {
  const cdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
  return cdata
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
      }
      return XML_ENTITIES[code.toLowerCase()] ?? m;
    })
    .trim();
}

export function xmlEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** The text of the first child element `tag` (with or without a namespace prefix). */
function childText(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tag}>`, "i"));
  if (!m) return undefined;
  const text = xmlText(m[1]!);
  return text === "" ? undefined : text;
}

function attribute(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  return m ? (m[2] ?? m[3]) : undefined;
}

/** Points of a rte (rtept) or trk (trkpt) block. */
function gpxPoints(block: string, tag: "rtept" | "trkpt"): DemoRoutePoint[] {
  const out: DemoRoutePoint[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, "gi");
  for (const m of block.matchAll(re)) {
    const lat = Number(attribute(m[1]!, "lat"));
    const lon = Number(attribute(m[1]!, "lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw badRequest("the route import", `Invalid GPX: a ${tag} has no valid lat and lon.`);
    }
    const inner = m[2] ?? "";
    const point: DemoRoutePoint = { lat, lon };
    // Standard GPX (and Suunto's export) says <ele>; Suunto's route page shows <elevation>.
    const ele = childText(inner, "ele") ?? childText(inner, "elevation");
    if (ele !== undefined && Number.isFinite(Number(ele))) point.ele = Number(ele);
    // Suunto's own export keeps names in a suunto:routePoint extension; plain GPX in name/type.
    const plain = inner.replace(/<extensions\b[\s\S]*?<\/extensions>/gi, "");
    const ext = inner.match(/<(?:[\w-]+:)?routePoint\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?routePoint>/i)?.[1] ?? "";
    const name = childText(plain, "name") ?? childText(ext, "name");
    const type = childText(plain, "type") ?? childText(ext, "type");
    const desc = childText(plain, "desc") ?? childText(ext, "description");
    if (name !== undefined) point.name = name;
    if (type !== undefined) point.type = type;
    if (desc !== undefined) point.desc = desc;
    out.push(point);
  }
  return out;
}

/**
 * The routes of a GPX file, like Suunto's import reads them (docs/suunto-api.md 3.7): every rte
 * and trk is a route; the name comes from rte/trk name, its description, metadata name, metadata
 * description, else "Unnamed route". Throws a 400 error for a file Suunto would refuse.
 */
export function parseGpxRoutes(gpx: string): ParsedGpxRoute[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(gpx)) throw badRequest("the route import", "Invalid GPX: DOCTYPE and ENTITY declarations are not allowed.");
  const text = gpx.replace(/<!--[\s\S]*?-->/g, "");
  if (!/<gpx\b[^>]*>[\s\S]*<\/gpx>/i.test(text)) throw badRequest("the route import", "Invalid GPX: no gpx element.");
  const metadata = text.match(/<metadata\b[^>]*>([\s\S]*?)<\/metadata>/i)?.[1] ?? "";
  const metaOwn = metadata.replace(/<(author|link|copyright|extensions|bounds|keywords)\b[\s\S]*?<\/\1>/gi, "");
  const fallbackName = childText(metaOwn, "name") ?? childText(metaOwn, "desc") ?? "Unnamed route";
  const out: ParsedGpxRoute[] = [];
  const blocks: Array<{ index: number; body: string; tag: "rtept" | "trkpt" }> = [];
  for (const m of text.matchAll(/<rte\b[^>]*>([\s\S]*?)<\/rte>/gi)) blocks.push({ index: m.index ?? 0, body: m[1]!, tag: "rtept" });
  for (const m of text.matchAll(/<trk\b[^>]*>([\s\S]*?)<\/trk>/gi)) blocks.push({ index: m.index ?? 0, body: m[1]!, tag: "trkpt" });
  blocks.sort((a, b) => a.index - b.index);
  for (const block of blocks) {
    const own = block.body
      .replace(/<(rtept|trkpt|trkseg|extensions)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<(rtept|trkpt)\b[^>]*\/>/gi, "");
    const points = gpxPoints(block.body, block.tag);
    if (points.length === 0) continue;
    out.push({ name: childText(own, "name") ?? childText(own, "desc") ?? fallbackName, points });
  }
  if (out.length === 0) throw badRequest("the route import", "Invalid GPX: no route (rte) or track (trk) with points.");
  return out;
}

const num7 = (x: number): string => String(Math.round(x * 1e7) / 1e7);

/** The GPX of a route as Suunto's export writes it (creator "Suunto app", suunto:route metadata). */
export function routeToGpx(r: DemoRoute, username: string): string {
  const route = r.route;
  const name = route.description ?? route.name ?? "Unnamed route";
  const ele = (p: DemoRoutePoint) => (p.ele !== undefined ? `<ele>${num7(p.ele)}</ele>` : "");
  const wpt = (p: DemoRoutePoint, label: string) =>
    `  <wpt lat="${num7(p.lat)}" lon="${num7(p.lon)}">${ele(p)}<name>${label}</name><desc>Auto-generated</desc><type>${label}</type></wpt>`;
  const first = r.points[0]!;
  const last = r.points[r.points.length - 1]!;
  const rtepts = r.points.map((p) => {
    const ext =
      p.name !== undefined || p.type !== undefined
        ? `<extensions><suunto:routePoint>${p.name !== undefined ? `<suunto:name>${xmlEscape(p.name)}</suunto:name>` : ""}<suunto:type>${xmlEscape(p.type ?? "Waypoint")}</suunto:type>${
            p.desc !== undefined ? `<suunto:description>${xmlEscape(p.desc)}</suunto:description>` : ""
          }</suunto:routePoint></extensions>`
        : "";
    return `    <rtept lat="${num7(p.lat)}" lon="${num7(p.lon)}">${ele(p)}${ext}</rtept>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:suunto="http://www.suunto.com/xmlschemas/RouteExtension/v1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" creator="Suunto app" version="1.1" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    "  <metadata>",
    `    <name>${xmlEscape(name)}</name>`,
    `    <author><name>${xmlEscape(username)}</name></author>`,
    "    <extensions>",
    "      <suunto:route>",
    `        <suunto:id>${xmlEscape(route.id)}</suunto:id>`,
    `        <suunto:revision>${r.revision}</suunto:revision>`,
    `        <suunto:activityIds>${(route.activityIds ?? []).map((id) => `<suunto:activityId>${id}</suunto:activityId>`).join("")}</suunto:activityIds>`,
    `        <suunto:turnWaypointsEnabled>${route.turnWaypointsEnabled === true}</suunto:turnWaypointsEnabled>`,
    "      </suunto:route>",
    "    </extensions>",
    "  </metadata>",
    wpt(first, "Begin"),
    wpt(last, "End"),
    "  <rte>",
    ...rtepts,
    "  </rte>",
    "</gpx>",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------------------------

const WORKOUT_KEY = /^[0-9a-f]{24}$/i;

/** An ActivityBackend on a DemoActivityStore. */
export class DemoActivityBackend implements ActivityBackend {
  readonly kind = "demo" as const;

  constructor(readonly store: DemoActivityStore) {}

  /** A synced workout, or the error Suunto answers with. */
  private workoutOrFail(key: string, what: string): DemoWorkout {
    const k = key.trim();
    if (!WORKOUT_KEY.test(k)) {
      // Suunto answers a malformed key with HTTP 500 (FAQ).
      throw new DemoSuuntoError(
        500,
        `Suunto had an internal error (${what}, HTTP 500). Suunto also answers this way for a workout key that does not exist: check the key (from suunto_list_workouts).`,
      );
    }
    const w = this.store.workout(k);
    if (!w) throw new DemoNotFoundError(`Suunto has no workout with the key ${k}.`);
    return w;
  }

  /** A 247 window: from <= to, at most 28 days. */
  private checkWindow(fromMs: number, toMs: number, what: string): void {
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs < 0 || toMs < fromMs) throw badRequest(what, BAD_PARAMETERS);
    if (toMs - fromMs > MAX_WINDOW_MS) throw badRequest(what, `${BAD_PARAMETERS} The time range can be at most 28 days.`);
  }

  // -------------------------------------------------------------------------------------------
  // Workouts
  // -------------------------------------------------------------------------------------------

  async listWorkouts(q: ListWorkoutsQuery): Promise<WireWorkoutList> {
    const now = this.store.now();
    if (!Number.isInteger(q.limit) || q.limit < 1 || !Number.isInteger(q.offset) || q.offset < 0) throw badRequest("the workout list", "limit and offset must be whole numbers.");
    const since = q.since ?? 0;
    const until = q.until ?? now;
    const field = (w: DemoWorkout) => (q.byModificationTime ? w.lastModifiedMs : w.startMs);
    const matching = this.store
      .visibleWorkouts(now)
      .filter((w) => field(w) >= since && field(w) < until)
      .sort((a, b) => field(b) - field(a));
    const payload = matching.slice(q.offset, q.offset + q.limit).map((w) => this.listItem(w));
    return { error: null, payload, metadata: { workoutcount: String(payload.length), until: String(until) } };
  }

  /** A workout as the list returns it: the summary with its SummaryExtension. */
  private listItem(w: DemoWorkout): WireWorkout {
    return { ...structuredClone(w.wire), extensions: [structuredClone(w.summaryExtension)] };
  }

  async getWorkout(key: string, extensions: readonly string[]): Promise<WireWorkout> {
    const w = this.workoutOrFail(key, "the workout");
    const names = extensions.map((e) => e.trim()).filter((e) => e !== "");
    const unknown = names.filter((n) => !EXTENSION_NAMES.has(n));
    if (unknown.length > 0) throw badRequest("the workout", `Unknown extension: ${unknown.join(", ")}`);
    // Without the parameter the answer has the summary only, like the workout list.
    if (names.length === 0) return this.listItem(w);
    let series: WorkoutSeries | undefined;
    const lazy = () => (series ??= workoutSeries(w));
    const ext: WireExtension[] = workoutExtensions(w, names, lazy);
    return { ...structuredClone(w.wire), extensions: ext };
  }

  async exportFit(key: string): Promise<Buffer> {
    return workoutFit(this.workoutOrFail(key, "the FIT file of the workout"));
  }

  /** Extension names this workout has (for tests and the mock API). */
  extensionsOf(key: string): string[] {
    return availableExtensions(this.workoutOrFail(key, "the workout"));
  }

  // -------------------------------------------------------------------------------------------
  // 24/7 data
  // -------------------------------------------------------------------------------------------

  async activitySamples(fromMs: number, toMs: number): Promise<WireSample<WireActivityEntry>[]> {
    this.checkWindow(fromMs, toMs, "the 24/7 activity samples");
    return this.store.timeline().activity(fromMs, toMs);
  }

  async sleep(fromMs: number, toMs: number): Promise<WireSample<WireSleepEntry>[]> {
    this.checkWindow(fromMs, toMs, "the sleep data");
    return this.store.timeline().sleep(fromMs, toMs);
  }

  async recovery(fromMs: number, toMs: number): Promise<WireSample<WireRecoveryEntry>[]> {
    this.checkWindow(fromMs, toMs, "the recovery data");
    return this.store.timeline().recovery(fromMs, toMs);
  }

  async dailyStatistics(startdate: string, enddate: string): Promise<WireDailyStatistic[]> {
    const what = "the daily activity statistics";
    const parse = (value: string): number => {
      const v = value.trim();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(v)) return Number.NaN;
      // Without an offset the time is UTC (the API stores and reads 247 data in UTC).
      return Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(v) ? v : `${v}Z`);
    };
    const start = parse(startdate);
    const end = parse(enddate);
    this.checkWindow(start, end, what);
    return this.store.timeline().dailyStatistics(start, end);
  }

  // -------------------------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------------------------

  private route(id: string): DemoRoute {
    const r = this.store.routes.find((x) => x.route.id === id.trim());
    if (!r) throw new DemoNotFoundError(`Suunto has no route with the id ${id.trim()}.`);
    return r;
  }

  async listRoutes(q: ListRoutesQuery): Promise<WireRoute[]> {
    if (!Number.isInteger(q.page) || q.page < 0 || !Number.isInteger(q.size) || q.size < 1) throw badRequest("the route list", "page and size must be whole numbers.");
    const dir = q.sort === "desc" ? -1 : 1;
    const routes = this.store.routes
      .filter((r) => q.since === undefined || (r.route.modified ?? 0) >= q.since)
      .sort((a, b) => dir * ((a.route.modified ?? 0) - (b.route.modified ?? 0)) || a.route.id.localeCompare(b.route.id));
    return routes.slice(q.page * q.size, (q.page + 1) * q.size).map((r) => structuredClone(r.route));
  }

  async getRoute(id: string): Promise<WireRoute> {
    return structuredClone(this.route(id).route);
  }

  async exportRouteGpx(id: string): Promise<string> {
    return routeToGpx(this.route(id), DEMO_USERNAME);
  }

  async importRouteGpx(gpx: string, activityIds: readonly number[]): Promise<WireRoute | undefined> {
    if (activityIds.some((id) => !Number.isInteger(id) || id < 0)) throw badRequest("the route import", "activities must be Suunto activity ids.");
    const parsed = parseGpxRoutes(gpx);
    const now = this.store.now();
    const ids = activityIds.length > 0 ? [...activityIds] : [1];
    const added = parsed.map((p) =>
      makeRoute({ id: this.store.newId(now), name: p.name, points: p.points, activityIds: ids, createdMs: now, modifiedMs: now, watchEnabled: true }),
    );
    this.store.routes.push(...added);
    return structuredClone(added[0]!.route);
  }

  // -------------------------------------------------------------------------------------------
  // Points of interest
  // -------------------------------------------------------------------------------------------

  async listPois(q: { limit: number; offset: number }): Promise<WirePoiEnvelope[]> {
    if (!Number.isInteger(q.limit) || q.limit < 1 || !Number.isInteger(q.offset) || q.offset < 0) throw badRequest("the points of interest", "limit and offset must be whole numbers.");
    // Newest first, so a point just added is on the first page.
    const pois = [...this.store.pois].sort((a, b) => (b.creation ?? 0) - (a.creation ?? 0) || String(b.key).localeCompare(String(a.key)));
    return pois.slice(q.offset, q.offset + q.limit).map((p) => ({ pointOfInterest: structuredClone(p) }));
  }

  async createPoi(poi: WirePoiInput): Promise<WirePoiEnvelope> {
    const what = "the new point of interest";
    const input = poi as Partial<WirePoiInput> & { point?: Partial<WirePoiInput["point"]> };
    if (input.watchEnabled !== true) throw badRequest(what, "watchEnabled must be true.");
    const p = input.point;
    if (!p || typeof p.x !== "number" || typeof p.y !== "number" || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 180 || Math.abs(p.y) > 90) {
      throw badRequest(what, "point.x (longitude) and point.y (latitude) are required.");
    }
    if (!isPoiType(p.type)) throw badRequest(what, "point.type must be a PoiType value.");
    if (p.z !== undefined && (typeof p.z !== "number" || !Number.isFinite(p.z))) throw badRequest(what, "point.z must be a number.");
    if (p.name !== undefined && typeof p.name !== "string") throw badRequest(what, "point.name must be a string.");
    if (input.activityId !== undefined && (!Number.isInteger(input.activityId) || input.activityId < 0)) throw badRequest(what, "activityId must be a Suunto activity id.");
    const now = this.store.now();
    const seconds = Math.floor(now / 1000);
    const created: WirePoi = {
      key: this.store.newId(now),
      creation: seconds,
      modified: seconds,
      point: { x: p.x, y: p.y, ...(p.z !== undefined ? { z: p.z } : {}), ...(p.name !== undefined ? { name: p.name } : {}), type: p.type },
      ...(input.activityId !== undefined ? { activityId: input.activityId } : {}),
      watchEnabled: true,
    };
    this.store.pois.push(created);
    return { pointOfInterest: structuredClone(created) };
  }

  // -------------------------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------------------------

  async account(): Promise<SuuntoAccount> {
    // A demo account has no access token, so no expiry.
    return { username: DEMO_USERNAME };
  }

  async close(): Promise<void> {
    // The store outlives the backend (it is reset by the demo registry).
  }
}
