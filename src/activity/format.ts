/**
 * Wire -> domain: turns what Suunto (or the demo) returns into the answers of the tools, in the
 * answer's units (docs/DESIGN.md section 6, src/activity/types.ts).
 *
 * Suunto documents the JSON of only a few objects (docs/suunto-api.md sections 3 and 5), so every
 * reader here is defensive: every field is optional, numbers may come as strings, unknown fields
 * of extensions are passed through with their known units converted, and nothing throws on a
 * strange shape. Units on the wire: seconds, metres, m/s, kcal (workouts), joules (24/7 energy),
 * kelvin (workout temperatures), Hz (cadence in extensions), fractions 0..1 (SpO2, balance).
 */

import { activityName, poiTypeName } from "../suunto/activities.js";
import {
  addDays,
  formatInZone,
  formatOffset,
  formatWithOffset,
  hasLocalOffset,
  HOUR_MS,
  localDateOf,
  localHourStart,
  parseUtcTimestamp,
  startOfDay,
  tzOffsetMinutes,
} from "../util/dates.js";
import type {
  DaySummary,
  PoiSummary,
  Position,
  RecoveryPoint,
  RouteSummary,
  SamplePoint,
  SleepNight,
  UnitChoice,
  UnitLabels,
  WireActivityEntry,
  WireDailyStatistic,
  WireExtension,
  WirePoiEnvelope,
  WirePoint,
  WireRecoveryEntry,
  WireRoute,
  WireRoutePoint,
  WireSample,
  WireSleepEntry,
  WireWorkout,
  Workout,
  WorkoutLap,
  WorkoutStream,
  WorkoutSummary,
} from "./types.js";
import * as U from "./units.js";

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;

export function isObject(value: unknown): value is Obj {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A number that is above zero, or undefined (Suunto sends 0 for "no value" in many fields). */
function positive(value: unknown): number | undefined {
  const n = U.num(value);
  return n !== undefined && n > 0 ? n : undefined;
}

/** The first argument that is a number above zero. */
function firstPositive(...values: unknown[]): number | undefined {
  for (const v of values) {
    const n = positive(v);
    if (n !== undefined) return n;
  }
  return undefined;
}

/**
 * An epoch time in milliseconds. Suunto's schema says seconds, its examples are milliseconds,
 * and POI times are seconds: values below 1e11 (the year 1973 in ms) are seconds.
 */
export function epochMs(value: unknown): number | undefined {
  const n = U.num(value);
  if (n === undefined || n <= 0) return undefined;
  return n < 1e11 ? n * 1000 : n;
}

/** "avgTemperature" -> "avg_temperature", "HRExt" -> "hr_ext". */
export function snakeCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Keep only the keys whose value is not undefined (compact JSON answers). */
function compact<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}

// ---------------------------------------------------------------------------------------------
// Generic conversion of extension fields
// ---------------------------------------------------------------------------------------------

type Category = "temperature" | "speed" | "time" | "cadence" | "power" | "heart_rate" | "depth" | "length" | "elevation" | "distance";

/** The kind of quantity a field name stands for (snake_case names). */
export function categoryOf(name: string): Category | undefined {
  if (/temp/.test(name)) return "temperature";
  if (/speed|velocity|per_second/.test(name)) return "speed";
  if (/(^|_)(time|duration|seconds)($|_)/.test(name)) return "time";
  if (/cadence/.test(name)) return "cadence";
  if (/power|watts/.test(name)) return "power";
  if (/heart_?rate|(^|_)hr($|_)|bpm/.test(name)) return "heart_rate";
  if (/depth/.test(name)) return "depth";
  if (/pool_?length/.test(name)) return "length";
  if (/altitude|ascent|descent|elevation/.test(name)) return "elevation";
  if (/distance/.test(name)) return "distance";
  return undefined;
}

/** One numeric field in the answer's units: [name, value] pairs (a duration gives two). */
function convertNumber(name: string, value: number, category: Category | undefined, units: UnitChoice): Array<[string, unknown]> {
  switch (category) {
    case "temperature":
      return [[name, U.temperatureFromKelvin(value, units)]];
    case "speed":
      return [[name, U.speed(value, units)]];
    case "time": {
      // An epoch time, not a duration.
      if (value > 1e9) return [[name, new Date(epochMs(value) ?? 0).toISOString()]];
      const base = name.replace(/_(seconds|s)$/, "") || name;
      return [
        [base, U.formatDuration(value)],
        [`${base}_s`, U.round(value, 1)],
      ];
    }
    case "cadence":
      return [[name.endsWith("_rpm") ? name : `${name}_rpm`, U.perMinute(value)]];
    case "power":
      return [[name.endsWith("_w") ? name : `${name}_w`, U.round(value)]];
    case "heart_rate":
      return [[name, U.perMinute(value)]];
    case "depth":
    case "length":
      return [[name, U.depth(value, units)]];
    case "elevation":
      return [[name, U.elevation(value, units)]];
    case "distance":
      return [[name, U.distance(value, units)]];
    default:
      return [[name, Number.isInteger(value) ? value : U.round(value, 3)]];
  }
}

const MAX_ARRAY = 500;
const MAX_DEPTH = 5;

/**
 * An extension (or a part of one) with snake_case keys and its known units converted: kelvin to
 * degrees, m/s to km/h or mph, seconds to h:mm:ss plus _s, Hz to rpm, metres to km/mi or m/ft.
 * A field without a known unit is passed through. Null fields are left out.
 */
export function convertFields(obj: Obj, units: UnitChoice, parent?: Category, depth = 0): Obj {
  const out: Obj = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (depth === 0 && key === "type") continue;
    const name = snakeCase(key) || key;
    const category = categoryOf(name) ?? parent;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
      for (const [k, v] of convertNumber(name, value, category, units)) out[k] = v;
    } else if (Array.isArray(value)) {
      out[name] = value.slice(0, MAX_ARRAY).map((item) => {
        if (typeof item === "number" && category && category !== "time") return convertNumber(name, item, category, units)[0]?.[1];
        if (isObject(item) && depth < MAX_DEPTH) return convertFields(item, units, category, depth + 1);
        return item;
      });
    } else if (isObject(value)) {
      if (depth < MAX_DEPTH) {
        const inner = convertFields(value, units, category, depth + 1);
        if (Object.keys(inner).length) out[name] = inner;
      }
    } else {
      out[name] = value;
    }
  }
  return out;
}

/** The first non-empty array of an object (an extension's points, laps or zones). */
function firstArray(ext: Obj, preferred: readonly string[]): unknown[] {
  for (const key of preferred) {
    const v = ext[key];
    if (Array.isArray(v) && v.length) return v;
  }
  for (const v of Object.values(ext)) {
    if (Array.isArray(v) && v.length) return v;
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------------------------

/** Sports where a pace per km or mi is how people think (on foot). */
export const ON_FOOT_ACTIVITIES: ReadonlySet<number> = new Set([0, 1, 11, 22, 24, 53, 60, 65, 70, 83, 95, 103, 115]);
/** Sports with a pace per 100 m or 100 yd. */
export const SWIM_ACTIVITIES: ReadonlySet<number> = new Set([21, 85]);

/** The samples a workout can be asked for (suunto_get_workout `samples`). */
export const SAMPLE_NAMES = ["heart_rate", "altitude", "speed", "pace", "cadence", "power", "temperature", "depth", "distance", "location"] as const;
export type SampleName = (typeof SAMPLE_NAMES)[number];

/** The stream extension (exact Suunto spelling) behind each sample name. */
export const SAMPLE_EXTENSIONS: Readonly<Record<SampleName, string>> = Object.freeze({
  heart_rate: "HeartrateStreamExtension",
  altitude: "AltitudeStreamExtension",
  speed: "SpeedStreamExtension",
  pace: "SpeedStreamExtension",
  cadence: "CadenceStreamExtension",
  power: "PowerStreamExtension",
  temperature: "TemperatureStreamExtension",
  depth: "DepthStreamExtension",
  distance: "DistanceDeltaStreamExtension",
  location: "LocationStreamExtension",
});

/** `extensionTypes` values (short upper-case names) -> the samples they make possible. */
const EXTENSION_TYPE_SAMPLES: Readonly<Record<string, readonly SampleName[]>> = {
  HEARTRATESTREAM: ["heart_rate"],
  ALTITUDESTREAM: ["altitude"],
  SPEEDSTREAM: ["speed", "pace"],
  CADENCESTREAM: ["cadence"],
  POWERSTREAM: ["power"],
  TEMPERATURESTREAM: ["temperature"],
  DEPTHSTREAM: ["depth"],
  DISTANCEDELTA: ["distance"],
  LOCATIONSTREAM: ["location"],
};

/** Summary extensions, asked for on every suunto_get_workout (an unknown name fails the call). */
export const SUMMARY_EXTENSIONS: readonly string[] = Object.freeze([
  "SummaryExtension",
  "IntensityExtension",
  "FitnessExtension",
  "WeatherExtension",
  "DiveHeaderExtension",
  "SwimmingHeaderExtension",
  "SkiExtension",
]);

/** Lap extensions, in the order they are used (the user's own laps first). */
export const LAP_EXTENSIONS: readonly string[] = Object.freeze([
  "ManualLapStreamExtension",
  "DistanceLapExtension",
  "DurationLapExtension",
  "VerticalLapExtension",
]);

const LAP_KIND: Readonly<Record<string, string>> = {
  ManualLapStreamExtension: "manual",
  DistanceLapExtension: "distance",
  DurationLapExtension: "duration",
  VerticalLapExtension: "vertical",
};

/** The samples a workout has, from its `extensionTypes` (names for the `samples` argument). */
export function availableSamples(extensionTypes: unknown): SampleName[] {
  if (!Array.isArray(extensionTypes)) return [];
  const out = new Set<SampleName>();
  for (const t of extensionTypes) {
    if (typeof t !== "string") continue;
    for (const s of EXTENSION_TYPE_SAMPLES[t.trim().toUpperCase()] ?? []) out.add(s);
  }
  return SAMPLE_NAMES.filter((s) => out.has(s));
}

export function workoutKeyOf(w: WireWorkout): string | undefined {
  const key = trimmed(w.workoutKey) ?? trimmed(w.key);
  if (key) return key;
  const id = U.num(w.workoutId);
  return id === undefined ? undefined : String(id);
}

/** The start of a workout in epoch milliseconds. */
export function workoutStartMs(w: WireWorkout): number | undefined {
  return epochMs(w.startTime);
}

/** The workout's offset from UTC in minutes, or undefined when Suunto sent none. */
function offsetOf(w: WireWorkout): number | undefined {
  const o = U.num(w.timeOffsetInMinutes);
  return o !== undefined && Math.abs(o) <= 18 * 60 ? o : undefined;
}

/** An instant in the workout's own local time; in the user's zone when the workout has no offset. */
function workoutTime(ms: number, offset: number | undefined, tz: string): string {
  return offset === undefined ? formatInZone(new Date(ms), tz) : formatWithOffset(ms, offset);
}

/** Duration in seconds: totalTime, else stop minus start. */
export function workoutDurationS(w: WireWorkout): number | undefined {
  const total = U.num(w.totalTime);
  if (total !== undefined && total >= 0) return total;
  const start = epochMs(w.startTime);
  const stop = epochMs(w.stopTime);
  return start !== undefined && stop !== undefined && stop >= start ? (stop - start) / 1000 : undefined;
}

/** Average speed in m/s: avgSpeed, else distance / time. */
function avgSpeedOf(w: WireWorkout): number | undefined {
  const given = positive(w.avgSpeed);
  if (given !== undefined) return given;
  const d = positive(w.totalDistance);
  const t = positive(workoutDurationS(w));
  return d !== undefined && t !== undefined ? d / t : undefined;
}

/** Pace text for the sport: per km or mi on foot, per 100 m or yd for swimming, else none. */
function paceFor(activityId: number | null, speedMs: number | undefined, avgPaceMinPerKm: unknown, units: UnitChoice): string | undefined {
  if (activityId === null) return undefined;
  if (SWIM_ACTIVITIES.has(activityId)) return speedMs === undefined ? undefined : U.swimPaceFromSpeed(speedMs, units);
  if (!ON_FOOT_ACTIVITIES.has(activityId)) return undefined;
  if (speedMs !== undefined) return U.paceFromSpeed(speedMs, units);
  const minPerKm = positive(avgPaceMinPerKm);
  return minPerKm === undefined ? undefined : U.paceFromMinPerKm(minPerKm, units);
}

export function toWorkoutSummary(w: WireWorkout, units: UnitChoice, tz: string): WorkoutSummary {
  const id = U.num(w.activityId);
  const activityId = id === undefined ? null : id;
  const startMs = workoutStartMs(w) ?? epochMs(w.created);
  const offset = offsetOf(w);
  const durationS = workoutDurationS(w) ?? 0;
  const stopMs = epochMs(w.stopTime);
  const endMs = stopMs ?? (startMs !== undefined && durationS > 0 ? startMs + durationS * 1000 : undefined);
  const speedMs = avgSpeedOf(w);
  const hr = isObject(w.hrdata) ? w.hrdata : {};
  const distance = positive(w.totalDistance);
  const ascent = positive(w.totalAscent);
  const descent = positive(w.totalDescent);
  const maxSpeed = positive(w.maxSpeed);
  const avgHr = firstPositive(hr.workoutAvgHR, hr.avg);
  const maxHr = firstPositive(hr.workoutMaxHR, hr.hrmax);
  const energy = positive(w.energyConsumption);
  const steps = positive(w.stepCount);
  const recovery = positive(w.recoveryTime);
  return compact<WorkoutSummary>({
    workout_key: workoutKeyOf(w) ?? "",
    sport: activityId === null ? "Unknown activity" : activityName(activityId),
    activity_id: activityId,
    name: trimmed(w.workoutName),
    start: startMs === undefined ? "unknown" : workoutTime(startMs, offset, tz),
    end: endMs === undefined ? undefined : workoutTime(endMs, offset, tz),
    duration: U.formatDuration(durationS),
    duration_s: U.round(durationS),
    distance: distance === undefined ? undefined : U.distance(distance, units),
    ascent: ascent === undefined ? undefined : U.elevation(ascent, units),
    descent: descent === undefined ? undefined : U.elevation(descent, units),
    avg_speed: speedMs === undefined ? undefined : U.speed(speedMs, units),
    max_speed: maxSpeed === undefined ? undefined : U.speed(maxSpeed, units),
    avg_pace: paceFor(activityId, speedMs, w.avgPace, units),
    avg_hr: avgHr === undefined ? undefined : U.perMinute(avgHr),
    max_hr: maxHr === undefined ? undefined : U.perMinute(maxHr),
    energy_kcal: energy === undefined ? undefined : U.round(energy),
    steps: steps === undefined ? undefined : U.round(steps),
    recovery_time_h: recovery === undefined ? undefined : U.round(recovery / 3600, 1),
  });
}

/** A workout position: x is the longitude and y the latitude. (0, 0) means "no position". */
export function positionOf(p: WirePoint | null | undefined, units: UnitChoice): Position | undefined {
  if (!isObject(p)) return undefined;
  const lon = U.num(p.x);
  const lat = U.num(p.y);
  return latLon(lat, lon, U.num(p.z), units);
}

function latLon(lat: number | undefined, lon: number | undefined, alt: number | undefined, units: UnitChoice): Position | undefined {
  if (lat === undefined || lon === undefined) return undefined;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return undefined;
  const out: Position = { latitude: U.round(lat, 6), longitude: U.round(lon, 6) };
  if (alt !== undefined) out.altitude = U.elevation(alt, units);
  return out;
}

export interface WorkoutOptions {
  /** Streams to include (suunto_get_workout `samples`). */
  samples?: readonly SampleName[];
  /** At most this many points per stream (default 200). */
  maxPoints?: number;
}

/** A full workout: the summary, extensions, laps and the requested streams. */
export function toWorkout(w: WireWorkout, units: UnitChoice, tz: string, opts: WorkoutOptions = {}): Workout {
  const summary = toWorkoutSummary(w, units, tz);
  const startMs = workoutStartMs(w);
  const offset = offsetOf(w) ?? (startMs === undefined ? 0 : tzOffsetMinutes(new Date(startMs), tz));
  const extensions = (Array.isArray(w.extensions) ? w.extensions : []).filter((e): e is WireExtension => isObject(e) && typeof e.type === "string");
  const byType = (type: string) => extensions.find((e) => e.type === type);
  const out: Workout = {
    ...summary,
    utc_offset: formatOffset(offset),
    available_data: availableSamples(w.extensionTypes),
    units: U.unitLabels(units),
  };
  const description = trimmed(w.description);
  if (description) out.description = description;
  const minAlt = U.num(w.minAltitude);
  const maxAlt = U.num(w.maxAltitude);
  if (minAlt !== undefined && maxAlt !== undefined && !(minAlt === 0 && maxAlt === 0)) {
    out.min_altitude = U.elevation(minAlt, units);
    out.max_altitude = U.elevation(maxAlt, units);
  }

  const summaryExt = byType("SummaryExtension");
  const cadence = w.cadence;
  const avgCadence = isObject(cadence) ? positive(cadence.avg) : positive(cadence);
  const maxCadence = isObject(cadence) ? positive(cadence.max) : undefined;
  const cadenceAvg = avgCadence ?? positive(summaryExt?.avgCadence);
  const cadenceMax = maxCadence ?? positive(summaryExt?.maxCadence);
  if (cadenceAvg !== undefined) out.avg_cadence = U.perMinute(cadenceAvg);
  if (cadenceMax !== undefined) out.max_cadence = U.perMinute(cadenceMax);

  const startPos = positionOf(w.startPosition, units);
  const endPos = positionOf(w.stopPosition, units);
  if (startPos) out.start_position = startPos;
  if (endPos) out.end_position = endPos;

  const put = (field: "summary" | "fitness" | "weather" | "dive" | "swimming" | "ski" | "intensity", value: Obj | undefined) => {
    if (value && Object.keys(value).length) out[field] = value;
  };
  if (summaryExt) put("summary", convertFields(summaryExt, units));
  const intensity = byType("IntensityExtension");
  if (intensity) put("intensity", intensityOf(intensity, units));
  const fitness = byType("FitnessExtension");
  if (fitness) put("fitness", convertFields(fitness, units));
  const weather = byType("WeatherExtension");
  if (weather) put("weather", convertFields(weather, units));
  const dive = byType("DiveHeaderExtension");
  if (dive) put("dive", convertFields(dive, units));
  const swimming = byType("SwimmingHeaderExtension");
  if (swimming) put("swimming", convertFields(swimming, units));
  const ski = byType("SkiExtension");
  if (ski) put("ski", convertFields(ski, units));

  const durationS = workoutDurationS(w);
  const laps = lapsOf(extensions, { startMs, durationS, units, activityId: summary.activity_id });
  if (laps?.length) out.laps = laps;

  if (opts.samples?.length) {
    const samples: Record<string, WorkoutStream> = {};
    for (const name of opts.samples) {
      samples[name] = streamOf(name, byType(SAMPLE_EXTENSIONS[name]), {
        startMs,
        durationS,
        totalDistanceM: positive(w.totalDistance),
        units,
        maxPoints: opts.maxPoints ?? 200,
      });
    }
    out.samples = samples;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Heart rate (and speed, power) zones
// ---------------------------------------------------------------------------------------------

interface Zone {
  zone: number;
  seconds?: number;
  lower?: number;
}

/** Zones as an array or as an object keyed zone1..zone5. */
function zoneList(value: unknown): Zone[] {
  const entries: Array<[number, unknown]> = Array.isArray(value)
    ? value.map((v, i): [number, unknown] => [i + 1, v])
    : isObject(value)
      ? Object.entries(value).map(([k, v], i): [number, unknown] => [Number(k.match(/\d+/)?.[0] ?? i + 1), v])
      : [];
  const zones: Zone[] = [];
  for (const [index, raw] of entries) {
    if (typeof raw === "number") {
      zones.push({ zone: index, seconds: raw });
      continue;
    }
    if (!isObject(raw)) continue;
    const zone = U.num(raw.zone) ?? U.num(raw.number) ?? index;
    const seconds = U.num(raw.totalTime) ?? U.num(raw.time) ?? U.num(raw.duration);
    const lower = U.num(raw.lowerLimit) ?? U.num(raw.lower) ?? U.num(raw.min);
    zones.push(compact({ zone, seconds, lower }));
  }
  return zones.sort((a, b) => a.zone - b.zone);
}

/**
 * IntensityExtension: time in each heart rate (speed, power) zone as h:mm:ss and seconds, with
 * the lower limit of each zone in the answer's units (heart rate in Hz becomes bpm). Other fields
 * are converted like any extension.
 */
export function intensityOf(ext: Obj, units: UnitChoice): Obj {
  const out: Obj = {};
  const { zones, type: _type, ...rest } = ext;
  if (isObject(zones)) {
    for (const [kind, value] of Object.entries(zones)) {
      const name = snakeCase(kind);
      const category = categoryOf(name);
      const list = zoneList(value).map((z) => {
        const row: Obj = { zone: z.zone };
        if (z.seconds !== undefined) {
          row.time = U.formatDuration(z.seconds);
          row.time_s = U.round(z.seconds);
        }
        if (z.lower !== undefined) {
          for (const [k, v] of convertNumber("lower_limit", z.lower, category, units)) row[k] = v;
        }
        return row;
      });
      if (list.length) out[`${name}_zones`] = list;
    }
  } else if (Array.isArray(zones)) {
    const list = zoneList(zones).map((z) => compact({ zone: z.zone, time: z.seconds === undefined ? undefined : U.formatDuration(z.seconds), time_s: z.seconds === undefined ? undefined : U.round(z.seconds) }));
    if (list.length) out.heart_rate_zones = list;
  }
  Object.assign(out, convertFields(rest, units));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Laps
// ---------------------------------------------------------------------------------------------

interface LapContext {
  startMs: number | undefined;
  durationS: number | undefined;
  units: UnitChoice;
  activityId: number | null;
}

/** Seconds from the workout start: epoch ms or s, an ISO string, or already relative seconds. */
function secondsFromStart(value: unknown, startMs: number | undefined): number | undefined {
  let abs: number | undefined;
  if (typeof value === "string") abs = parseUtcTimestamp(value);
  else {
    const n = U.num(value);
    if (n === undefined) return undefined;
    if (n > 1e9) abs = epochMs(n);
    else return n;
  }
  if (abs === undefined || startMs === undefined) return undefined;
  return (abs - startMs) / 1000;
}

const LAP_TIME_KEYS = ["timestamp", "startTime", "start", "time"];
const LAP_CONSUMED = new Set([
  ...LAP_TIME_KEYS,
  "duration",
  "totalTime",
  "distance",
  "totalDistance",
  "hr",
  "heartRate",
  "avgHR",
  "maxHR",
  "avgHeartRate",
  "maxHeartRate",
  "speed",
  "avgSpeed",
  "maxSpeed",
  "ascent",
  "totalAscent",
  "descent",
  "totalDescent",
  "lapNumber",
  "type",
]);

/** One lap of a lap extension; `null` for an entry that is only a marker (a time). */
function lapOf(entry: unknown, kind: string, ctx: LapContext): { lap: WorkoutLap; marker: boolean } | undefined {
  if (!isObject(entry)) {
    const t = secondsFromStart(entry, ctx.startMs);
    return t === undefined ? undefined : { lap: { lap: 0, type: kind, start_s: U.round(t, 1) }, marker: true };
  }
  const { units } = ctx;
  const lap: WorkoutLap = { lap: 0, type: kind };
  const timeKey = LAP_TIME_KEYS.find((k) => entry[k] !== undefined && entry[k] !== null);
  const start = timeKey ? secondsFromStart(entry[timeKey], ctx.startMs) : undefined;
  if (start !== undefined) lap.start_s = U.round(start, 1);
  const duration = positive(entry.duration) ?? positive(entry.totalTime);
  if (duration !== undefined && duration < 1e9) {
    lap.duration = U.formatDuration(duration);
    lap.duration_s = U.round(duration, 1);
  }
  const distance = positive(entry.distance) ?? positive(entry.totalDistance);
  if (distance !== undefined) lap.distance = U.distance(distance, units);
  const hr = isObject(entry.hr) ? entry.hr : isObject(entry.heartRate) ? entry.heartRate : {};
  const avgHr = firstPositive(hr.avg, entry.avgHR, entry.avgHeartRate, typeof entry.heartRate === "number" ? entry.heartRate : undefined);
  const maxHr = firstPositive(hr.max, entry.maxHR, entry.maxHeartRate);
  if (avgHr !== undefined) lap.avg_hr = U.perMinute(avgHr);
  if (maxHr !== undefined) lap.max_hr = U.perMinute(maxHr);
  const speedObj = isObject(entry.speed) ? entry.speed : {};
  const avgSpeed =
    firstPositive(speedObj.avg, entry.avgSpeed, typeof entry.speed === "number" ? entry.speed : undefined) ??
    (distance !== undefined && duration !== undefined ? distance / duration : undefined);
  if (avgSpeed !== undefined) {
    lap.avg_speed = U.speed(avgSpeed, units);
    const pace = paceFor(ctx.activityId, avgSpeed, undefined, units);
    if (pace) lap.avg_pace = pace;
  }
  const ascent = positive(entry.ascent) ?? positive(entry.totalAscent);
  const descent = positive(entry.descent) ?? positive(entry.totalDescent);
  if (ascent !== undefined) lap.ascent = U.elevation(ascent, units);
  if (descent !== undefined) lap.descent = U.elevation(descent, units);
  const rest: Obj = {};
  for (const [k, v] of Object.entries(entry)) if (!LAP_CONSUMED.has(k)) rest[k] = v;
  // Nested min/max objects (hr, speed) keep their other values, converted.
  for (const k of ["hr", "speed"] as const) {
    const nested = entry[k];
    if (isObject(nested)) {
      const { avg: _avg, ...others } = nested;
      if (Object.keys(others).length) rest[k === "hr" ? "heartRate" : "speed"] = others;
    }
  }
  Object.assign(lap, convertFields(rest, units, undefined, 1));
  const marker = Object.keys(lap).every((k) => k === "lap" || k === "type" || k === "start_s");
  return { lap, marker };
}

/**
 * Laps from the first lap extension that has entries (manual laps first). Entries that are only
 * times (lap button presses) become laps between those times: a first time after the start is the
 * end of lap 1.
 */
export function lapsOf(extensions: readonly WireExtension[], ctx: LapContext): WorkoutLap[] | undefined {
  for (const type of LAP_EXTENSIONS) {
    const ext = extensions.find((e) => e.type === type);
    if (!ext) continue;
    const kind = LAP_KIND[type] ?? "lap";
    const entries = firstArray(ext, ["lapTable", "laps", "markers", "points", "lapMarkers"]).slice(0, MAX_ARRAY);
    const parsed = entries.map((e) => lapOf(e, kind, ctx)).filter((p): p is { lap: WorkoutLap; marker: boolean } => !!p);
    if (!parsed.length) continue;
    let laps: WorkoutLap[];
    if (parsed.every((p) => p.marker)) {
      const times = parsed.map((p) => p.lap.start_s).filter((t): t is number => t !== undefined && t >= 0).sort((a, b) => a - b);
      const bounds = times.length && times[0]! > 1 ? [0, ...times] : [...times];
      const end = ctx.durationS;
      if (end !== undefined && bounds.length && end - bounds[bounds.length - 1]! > 1) bounds.push(end);
      laps = [];
      for (let i = 0; i + 1 < bounds.length; i++) {
        const s = bounds[i]!;
        const d = bounds[i + 1]! - s;
        laps.push({ lap: 0, type: kind, start_s: U.round(s, 1), duration: U.formatDuration(d), duration_s: U.round(d, 1) });
      }
    } else {
      laps = parsed.map((p) => p.lap);
      // Lap durations that are missing come from the next lap's start.
      for (let i = 0; i < laps.length; i++) {
        const lap = laps[i]!;
        if (lap.duration_s !== undefined || lap.start_s === undefined) continue;
        const next = laps[i + 1]?.start_s ?? ctx.durationS;
        if (next !== undefined && next > lap.start_s) {
          lap.duration_s = U.round(next - lap.start_s, 1);
          lap.duration = U.formatDuration(next - lap.start_s);
        }
      }
    }
    laps.forEach((lap, i) => (lap.lap = i + 1));
    if (laps.length) return laps;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Streams
// ---------------------------------------------------------------------------------------------

const TIME_KEYS = new Set(["timestamp", "time", "t", "elapsed", "offset", "timeOffset", "dateTime"]);

function pointTime(p: unknown): number | string | undefined {
  if (Array.isArray(p)) return typeof p[0] === "number" || typeof p[0] === "string" ? p[0] : undefined;
  if (!isObject(p)) return undefined;
  for (const key of TIME_KEYS) {
    const v = p[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) return v;
  }
  return undefined;
}

/** The value of a point: `value`, `v`, or the one numeric field that is not a time. */
function pointValue(p: unknown): number | undefined {
  if (typeof p === "number") return Number.isFinite(p) ? p : undefined;
  if (Array.isArray(p)) return U.num(p[1]);
  if (!isObject(p)) return undefined;
  for (const key of ["value", "v"]) {
    const n = U.num(p[key]);
    if (n !== undefined) return n;
  }
  const numbers = Object.entries(p).filter(([k, v]) => !TIME_KEYS.has(k) && typeof v === "number" && Number.isFinite(v));
  return numbers.length === 1 ? (numbers[0]![1] as number) : undefined;
}

/**
 * Point times as seconds from the workout start. Accepted: epoch ms, epoch seconds, ISO strings,
 * and times relative to the start in seconds (or in ms, when they are far longer than the
 * workout). Points without any time are spread evenly over the workout.
 */
export function relativeTimes(raw: ReadonlyArray<number | string | undefined>, startMs: number | undefined, durationS: number | undefined): Array<number | undefined> {
  const abs: Array<number | undefined> = [];
  const rel: Array<number | undefined> = [];
  for (const r of raw) {
    let a: number | undefined;
    let l: number | undefined;
    if (typeof r === "string") a = parseUtcTimestamp(r);
    else if (typeof r === "number") {
      if (r > 1e11) a = r;
      else if (r > 1e9) a = r * 1000;
      else l = r;
    }
    abs.push(a);
    rel.push(l);
  }
  const base = startMs ?? abs.find((a) => a !== undefined);
  const relValues = rel.filter((v): v is number => v !== undefined);
  const relMax = relValues.length ? Math.max(...relValues) : 0;
  const relScale = durationS !== undefined && durationS > 0 && relMax > durationS * 5 + 60 ? 1 / 1000 : 1;
  const out = raw.map((_, i) => {
    const a = abs[i];
    if (a !== undefined && base !== undefined) return (a - base) / 1000;
    const l = rel[i];
    return l === undefined ? undefined : l * relScale;
  });
  if (out.every((t) => t === undefined) && raw.length) {
    const span = durationS !== undefined && durationS > 0 ? durationS : raw.length - 1;
    return raw.map((_, i) => (raw.length > 1 ? (span * i) / (raw.length - 1) : 0));
  }
  return out;
}

/**
 * At most `max` points, evenly spaced in time, always with the first and the last point. Points
 * must be sorted by `t`. With no time span (all at one time), evenly spaced by index.
 */
export function downsample<T extends { t: number }>(points: readonly T[], max: number): T[] {
  const n = points.length;
  if (n <= max) return [...points];
  if (max <= 1) return n ? [points[0]!] : [];
  const first = points[0]!.t;
  const span = points[n - 1]!.t - first;
  const picked: number[] = [0];
  if (!(span > 0)) {
    for (let k = 1; k < max - 1; k++) picked.push(Math.round((k * (n - 1)) / (max - 1)));
  } else {
    let j = 0;
    for (let k = 1; k < max - 1; k++) {
      const target = first + (span * k) / (max - 1);
      while (j < n - 1 && points[j + 1]!.t <= target) j++;
      let idx = j;
      if (j + 1 < n && Math.abs(points[j + 1]!.t - target) < Math.abs(points[j]!.t - target)) idx = j + 1;
      const last = picked[picked.length - 1]!;
      if (idx <= last) idx = last + 1;
      if (idx >= n - 1) break;
      picked.push(idx);
    }
  }
  picked.push(n - 1);
  return [...new Set(picked)].map((i) => points[i]!);
}

interface StreamContext {
  startMs: number | undefined;
  durationS: number | undefined;
  totalDistanceM: number | undefined;
  units: UnitChoice;
  maxPoints: number;
}

/** Unit of each sample stream. */
export function sampleUnit(name: SampleName, labels: UnitLabels): string {
  switch (name) {
    case "heart_rate":
      return "bpm";
    case "altitude":
    case "depth":
      return labels.elevation;
    case "speed":
      return labels.speed;
    case "pace":
      return labels.pace;
    case "cadence":
      return "rpm";
    case "power":
      return "W";
    case "temperature":
      return labels.temperature;
    case "distance":
      return labels.distance;
    case "location":
      return "deg";
  }
}

const STREAM_DECIMALS: Readonly<Record<SampleName, number>> = {
  heart_rate: 0,
  altitude: 0,
  speed: 1,
  pace: 2,
  cadence: 0,
  power: 0,
  temperature: 1,
  depth: 1,
  distance: 2,
  location: 6,
};

/** True for a series that is already a running total (each value at least the one before). */
function isCumulative(values: readonly number[], total: number | undefined): boolean {
  for (let i = 1; i < values.length; i++) if (values[i]! < values[i - 1]!) return false;
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  if (total !== undefined) return Math.abs(last - total) <= total * 0.2;
  return last >= 10 * Math.max(first, 1);
}

/** A converter from wire values (SI) to the stream's unit, chosen from all values (Hz or not). */
function streamConverter(name: SampleName, values: readonly number[], units: UnitChoice): (v: number) => number | undefined {
  const finite = values.filter((v) => Number.isFinite(v));
  const max = finite.length ? Math.max(...finite) : 0;
  const hz = max > 0 && max < U.HZ_THRESHOLD;
  switch (name) {
    case "heart_rate":
    case "cadence":
      return (v) => (hz ? v * 60 : v);
    case "speed":
      return (v) => (units === "imperial" ? (v * 3600) / U.M_PER_MI : v * 3.6);
    case "pace":
      return (v) => {
        const s = U.paceSecondsFromSpeed(v, units);
        return s === undefined || s > 6000 ? undefined : s / 60;
      };
    case "altitude":
    case "depth":
      return (v) => (units === "imperial" ? v / U.M_PER_FT : v);
    case "temperature":
      return (v) => {
        const c = v > U.KELVIN_THRESHOLD ? v - 273.15 : v;
        return units === "imperial" ? (c * 9) / 5 + 32 : c;
      };
    case "distance":
      return (v) => v / (units === "imperial" ? U.M_PER_MI : U.M_PER_KM);
    default:
      return (v) => v;
  }
}

/** One requested stream, converted and downsampled; an empty stream when the workout has none. */
export function streamOf(name: SampleName, ext: WireExtension | undefined, ctx: StreamContext): WorkoutStream {
  const labels = U.unitLabels(ctx.units);
  const unit = sampleUnit(name, labels);
  const raw = ext ? firstArray(ext, name === "location" ? ["locationPoints", "points"] : ["points", "samples", "values"]) : [];
  if (!raw.length) return { unit, original_points: 0, points: [] };
  const times = relativeTimes(raw.map(pointTime), ctx.startMs, ctx.durationS);

  if (name === "location") {
    const points: Array<{ t: number; lat: number; lon: number }> = [];
    raw.forEach((p, i) => {
      const t = times[i];
      if (!isObject(p) || t === undefined) return;
      const lat = U.num(p.latitude) ?? U.num(p.lat) ?? U.num(p.y);
      const lon = U.num(p.longitude) ?? U.num(p.lon) ?? U.num(p.lng) ?? U.num(p.x);
      if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return;
      points.push({ t: U.round(t, 1), lat: U.round(lat, 6), lon: U.round(lon, 6) });
    });
    points.sort((a, b) => a.t - b.t);
    return { unit, original_points: raw.length, points: downsample(points, ctx.maxPoints) };
  }

  let values = raw.map(pointValue);
  if (name === "distance") {
    const known = values.filter((v): v is number => v !== undefined);
    if (!isCumulative(known, ctx.totalDistanceM)) {
      let sum = 0;
      values = values.map((v) => (v === undefined ? undefined : (sum += v)));
    }
  }
  const convert = streamConverter(
    name,
    values.filter((v): v is number => v !== undefined),
    ctx.units,
  );
  const decimals = STREAM_DECIMALS[name];
  const exact: Array<{ t: number; v: number }> = [];
  values.forEach((v, i) => {
    const t = times[i];
    if (v === undefined || t === undefined) return;
    const c = convert(v);
    if (c === undefined || !Number.isFinite(c)) return;
    exact.push({ t, v: c });
  });
  exact.sort((a, b) => a.t - b.t);
  const stream: WorkoutStream = { unit, original_points: raw.length, points: [] };
  if (exact.length) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const p of exact) {
      min = Math.min(min, p.v);
      max = Math.max(max, p.v);
      sum += p.v;
    }
    stream.min = U.round(min, decimals);
    stream.max = U.round(max, decimals);
    if (name === "pace") {
      // The average pace is the pace of the average speed, not the average of the paces.
      const speeds = raw.map(pointValue).filter((v): v is number => v !== undefined && v > 0);
      const meanSpeed = speeds.reduce((a, b) => a + b, 0) / (speeds.length || 1);
      const s = U.paceSecondsFromSpeed(meanSpeed, ctx.units);
      if (s !== undefined) stream.avg = U.round(s / 60, decimals);
    } else if (name !== "distance") {
      stream.avg = U.round(sum / exact.length, decimals);
    }
  }
  stream.points = downsample(exact, ctx.maxPoints).map((p) => ({ t: U.round(p.t, 1), v: U.round(p.v, decimals) }));
  return stream;
}

// ---------------------------------------------------------------------------------------------
// 24/7 data
// ---------------------------------------------------------------------------------------------

export type Resolution = "raw" | "hour" | "day";

/** Recovery StressState values (docs/suunto-api.md section 3.2). */
export const STRESS_STATES: Readonly<Record<number, string>> = Object.freeze({
  0: "invalid",
  1: "relaxing",
  2: "active",
  3: "passive",
  4: "stressful",
});

interface Bucket {
  start: number;
  end: number;
}

/** Buckets of one hour or one local day in `tz` (DST safe); a cache keeps day lookups cheap. */
class Bucketer {
  private readonly days = new Map<string, Bucket>();

  constructor(
    private readonly resolution: "hour" | "day",
    private readonly tz: string,
  ) {}

  of(ms: number): Bucket {
    if (this.resolution === "hour") {
      const start = localHourStart(ms, this.tz);
      return { start, end: start + HOUR_MS };
    }
    const date = localDateOf(ms, this.tz);
    let bucket = this.days.get(date);
    if (!bucket) {
      bucket = { start: startOfDay(date, this.tz).getTime(), end: startOfDay(addDays(date, 1), this.tz).getTime() };
      this.days.set(date, bucket);
    }
    return bucket;
  }
}

/** Samples with a readable timestamp, sorted by time, without duplicates (chunk edges). */
export function timedSamples<T>(samples: readonly WireSample<T>[]): Array<{ ms: number; entry: T }> {
  const seen = new Set<number>();
  const out: Array<{ ms: number; entry: T }> = [];
  for (const s of samples) {
    if (!s || typeof s.timestamp !== "string" || !isObject(s.entryData)) continue;
    const ms = parseUtcTimestamp(s.timestamp);
    if (ms === undefined || seen.has(ms)) continue;
    seen.add(ms);
    out.push({ ms, entry: s.entryData });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

class ActivityAccumulator {
  n = 0;
  private hrSum = 0;
  private hrN = 0;
  private hrMin = Infinity;
  private hrMax = -Infinity;
  private steps?: number;
  private energyJ?: number;
  private spo2Sum = 0;
  private spo2N = 0;
  private hrvSum = 0;
  private hrvN = 0;
  private altSum = 0;
  private altN = 0;

  add(e: WireActivityEntry): void {
    this.n++;
    const hr = positive(e.HR);
    if (hr !== undefined) {
      this.hrSum += hr;
      this.hrN++;
    }
    const ext = isObject(e.HRExt) ? e.HRExt : {};
    const lo = positive(ext.Min) ?? hr;
    const hi = positive(ext.Max) ?? hr;
    if (lo !== undefined) this.hrMin = Math.min(this.hrMin, lo);
    if (hi !== undefined) this.hrMax = Math.max(this.hrMax, hi);
    const steps = U.num(e.StepCount);
    if (steps !== undefined && steps >= 0) this.steps = (this.steps ?? 0) + steps;
    const energy = U.num(e.EnergyConsumption);
    if (energy !== undefined && energy >= 0) this.energyJ = (this.energyJ ?? 0) + energy;
    const spo2 = positive(e.SpO2);
    if (spo2 !== undefined) {
      this.spo2Sum += spo2;
      this.spo2N++;
    }
    const hrv = positive(e.HRV);
    if (hrv !== undefined) {
      this.hrvSum += hrv;
      this.hrvN++;
    }
    const alt = U.num(e.Altitude);
    if (alt !== undefined) {
      this.altSum += alt;
      this.altN++;
    }
  }

  point(start: string, end: string | undefined, units: UnitChoice, energyDecimals: number): SamplePoint {
    return compact<SamplePoint>({
      start,
      end,
      hr_avg: this.hrN ? U.round(this.hrSum / this.hrN) : undefined,
      hr_min: Number.isFinite(this.hrMin) ? U.round(this.hrMin) : undefined,
      hr_max: Number.isFinite(this.hrMax) ? U.round(this.hrMax) : undefined,
      steps: this.steps === undefined ? undefined : U.round(this.steps),
      energy_kcal: this.energyJ === undefined ? undefined : U.kcalFromJoules(this.energyJ, energyDecimals),
      spo2_pct: this.spo2N ? U.percent(this.spo2Sum / this.spo2N) : undefined,
      hrv_ms: this.hrvN ? U.round(this.hrvSum / this.hrvN) : undefined,
      altitude: this.altN ? U.elevation(this.altSum / this.altN, units) : undefined,
      samples: this.n,
    });
  }
}

export interface SampleOptions {
  tz: string;
  units: UnitChoice;
  resolution: Resolution;
  /** Only samples in [fromMs, toMs). */
  fromMs?: number;
  toMs?: number;
}

function inWindow(ms: number, opts: { fromMs?: number; toMs?: number }): boolean {
  return (opts.fromMs === undefined || ms >= opts.fromMs) && (opts.toMs === undefined || ms < opts.toMs);
}

/** 24/7 activity samples, raw or summed up per local hour or day. */
export function toSamplePoints(samples: readonly WireSample<WireActivityEntry>[], opts: SampleOptions): SamplePoint[] {
  const timed = timedSamples(samples).filter((s) => inWindow(s.ms, opts));
  if (opts.resolution === "raw") {
    return timed.map((s) => {
      const acc = new ActivityAccumulator();
      acc.add(s.entry);
      return acc.point(formatInZone(new Date(s.ms), opts.tz), undefined, opts.units, 1);
    });
  }
  const bucketer = new Bucketer(opts.resolution, opts.tz);
  const buckets = new Map<number, { bucket: Bucket; acc: ActivityAccumulator }>();
  for (const s of timed) {
    const bucket = bucketer.of(s.ms);
    let entry = buckets.get(bucket.start);
    if (!entry) {
      entry = { bucket, acc: new ActivityAccumulator() };
      buckets.set(bucket.start, entry);
    }
    entry.acc.add(s.entry);
  }
  const decimals = opts.resolution === "hour" ? 1 : 0;
  return [...buckets.values()]
    .sort((a, b) => a.bucket.start - b.bucket.start)
    .map(({ bucket, acc }) => acc.point(formatInZone(new Date(bucket.start), opts.tz), formatInZone(new Date(bucket.end), opts.tz), opts.units, decimals));
}

/** Recovery balance (percent) and stress state, raw or per local hour or day. */
export function toRecoveryPoints(samples: readonly WireSample<WireRecoveryEntry>[], opts: Omit<SampleOptions, "units">): RecoveryPoint[] {
  const timed = timedSamples(samples).filter((s) => inWindow(s.ms, opts));
  if (opts.resolution === "raw") {
    return timed.map((s) => {
      const balance = U.num(s.entry.Balance);
      const state = U.num(s.entry.StressState);
      return compact<RecoveryPoint>({
        start: formatInZone(new Date(s.ms), opts.tz),
        balance_pct_avg: balance === undefined ? undefined : U.percent(balance),
        stress_state: state,
        samples: 1,
      });
    });
  }
  const bucketer = new Bucketer(opts.resolution, opts.tz);
  const groups = new Map<number, { bucket: Bucket; balances: number[]; states: Record<string, number>; n: number }>();
  for (const s of timed) {
    const bucket = bucketer.of(s.ms);
    let g = groups.get(bucket.start);
    if (!g) {
      g = { bucket, balances: [], states: {}, n: 0 };
      groups.set(bucket.start, g);
    }
    g.n++;
    const balance = U.num(s.entry.Balance);
    if (balance !== undefined) g.balances.push(balance);
    const state = U.num(s.entry.StressState);
    if (state !== undefined) {
      const key = STRESS_STATES[state] ?? String(state);
      g.states[key] = (g.states[key] ?? 0) + 1;
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.bucket.start - b.bucket.start)
    .map((g) => {
      const b = g.balances;
      return compact<RecoveryPoint>({
        start: formatInZone(new Date(g.bucket.start), opts.tz),
        end: formatInZone(new Date(g.bucket.end), opts.tz),
        balance_pct_avg: b.length ? U.percent(b.reduce((x, y) => x + y, 0) / b.length) : undefined,
        balance_pct_min: b.length ? U.percent(Math.min(...b)) : undefined,
        balance_pct_max: b.length ? U.percent(Math.max(...b)) : undefined,
        stress_states: Object.keys(g.states).length ? g.states : undefined,
        samples: g.n,
      });
    });
}

/** Start and end of a sleep (epoch ms): BedtimeStart/BedtimeEnd, else timestamp and Duration. */
export function sleepTimes(sample: WireSample<WireSleepEntry>): { startMs?: number; endMs?: number } {
  const e = isObject(sample.entryData) ? sample.entryData : {};
  const startMs = (typeof e.BedtimeStart === "string" ? parseUtcTimestamp(e.BedtimeStart) : undefined) ?? (typeof sample.timestamp === "string" ? parseUtcTimestamp(sample.timestamp) : undefined);
  const duration = positive(e.Duration);
  const endMs = (typeof e.BedtimeEnd === "string" ? parseUtcTimestamp(e.BedtimeEnd) : undefined) ?? (startMs !== undefined && duration !== undefined ? startMs + duration * 1000 : undefined);
  return compact({ startMs, endMs });
}

/** One sleep. `date` is the local date of waking up (BedtimeEnd) in `tz`. */
export function toSleepNight(sample: WireSample<WireSleepEntry>, tz: string): SleepNight | undefined {
  const e = isObject(sample.entryData) ? (sample.entryData as WireSleepEntry) : {};
  const { startMs, endMs } = sleepTimes(sample);
  const ref = endMs ?? startMs;
  if (ref === undefined) return undefined;
  const seconds = (v: unknown) => {
    const n = U.num(v);
    return n !== undefined && n >= 0 ? n : undefined;
  };
  const duration = seconds(e.Duration);
  const deep = seconds(e.DeepSleepDuration);
  const light = seconds(e.LightSleepDuration);
  const rem = seconds(e.REMSleepDuration);
  const hrAvg = positive(e.HRAvg);
  const hrMin = positive(e.HRMin);
  const hrv = positive(e.AvgHRV);
  const spo2 = positive(e.MaxSpo2);
  const sol = seconds(e.SleepOnsetLatencyDuration);
  const waso = seconds(e.WakeAfterSleepOnsetDuration);
  return compact<SleepNight>({
    date: localDateOf(ref, tz),
    is_nap: e.IsNap === true,
    bedtime_start: startMs === undefined ? undefined : formatInZone(new Date(startMs), tz),
    bedtime_end: endMs === undefined ? undefined : formatInZone(new Date(endMs), tz),
    duration: duration === undefined ? undefined : U.formatHoursMinutes(duration),
    duration_s: duration === undefined ? undefined : U.round(duration),
    deep: deep === undefined ? undefined : U.formatHoursMinutes(deep),
    deep_s: deep === undefined ? undefined : U.round(deep),
    light: light === undefined ? undefined : U.formatHoursMinutes(light),
    light_s: light === undefined ? undefined : U.round(light),
    rem: rem === undefined ? undefined : U.formatHoursMinutes(rem),
    rem_s: rem === undefined ? undefined : U.round(rem),
    hr_avg: hrAvg === undefined ? undefined : U.round(hrAvg),
    hr_min: hrMin === undefined ? undefined : U.round(hrMin),
    hrv_avg_ms: hrv === undefined ? undefined : U.round(hrv),
    spo2_max_pct: spo2 === undefined ? undefined : U.percent(spo2),
    quality_score: U.num(e.SleepQualityScore),
    feeling: positive(e.Feeling),
    sleep_onset_latency_s: sol === undefined ? undefined : U.round(sol),
    awake_after_sleep_onset_s: waso === undefined ? undefined : U.round(waso),
  });
}

/** The instant of local midnight of each date, for matching daily statistics to dates. */
export interface DayStart {
  date: string;
  ms: number;
}

/** Days within this distance of a local midnight belong to that date (DST moves them by 1 h). */
const DAY_MATCH_MS = 3 * HOUR_MS;

/**
 * The local date a daily statistics sample belongs to. With a local offset in the time
 * ("2026-09-27T12:00:00+02:00") the date part is the local date. Without one the time is UTC: the
 * date is the one whose local midnight is nearest (Suunto steps 24 hours from the `startdate` we
 * sent, so after a DST change its times are one hour off local midnight), else the local date.
 */
export function dateOfDailySample(time: string, starts: readonly DayStart[], tz: string): string | undefined {
  if (hasLocalOffset(time)) return time.trim().slice(0, 10);
  const ms = parseUtcTimestamp(time);
  if (ms === undefined) return undefined;
  let best: DayStart | undefined;
  let bestDiff = Infinity;
  for (const s of starts) {
    const diff = Math.abs(ms - s.ms);
    if (diff < bestDiff) {
      best = s;
      bestDiff = diff;
    }
  }
  if (best && bestDiff <= DAY_MATCH_MS) return best.date;
  return localDateOf(ms, tz);
}

/**
 * One row per date from daily-activity-statistics. Per watch (source) and date the larger value
 * wins (Suunto may send a null and a real record for one date); the watches are then added up.
 * Energy comes in joules.
 */
export function toDaySummaries(stats: readonly WireDailyStatistic[], days: readonly DayStart[], tz: string): DaySummary[] {
  const wanted = new Set(days.map((d) => d.date));
  const values = { steps: new Map<string, Map<string, number>>(), energy: new Map<string, Map<string, number>>() };
  for (const stat of stats) {
    if (!isObject(stat) || typeof stat.Name !== "string") continue;
    const metric = /step/i.test(stat.Name) ? "steps" : /energy/i.test(stat.Name) ? "energy" : undefined;
    if (!metric) continue;
    const sources = Array.isArray(stat.Sources) ? stat.Sources : [];
    sources.forEach((source, i) => {
      if (!isObject(source)) return;
      const sourceName = trimmed(source.Name) ?? `source-${i}`;
      for (const sample of Array.isArray(source.Samples) ? source.Samples : []) {
        if (!isObject(sample) || typeof sample.TimeISO8601 !== "string") continue;
        const value = U.num(sample.Value);
        if (value === undefined) continue;
        const date = dateOfDailySample(sample.TimeISO8601, days, tz);
        if (!date || !wanted.has(date)) continue;
        const perSource = values[metric].get(date) ?? new Map<string, number>();
        perSource.set(sourceName, Math.max(perSource.get(sourceName) ?? -Infinity, value));
        values[metric].set(date, perSource);
      }
    });
  }
  const total = (m: Map<string, number> | undefined) => (m ? [...m.values()].reduce((a, b) => a + b, 0) : undefined);
  return days.map(({ date }) => {
    const steps = total(values.steps.get(date));
    const energy = total(values.energy.get(date));
    return { date, steps: steps === undefined ? null : U.round(steps), energy_kcal: energy === undefined ? null : U.kcalFromJoules(energy) };
  });
}

// ---------------------------------------------------------------------------------------------
// Routes and points of interest
// ---------------------------------------------------------------------------------------------

function routePoint(p: WireRoutePoint | null | undefined, units: UnitChoice): Position | undefined {
  if (!isObject(p)) return undefined;
  return latLon(U.num(p.latitude), U.num(p.longitude), U.num(p.altitude), units);
}

/** A route. Suunto has no name field: the description holds the name (docs/suunto-api.md 3.7). */
export function toRouteSummary(r: WireRoute, units: UnitChoice, tz: string): RouteSummary {
  const name = trimmed(r.name) ?? trimmed(r.description);
  const description = trimmed(r.name) && trimmed(r.description) !== trimmed(r.name) ? trimmed(r.description) : undefined;
  const distance = positive(r.totalDistance);
  const created = epochMs(r.created);
  const modified = epochMs(r.modified);
  const ids = Array.isArray(r.activityIds) ? r.activityIds.filter((id): id is number => typeof id === "number") : [];
  return compact<RouteSummary>({
    route_id: String(r.id),
    name,
    description,
    distance: distance === undefined ? undefined : U.distance(distance, units),
    sports: ids.map((id) => activityName(id)),
    start: routePoint(r.startPoint, units),
    end: routePoint(r.endPoint, units),
    created: created === undefined ? undefined : formatInZone(new Date(created), tz),
    modified: modified === undefined ? undefined : formatInZone(new Date(modified), tz),
    watch_enabled: typeof r.watchEnabled === "boolean" ? r.watchEnabled : undefined,
  });
}

/** A point of interest; undefined when it has no valid position. */
export function toPoiSummary(envelope: WirePoiEnvelope, units: UnitChoice, tz: string): PoiSummary | undefined {
  const poi = isObject(envelope) && isObject(envelope.pointOfInterest) ? envelope.pointOfInterest : undefined;
  const point = poi && isObject(poi.point) ? poi.point : undefined;
  if (!poi || !point) return undefined;
  const lat = U.num(point.y);
  const lon = U.num(point.x);
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined;
  const alt = U.num(point.z);
  const typeId = U.num(point.type) ?? -1;
  const activity = U.num(poi.activityId);
  const created = epochMs(poi.creation);
  return compact<PoiSummary>({
    poi_key: trimmed(poi.key),
    name: trimmed(point.name),
    latitude: U.round(lat, 6),
    longitude: U.round(lon, 6),
    altitude: alt === undefined ? undefined : U.elevation(alt, units),
    type: poiTypeName(typeId),
    type_id: typeId,
    sport: activity === undefined ? undefined : activityName(activity),
    created: created === undefined ? undefined : formatInZone(new Date(created), tz),
    watch_enabled: typeof poi.watchEnabled === "boolean" ? poi.watchEnabled : undefined,
  });
}
