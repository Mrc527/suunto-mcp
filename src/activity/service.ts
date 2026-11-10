/**
 * ActivityService: everything between the MCP tools and an ActivityBackend (docs/DESIGN.md
 * sections 5, 6 and 11).
 *
 * It validates input (the zod shapes below are shared with the tools), turns dates in the user's
 * time zone into time windows, splits 24/7 requests into windows the API accepts (at most 28
 * days), pages and filters workouts, computes statistics, checks GPX files and converts every
 * answer to the user's units (format.ts). The backend only moves wire data. Requests of one call
 * run one after another, never in parallel, to be kind to Suunto's rate limit.
 */

import { z } from "zod";
import { activityIdFor, activityIdsFor, activityName, DEFAULT_POI_TYPE, POI_TYPES, poiTypeId, SPORT_EXAMPLES } from "../suunto/activities.js";
import {
  addDays,
  DAY_MS,
  datesBetween,
  daysBetween,
  formatInZone,
  formatUtcNoOffset,
  HOUR_MS,
  isDateOnly,
  isoWeek,
  MINUTE_MS,
  parseDateOnly,
  parseDateTimeInput,
  startOfDay,
  todayInZone,
  wallTimeToDate,
} from "../util/dates.js";
import { describeError, ReadOnlyError, UserFacingError } from "../util/errors.js";
import {
  LAP_EXTENSIONS,
  SAMPLE_EXTENSIONS,
  SAMPLE_NAMES,
  SUMMARY_EXTENSIONS,
  epochMs,
  sleepTimes,
  timedSamples,
  toDaySummaries,
  toPoiSummary,
  toRecoveryPoints,
  toRouteSummary,
  toSamplePoints,
  toSleepNight,
  toWorkout,
  toWorkoutSummary,
  workoutDurationS,
  workoutKeyOf,
  workoutStartMs,
  type DayStart,
  type Resolution,
  type SampleName,
} from "./format.js";
import type {
  ActivityBackend,
  DaySummary,
  PoiSummary,
  RecoveryPoint,
  RouteSummary,
  SamplePoint,
  SleepNight,
  SuuntoAccount,
  UnitChoice,
  UnitLabels,
  WirePoiInput,
  WireRoute,
  WireSample,
  WireWorkout,
  Workout,
  WorkoutSummary,
} from "./types.js";
import * as U from "./units.js";

export { ReadOnlyError };

export interface ServiceOptions {
  readOnly: boolean;
  /** Units of answers and of unit-bearing inputs when a call names none. */
  units: UnitChoice;
  /** IANA time zone of the user: calendar dates and 24/7 times are in this zone. */
  timeZone: string;
  /** The clock (epoch ms), for tests. */
  now?: () => number;
}

// ---------------------------------------------------------------------------------------------
// Limits (docs/DESIGN.md section 6)
// ---------------------------------------------------------------------------------------------

export const LIST_DEFAULT_DAYS = 30;
export const STATS_DEFAULT_DAYS = 365;
export const DAILY_MAX_DAYS = 92;
export const SLEEP_MAX_DAYS = 92;
export const SAMPLES_MAX_DAYS = 28;
export const RECOVERY_MAX_DAYS = 28;
export const RAW_MAX_DAYS = 2;
/** Workouts read for a sport filter (or when the list order of Suunto is not newest first). */
export const LIST_SCAN_CAP = 1000;
export const STATS_CAP = 2000;
/** Workouts per request when a whole range is read. */
export const WORKOUT_PAGE = 100;
/** The longest window the 247 endpoints accept (docs/suunto-api.md section 3.2). */
export const WINDOW_MS = 28 * DAY_MS;
export const MAX_FIT_BYTES = 8 * 1024 * 1024;
export const MAX_ROUTE_GPX_BYTES = 1024 * 1024;
export const MAX_IMPORT_GPX_BYTES = 5 * 1024 * 1024;
/** Altitudes of new points of interest, in metres. */
export const MIN_ALTITUDE_M = -1000;
export const MAX_ALTITUDE_M = 9000;
/** How far back a route counts as "just imported" when Suunto's answer has no route. */
const IMPORT_LOOKBACK_MS = 2 * MINUTE_MS;

// ---------------------------------------------------------------------------------------------
// Input shapes (zod v4), shared with the tools
// ---------------------------------------------------------------------------------------------

export const UNITS_TEXT = "metric (km, m, km/h, min/km, °C) or imperial (mi, ft, mph, min/mi, °F). Default: the account setting";

const unitsArg = z.enum(["metric", "imperial"]).describe(`Units of the numbers in this call and its answer: ${UNITS_TEXT}`);
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date YYYY-MM-DD");
const dateOrTime = z
  .string()
  .trim()
  .min(10, "Use a date YYYY-MM-DD or an ISO 8601 date-time")
  .max(40, "Use a date YYYY-MM-DD or an ISO 8601 date-time");
const sportArg = z.string().trim().min(1).max(60);
const workoutKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "A workout key has only letters, digits, - and _ (use workout_key from suunto_list_workouts)");
const routeId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "A route id has only letters, digits, - and _ (use route_id from suunto_list_routes)");
const resolutionArg = z.enum(["raw", "hour", "day"]);

export const listWorkoutsShape = {
  from: dateOrTime.optional(),
  to: dateOrTime.optional(),
  sport: sportArg.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
  units: unitsArg.optional(),
};

export const getWorkoutShape = {
  workout_key: workoutKey,
  samples: z.array(z.enum(SAMPLE_NAMES)).max(SAMPLE_NAMES.length).optional(),
  max_points: z.number().int().min(10).max(1000).optional(),
  units: unitsArg.optional(),
};

export const workoutStatsShape = {
  from: dateOrTime.optional(),
  to: dateOrTime.optional(),
  sport: sportArg.optional(),
  group_by: z.enum(["none", "week", "month", "year", "sport"]).optional(),
  units: unitsArg.optional(),
};

export const exportFitShape = { workout_key: workoutKey };

export const dailyActivityShape = { from: dateOnly, to: dateOnly, units: unitsArg.optional() };

export const activitySamplesShape = {
  from: dateOrTime,
  to: dateOrTime,
  resolution: resolutionArg.optional(),
  units: unitsArg.optional(),
};

export const sleepShape = { from: dateOnly, to: dateOnly };

export const recoveryShape = { from: dateOrTime, to: dateOrTime, resolution: resolutionArg.optional() };

export const listRoutesShape = {
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
  units: unitsArg.optional(),
};

export const getRouteShape = { route_id: routeId, format: z.enum(["summary", "gpx"]).optional(), units: unitsArg.optional() };

export const listPoisShape = {
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
  units: unitsArg.optional(),
};

export const importRouteShape = {
  gpx: z.string().min(1).max(MAX_IMPORT_GPX_BYTES, "The GPX is longer than 5 MB"),
  sports: z.array(sportArg).max(10).optional(),
  units: unitsArg.optional(),
};

export const createPoiShape = {
  name: z.string().trim().min(1, "Give a name").max(60, "The name has at most 60 characters"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  altitude: z.number().min(-35_000).max(35_000).optional(),
  altitude_m: z.number().min(MIN_ALTITUDE_M).max(MAX_ALTITUDE_M).optional(),
  type: z.string().trim().min(1).max(40).optional(),
  sport: sportArg.optional(),
  units: unitsArg.optional(),
};

const schemas = {
  listWorkouts: z.strictObject(listWorkoutsShape),
  getWorkout: z.strictObject(getWorkoutShape),
  workoutStats: z.strictObject(workoutStatsShape),
  exportFit: z.strictObject(exportFitShape),
  dailyActivity: z.strictObject(dailyActivityShape),
  activitySamples: z.strictObject(activitySamplesShape),
  sleep: z.strictObject(sleepShape),
  recovery: z.strictObject(recoveryShape),
  listRoutes: z.strictObject(listRoutesShape),
  getRoute: z.strictObject(getRouteShape),
  listPois: z.strictObject(listPoisShape),
  importRoute: z.strictObject(importRouteShape),
  createPoi: z.strictObject(createPoiShape),
};

export type ListWorkoutsArgs = z.input<typeof schemas.listWorkouts>;
export type GetWorkoutArgs = z.input<typeof schemas.getWorkout>;
export type WorkoutStatsArgs = z.input<typeof schemas.workoutStats>;
export type ExportFitArgs = z.input<typeof schemas.exportFit>;
export type DailyActivityArgs = z.input<typeof schemas.dailyActivity>;
export type ActivitySamplesArgs = z.input<typeof schemas.activitySamples>;
export type SleepArgs = z.input<typeof schemas.sleep>;
export type RecoveryArgs = z.input<typeof schemas.recovery>;
export type ListRoutesArgs = z.input<typeof schemas.listRoutes>;
export type GetRouteArgs = z.input<typeof schemas.getRoute>;
export type ListPoisArgs = z.input<typeof schemas.listPois>;
export type ImportRouteArgs = z.input<typeof schemas.importRoute>;
export type CreatePoiArgs = z.input<typeof schemas.createPoi>;
export type StatsGroupBy = "none" | "week" | "month" | "year" | "sport";

/** Parse arguments (the tools already did; direct callers get the same checks). */
function parse<T extends z.ZodType>(schema: T, args: unknown): z.output<T> {
  const result = schema.safeParse(args ?? {});
  if (result.success) return result.data;
  const problems = result.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "arguments"}: ${i.message}`);
  throw new UserFacingError(`Invalid arguments. ${problems.join("; ")}.`);
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

export interface ListWorkoutsResult {
  from: string;
  to: string;
  sport?: string;
  /** The activities the sport filter matched. */
  sports_matched?: string[];
  /** Workouts in the range (and sport), when known. */
  total_in_range?: number;
  count: number;
  workouts: WorkoutSummary[];
  next_offset?: number;
  note?: string;
  units: UnitLabels;
}

export interface WorkoutRef {
  workout_key: string;
  sport: string;
  name?: string;
  start: string;
}

export interface StatsSummary {
  count: number;
  /** h:mm:ss */
  total_duration: string;
  total_duration_s: number;
  /** units.distance */
  total_distance?: number;
  /** units.elevation */
  total_ascent?: number;
  total_energy_kcal?: number;
  /** Heart rate averaged over the time of the workouts that have one (bpm). */
  avg_hr?: number;
  longest?: WorkoutRef & { duration: string; duration_s: number };
  farthest?: WorkoutRef & { distance: number };
  /** Local dates of the first and the last workout. */
  first_date?: string;
  last_date?: string;
}

export interface StatsResult extends StatsSummary {
  from: string;
  to: string;
  sport?: string;
  group_by: StatsGroupBy;
  groups?: Array<StatsSummary & { key: string }>;
  note?: string;
  units: UnitLabels;
}

export interface ExportFitResult {
  workout_key: string;
  bytes: number;
  file_name: string;
  data: Buffer;
}

export interface DailyActivityResult {
  from: string;
  to: string;
  time_zone: string;
  days: DaySummary[];
  days_with_data: number;
  totals: { steps: number; energy_kcal: number };
  /** Per day with data. */
  averages?: { steps?: number; energy_kcal?: number };
  units: UnitLabels;
}

export interface ActivitySamplesResult {
  from: string;
  to: string;
  time_zone: string;
  resolution: Resolution;
  count: number;
  points: SamplePoint[];
  units: UnitLabels;
}

export interface SleepResult {
  from: string;
  to: string;
  time_zone: string;
  count: number;
  sleeps: SleepNight[];
  /** Over the sleeps that are not naps. */
  averages?: {
    duration?: string;
    duration_s?: number;
    deep_s?: number;
    light_s?: number;
    rem_s?: number;
    hr_avg?: number;
    hrv_avg_ms?: number;
    quality_score?: number;
  };
  units: UnitLabels;
}

export interface RecoveryResult {
  from: string;
  to: string;
  time_zone: string;
  resolution: Resolution;
  count: number;
  points: RecoveryPoint[];
  summary?: { balance_pct_min: number; balance_pct_avg: number; balance_pct_max: number; samples: number };
}

export interface ListRoutesResult {
  count: number;
  routes: RouteSummary[];
  next_offset?: number;
  units: UnitLabels;
}

export type GetRouteResult = (RouteSummary & { units: UnitLabels }) | { route_id: string; format: "gpx"; bytes: number; gpx: string };

export interface ListPoisResult {
  count: number;
  pois: PoiSummary[];
  next_offset?: number;
  units: UnitLabels;
}

export interface ImportRouteResult {
  added: true;
  route?: RouteSummary;
  /** How many routes the file holds (each <rte> and <trk> becomes one route). */
  routes_in_file: number;
  points: number;
  note?: string;
  units: UnitLabels;
}

export interface CreatePoiResult {
  added: true;
  poi: PoiSummary;
  units: UnitLabels;
}

export interface CheckResult {
  ok: boolean;
  error?: string;
  workouts_last_30_days?: number;
}

// ---------------------------------------------------------------------------------------------
// GPX checks (docs/DESIGN.md section 9: parsed only to check it, sent as it is)
// ---------------------------------------------------------------------------------------------

export interface GpxInfo {
  /** The name of the first route or track, else of the metadata. */
  name?: string;
  /** Number of <rte> and <trk> elements (each becomes one route at Suunto). */
  routes: number;
  /** Number of <rtept> and <trkpt> elements. */
  points: number;
}

function decodeXmlText(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Math.min(Number(d), 0x10ffff)))
    .replace(/&amp;/g, "&")
    .trim();
}

const NAME_TAG = /<(?:[\w.-]+:)?name\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?name>/;

/** The name of the first <rte>/<trk> (before its points), else of <metadata>. */
function gpxName(gpx: string): string | undefined {
  const container = gpx.match(/<(?:[\w.-]+:)?(?:rte|trk)\b[^>]*>/);
  if (container?.index !== undefined) {
    const after = gpx.slice(container.index + container[0].length);
    const head = after.split(/<(?:[\w.-]+:)?(?:rtept|trkseg|trkpt)\b/)[0] ?? "";
    const name = head.match(NAME_TAG)?.[1];
    if (name && decodeXmlText(name)) return decodeXmlText(name).slice(0, 200);
  }
  const metadata = gpx.match(/<(?:[\w.-]+:)?metadata\b[\s\S]*?<\/(?:[\w.-]+:)?metadata>/)?.[0];
  const name = metadata?.match(NAME_TAG)?.[1];
  return name && decodeXmlText(name) ? decodeXmlText(name).slice(0, 200) : undefined;
}

/**
 * Check a GPX file before it is sent to Suunto: at most 5 MB, no DOCTYPE or ENTITY (no entity
 * expansion, ever), root element <gpx>, at least one <rte> or <trk>, at least 2 route or track
 * points, every point with a latitude and longitude in range. Throws a UserFacingError that says
 * what to fix.
 */
export function checkGpx(gpx: string): GpxInfo {
  const bytes = Buffer.byteLength(gpx, "utf8");
  if (bytes > MAX_IMPORT_GPX_BYTES) {
    throw new UserFacingError(`The GPX is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB. Simplify the route (fewer points) and try again.`);
  }
  if (/<!DOCTYPE/i.test(gpx) || /<!ENTITY/i.test(gpx)) {
    throw new UserFacingError("The GPX has a <!DOCTYPE> or <!ENTITY> declaration. These are not allowed: remove them and send plain GPX 1.1.");
  }
  const body = gpx.replace(/^﻿/, "").replace(/^\s*(?:(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->)\s*)*/, "");
  const root = body.match(/^<(?:[A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)[\s>/]/);
  if (!root || root[1]!.toLowerCase() !== "gpx") {
    throw new UserFacingError("This is not a GPX file: the root element must be <gpx> (GPX 1.1 text, not a file name or a link).");
  }
  const routes = (gpx.match(/<(?:[\w.-]+:)?(?:rte|trk)\b[\s>/]/g) ?? []).length;
  if (!routes) throw new UserFacingError("The GPX has no <rte> or <trk>. Suunto imports routes from <rte> or <trk> elements; waypoints (<wpt>) alone are not a route.");
  let points = 0;
  for (const m of gpx.matchAll(/<(?:[\w.-]+:)?(rtept|trkpt)\b([^>]*)>/g)) {
    points++;
    const attrs = m[2] ?? "";
    const lat = Number(attrs.match(/\blat\s*=\s*["']\s*([^"']*?)\s*["']/)?.[1] ?? Number.NaN);
    const lon = Number(attrs.match(/\blon\s*=\s*["']\s*([^"']*?)\s*["']/)?.[1] ?? Number.NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      throw new UserFacingError(
        `Point ${points} (<${m[1]}>) of the GPX has no valid position: it needs lat between -90 and 90 and lon between -180 and 180, for example <${m[1]} lat="46.5" lon="7.9">.`,
      );
    }
  }
  if (points < 2) throw new UserFacingError(`The GPX has ${points} route or track point${points === 1 ? "" : "s"}; a route needs at least 2 (<rtept> or <trkpt>).`);
  const name = gpxName(gpx);
  return { ...(name ? { name } : {}), routes, points };
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

interface Range {
  fromMs: number;
  toMs: number;
  /** As given (dates) or as instants in the user's zone. */
  from: string;
  to: string;
  fromDate?: string;
  toDate?: string;
}

/** The activity ids of a sport filter, or an error that lists examples. */
export function sportFilterIds(sport: string): number[] {
  const ids = activityIdsFor(sport);
  if (!ids.length) {
    throw new UserFacingError(
      `Unknown sport "${sport}". Use an activity name (for example Running, Trail running, Cycling, Hiking, Scuba diving) or a word such as ${SPORT_EXAMPLES.slice(0, 17).join(", ")}.`,
    );
  }
  return ids;
}

/** One activity id per sport name (routes and points of interest), or an error with examples. */
export function activityIdOf(sport: string): number {
  const id = activityIdFor(sport);
  if (id === undefined) {
    throw new UserFacingError(
      `Unknown sport "${sport}". Use an activity name such as Running, Trail running, Cycling, Mountain biking, Hiking, Cross-country skiing or Ski touring (also: ${SPORT_EXAMPLES.slice(0, 12).join(", ")}).`,
    );
  }
  return id;
}

function workoutTime(w: WireWorkout): number {
  return workoutStartMs(w) ?? epochMs(w.created) ?? 0;
}

/** Newest first; ties by key so pages stay stable. */
function newestFirst(list: readonly WireWorkout[]): WireWorkout[] {
  return [...list].sort((a, b) => workoutTime(b) - workoutTime(a) || (workoutKeyOf(a) ?? "").localeCompare(workoutKeyOf(b) ?? ""));
}

/** The order of a page: "desc" (newest first), "asc" or "unknown" (too few or mixed). */
function orderOf(list: readonly WireWorkout[]): "desc" | "asc" | "unknown" {
  let up = false;
  let down = false;
  let prev: number | undefined;
  for (const w of list) {
    const t = workoutStartMs(w);
    if (t === undefined) continue;
    if (prev !== undefined) {
      if (t > prev) up = true;
      else if (t < prev) down = true;
    }
    prev = t;
  }
  if (down && !up) return "desc";
  if (up && !down) return "asc";
  return "unknown";
}

function dedupeWorkouts(list: readonly WireWorkout[]): WireWorkout[] {
  const seen = new Set<string>();
  const out: WireWorkout[] = [];
  for (const w of list) {
    const key = workoutKeyOf(w);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

class StatsAccumulator {
  private count = 0;
  private seconds = 0;
  private metres = 0;
  private ascentM = 0;
  private kcal = 0;
  private hasDistance = false;
  private hasAscent = false;
  private hasEnergy = false;
  private hrWeighted = 0;
  private hrSeconds = 0;
  private longest?: { s: WorkoutSummary; seconds: number };
  private farthest?: { s: WorkoutSummary; metres: number };
  private first?: string;
  private last?: string;

  add(w: WireWorkout, s: WorkoutSummary): void {
    this.count++;
    const seconds = workoutDurationS(w) ?? 0;
    this.seconds += seconds;
    const metres = U.num(w.totalDistance);
    if (metres !== undefined && metres > 0) {
      this.metres += metres;
      this.hasDistance = true;
      if (!this.farthest || metres > this.farthest.metres) this.farthest = { s, metres };
    }
    const ascent = U.num(w.totalAscent);
    if (ascent !== undefined && ascent > 0) {
      this.ascentM += ascent;
      this.hasAscent = true;
    }
    const kcal = U.num(w.energyConsumption);
    if (kcal !== undefined && kcal > 0) {
      this.kcal += kcal;
      this.hasEnergy = true;
    }
    if (s.avg_hr !== undefined && seconds > 0) {
      this.hrWeighted += s.avg_hr * seconds;
      this.hrSeconds += seconds;
    }
    if (seconds > 0 && (!this.longest || seconds > this.longest.seconds)) this.longest = { s, seconds };
    const date = /^\d{4}-\d{2}-\d{2}/.test(s.start) ? s.start.slice(0, 10) : undefined;
    if (date) {
      if (!this.first || date < this.first) this.first = date;
      if (!this.last || date > this.last) this.last = date;
    }
  }

  get totalSeconds(): number {
    return this.seconds;
  }

  summary(units: UnitChoice): StatsSummary {
    const ref = (s: WorkoutSummary): WorkoutRef => ({ workout_key: s.workout_key, sport: s.sport, ...(s.name ? { name: s.name } : {}), start: s.start });
    const out: StatsSummary = { count: this.count, total_duration: U.formatDuration(this.seconds), total_duration_s: U.round(this.seconds) };
    if (this.hasDistance) out.total_distance = U.distance(this.metres, units);
    if (this.hasAscent) out.total_ascent = U.elevation(this.ascentM, units);
    if (this.hasEnergy) out.total_energy_kcal = U.round(this.kcal);
    if (this.hrSeconds > 0) out.avg_hr = U.round(this.hrWeighted / this.hrSeconds);
    if (this.longest) out.longest = { ...ref(this.longest.s), duration: U.formatDuration(this.longest.seconds), duration_s: U.round(this.longest.seconds) };
    if (this.farthest) out.farthest = { ...ref(this.farthest.s), distance: U.distance(this.farthest.metres, units) };
    if (this.first) out.first_date = this.first;
    if (this.last) out.last_date = this.last;
    return out;
  }
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function average(values: readonly number[]): number | undefined {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
}

// ---------------------------------------------------------------------------------------------
// The service
// ---------------------------------------------------------------------------------------------

export class ActivityService {
  readonly backend: ActivityBackend;
  private readonly opts: ServiceOptions;

  constructor(backend: ActivityBackend, opts: ServiceOptions) {
    this.backend = backend;
    this.opts = { ...opts };
  }

  get timeZone(): string {
    return this.opts.timeZone;
  }

  get units(): UnitChoice {
    return this.opts.units;
  }

  get readOnly(): boolean {
    return this.opts.readOnly;
  }

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  private unitsOf(units: UnitChoice | undefined): UnitChoice {
    return units ?? this.opts.units;
  }

  /** Every write calls this first. */
  assertWritable(action: string): void {
    if (this.opts.readOnly) throw new ReadOnlyError(action);
  }

  // -------------------------------------------------------------------------------------------
  // Dates and windows
  // -------------------------------------------------------------------------------------------

  /**
   * A time window from the user's `from` and `to`. Dates (YYYY-MM-DD) are calendar days in the
   * user's zone: `from` starts at its local midnight, `to` is included (up to the next local
   * midnight). Date-times are instants (ISO 8601; without an offset they are local times).
   * Without `to` the window ends today; without `from` it is `defaultDays` long.
   */
  private range(fromArg: string | undefined, toArg: string | undefined, defaultDays: number, maxDays?: number, tool?: string): Range {
    const tz = this.opts.timeZone;
    const point = (value: string, end: boolean): { ms: number; date?: string } => {
      if (isDateOnly(value)) {
        parseDateOnly(value);
        return { ms: startOfDay(end ? addDays(value, 1) : value, tz).getTime(), date: value };
      }
      return { ms: parseDateTimeInput(value, tz).getTime() };
    };
    const today = todayInZone(tz, new Date(this.now()));
    const to = toArg !== undefined ? point(toArg, true) : point(today, true);
    let from: { ms: number; date?: string };
    if (fromArg !== undefined) from = point(fromArg, false);
    else if (to.date) from = point(addDays(to.date, -(defaultDays - 1)), false);
    else from = { ms: to.ms - defaultDays * DAY_MS };
    const r: Range = {
      fromMs: from.ms,
      toMs: to.ms,
      from: from.date ?? formatInZone(new Date(from.ms), tz),
      to: to.date ?? formatInZone(new Date(to.ms), tz),
      ...(from.date ? { fromDate: from.date } : {}),
      ...(to.date ? { toDate: to.date } : {}),
    };
    if (r.fromMs >= r.toMs) throw new UserFacingError(`"from" (${r.from}) must be before "to" (${r.to}).`);
    if (maxDays !== undefined) {
      const days = r.fromDate && r.toDate ? daysBetween(r.fromDate, r.toDate) + 1 : (r.toMs - r.fromMs) / DAY_MS;
      // One hour of slack for date-times across a DST change.
      const tooLong = r.fromDate && r.toDate ? days > maxDays : r.toMs - r.fromMs > maxDays * DAY_MS + HOUR_MS;
      if (tooLong) {
        throw new UserFacingError(
          `The range from ${r.from} to ${r.to} is ${Math.ceil(days)} days; ${tool ?? "this tool"} takes at most ${maxDays} days per call. Ask for shorter ranges, one after another.`,
        );
      }
    }
    return r;
  }

  /**
   * Calls a 247 endpoint for [fromMs, toMs) in windows shorter than 28 days, one after another,
   * never for the future. Each window ends 1 ms before the next starts: the docs do not say
   * whether `to` is included, and the span stays below the 28-day limit.
   */
  private async windowed<T>(fromMs: number, toMs: number, call: (from: number, to: number) => Promise<WireSample<T>[]>): Promise<WireSample<T>[]> {
    const end = Math.min(toMs, this.now());
    const out: WireSample<T>[] = [];
    for (let start = fromMs; start < end; start += WINDOW_MS) {
      out.push(...(await call(start, Math.min(start + WINDOW_MS, end) - 1)));
    }
    return out;
  }

  /** Whole local days, grouped so that each group spans at most 28 days in UTC (DST safe). */
  private dayGroups(days: readonly DayStart[]): DayStart[][] {
    const tz = this.opts.timeZone;
    const groups: DayStart[][] = [];
    let group: DayStart[] = [];
    for (const day of days) {
      if (group.length) {
        const end = startOfDay(addDays(day.date, 1), tz).getTime();
        if (end - group[0]!.ms > WINDOW_MS) {
          groups.push(group);
          group = [];
        }
      }
      group.push(day);
    }
    if (group.length) groups.push(group);
    return groups;
  }

  // -------------------------------------------------------------------------------------------
  // Workouts
  // -------------------------------------------------------------------------------------------

  /** Every workout that started in [since, until), at most `cap`, in pages of 100. */
  private async scanWorkouts(since: number, until: number, cap: number): Promise<{ workouts: WireWorkout[]; capped: boolean }> {
    const all: WireWorkout[] = [];
    let capped = true;
    for (let offset = 0; offset < cap; offset += WORKOUT_PAGE) {
      const limit = Math.min(WORKOUT_PAGE, cap - offset);
      const page = (await this.backend.listWorkouts({ since, until, limit, offset, byModificationTime: false })).payload ?? [];
      all.push(...page);
      if (page.length < limit) {
        capped = false;
        break;
      }
    }
    return { workouts: this.inRange(dedupeWorkouts(all), since, until), capped };
  }

  /** Suunto filters on the start time already; this keeps a strange answer from leaking in. */
  private inRange(list: readonly WireWorkout[], since: number, until: number): WireWorkout[] {
    return list.filter((w) => {
      const t = workoutStartMs(w);
      return t === undefined || (t >= since && t < until);
    });
  }

  /**
   * suunto_list_workouts. The order of Suunto's list is not documented. Without a sport filter
   * one page is read (one more workout than asked, to know whether there is a next page): when
   * that page is newest first it is used as it is. A short last page tells the total, so one more
   * request finds the oldest workouts when the list is oldest first. A full page that is oldest
   * first (or of unknown order) means the whole range is read (at most 1000 workouts) and sorted
   * here, newest first. With a sport filter the whole range is always read, filtered and sorted.
   */
  async listWorkouts(args: ListWorkoutsArgs = {}): Promise<ListWorkoutsResult> {
    const a = parse(schemas.listWorkouts, args);
    const units = this.unitsOf(a.units);
    const tz = this.opts.timeZone;
    const r = this.range(a.from, a.to, LIST_DEFAULT_DAYS);
    const limit = a.limit ?? 20;
    const offset = a.offset ?? 0;
    const sportIds = a.sport ? sportFilterIds(a.sport) : undefined;
    const head: Pick<ListWorkoutsResult, "from" | "to" | "sport" | "sports_matched"> = { from: r.from, to: r.to };
    if (a.sport && sportIds) {
      head.sport = a.sport;
      head.sports_matched = [...new Set(sportIds.map((id) => activityName(id)))];
    }
    const finish = (workouts: WireWorkout[], extra: Pick<ListWorkoutsResult, "total_in_range" | "next_offset" | "note">): ListWorkoutsResult => {
      const summaries = workouts.map((w) => toWorkoutSummary(w, units, tz));
      return {
        ...head,
        ...(extra.total_in_range !== undefined ? { total_in_range: extra.total_in_range } : {}),
        count: summaries.length,
        workouts: summaries,
        ...(extra.next_offset !== undefined ? { next_offset: extra.next_offset } : {}),
        ...(extra.note ? { note: extra.note } : {}),
        units: U.unitLabels(units),
      };
    };

    if (!sportIds) {
      const want = Math.min(limit + 1, WORKOUT_PAGE);
      const raw = (await this.backend.listWorkouts({ since: r.fromMs, until: r.toMs, limit: want, offset, byModificationTime: false })).payload ?? [];
      const page = this.inRange(dedupeWorkouts(raw), r.fromMs, r.toMs);
      const order = orderOf(raw);
      if (raw.length < want) {
        // The last page: the range holds offset + raw.length workouts, whatever the order.
        const total = offset + raw.length;
        if (offset === 0 || order === "desc" || !raw.length) {
          return finish(newestFirst(page).slice(0, limit), raw.length ? { total_in_range: total } : {});
        }
        // Oldest first (or unknown): the wanted workouts are the oldest raw.length of the range.
        // In either order they are in this page or in the first raw.length of the list.
        const start = (await this.backend.listWorkouts({ since: r.fromMs, until: r.toMs, limit: raw.length, offset: 0, byModificationTime: false })).payload ?? [];
        const oldest = newestFirst(this.inRange(dedupeWorkouts([...raw, ...start]), r.fromMs, r.toMs)).slice(-raw.length);
        return finish(oldest.slice(0, limit), { total_in_range: total });
      }
      if (order === "desc") {
        return finish(newestFirst(page).slice(0, limit), { next_offset: offset + limit });
      }
    }

    const { workouts, capped } = await this.scanWorkouts(r.fromMs, r.toMs, LIST_SCAN_CAP);
    const ids = sportIds ? new Set(sportIds) : undefined;
    const matching = newestFirst(ids ? workouts.filter((w) => ids.has(U.num(w.activityId) ?? -1)) : workouts);
    const shown = matching.slice(offset, offset + limit);
    const extra: Pick<ListWorkoutsResult, "total_in_range" | "next_offset" | "note"> = {};
    if (!capped) extra.total_in_range = matching.length;
    if (offset + shown.length < matching.length) extra.next_offset = offset + shown.length;
    if (capped) {
      extra.note = `This range has more than ${LIST_SCAN_CAP} workouts and only ${LIST_SCAN_CAP} were read${ids ? " for the sport filter" : ""}, so some may be missing. Use a shorter range (from, to).`;
    }
    return finish(shown, extra);
  }

  /** suunto_get_workout: the summary extensions and laps always; streams when asked for. */
  async getWorkout(args: GetWorkoutArgs): Promise<Workout> {
    const a = parse(schemas.getWorkout, args);
    const units = this.unitsOf(a.units);
    const samples = [...new Set(a.samples ?? [])] as SampleName[];
    const extensions = [...new Set([...SUMMARY_EXTENSIONS, ...LAP_EXTENSIONS, ...samples.map((s) => SAMPLE_EXTENSIONS[s])])];
    const wire = await this.backend.getWorkout(a.workout_key, extensions);
    const workout = toWorkout(wire, units, this.opts.timeZone, { samples, maxPoints: a.max_points ?? 200 });
    if (!workout.workout_key) workout.workout_key = a.workout_key;
    return workout;
  }

  /** suunto_workout_stats: totals over at most 2000 workouts, optionally per week, month, year or sport. */
  async workoutStats(args: WorkoutStatsArgs = {}): Promise<StatsResult> {
    const a = parse(schemas.workoutStats, args);
    const units = this.unitsOf(a.units);
    const tz = this.opts.timeZone;
    const r = this.range(a.from, a.to, STATS_DEFAULT_DAYS);
    const groupBy: StatsGroupBy = a.group_by ?? "none";
    const ids = a.sport ? new Set(sportFilterIds(a.sport)) : undefined;
    const { workouts, capped } = await this.scanWorkouts(r.fromMs, r.toMs, STATS_CAP);
    const chosen = ids ? workouts.filter((w) => ids.has(U.num(w.activityId) ?? -1)) : workouts;
    const all = new StatsAccumulator();
    const groups = new Map<string, StatsAccumulator>();
    for (const w of newestFirst(chosen).reverse()) {
      const s = toWorkoutSummary(w, units, tz);
      all.add(w, s);
      if (groupBy === "none") continue;
      const date = /^\d{4}-\d{2}-\d{2}/.test(s.start) ? s.start.slice(0, 10) : undefined;
      const key =
        groupBy === "sport" ? s.sport : !date ? "unknown" : groupBy === "week" ? isoWeek(date) : groupBy === "month" ? date.slice(0, 7) : date.slice(0, 4);
      let g = groups.get(key);
      if (!g) {
        g = new StatsAccumulator();
        groups.set(key, g);
      }
      g.add(w, s);
    }
    const result: Omit<StatsResult, "units"> = { from: r.from, to: r.to, ...(a.sport ? { sport: a.sport } : {}), group_by: groupBy, ...all.summary(units) };
    if (groupBy !== "none") {
      const list = [...groups.entries()].map(([key, g]) => ({ key, seconds: g.totalSeconds, ...g.summary(units) }));
      // Time groups in time order; sports with the most time first.
      list.sort((x, y) => (groupBy === "sport" ? y.seconds - x.seconds || x.key.localeCompare(y.key) : x.key.localeCompare(y.key)));
      result.groups = list.map(({ seconds: _s, ...g }) => g);
    }
    if (capped) result.note = `More than ${STATS_CAP} workouts are in this range; only ${STATS_CAP} were counted. Use a shorter range (from, to).`;
    return { ...result, units: U.unitLabels(units) };
  }

  /** suunto_export_workout_fit: the FIT file (at most 8 MB). */
  async exportFit(args: ExportFitArgs): Promise<ExportFitResult> {
    const a = parse(schemas.exportFit, args);
    const data = await this.backend.exportFit(a.workout_key);
    if (!data.length) throw new UserFacingError(`Suunto sent an empty FIT file for workout ${a.workout_key}. Try again later, or export it in the Suunto App.`);
    if (data.length > MAX_FIT_BYTES) {
      throw new UserFacingError(
        `The FIT file of workout ${a.workout_key} is ${mb(data.length)} MB, more than the 8 MB this tool can send. Export it in the Suunto App instead, or use suunto_get_workout with samples for the data.`,
      );
    }
    return { workout_key: a.workout_key, bytes: data.length, file_name: `suunto-workout-${a.workout_key}.fit`, data };
  }

  // -------------------------------------------------------------------------------------------
  // 24/7 data
  // -------------------------------------------------------------------------------------------

  /**
   * suunto_daily_activity: steps and energy per local day. daily-activity-statistics is asked
   * per group of whole local days (each under 28 days): startdate is the local midnight of the
   * first day in UTC, enddate one second before the local midnight after the last day. Each
   * sample is then matched to the day whose local midnight it is (format.ts).
   */
  async dailyActivity(args: DailyActivityArgs): Promise<DailyActivityResult> {
    const a = parse(schemas.dailyActivity, args);
    const units = this.unitsOf(a.units);
    const tz = this.opts.timeZone;
    const r = this.range(a.from, a.to, DAILY_MAX_DAYS, DAILY_MAX_DAYS, "suunto_daily_activity");
    const days: DayStart[] = datesBetween(r.fromDate!, r.toDate!).map((date) => ({ date, ms: startOfDay(date, tz).getTime() }));
    const now = this.now();
    const stats = [];
    for (const group of this.dayGroups(days)) {
      const first = group[0]!;
      if (first.ms > now) break;
      const last = group[group.length - 1]!;
      const end = startOfDay(addDays(last.date, 1), tz).getTime();
      stats.push(...(await this.backend.dailyStatistics(formatUtcNoOffset(first.ms), formatUtcNoOffset(end - 1000))));
    }
    const rows = toDaySummaries(stats, days, tz);
    const withData = rows.filter((d) => d.steps !== null || d.energy_kcal !== null);
    const steps = rows.map((d) => d.steps).filter((v): v is number => v !== null);
    const energy = rows.map((d) => d.energy_kcal).filter((v): v is number => v !== null);
    const result: Omit<DailyActivityResult, "units"> = {
      from: r.from,
      to: r.to,
      time_zone: tz,
      days: rows,
      days_with_data: withData.length,
      totals: { steps: steps.reduce((x, y) => x + y, 0), energy_kcal: energy.reduce((x, y) => x + y, 0) },
    };
    const avgSteps = average(steps);
    const avgEnergy = average(energy);
    if (avgSteps !== undefined || avgEnergy !== undefined) {
      result.averages = {
        ...(avgSteps !== undefined ? { steps: U.round(avgSteps) } : {}),
        ...(avgEnergy !== undefined ? { energy_kcal: U.round(avgEnergy) } : {}),
      };
    }
    return { ...result, units: U.unitLabels(units) };
  }

  private resolutionFor(r: Range, given: Resolution | undefined, tool: string): Resolution {
    const short = r.fromDate && r.toDate ? daysBetween(r.fromDate, r.toDate) + 1 <= RAW_MAX_DAYS : r.toMs - r.fromMs <= RAW_MAX_DAYS * DAY_MS + HOUR_MS;
    if (given === "raw" && !short) {
      throw new UserFacingError(`resolution raw takes at most ${RAW_MAX_DAYS} days per call in ${tool}. Use resolution hour or day, or a shorter range.`);
    }
    return given ?? (short ? "hour" : "day");
  }

  /** suunto_activity_samples: 24/7 heart rate, steps, energy, SpO2, HRV and altitude. */
  async activitySamples(args: ActivitySamplesArgs): Promise<ActivitySamplesResult> {
    const a = parse(schemas.activitySamples, args);
    const units = this.unitsOf(a.units);
    const tz = this.opts.timeZone;
    const r = this.range(a.from, a.to, SAMPLES_MAX_DAYS, SAMPLES_MAX_DAYS, "suunto_activity_samples");
    const resolution = this.resolutionFor(r, a.resolution, "suunto_activity_samples");
    const samples = await this.windowed(r.fromMs, r.toMs, (f, t) => this.backend.activitySamples(f, t));
    const points = toSamplePoints(samples, { tz, units, resolution, fromMs: r.fromMs, toMs: r.toMs });
    return { from: r.from, to: r.to, time_zone: tz, resolution, count: points.length, points, units: U.unitLabels(units) };
  }

  /**
   * suunto_sleep: one entry per sleep whose wake-up (BedtimeEnd) falls on a date in [from, to].
   * Suunto is asked from 18:00 local of the day before `from`, so the night into `from` is found.
   */
  async sleep(args: SleepArgs): Promise<SleepResult> {
    const a = parse(schemas.sleep, args);
    const tz = this.opts.timeZone;
    const r = this.range(a.from, a.to, SLEEP_MAX_DAYS, SLEEP_MAX_DAYS, "suunto_sleep");
    const eve = parseDateOnly(addDays(r.fromDate!, -1));
    const queryFrom = wallTimeToDate({ ...eve, hour: 18, minute: 0, second: 0 }, tz).getTime();
    const raw = await this.windowed(queryFrom, r.toMs, (f, t) => this.backend.sleep(f, t));
    const seen = new Set<string>();
    const entries: Array<{ night: SleepNight; startMs: number }> = [];
    for (const sample of raw) {
      const e = sample?.entryData;
      if (!e) continue;
      const times = sleepTimes(sample);
      const id = e.SleepId !== null && e.SleepId !== undefined ? `id:${String(e.SleepId)}` : `t:${times.startMs ?? sample.timestamp}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const night = toSleepNight(sample, tz);
      if (!night || night.date < r.fromDate! || night.date > r.toDate!) continue;
      entries.push({ night, startMs: times.startMs ?? times.endMs ?? 0 });
    }
    entries.sort((x, y) => x.startMs - y.startMs);
    const sleeps = entries.map((e) => e.night);
    const result: Omit<SleepResult, "units"> = { from: r.from, to: r.to, time_zone: tz, count: sleeps.length, sleeps };
    const nights = sleeps.filter((s) => !s.is_nap);
    if (nights.length) {
      const avg = (pick: (s: SleepNight) => number | undefined) => {
        const v = average(nights.map(pick).filter((x): x is number => x !== undefined));
        return v === undefined ? undefined : U.round(v);
      };
      const duration = avg((s) => s.duration_s);
      const averages = {
        duration: duration === undefined ? undefined : U.formatHoursMinutes(duration),
        duration_s: duration,
        deep_s: avg((s) => s.deep_s),
        light_s: avg((s) => s.light_s),
        rem_s: avg((s) => s.rem_s),
        hr_avg: avg((s) => s.hr_avg),
        hrv_avg_ms: avg((s) => s.hrv_avg_ms),
        quality_score: avg((s) => s.quality_score),
      };
      result.averages = Object.fromEntries(Object.entries(averages).filter(([, v]) => v !== undefined));
    }
    return { ...result, units: U.unitLabels(this.opts.units) };
  }

  /** suunto_recovery: recovery balance (percent) and stress state per bucket. */
  async recovery(args: RecoveryArgs): Promise<RecoveryResult> {
    const a = parse(schemas.recovery, args);
    const tz = this.opts.timeZone;
    const r = this.range(a.from, a.to, RECOVERY_MAX_DAYS, RECOVERY_MAX_DAYS, "suunto_recovery");
    const resolution = a.resolution ?? "day";
    if (resolution === "raw") this.resolutionFor(r, "raw", "suunto_recovery");
    const samples = await this.windowed(r.fromMs, r.toMs, (f, t) => this.backend.recovery(f, t));
    const points = toRecoveryPoints(samples, { tz, resolution, fromMs: r.fromMs, toMs: r.toMs });
    const result: RecoveryResult = { from: r.from, to: r.to, time_zone: tz, resolution, count: points.length, points };
    const balances = timedSamples(samples)
      .filter((s) => s.ms >= r.fromMs && s.ms < r.toMs)
      .map((s) => U.num(s.entry.Balance))
      .filter((v): v is number => v !== undefined);
    if (balances.length) {
      result.summary = {
        balance_pct_min: U.percent(Math.min(...balances)),
        balance_pct_avg: U.percent(average(balances)!),
        balance_pct_max: U.percent(Math.max(...balances)),
        samples: balances.length,
      };
    }
    return result;
  }

  // -------------------------------------------------------------------------------------------
  // Routes and points of interest
  // -------------------------------------------------------------------------------------------

  /** suunto_list_routes: newest first (sort desc), paged with Suunto's page and size. */
  async listRoutes(args: ListRoutesArgs = {}): Promise<ListRoutesResult> {
    const a = parse(schemas.listRoutes, args);
    const units = this.unitsOf(a.units);
    const limit = a.limit ?? 20;
    const offset = a.offset ?? 0;
    const size = limit;
    const firstPage = Math.floor(offset / size);
    const lastPage = Math.floor((offset + limit - 1) / size);
    const items: WireRoute[] = [];
    let lastFull = false;
    for (let page = firstPage; page <= lastPage; page++) {
      const got = await this.backend.listRoutes({ page, size, sort: "desc" });
      items.push(...got);
      lastFull = got.length >= size;
      if (!lastFull) break;
    }
    const start = offset - firstPage * size;
    const shown = items.slice(start, start + limit);
    const routes = shown.map((route) => toRouteSummary(route, units, this.opts.timeZone));
    return {
      count: routes.length,
      routes,
      ...(lastFull && routes.length === limit ? { next_offset: offset + limit } : {}),
      units: U.unitLabels(units),
    };
  }

  /** suunto_get_route: the summary, or the GPX text (at most 1 MB). */
  async getRoute(args: GetRouteArgs): Promise<GetRouteResult> {
    const a = parse(schemas.getRoute, args);
    if ((a.format ?? "summary") === "gpx") {
      const gpx = await this.backend.exportRouteGpx(a.route_id);
      const bytes = Buffer.byteLength(gpx, "utf8");
      if (bytes > MAX_ROUTE_GPX_BYTES) {
        throw new UserFacingError(`The GPX of route ${a.route_id} is ${mb(bytes)} MB, more than the 1 MB this tool can send. Export it in the Suunto App instead, or use format summary.`);
      }
      return { route_id: a.route_id, format: "gpx", bytes, gpx };
    }
    const units = this.unitsOf(a.units);
    const route = await this.backend.getRoute(a.route_id);
    return { ...toRouteSummary(route, units, this.opts.timeZone), units: U.unitLabels(units) };
  }

  /** suunto_list_pois: points of interest, in Suunto's order. */
  async listPois(args: ListPoisArgs = {}): Promise<ListPoisResult> {
    const a = parse(schemas.listPois, args);
    const units = this.unitsOf(a.units);
    const limit = a.limit ?? 50;
    const offset = a.offset ?? 0;
    const page = await this.backend.listPois({ limit, offset });
    const pois = page.map((p) => toPoiSummary(p, units, this.opts.timeZone)).filter((p): p is PoiSummary => !!p);
    return { count: pois.length, pois, ...(page.length >= limit ? { next_offset: offset + page.length } : {}), units: U.unitLabels(units) };
  }

  /**
   * suunto_import_route: checks the GPX, adds it to the user's Suunto App, and returns the new
   * route. Suunto's answer to an import is not documented: when it holds no route, the newest
   * route modified since the import started is looked up (preferring the GPX's name).
   */
  async importRoute(args: ImportRouteArgs): Promise<ImportRouteResult> {
    this.assertWritable("suunto_import_route");
    const a = parse(schemas.importRoute, args);
    const units = this.unitsOf(a.units);
    const tz = this.opts.timeZone;
    const info = checkGpx(a.gpx);
    const ids = [...new Set((a.sports ?? []).map((s) => activityIdOf(s)))];
    const started = this.now();
    const route = await this.backend.importRouteGpx(a.gpx, ids);
    const base = { added: true as const, routes_in_file: info.routes, points: info.points };
    const multi = info.routes > 1 ? `The file has ${info.routes} routes or tracks; Suunto adds each as its own route. ` : "";
    if (route) {
      return { ...base, route: toRouteSummary(route, units, tz), ...(multi ? { note: multi.trim() } : {}), units: U.unitLabels(units) };
    }
    let found: WireRoute | undefined;
    try {
      const since = started - IMPORT_LOOKBACK_MS;
      const recent = await this.backend.listRoutes({ page: 0, size: 10, sort: "desc", since });
      const fresh = recent.filter((rt) => (epochMs(rt.modified) ?? epochMs(rt.created) ?? 0) >= since);
      const byName = info.name ? fresh.find((rt) => [rt.name, rt.description].some((n) => typeof n === "string" && n.trim() === info.name)) : undefined;
      found = byName ?? [...fresh].sort((x, y) => (epochMs(y.modified) ?? epochMs(y.created) ?? 0) - (epochMs(x.modified) ?? epochMs(x.created) ?? 0))[0];
    } catch {
      // The route was added; only the lookup of its details failed.
    }
    if (found) return { ...base, route: toRouteSummary(found, units, tz), ...(multi ? { note: multi.trim() } : {}), units: U.unitLabels(units) };
    return {
      ...base,
      note: `${multi}Suunto added the route but did not send its details. It is in the Suunto App and in suunto_list_routes.`,
      units: U.unitLabels(units),
    };
  }

  /** suunto_create_poi: adds a point of interest (watch enabled) and returns it. */
  async createPoi(args: CreatePoiArgs): Promise<CreatePoiResult> {
    this.assertWritable("suunto_create_poi");
    const a = parse(schemas.createPoi, args);
    const units = this.unitsOf(a.units);
    if (a.altitude !== undefined && a.altitude_m !== undefined) {
      throw new UserFacingError("Give altitude (in the call's units) or altitude_m (metres), not both.");
    }
    const altitudeM = a.altitude_m ?? (a.altitude !== undefined ? U.elevationToMetres(a.altitude, units) : undefined);
    if (altitudeM !== undefined && (altitudeM < MIN_ALTITUDE_M || altitudeM > MAX_ALTITUDE_M)) {
      throw new UserFacingError(`The altitude must be between ${MIN_ALTITUDE_M} and ${MAX_ALTITUDE_M} m (${U.elevation(MIN_ALTITUDE_M, "imperial")} to ${U.elevation(MAX_ALTITUDE_M, "imperial")} ft).`);
    }
    let type = DEFAULT_POI_TYPE;
    if (a.type) {
      const id = poiTypeId(a.type);
      if (id === undefined) {
        throw new UserFacingError(`Unknown point of interest type "${a.type}". Use one of: ${POI_TYPES.filter((t) => t.id >= 0).map((t) => t.name).join(", ")}.`);
      }
      type = id;
    }
    const activityId = a.sport ? activityIdOf(a.sport) : undefined;
    const input: WirePoiInput = {
      point: { x: a.longitude, y: a.latitude, ...(altitudeM !== undefined ? { z: altitudeM } : {}), name: a.name, type },
      ...(activityId !== undefined ? { activityId } : {}),
      watchEnabled: true,
    };
    const saved = await this.backend.createPoi(input);
    const poi =
      toPoiSummary(saved, units, this.opts.timeZone) ??
      (toPoiSummary({ pointOfInterest: { ...input, point: { ...input.point } } }, units, this.opts.timeZone) as PoiSummary);
    return { added: true, poi, units: U.unitLabels(units) };
  }

  // -------------------------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------------------------

  account(): Promise<SuuntoAccount> {
    return this.backend.account();
  }

  /** A test call: the workouts of the last 30 days (at most 100). Never throws. */
  async check(): Promise<CheckResult> {
    try {
      const until = this.now();
      const page = await this.backend.listWorkouts({ since: until - 30 * DAY_MS, until, limit: 100, offset: 0, byModificationTime: false });
      return { ok: true, workouts_last_30_days: (page.payload ?? []).length };
    } catch (error) {
      return { ok: false, error: error instanceof UserFacingError ? error.message : describeError(error) };
    }
  }
}
