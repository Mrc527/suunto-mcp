/**
 * The invented Suunto data of the demo accounts: "Alex Demo" (Suunto username alexdemo), who lives
 * in the time zone Europe/Zurich and trains around invented places (Lake Serein, Pine Ridge,
 * Valmora, Larch Valley, Aster Sports Hall). No real person, place name or address is behind any
 * of it.
 *
 * Everything comes from a seeded generator keyed by the calendar day, so the same day always gives
 * the same data:
 * - workouts (planWorkouts): the DATA_DAYS days before the reset day and the reset day itself, 4
 *   to 6 per week. Only their summaries are kept. The 10-second streams, the extensions and the
 *   FIT file are computed from the plan when asked (workoutSeries, workoutExtensions, workoutFit);
 * - 24/7 data (DemoTimeline): activity samples every 10 minutes, nightly sleep, naps, recovery every
 *   30 minutes and the daily statistics, computed on demand from the timestamp, the night and the
 *   workouts of the day. Nothing of it is stored;
 * - 4 routes and 5 points of interest (sampleRoutes, samplePois).
 *
 * Units are those of the Suunto Cloud API (docs/suunto-api.md): epoch milliseconds, seconds,
 * metres, m/s, min/km, kcal for workouts, joules for 24/7 energy, kelvin for temperatures, Hz for
 * cadence in extensions, 0..1 fractions for SpO2 and the recovery balance.
 */

import type {
  WireActivityEntry,
  WireDailyStatistic,
  WireExtension,
  WirePoi,
  WireRecoveryEntry,
  WireRoute,
  WireRoutePoint,
  WireSample,
  WireSleepEntry,
  WireWorkout,
} from "../activity/types.js";
import { DAY_MS, HOUR_MS, MINUTE_MS, parseDateOnly, tzOffsetMinutes } from "../util/dates.js";

// ---------------------------------------------------------------------------------------------
// The demo person and the shape of the data
// ---------------------------------------------------------------------------------------------

/** The demo person's name (invented). */
export const DEMO_NAME = "Alex Demo";
/** The demo person's e-mail (invented; the example.com domain never receives mail). */
export const DEMO_ADDRESS = "alex.demo@example.com";
/** The Suunto App username of the demo account (the `user` claim a real access token has). */
export const DEMO_USERNAME = "alexdemo";
/** The demo person's time zone: workout offsets, nights and day boundaries follow it. */
export const DEMO_TIME_ZONE = "Europe/Zurich";

/** Days of workouts and 24/7 data before the reset day. */
export const DATA_DAYS = 120;
/** 24/7 activity samples: one every 10 minutes (what live observers of the API count). */
export const ACTIVITY_INTERVAL_MS = 10 * MINUTE_MS;
/** Recovery samples: one every 30 minutes. */
export const RECOVERY_INTERVAL_MS = 30 * MINUTE_MS;
/** Workout streams: one point every 10 seconds of timer time. */
export const STREAM_STEP_S = 10;
/** Longer streams are thinned to at most this many points (every k-th point, the last one kept). */
export const MAX_STREAM_POINTS = 2400;
/** Record messages in a demo FIT file. */
export const FIT_RECORDS = 30;
/** The demo person's maximum heart rate setting (bpm). */
export const USER_MAX_HR = 188;
/** The name of the demo watch as a 24/7 data source (invented). */
export const DAILY_SOURCE_NAME = "suunto-247-5a1e7c00-de30-4d00-9a00-00000000a1e7";

const REST_HR = 50;
const WEIGHT_KG = 72;
const AGE_YEARS = 38;
const J_PER_KCAL = 4184;
const KELVIN = 273.15;
/** Energy at rest per 10 minutes (about 1700 kcal a day), in joules. */
const REST_J_PER_SAMPLE = (1700 * J_PER_KCAL) / 144;
/** Joules per step on top of the energy at rest. */
const J_PER_STEP = 190;
/** Altitude of the demo person's home (m). */
const HOME_ALTITUDE = 434;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

// ---------------------------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------------------------

/** Salts, so the draws for different things on the same day are independent. */
const SALT = { week: 11, day: 12, workout: 13, night: 14, nap: 15, life: 16, sample: 17, recovery: 18, series: 19 } as const;

/** A 32-bit hash of integers (murmur3 steps): the same inputs always give the same number. */
export function hash32(...values: number[]): number {
  let h = 0x9e3779b9 ^ values.length;
  for (const value of values) {
    const lo = value | 0;
    const hi = Math.floor(value / 4294967296) | 0;
    h = Math.imul(h ^ lo, 0xcc9e2d51);
    h = (h << 15) | (h >>> 17);
    h = Math.imul(h ^ hi, 0x1b873593);
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A number in [0, 1) from integers, without state (for per-sample noise). */
export function unit(...values: number[]): number {
  return hash32(...values) / 4294967296;
}

/** One murmur3 step of hash32 for a whole number in [-2^31, 2^32). */
function mix(h: number, v: number): number {
  h = Math.imul(h ^ (v | 0), 0xcc9e2d51);
  h = (h << 15) | (h >>> 17);
  h = Math.imul(h ^ (v < 0 ? -1 : 0), 0x1b873593);
  h = (h << 13) | (h >>> 19);
  return (Math.imul(h, 5) + 0xe6546b64) | 0;
}

/** unit(a, b, c) without the cost of a rest parameter (hot loops); same result. */
function unit3(a: number, b: number, c: number): number {
  let h = mix(mix(mix(0x9e3779b9 ^ 3, a), b), c);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A small seeded generator (mulberry32). */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A number in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** A whole number from min to max, both included. */
  int(min: number, max: number): number {
    return Math.min(max, Math.floor(this.range(min, max + 1)));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

function hex(value: number, width: number): string {
  return Math.floor(Math.abs(value)).toString(16).padStart(width, "0").slice(-width);
}

/**
 * A 24-hex-character id shaped like Suunto's (a MongoDB object id): the seconds of `ms`, "de30"
 * (demo), and a counter.
 */
export function demoId(ms: number, counter: number): string {
  return `${hex(ms / 1000, 8)}de30${hex(counter, 12)}`;
}

// ---------------------------------------------------------------------------------------------
// Calendar and time zone
// ---------------------------------------------------------------------------------------------

/** Days since 1970-01-01 of a YYYY-MM-DD date (the key of every seeded draw). */
export function dayNumberOf(date: string): number {
  const d = parseDateOnly(date);
  return Math.round(Date.UTC(d.year, d.month - 1, d.day) / DAY_MS);
}

/** The YYYY-MM-DD date of a day number. */
export function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 1 (Monday) to 7 (Sunday). */
export function weekdayOf(day: number): number {
  const w = new Date(day * DAY_MS).getUTCDay();
  return w === 0 ? 7 : w;
}

/** 1 (January) to 12. */
export function monthOfDay(day: number): number {
  return new Date(day * DAY_MS).getUTCMonth() + 1;
}

/**
 * Local wall-clock arithmetic in one time zone. Offsets are cached per UTC day (and per hour on
 * the days the offset changes), because Intl is slow and a 28-day request needs thousands.
 */
export class ZoneClock {
  private readonly days = new Map<number, number>();
  private readonly hours = new Map<number, number>();

  constructor(readonly timeZone: string) {}

  private exact(ms: number): number {
    return tzOffsetMinutes(new Date(ms), this.timeZone);
  }

  /** Offset of the zone from UTC at an instant, in minutes. */
  offset(ms: number): number {
    const block = Math.floor(ms / DAY_MS);
    let day = this.days.get(block);
    if (day === undefined) {
      const a = this.exact(block * DAY_MS);
      const b = this.exact(block * DAY_MS + DAY_MS - 1000);
      day = a === b ? a : Number.NaN;
      this.days.set(block, day);
    }
    if (!Number.isNaN(day)) return day;
    const hour = Math.floor(ms / HOUR_MS);
    let h = this.hours.get(hour);
    if (h === undefined) {
      const a = this.exact(hour * HOUR_MS);
      const b = this.exact(hour * HOUR_MS + HOUR_MS - 1000);
      h = a === b ? a : Number.NaN;
      this.hours.set(hour, h);
    }
    return Number.isNaN(h) ? this.exact(ms) : h;
  }

  /** The local day number of an instant. */
  day(ms: number): number {
    return Math.floor((ms + this.offset(ms) * MINUTE_MS) / DAY_MS);
  }

  /** Minutes since local midnight. */
  minuteOfDay(ms: number): number {
    const local = ms + this.offset(ms) * MINUTE_MS;
    return Math.floor((local - Math.floor(local / DAY_MS) * DAY_MS) / MINUTE_MS);
  }

  /**
   * The instant of a local wall-clock time: `minutes` after the local midnight of `day` (may be
   * more than a day). A time in a DST gap moves forward, like a watch would show it.
   */
  instant(day: number, minutes: number): number {
    const naive = day * DAY_MS + minutes * MINUTE_MS;
    const first = naive - this.offset(naive) * MINUTE_MS;
    return naive - this.offset(first) * MINUTE_MS;
  }
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------------------------
// Places and geometry
// ---------------------------------------------------------------------------------------------

/** An invented place. `heading` turns its loops (radians), so they do not all point the same way. */
export interface DemoPlace {
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly alt: number;
  readonly heading: number;
}

/** The invented places of the demo data. */
export const DEMO_PLACES = {
  lake: { name: "Lake Serein", lat: 46.93842, lon: 8.41275, alt: HOME_ALTITUDE, heading: 0.6 },
  ridge: { name: "Pine Ridge", lat: 46.97118, lon: 8.48553, alt: 820, heading: 2.1 },
  valmora: { name: "Valmora", lat: 46.90461, lon: 8.35617, alt: 520, heading: -1.2 },
  larch: { name: "Larch Valley", lat: 46.81274, lon: 8.52491, alt: 1450, heading: 1.0 },
  hall: { name: "Aster Sports Hall", lat: 46.94307, lon: 8.40624, alt: 440, heading: 0 },
} as const satisfies Record<string, DemoPlace>;
export type PlaceId = keyof typeof DEMO_PLACES;

const M_PER_DEG_LAT = 111_320;

/**
 * A point of a closed loop that starts and ends at the place: `fraction` 0..1 of the way round a
 * loop of `perimeter` metres (a wobbly circle, so it does not look drawn with a compass).
 */
export function loopPoint(place: DemoPlace, perimeter: number, fraction: number): { lat: number; lon: number } {
  const radius = perimeter / (2 * Math.PI * 1.01);
  const theta = 2 * Math.PI * fraction;
  const r = radius * (1 + 0.1 * Math.sin(3 * theta));
  // The centre is one radius away from the place, so fraction 0 (and 1) is the place itself.
  const x = -radius + r * Math.cos(theta);
  const y = r * Math.sin(theta);
  const c = Math.cos(place.heading);
  const s = Math.sin(place.heading);
  const east = x * c - y * s;
  const north = x * s + y * c;
  return {
    lat: place.lat + north / M_PER_DEG_LAT,
    lon: place.lon + east / (M_PER_DEG_LAT * Math.cos((place.lat * Math.PI) / 180)),
  };
}

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Altitude profiles of loops, routes and workouts, as a function of the fraction done (0..1). */
export type Profile = "loop" | "climb" | "two_climbs";

/** Altitude in metres. `gain` is the climb (per lap for "loop", in total for the others). */
export function profileAltitude(profile: Profile, base: number, gain: number, laps: number, f: number): number {
  switch (profile) {
    case "loop":
      return base + gain * 0.5 * (1 - Math.cos(2 * Math.PI * laps * f)) + 3 * Math.sin(2 * Math.PI * 5.3 * laps * f);
    case "climb":
      return base + gain * Math.pow(Math.sin(Math.PI * f), 1.15) + 12 * Math.sin(14 * Math.PI * f) * Math.sin(Math.PI * f);
    case "two_climbs":
      return base + (gain / 2) * 0.5 * (1 - Math.cos(4 * Math.PI * f)) + 6 * Math.sin(22 * Math.PI * f) * Math.sin(Math.PI * f);
  }
}

// ---------------------------------------------------------------------------------------------
// Workouts: kinds and plans
// ---------------------------------------------------------------------------------------------

export type WorkoutKind =
  | "easy_run"
  | "intervals"
  | "long_run"
  | "trail_run"
  | "road_ride"
  | "hike"
  | "pool_swim"
  | "open_water_swim"
  | "dive"
  | "strength"
  | "xc_ski";

interface KindSpec {
  /** Suunto App activity id. */
  readonly activityId: number;
  readonly place: PlaceId;
  /** Altitude stream and ascent (barometer) when set. */
  readonly profile?: Profile;
  /** Location stream (GPS). */
  readonly gps: boolean;
  /** Start and stop positions without a location stream (a dive: GPS fix at the surface). */
  readonly fix?: boolean;
  readonly speed: boolean;
  readonly cadence: boolean;
  readonly power: boolean;
  /** Counts steps. */
  readonly foot: boolean;
  /** Short extension type names as /v3/workouts lists them in `extensionTypes`. */
  readonly types: readonly string[];
  /** FIT sport and sub_sport. */
  readonly fit: readonly [sport: number, subSport: number];
}

const OUTDOOR_TYPES = [
  "SUMMARY",
  "HEARTRATESTREAM",
  "ALTITUDESTREAM",
  "LOCATIONSTREAM",
  "SPEEDSTREAM",
  "DISTANCEDELTA",
  "CADENCESTREAM",
  "TEMPERATURESTREAM",
  "INTENSITY",
  "FITNESS",
] as const;

const RUN: KindSpec = { activityId: 1, place: "lake", profile: "loop", gps: true, speed: true, cadence: true, power: false, foot: true, types: OUTDOOR_TYPES, fit: [1, 0] };

const KINDS: Readonly<Record<WorkoutKind, KindSpec>> = {
  easy_run: RUN,
  intervals: RUN,
  long_run: RUN,
  trail_run: { ...RUN, activityId: 22, place: "ridge", profile: "climb", fit: [1, 3] },
  road_ride: { ...RUN, activityId: 2, place: "valmora", profile: "two_climbs", power: true, foot: false, types: [...OUTDOOR_TYPES, "POWERSTREAM"], fit: [2, 7] },
  hike: { ...RUN, activityId: 11, place: "ridge", profile: "climb", types: [...OUTDOOR_TYPES, "PAUSEMARKER"], fit: [17, 0] },
  xc_ski: { ...RUN, activityId: 3, place: "larch", foot: false, fit: [12, 0] },
  pool_swim: {
    activityId: 21,
    place: "hall",
    gps: false,
    speed: true,
    cadence: false,
    power: false,
    foot: false,
    types: ["SUMMARY", "HEARTRATESTREAM", "SPEEDSTREAM", "DISTANCEDELTA", "TEMPERATURESTREAM", "SWIMMINGHEADER", "INTENSITY"],
    fit: [5, 17],
  },
  open_water_swim: {
    activityId: 85,
    place: "lake",
    gps: true,
    speed: true,
    cadence: false,
    power: false,
    foot: false,
    types: ["SUMMARY", "HEARTRATESTREAM", "LOCATIONSTREAM", "SPEEDSTREAM", "DISTANCEDELTA", "TEMPERATURESTREAM", "SWIMMINGHEADER", "INTENSITY"],
    fit: [5, 18],
  },
  dive: {
    activityId: 78,
    place: "lake",
    gps: false,
    fix: true,
    speed: false,
    cadence: false,
    power: false,
    foot: false,
    types: ["SUMMARY", "HEARTRATESTREAM", "DEPTHSTREAM", "TEMPERATURESTREAM"],
    fit: [53, 53],
  },
  strength: {
    activityId: 23,
    place: "hall",
    gps: false,
    speed: false,
    cadence: false,
    power: false,
    foot: false,
    types: ["SUMMARY", "HEARTRATESTREAM", "TEMPERATURESTREAM", "INTENSITY"],
    fit: [10, 20],
  },
};

const KIND_INDEX: Readonly<Record<WorkoutKind, number>> = {
  easy_run: 1,
  intervals: 2,
  long_run: 3,
  trail_run: 4,
  road_ride: 5,
  hike: 6,
  pool_swim: 7,
  open_water_swim: 8,
  dive: 9,
  strength: 10,
  xc_ski: 11,
};

/** The Suunto activity id of a demo workout kind. */
export function activityIdOf(kind: WorkoutKind): number {
  return KINDS[kind].activityId;
}

/** Air temperature by month (degrees C) around the invented places. */
const AIR_C = [-1, 1, 5, 9, 14, 17, 20, 19, 15, 10, 5, 1] as const;
/** Lake Serein: surface water and water below the thermocline, by month (degrees C). */
const WATER_SURFACE_C = [5, 4, 5, 8, 13, 18, 21, 21, 18, 14, 10, 7] as const;
const WATER_DEEP_C = [5, 4, 5, 6, 7, 8, 9, 9, 9, 8, 7, 6] as const;

/** What a workout is made of: everything its streams, extensions and FIT file are computed from. */
export interface WorkoutPlan {
  readonly key: string;
  readonly workoutId: number;
  readonly kind: WorkoutKind;
  /** Local day number of the start. */
  readonly day: number;
  /** 0 for the first workout of the day. */
  readonly slot: number;
  readonly seed: number;
  readonly startMs: number;
  /** Timer time in seconds (pauses not counted). */
  readonly totalTimeS: number;
  /** A break (a hike's lunch at the summit): the timer stops at `atS` for `lengthS` seconds. */
  readonly pause?: { readonly atS: number; readonly lengthS: number };
  /** m/s on the flat (0 when the sport has no speed). */
  readonly baseSpeed: number;
  /** Climb in metres (per lap for loops). */
  readonly gain: number;
  readonly laps: number;
  /** Pool swims: makes the distance a whole number of pool lengths. */
  readonly speedScale: number;
  readonly airC: number;
  readonly waterSurfaceC: number;
  readonly waterDeepC: number;
  readonly maxDepth?: number;
  readonly diveNumber?: number;
  readonly name?: string;
  readonly description?: string;
}

/** A planned workout with its summary as /v3/workouts returns it. */
export interface DemoWorkout extends WorkoutPlan {
  readonly stopMs: number;
  readonly createdMs: number;
  readonly lastModifiedMs: number;
  /** kcal. */
  readonly energy: number;
  /** Training load (a TRIMP): drives the recovery balance and the next night. */
  readonly load: number;
  /** The summary, without extensions. */
  readonly wire: WireWorkout;
  readonly summaryExtension: WireExtension;
  /** The workout per 10 minutes of the 24/7 sample grid (heart rate, steps, altitude). */
  readonly tenMinutes: readonly WorkoutBucket[];
}

/** One 10-minute slot of a workout (aligned to the 24/7 sample grid), from its streams. */
export interface WorkoutBucket {
  /** Start of the slot (epoch ms, a multiple of ACTIVITY_INTERVAL_MS). */
  readonly t: number;
  /** Timer seconds of the workout in the slot. */
  readonly sec: number;
  /** Sum of heart rate x seconds. */
  readonly hrSec: number;
  readonly hrMin: number;
  readonly hrMax: number;
  readonly steps: number;
  readonly altSum: number;
  readonly altN: number;
}

/** A workout's streams summed per 10-minute slot: what its 24/7 samples need, small enough to keep. */
function tenMinuteBuckets(s: WorkoutSeries, foot: boolean): WorkoutBucket[] {
  const out: WorkoutBucket[] = [];
  let cur: { -readonly [K in keyof WorkoutBucket]: WorkoutBucket[K] } | undefined;
  for (let i = 0; i < s.time.length; i++) {
    const t = Math.floor(s.time[i]! / ACTIVITY_INTERVAL_MS) * ACTIVITY_INTERVAL_MS;
    if (!cur || cur.t !== t) {
      cur = { t, sec: 0, hrSec: 0, hrMin: Infinity, hrMax: -Infinity, steps: 0, altSum: 0, altN: 0 };
      out.push(cur);
    }
    const dt = i + 1 < s.timer.length ? s.timer[i + 1]! - s.timer[i]! : 0;
    const hr = s.hr[i]!;
    cur.sec += dt;
    cur.hrSec += hr * dt;
    cur.hrMin = Math.min(cur.hrMin, hr);
    cur.hrMax = Math.max(cur.hrMax, hr);
    if (foot && s.cadenceHz) cur.steps += s.cadenceHz[i]! * 2 * dt;
    if (s.altitude) {
      cur.altSum += s.altitude[i]!;
      cur.altN++;
    }
  }
  return out;
}

const INTERVAL_WARM_S = 900;
const INTERVAL_ON_S = 180;
const INTERVAL_OFF_S = 120;
const INTERVAL_REPS = 6;

/** The kinds of the workouts of a day (none on rest days). The week decides how many. */
function plannedKinds(day: number): WorkoutKind[] {
  const weekday = weekdayOf(day);
  const monday = day - (weekday - 1);
  const count = 4 + Math.floor(new Rng(hash32(SALT.week, monday)).next() * 3);
  const days = count === 4 ? [2, 4, 6, 7] : count === 5 ? [1, 2, 4, 6, 7] : [1, 2, 3, 4, 6, 7];
  if (!days.includes(weekday)) return [];
  const month = monthOfDay(day);
  const winter = month === 12 || month <= 3;
  const summer = month >= 6 && month <= 9;
  const r = new Rng(hash32(SALT.day, day));
  switch (weekday) {
    case 1:
      return ["strength"];
    case 2:
      return ["intervals"];
    case 3:
      return [summer && r.chance(0.5) ? "open_water_swim" : "pool_swim"];
    case 4:
      if (count === 4 && r.chance(0.5)) return ["strength"];
      if (summer && r.chance(0.2)) return ["road_ride"];
      return [r.chance(0.25) ? "pool_swim" : "easy_run"];
    case 6:
      if (winter) return [r.chance(0.6) ? "xc_ski" : "long_run"];
      return [r.chance(0.6) ? "long_run" : "road_ride"];
    default: {
      const x = r.next();
      if (winter) return [x < 0.4 ? "xc_ski" : x < 0.7 ? "hike" : "trail_run"];
      return [x < 0.5 ? "hike" : x < 0.85 ? "trail_run" : "road_ride"];
    }
  }
}

/** The Saturday on or before a day. */
function saturdayOnOrBefore(day: number): number {
  return day - ((weekdayOf(day) - 6 + 7) % 7);
}

/** Local start time of a workout, in minutes after midnight. */
function startMinute(kind: WorkoutKind, day: number, slot: number, r: Rng): number {
  const weekend = weekdayOf(day) >= 6;
  switch (kind) {
    case "dive":
      return slot === 0 ? 10 * 60 + r.int(0, 20) : 13 * 60 + 20 + r.int(0, 20);
    case "strength":
      return 18 * 60 + 25 + r.int(0, 35);
    case "intervals":
      return r.chance(0.7) ? 18 * 60 + r.int(0, 40) : 6 * 60 + 50 + r.int(0, 20);
    case "easy_run":
      if (weekend) return 9 * 60 + r.int(0, 60);
      return r.chance(0.5) ? 6 * 60 + 50 + r.int(0, 25) : 12 * 60 + 5 + r.int(0, 15);
    case "pool_swim":
      return r.chance(0.5) ? 12 * 60 + 5 + r.int(0, 15) : 19 * 60 + r.int(0, 10);
    case "open_water_swim":
      return 18 * 60 + 30 + r.int(0, 30);
    case "road_ride":
      return weekend ? 9 * 60 + r.int(0, 60) : 17 * 60 + 40 + r.int(0, 20);
    case "long_run":
      return 8 * 60 + 30 + r.int(0, 60);
    case "trail_run":
      return 9 * 60 + r.int(0, 60);
    case "hike":
      return 8 * 60 + r.int(0, 50);
    case "xc_ski":
      return 9 * 60 + 30 + r.int(0, 60);
  }
}

/** Seconds with hundredths, like the timer times Suunto sends (for example 2686.03). */
function timerSeconds(minutes: number, r: Rng): number {
  return Math.round(minutes * 60) + r.int(0, 99) / 100;
}

function lapsFor(baseSpeed: number, totalTimeS: number, lapMetres: number): number {
  return Math.max(1, Math.round((baseSpeed * totalTimeS) / lapMetres));
}

function planWorkout(kind: WorkoutKind, day: number, slot: number, zone: ZoneClock): WorkoutPlan {
  const seed = hash32(SALT.workout, day, slot, KIND_INDEX[kind]);
  const r = new Rng(seed);
  const month = monthOfDay(day);
  const weekend = weekdayOf(day) >= 6;
  const startMs = zone.instant(day, startMinute(kind, day, slot, r)) + r.int(0, 59_999);
  const base = {
    key: demoId(startMs, day * 16 + slot),
    workoutId: 700_000_000 + day * 10 + slot,
    kind,
    day,
    slot,
    seed,
    startMs,
    speedScale: 1,
    airC: AIR_C[month - 1]! + r.range(-3, 3),
    waterSurfaceC: WATER_SURFACE_C[month - 1]! + r.range(-0.8, 0.8),
    waterDeepC: WATER_DEEP_C[month - 1]! + r.range(-0.4, 0.4),
  };
  const named = (p: number, name: string) => (r.chance(p) ? { name } : {});
  const described = (p: number, description: string) => (r.chance(p) ? { description } : {});
  switch (kind) {
    case "easy_run": {
      const totalTimeS = timerSeconds(r.range(38, 55), r);
      const baseSpeed = r.range(2.85, 3.05);
      return { ...base, totalTimeS, baseSpeed, gain: r.range(8, 16), laps: lapsFor(baseSpeed, totalTimeS, 5000), ...named(0.3, "Lake Serein loop"), ...described(0.2, "Easy run, legs a bit heavy.") };
    }
    case "intervals": {
      const totalTimeS = INTERVAL_WARM_S + INTERVAL_REPS * (INTERVAL_ON_S + INTERVAL_OFF_S) + timerSeconds(r.range(10, 13), r);
      const baseSpeed = r.range(2.85, 3.0);
      return {
        ...base,
        totalTimeS,
        baseSpeed,
        gain: 10,
        laps: lapsFor(baseSpeed * 1.1, totalTimeS, 5000),
        name: `Intervals ${INTERVAL_REPS} x 3 min`,
        description: `${INTERVAL_REPS} x 3 min hard, 2 min easy jog.`,
      };
    }
    case "long_run": {
      const totalTimeS = timerSeconds(r.range(80, 115), r);
      const baseSpeed = r.range(2.8, 2.95);
      return { ...base, totalTimeS, baseSpeed, gain: 14, laps: lapsFor(baseSpeed, totalTimeS, 8000), ...named(0.5, "Long run around Lake Serein"), ...described(0.3, "Steady long run.") };
    }
    case "trail_run":
      return { ...base, totalTimeS: timerSeconds(r.range(60, 95), r), baseSpeed: r.range(2.45, 2.65), gain: r.range(350, 750), laps: 1, ...named(0.5, "Pine Ridge trail") };
    case "road_ride": {
      const minutes = weekend ? r.range(110, 170) : r.range(95, 120);
      return { ...base, totalTimeS: timerSeconds(minutes, r), baseSpeed: r.range(7.4, 8.2), gain: r.range(600, 1400), laps: 1, ...named(0.5, "Valmora Pass ride") };
    }
    case "hike": {
      const totalTimeS = timerSeconds(r.range(200, 320), r);
      return {
        ...base,
        totalTimeS,
        baseSpeed: r.range(1.15, 1.3),
        gain: r.range(650, 1150),
        laps: 1,
        pause: { atS: Math.round(totalTimeS / 20) * 10, lengthS: r.int(25, 40) * 60 },
        ...named(0.6, "Pine Ridge summit hike"),
        ...described(0.4, "Lunch break at the summit."),
      };
    }
    case "pool_swim":
      return { ...base, totalTimeS: timerSeconds(r.range(38, 52), r), baseSpeed: r.range(0.82, 0.9), gain: 0, laps: 1, ...described(0.3, "Technique drills and 10 x 100 m.") };
    case "open_water_swim":
      return { ...base, totalTimeS: timerSeconds(r.range(28, 45), r), baseSpeed: r.range(0.74, 0.82), gain: 0, laps: 1, name: "Lake Serein swim" };
    case "dive":
      return {
        ...base,
        totalTimeS: timerSeconds(r.range(42, 55), r),
        baseSpeed: 0,
        gain: 0,
        laps: 1,
        maxDepth: slot === 0 ? r.range(18, 24) : r.range(11, 15),
        diveNumber: slot + 1,
        name: `Lake Serein dive ${slot + 1}`,
        description: slot === 0 ? "North wall, visibility about 6 m." : "Shallow dive along the reed belt.",
      };
    case "strength":
      return { ...base, totalTimeS: timerSeconds(r.range(42, 58), r), baseSpeed: 0, gain: 0, laps: 1, ...named(0.3, "Core and legs") };
    case "xc_ski": {
      const totalTimeS = timerSeconds(r.range(60, 110), r);
      const baseSpeed = r.range(3.7, 4.4);
      return { ...base, totalTimeS, baseSpeed, gain: r.range(40, 90), laps: lapsFor(baseSpeed, totalTimeS, 6000), ...named(0.5, "Larch Valley ski track") };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Workouts: streams
// ---------------------------------------------------------------------------------------------

/** A workout's streams, one point every STREAM_STEP_S seconds of timer time, plus the last point. */
export interface WorkoutSeries {
  /** Wall-clock time of each point (epoch ms). */
  readonly time: number[];
  /** Timer seconds of each point. */
  readonly timer: number[];
  /** bpm. */
  readonly hr: number[];
  readonly temperatureK: number[];
  /** m/s. */
  readonly speed?: number[];
  /** Metres from the start. */
  readonly distance?: number[];
  readonly altitude?: number[];
  /** Hz (cycles per second: strides, pedal turns, pole pushes). */
  readonly cadenceHz?: number[];
  /** W. */
  readonly power?: number[];
  /** Metres below the surface. */
  readonly depth?: number[];
  readonly lat?: number[];
  readonly lon?: number[];
}

/** Wall-clock time (epoch ms) of a timer second. */
function wallTime(p: WorkoutPlan, timerS: number): number {
  const paused = p.pause && timerS > p.pause.atS ? p.pause.lengthS : 0;
  return p.startMs + Math.round((timerS + paused) * 1000);
}

function intervalPhase(s: number): "warm" | "on" | "off" | "cool" {
  if (s < INTERVAL_WARM_S) return "warm";
  const k = s - INTERVAL_WARM_S;
  const rep = INTERVAL_ON_S + INTERVAL_OFF_S;
  if (k >= INTERVAL_REPS * rep) return "cool";
  return k % rep < INTERVAL_ON_S ? "on" : "off";
}

function speedAt(p: WorkoutPlan, s: number, f: number, slope: number): number {
  const b = p.baseSpeed;
  switch (p.kind) {
    case "easy_run":
      return b * (1 + 0.03 * Math.sin((2 * Math.PI * s) / 420)) * clamp(1 - 3 * slope, 0.75, 1.15);
    case "long_run":
      return b * (1 - 0.05 * f) * clamp(1 - 3 * slope, 0.75, 1.15);
    case "intervals": {
      const phase = intervalPhase(s);
      return b * (phase === "warm" ? 0.97 : phase === "on" ? 1.42 : phase === "off" ? 0.83 : 0.94);
    }
    case "trail_run":
      return b * clamp(1 - 2.5 * slope, 0.55, 1.2);
    case "hike":
      return b * clamp(1 - 4 * slope, 0.55, 1.25);
    case "road_ride":
      return b * clamp(1 - 10 * slope, 0.42, 1.9);
    case "xc_ski":
      return b * clamp(1 - 7 * slope, 0.5, 1.5);
    case "pool_swim":
      return b * (1 + 0.04 * Math.sin((2 * Math.PI * s) / 97));
    case "open_water_swim":
      return b * (1 + 0.03 * Math.sin((2 * Math.PI * s) / 131));
    default:
      return 0;
  }
}

/** Cycling power from speed and slope (80 kg with the bike), in W. */
function ridePower(v: number, slope: number): number {
  const mass = 80;
  const g = 9.81;
  const climb = mass * g * v * slope;
  const rolling = 0.005 * mass * g * v;
  const aero = 0.5 * 1.2 * 0.45 * v ** 3;
  // 3 % lost in the drivetrain.
  return clamp((climb + rolling + aero) / 0.97, 0, 460);
}

/** Energy cost of running on a slope, J per kg and metre (Minetti et al. 2002). */
function runningCost(slope: number): number {
  const i = clamp(slope, -0.45, 0.45);
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

function hrTarget(p: WorkoutPlan, s: number, f: number, v: number, slope: number, watts: number): number {
  switch (p.kind) {
    case "easy_run":
    case "long_run":
    case "intervals":
    case "trail_run": {
      // Metabolic power (W/kg): runners slow down uphill and keep about the same effort.
      // Downhill the heart rate stays up a little (the legs brake).
      const effort = Math.max(runningCost(slope), 0.85 * runningCost(0)) * v;
      return 55 + 115 * (effort / (runningCost(0) * 4.6)) + (p.kind === "long_run" ? 8 * f : 0);
    }
    case "hike":
      return 90 + 300 * Math.max(slope, 0) + 8 * (v / 1.2);
    case "road_ride":
      return 84 + 0.3 * watts;
    case "xc_ski":
      return 118 + 22 * (v / 4) + 160 * Math.max(slope, 0);
    case "pool_swim":
    case "open_water_swim":
      return 104 + 26 * (v / 0.85);
    case "dive":
      return 78 + 14 * Math.exp(-s / 400);
    case "strength":
      return s % 150 < 50 ? 132 : 97;
  }
}

function cadenceAt(p: WorkoutPlan, v: number, watts: number, noise: number): number {
  switch (p.kind) {
    case "hike":
      return 0.92 + 0.03 * noise;
    case "road_ride":
      return watts < 20 ? 0 : 1.4 + 0.05 * noise;
    case "xc_ski":
      return 0.75 + 0.04 * noise;
    default:
      return 1.38 + 0.025 * v + 0.01 * noise;
  }
}

/** Depth of a dive (m) at a timer second: down, a multi-level profile, a safety stop at 5 m, up. */
function diveDepth(p: WorkoutPlan, s: number): number {
  const T = p.totalTimeS;
  const m = p.maxDepth ?? 18;
  const knots: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [100, m],
    [0.35 * T, m - 1.2],
    [0.42 * T, 0.62 * m],
    [0.62 * T, 0.55 * m],
    [0.7 * T, 0.4 * m],
    [T - 250, 5.3],
    [T - 70, 4.9],
    [T, 0],
  ];
  let d = 0;
  for (let i = 1; i < knots.length; i++) {
    const [t1, d1] = knots[i]!;
    if (s <= t1) {
      const [t0, d0] = knots[i - 1]!;
      d = d0 + ((d1 - d0) * (s - t0)) / Math.max(1e-9, t1 - t0);
      break;
    }
  }
  return Math.max(0, d + (d > 1.5 ? 0.25 * Math.sin((2 * Math.PI * s) / 97) : 0));
}

/** Lake water temperature (degrees C) at a depth: warm above the thermocline at about 8 m. */
function waterAt(p: WorkoutPlan, depth: number): number {
  return p.waterDeepC + (p.waterSurfaceC - p.waterDeepC) / (1 + Math.exp((depth - 8) / 1.5));
}

function temperatureC(p: WorkoutPlan, s: number, depth: number): number {
  switch (p.kind) {
    case "pool_swim":
      return 28.2 + 0.2 * Math.sin(s / 300);
    case "strength":
      return 23.5 + 2.5 * (1 - Math.exp(-s / 900));
    case "open_water_swim":
      return p.waterSurfaceC + 0.6;
    case "dive":
      return waterAt(p, depth);
    default:
      // A wrist sensor reads warmer than the air.
      return p.airC + 4 + 2.5 * (1 - Math.exp(-s / 900));
  }
}

/** The streams of a workout. Pure: the same plan always gives the same points. */
export function workoutSeries(p: WorkoutPlan): WorkoutSeries {
  const spec = KINDS[p.kind];
  const place = DEMO_PLACES[spec.place];
  const T = p.totalTimeS;
  const timer: number[] = [];
  for (let s = 0; s < T; s += STREAM_STEP_S) timer.push(s);
  timer.push(T);
  const n = timer.length;
  const time = timer.map((s) => wallTime(p, s));
  const hr = new Array<number>(n);
  const temperatureK = new Array<number>(n);
  const speed = spec.speed ? new Array<number>(n) : undefined;
  const distance = spec.speed ? new Array<number>(n) : undefined;
  const altitude = spec.profile ? new Array<number>(n) : undefined;
  const cadenceHz = spec.cadence ? new Array<number>(n) : undefined;
  const power = spec.power ? new Array<number>(n) : undefined;
  const depth = p.kind === "dive" ? new Array<number>(n) : undefined;
  const flatMetres = Math.max(1, p.baseSpeed * T);
  let hrState = 86 + 8 * unit(p.seed, SALT.series);
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const s = timer[i]!;
    const f = s / T;
    const dt = i === 0 ? 0 : s - timer[i - 1]!;
    const noise = (k: number) => unit3(p.seed, i, k) * 2 - 1;
    let slope = 0;
    if (spec.profile) {
      const alt = profileAltitude(spec.profile, place.alt, p.gain, p.laps, f);
      altitude![i] = roundTo(alt, 1);
      const d = 0.0005;
      const da = profileAltitude(spec.profile, place.alt, p.gain, p.laps, Math.min(1, f + d)) - profileAltitude(spec.profile, place.alt, p.gain, p.laps, Math.max(0, f - d));
      slope = da / ((Math.min(1, f + d) - Math.max(0, f - d)) * flatMetres);
    }
    let v = 0;
    if (speed && distance) {
      v = Math.max(0.05, speedAt(p, s, f, slope) * (1 + 0.025 * noise(1)) * p.speedScale);
      speed[i] = v;
      if (i > 0) dist += ((speed[i - 1]! + v) / 2) * dt;
      distance[i] = dist;
    }
    let watts = 0;
    if (power) {
      watts = Math.max(0, ridePower(v, slope) * (1 + 0.06 * noise(2)));
      power[i] = Math.round(watts);
    }
    const target = hrTarget(p, s, f, v, slope, watts);
    hrState += (target - hrState) * (1 - Math.exp(-dt / 25));
    hr[i] = Math.round(clamp(hrState + 1.5 * noise(3), 60, USER_MAX_HR));
    if (cadenceHz) cadenceHz[i] = roundTo(cadenceAt(p, v, watts, noise(4)), 3);
    const dep = depth ? diveDepth(p, s) : 0;
    if (depth) depth[i] = roundTo(dep, 2);
    temperatureK[i] = roundTo(temperatureC(p, s, dep) + KELVIN, 2);
  }
  let lat: number[] | undefined;
  let lon: number[] | undefined;
  if (spec.gps && distance) {
    lat = new Array<number>(n);
    lon = new Array<number>(n);
    const perimeter = Math.max(1, dist / p.laps);
    for (let i = 0; i < n; i++) {
      const pos = loopPoint(place, perimeter, (distance[i]! / perimeter) % 1);
      // A metre or two of GPS jitter.
      lat[i] = roundTo(pos.lat + (1.5 * (unit3(p.seed, i, 5) * 2 - 1)) / M_PER_DEG_LAT, 7);
      lon[i] = roundTo(pos.lon + (1.5 * (unit3(p.seed, i, 6) * 2 - 1)) / M_PER_DEG_LAT, 7);
    }
  }
  return {
    time,
    timer,
    hr,
    temperatureK,
    ...(speed ? { speed: speed.map((x) => roundTo(x, 3)) } : {}),
    ...(distance ? { distance: distance.map((x) => roundTo(x, 2)) } : {}),
    ...(altitude ? { altitude } : {}),
    ...(cadenceHz ? { cadenceHz } : {}),
    ...(power ? { power } : {}),
    ...(depth ? { depth } : {}),
    ...(lat && lon ? { lat, lon } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Workouts: summaries
// ---------------------------------------------------------------------------------------------

interface SeriesStats {
  hrAvg: number;
  hrMax: number;
  hrrAvg: number;
  kcal: number;
  load: number;
  distance?: number;
  maxSpeed?: number;
  ascent: number;
  descent: number;
  ascentTime: number;
  descentTime: number;
  minAlt?: number;
  maxAlt?: number;
  cadenceAvgHz?: number;
  cadenceMaxHz?: number;
  steps?: number;
  powerAvg?: number;
  powerMax?: number;
  tempAvgK: number;
  tempMaxK: number;
  maxDepth?: number;
  avgDepth?: number;
}

/** kcal per minute from heart rate (Keytel et al., for the demo person's weight and age). */
function kcalPerMinute(hr: number): number {
  return Math.max(1.5, (-55.0969 + 0.6309 * hr + 0.1988 * WEIGHT_KG + 0.2017 * AGE_YEARS) / 4.184);
}

function seriesStats(p: WorkoutPlan, s: WorkoutSeries): SeriesStats {
  const n = s.timer.length;
  let weight = 0;
  let hrSum = 0;
  let hrMax = 0;
  let kcal = 0;
  let load = 0;
  let tempSum = 0;
  let tempMax = -Infinity;
  let ascent = 0;
  let descent = 0;
  let ascentTime = 0;
  let descentTime = 0;
  let cadSum = 0;
  let cadW = 0;
  let cadMax = 0;
  let steps = 0;
  let powSum = 0;
  let depthSum = 0;
  for (let i = 0; i < n; i++) {
    const dt = i + 1 < n ? s.timer[i + 1]! - s.timer[i]! : 0;
    const hr = s.hr[i]!;
    weight += dt;
    hrSum += hr * dt;
    hrMax = Math.max(hrMax, hr);
    kcal += (kcalPerMinute(hr) * dt) / 60;
    const hrr = clamp((hr - REST_HR) / (USER_MAX_HR - REST_HR), 0, 1);
    load += (dt / 60) * hrr * 0.64 * Math.exp(1.92 * hrr);
    tempSum += s.temperatureK[i]! * dt;
    tempMax = Math.max(tempMax, s.temperatureK[i]!);
    if (s.altitude && i > 0) {
      const d = s.altitude[i]! - s.altitude[i - 1]!;
      const step = s.timer[i]! - s.timer[i - 1]!;
      if (d > 0) {
        ascent += d;
        ascentTime += step;
      } else if (d < 0) {
        descent -= d;
        descentTime += step;
      }
    }
    if (s.cadenceHz) {
      const c = s.cadenceHz[i]!;
      if (c > 0) {
        cadSum += c * dt;
        cadW += dt;
      }
      cadMax = Math.max(cadMax, c);
      steps += c * 2 * dt;
    }
    if (s.power) powSum += s.power[i]! * dt;
    if (s.depth) depthSum += s.depth[i]! * dt;
  }
  const w = Math.max(1, weight);
  const hrAvg = hrSum / w;
  return {
    hrAvg: Math.round(hrAvg),
    hrMax,
    hrrAvg: clamp((hrAvg - REST_HR) / (USER_MAX_HR - REST_HR), 0, 1),
    kcal: Math.round(kcal),
    load,
    ...(s.distance ? { distance: s.distance[n - 1]!, maxSpeed: Math.max(...s.speed!) } : {}),
    ascent,
    descent,
    ascentTime,
    descentTime,
    ...(s.altitude ? { minAlt: Math.min(...s.altitude), maxAlt: Math.max(...s.altitude) } : {}),
    ...(s.cadenceHz && cadW > 0 ? { cadenceAvgHz: cadSum / cadW, cadenceMaxHz: cadMax } : {}),
    ...(KINDS[p.kind].foot ? { steps: Math.round(steps) } : {}),
    ...(s.power ? { powerAvg: Math.round(powSum / w), powerMax: Math.max(...s.power) } : {}),
    tempAvgK: tempSum / w,
    tempMaxK: tempMax,
    ...(s.depth ? { maxDepth: Math.max(...s.depth), avgDepth: depthSum / w } : {}),
  };
}

/** A position as workouts carry it: x the longitude, y the latitude. */
function position(lat: number, lon: number): { x: number; y: number } {
  return { x: roundTo(lon, 7), y: roundTo(lat, 7) };
}

function finishWorkout(plan: WorkoutPlan, zone: ZoneClock, resetAtMs: number): DemoWorkout {
  let p = plan;
  if (p.kind === "pool_swim") {
    // A pool swim is a whole number of 50 m (two 25 m lengths).
    const raw = workoutSeries(p).distance!.at(-1)!;
    p = { ...p, speedScale: Math.max(50, Math.round(raw / 50) * 50) / raw };
  }
  const spec = KINDS[p.kind];
  const series = workoutSeries(p);
  const st = seriesStats(p, series);
  const r = new Rng(hash32(p.seed, 77));
  const T = p.totalTimeS;
  const stopMs = series.time.at(-1)!;
  const createdMs = stopMs + r.int(5, 45) * MINUTE_MS + r.int(0, 59_999);
  const editedMs = createdMs + Math.round(r.range(1, 2) * DAY_MS);
  const edited = r.chance(0.08) && editedMs < resetAtMs;
  const lastModifiedMs = edited ? editedMs : createdMs;
  const recoveryH = Math.round(4 + st.load * 0.18);
  const pte = roundTo(clamp(1 + 2.6 * (st.hrrAvg / 0.65) ** 2 + 0.6 * Math.min(1, T / 7200), 1, 5), 1);
  const place = DEMO_PLACES[spec.place];
  const n = series.timer.length;

  let positions: Pick<WireWorkout, "startPosition" | "stopPosition" | "centerPosition"> = {};
  if (series.lat && series.lon) {
    const lats = series.lat;
    const lons = series.lon;
    positions = {
      startPosition: position(lats[0]!, lons[0]!),
      stopPosition: position(lats[n - 1]!, lons[n - 1]!),
      centerPosition: position((Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2),
    };
  } else if (spec.fix) {
    const entry = loopPoint(place, 900, 0.18);
    positions = { startPosition: position(entry.lat, entry.lon), stopPosition: position(entry.lat + 0.00004, entry.lon - 0.00003), centerPosition: position(entry.lat, entry.lon) };
  }

  const wire: WireWorkout = {
    workoutKey: p.key,
    workoutId: p.workoutId,
    activityId: spec.activityId,
    ...(p.name ? { workoutName: p.name } : {}),
    ...(p.description ? { description: p.description } : {}),
    startTime: p.startMs,
    stopTime: stopMs,
    timeOffsetInMinutes: zone.offset(stopMs),
    totalTime: T,
    ...(st.distance !== undefined
      ? {
          totalDistance: roundTo(st.distance, 1),
          avgSpeed: roundTo(st.distance / T, 2),
          maxSpeed: roundTo(st.maxSpeed!, 2),
          avgPace: roundTo(T / 60 / Math.max(0.001, st.distance / 1000), 2),
        }
      : {}),
    ...(series.altitude
      ? { totalAscent: roundTo(st.ascent, 2), totalDescent: roundTo(st.descent, 2), minAltitude: st.minAlt!, maxAltitude: st.maxAlt! }
      : {}),
    energyConsumption: st.kcal,
    ...(st.steps !== undefined ? { stepCount: st.steps } : {}),
    recoveryTime: recoveryH * 3600,
    cumulativeRecoveryTime: Math.round(recoveryH * 1.2) * 3600,
    hrdata: { userMaxHR: USER_MAX_HR, workoutMaxHR: st.hrMax, workoutAvgHR: st.hrAvg, hrmax: st.hrMax, max: USER_MAX_HR, avg: st.hrAvg },
    // Per minute, as the schema says ("round per minute").
    ...(st.cadenceAvgHz !== undefined ? { cadence: { avg: Math.round(st.cadenceAvgHz * 60), max: Math.round(st.cadenceMaxHz! * 60) } } : {}),
    ...positions,
    created: createdMs,
    lastModified: lastModifiedMs,
    isEdited: edited,
    pictureCount: 0,
    commentCount: 0,
    viewCount: 0,
    extensionTypes: [...spec.types],
  };
  const summaryExtension: WireExtension = {
    type: "SummaryExtension",
    pte,
    feeling: r.chance(0.6) ? r.int(3, 5) : null,
    avgTemperature: roundTo(st.tempAvgK, 5),
    maxTemperature: roundTo(st.tempMaxK, 5),
    peakEpoc: roundTo(3 * pte ** 2.6, 1),
    avgPower: st.powerAvg ?? null,
    maxPower: st.powerMax ?? null,
    avgCadence: st.cadenceAvgHz !== undefined ? roundTo(st.cadenceAvgHz, 7) : null,
    maxCadence: st.cadenceMaxHz !== undefined ? roundTo(st.cadenceMaxHz, 7) : null,
    ascentTime: series.altitude ? st.ascentTime : null,
    descentTime: series.altitude ? st.descentTime : null,
    performanceLevel: null,
  };
  return { ...p, stopMs, createdMs, lastModifiedMs, energy: st.kcal, load: st.load, wire, summaryExtension, tenMinutes: tenMinuteBuckets(series, spec.foot) };
}

/**
 * The workouts of the demo data for a reset at `resetAtMs`: every planned workout from DATA_DAYS
 * days before the reset day to the end of the reset day, oldest first. Workouts that end after
 * "now" are in the list; the backend hides them until they are synced. Two scuba dives fall on
 * the Saturday about four weeks before the reset day.
 */
export function planWorkouts(resetAtMs: number, timeZone: string): DemoWorkout[] {
  const zone = new ZoneClock(timeZone);
  const resetDay = zone.day(resetAtMs);
  const diveDay = saturdayOnOrBefore(resetDay - 26);
  const out: DemoWorkout[] = [];
  for (let day = resetDay - DATA_DAYS; day <= resetDay; day++) {
    const kinds: WorkoutKind[] = day === diveDay ? ["dive", "dive"] : plannedKinds(day);
    kinds.forEach((kind, slot) => out.push(finishWorkout(planWorkout(kind, day, slot, zone), zone, resetAtMs)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Workouts: extensions
// ---------------------------------------------------------------------------------------------

/** Extension names (the `extensions` parameter) for the short names of `extensionTypes`. */
const EXTENSION_OF_TYPE: Readonly<Record<string, string>> = {
  SUMMARY: "SummaryExtension",
  HEARTRATESTREAM: "HeartrateStreamExtension",
  ALTITUDESTREAM: "AltitudeStreamExtension",
  LOCATIONSTREAM: "LocationStreamExtension",
  SPEEDSTREAM: "SpeedStreamExtension",
  DISTANCEDELTA: "DistanceDeltaStreamExtension",
  CADENCESTREAM: "CadenceStreamExtension",
  TEMPERATURESTREAM: "TemperatureStreamExtension",
  INTENSITY: "IntensityExtension",
  FITNESS: "FitnessExtension",
  POWERSTREAM: "PowerStreamExtension",
  DEPTHSTREAM: "DepthStreamExtension",
  SWIMMINGHEADER: "SwimmingHeaderExtension",
  PAUSEMARKER: "PauseMarkerExtension",
};

/** The extension names a demo workout has (what GET /v3/workouts/{key}?extensions= can return). */
export function availableExtensions(w: DemoWorkout): string[] {
  const spec = KINDS[w.kind];
  const names = spec.types.map((t) => EXTENSION_OF_TYPE[t]).filter((x): x is string => !!x);
  // These two exist on the API but have no short name in `extensionTypes`.
  if (spec.gps && spec.profile) names.push("WeatherExtension");
  if (w.kind === "dive") names.push("DiveHeaderExtension");
  return names;
}

/** Indices of the points of a stream: all of them, or every k-th one (and the last) above the cap. */
function streamIndices(n: number): number[] {
  const step = Math.max(1, Math.ceil(n / MAX_STREAM_POINTS));
  const out: number[] = [];
  for (let i = 0; i < n; i += step) out.push(i);
  if (out.at(-1) !== n - 1) out.push(n - 1);
  return out;
}

function valueStream(type: string, s: WorkoutSeries, values: readonly number[], decimals: number): WireExtension {
  return { type, points: streamIndices(s.time.length).map((i) => ({ timestamp: s.time[i]!, value: roundTo(values[i]!, decimals) })) };
}

/** Heart rate zones as fractions of the maximum heart rate (lower limits in bpm). */
const ZONE_LIMITS = [0, 0.6, 0.7, 0.8, 0.9].map((f) => Math.round(f * USER_MAX_HR));

function buildExtension(w: DemoWorkout, name: string, series: () => WorkoutSeries): WireExtension | undefined {
  const spec = KINDS[w.kind];
  const r = new Rng(hash32(w.seed, 99));
  switch (name) {
    case "SummaryExtension":
      return structuredClone(w.summaryExtension);
    case "HeartrateStreamExtension":
      return valueStream(name, series(), series().hr, 0);
    case "TemperatureStreamExtension":
      return valueStream(name, series(), series().temperatureK, 2);
    case "AltitudeStreamExtension": {
      const s = series();
      return s.altitude ? valueStream(name, s, s.altitude, 1) : undefined;
    }
    case "SpeedStreamExtension": {
      const s = series();
      return s.speed ? valueStream(name, s, s.speed, 2) : undefined;
    }
    case "CadenceStreamExtension": {
      const s = series();
      return s.cadenceHz ? valueStream(name, s, s.cadenceHz, 3) : undefined;
    }
    case "PowerStreamExtension": {
      const s = series();
      return s.power ? valueStream(name, s, s.power, 0) : undefined;
    }
    case "DepthStreamExtension": {
      const s = series();
      return s.depth ? valueStream(name, s, s.depth, 2) : undefined;
    }
    case "DistanceDeltaStreamExtension": {
      const s = series();
      if (!s.distance) return undefined;
      const idx = streamIndices(s.time.length);
      return {
        type: name,
        points: idx.map((i, k) => ({ timestamp: s.time[i]!, value: roundTo(k === 0 ? 0 : s.distance![i]! - s.distance![idx[k - 1]!]!, 2) })),
      };
    }
    case "LocationStreamExtension": {
      const s = series();
      if (!s.lat || !s.lon) return undefined;
      return {
        type: name,
        locationPoints: streamIndices(s.time.length).map((i) => ({
          timestamp: s.time[i]!,
          latitude: s.lat![i]!,
          longitude: s.lon![i]!,
          ...(s.altitude ? { altitude: s.altitude[i]! } : {}),
        })),
      };
    }
    case "IntensityExtension": {
      const s = series();
      const totals = [0, 0, 0, 0, 0];
      for (let i = 0; i + 1 < s.timer.length; i++) {
        let z = 0;
        while (z < 4 && s.hr[i]! >= ZONE_LIMITS[z + 1]!) z++;
        totals[z]! += s.timer[i + 1]! - s.timer[i]!;
      }
      const heartRate: Record<string, { totalTime: number; lowerLimit: number }> = {};
      totals.forEach((t, z) => (heartRate[`zone${z + 1}`] = { totalTime: roundTo(t, 2), lowerLimit: ZONE_LIMITS[z]! }));
      return { type: name, zones: { heartRate } };
    }
    case "FitnessExtension":
      return { type: name, maxHeartRate: USER_MAX_HR, vo2Max: roundTo(51.2 + 0.8 * Math.sin(w.day / 40), 1), fitnessAge: 31 };
    case "WeatherExtension":
      if (!(spec.gps && spec.profile)) return undefined;
      return {
        type: name,
        temperature: roundTo(w.airC + KELVIN, 2),
        humidity: r.int(45, 90),
        windSpeed: roundTo(r.range(0.5, 6), 1),
        windDirection: r.int(0, 359),
        cloudiness: r.int(0, 100),
        weatherIcon: r.chance(0.5) ? "02d" : "04d",
      };
    case "PauseMarkerExtension":
      if (!w.pause) return undefined;
      return {
        type: name,
        pauseMarkers: [{ startTime: wallTime(w, w.pause.atS), endTime: wallTime(w, w.pause.atS) + w.pause.lengthS * 1000, automatic: false }],
      };
    case "SwimmingHeaderExtension": {
      if (w.kind !== "pool_swim" && w.kind !== "open_water_swim") return undefined;
      const strokeRate = r.int(26, 32);
      return {
        type: name,
        avgSwolf: w.kind === "pool_swim" ? r.int(36, 44) : null,
        avgStrokeRate: strokeRate,
        ...(w.kind === "pool_swim" ? { poolLength: 25 } : {}),
      };
    }
    case "DiveHeaderExtension": {
      if (w.kind !== "dive") return undefined;
      const s = series();
      const depths = s.depth!;
      let sum = 0;
      for (let i = 0; i + 1 < depths.length; i++) sum += depths[i]! * (s.timer[i + 1]! - s.timer[i]!);
      const deepest = depths.indexOf(Math.max(...depths));
      return {
        type: name,
        maxDepth: roundTo(Math.max(...depths), 2),
        avgDepth: roundTo(sum / w.totalTimeS, 2),
        diveTime: w.totalTimeS,
        pauseDuration: 0,
        maxDepthTemperature: s.temperatureK[deepest]!,
        diveMode: "Air",
        diveNumberInSeries: w.diveNumber ?? 1,
        surfaceTime: w.diveNumber === 2 ? r.int(80, 110) * 60 : null,
        gasesUsed: ["Air"],
        algorithm: "Buhlmann 16 GF",
        minGF: 30,
        maxGF: 70,
        personalSetting: 0,
        altitudeSetting: 0,
        algorithmLock: false,
        cns: roundTo(0.03 + 0.02 * (w.diveNumber ?? 1), 2),
        otu: r.int(6, 12),
      };
    }
    default:
      return undefined;
  }
}

/**
 * The extensions of a workout for an `extensions` query: the named ones the workout has, in the
 * order asked, each once. Streams use `series` (computed once, only when a stream is asked).
 */
export function workoutExtensions(w: DemoWorkout, names: readonly string[], series: () => WorkoutSeries): WireExtension[] {
  const has = new Set(availableExtensions(w));
  const out: WireExtension[] = [];
  for (const name of new Set(names)) {
    if (!has.has(name)) continue;
    const ext = buildExtension(w, name, series);
    if (ext) out.push(ext);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Workouts: FIT files
// ---------------------------------------------------------------------------------------------

/** Seconds between the Unix epoch and the FIT epoch (1989-12-31T00:00:00Z). */
const FIT_EPOCH_S = 631_065_600;
const FIT_CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400] as const;

/** The CRC-16 of the FIT protocol (the algorithm of the FIT SDK), continuing from `crc`. */
export function fitCrc16(bytes: Uint8Array, crc = 0): number {
  for (const byte of bytes) {
    let tmp = FIT_CRC_TABLE[crc & 0xf]!;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ FIT_CRC_TABLE[byte & 0xf]!;
    tmp = FIT_CRC_TABLE[crc & 0xf]!;
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ FIT_CRC_TABLE[(byte >> 4) & 0xf]!;
  }
  return crc;
}

type FitBase = "enum" | "sint8" | "uint8" | "uint16" | "sint32" | "uint32" | "uint32z";

const FIT_BASE: Readonly<Record<FitBase, { id: number; size: number; invalid: number; min: number; max: number }>> = {
  enum: { id: 0x00, size: 1, invalid: 0xff, min: 0, max: 0xfe },
  sint8: { id: 0x01, size: 1, invalid: 0x7f, min: -0x80, max: 0x7e },
  uint8: { id: 0x02, size: 1, invalid: 0xff, min: 0, max: 0xfe },
  uint16: { id: 0x84, size: 2, invalid: 0xffff, min: 0, max: 0xfffe },
  sint32: { id: 0x85, size: 4, invalid: 0x7fffffff, min: -0x80000000, max: 0x7ffffffe },
  uint32: { id: 0x86, size: 4, invalid: 0xffffffff, min: 0, max: 0xfffffffe },
  uint32z: { id: 0x8c, size: 4, invalid: 0, min: 1, max: 0xffffffff },
};

type FitField = readonly [num: number, base: FitBase];

/** A tiny FIT writer: definition messages, data messages, the 14-byte header and both CRCs. */
class FitWriter {
  private readonly chunks: Buffer[] = [];
  private readonly defs = new Map<number, readonly FitField[]>();

  define(local: number, global: number, fields: readonly FitField[]): void {
    const b = Buffer.alloc(6 + 3 * fields.length);
    b[0] = 0x40 | local; // definition message, normal header
    b[1] = 0; // reserved
    b[2] = 0; // little endian
    b.writeUInt16LE(global, 3);
    b[5] = fields.length;
    fields.forEach(([num, base], i) => {
      b[6 + 3 * i] = num;
      b[7 + 3 * i] = FIT_BASE[base].size;
      b[8 + 3 * i] = FIT_BASE[base].id;
    });
    this.chunks.push(b);
    this.defs.set(local, fields);
  }

  write(local: number, values: ReadonlyArray<number | undefined>): void {
    const fields = this.defs.get(local)!;
    const b = Buffer.alloc(1 + fields.reduce((n, [, base]) => n + FIT_BASE[base].size, 0));
    b[0] = local;
    let at = 1;
    fields.forEach(([, base], i) => {
      const spec = FIT_BASE[base];
      const v = values[i];
      const raw = v === undefined || !Number.isFinite(v) ? spec.invalid : clamp(Math.round(v), spec.min, spec.max);
      if (spec.size === 1) {
        if (spec.min < 0) b.writeInt8(raw === spec.invalid ? 0x7f : raw, at);
        else b.writeUInt8(raw, at);
      } else if (spec.size === 2) b.writeUInt16LE(raw, at);
      else if (spec.min < 0) b.writeInt32LE(raw, at);
      else b.writeUInt32LE(raw, at);
      at += spec.size;
    });
    this.chunks.push(b);
  }

  finish(): Buffer {
    const data = Buffer.concat(this.chunks);
    const header = Buffer.alloc(14);
    header[0] = 14; // header size
    header[1] = 0x20; // protocol version 2.0
    header.writeUInt16LE(2140, 2); // profile version 21.40
    header.writeUInt32LE(data.length, 4);
    header.write(".FIT", 8, "ascii");
    header.writeUInt16LE(fitCrc16(header.subarray(0, 12)), 12);
    const body = Buffer.concat([header, data]);
    const crc = Buffer.alloc(2);
    crc.writeUInt16LE(fitCrc16(body), 0);
    return Buffer.concat([body, crc]);
  }
}

const fitTime = (ms: number): number => Math.floor(ms / 1000) - FIT_EPOCH_S;
const semicircles = (deg: number): number => Math.round((deg * 2147483648) / 180);

/**
 * A minimal valid FIT activity file of a workout: file_id, a few record messages spread over the
 * workout, session and activity. The manufacturer is "development" (255), because the data is
 * invented and no real watch recorded it.
 */
export function workoutFit(w: DemoWorkout, s: WorkoutSeries = workoutSeries(w)): Buffer {
  const spec = KINDS[w.kind];
  const fit = new FitWriter();
  fit.define(0, 0, [
    [0, "enum"],
    [1, "uint16"],
    [2, "uint16"],
    [3, "uint32z"],
    [4, "uint32"],
  ]);
  fit.write(0, [4, 255, 1, 0xde300001, fitTime(w.startMs)]);

  const columns: Array<readonly [FitField, (i: number) => number | undefined]> = [
    [[253, "uint32"], (i) => fitTime(s.time[i]!)],
    [[3, "uint8"], (i) => s.hr[i]],
  ];
  if (s.lat && s.lon) {
    const lat = s.lat;
    const lon = s.lon;
    columns.push([[0, "sint32"], (i) => semicircles(lat[i]!)], [[1, "sint32"], (i) => semicircles(lon[i]!)]);
  }
  if (s.altitude) {
    const alt = s.altitude;
    columns.push([[2, "uint16"], (i) => (alt[i]! + 500) * 5]);
  }
  if (s.distance) {
    const d = s.distance;
    columns.push([[5, "uint32"], (i) => d[i]! * 100]);
  }
  if (s.speed) {
    const v = s.speed;
    columns.push([[6, "uint16"], (i) => v[i]! * 1000]);
  }
  if (s.cadenceHz) {
    const c = s.cadenceHz;
    columns.push([[4, "uint8"], (i) => c[i]! * 60]);
  }
  if (s.power) {
    const p = s.power;
    columns.push([[7, "uint16"], (i) => p[i]]);
  }
  if (s.depth) {
    const d = s.depth;
    columns.push([[92, "uint32"], (i) => d[i]! * 1000]);
  }
  columns.push([[13, "sint8"], (i) => s.temperatureK[i]! - KELVIN]);
  fit.define(
    1,
    20,
    columns.map(([field]) => field),
  );
  const n = s.time.length;
  const count = Math.min(FIT_RECORDS, n);
  for (let k = 0; k < count; k++) {
    const i = count === 1 ? 0 : Math.round((k * (n - 1)) / (count - 1));
    fit.write(
      1,
      columns.map(([, get]) => get(i)),
    );
  }

  const wire = w.wire;
  fit.define(2, 18, [
    [253, "uint32"],
    [0, "enum"],
    [1, "enum"],
    [2, "uint32"],
    [5, "enum"],
    [6, "enum"],
    [7, "uint32"],
    [8, "uint32"],
    [9, "uint32"],
    [11, "uint16"],
    [16, "uint8"],
    [17, "uint8"],
    [22, "uint16"],
    [23, "uint16"],
    [254, "uint16"],
  ]);
  fit.write(2, [
    fitTime(w.stopMs),
    8, // event: session
    1, // event_type: stop
    fitTime(w.startMs),
    spec.fit[0],
    spec.fit[1],
    (w.stopMs - w.startMs),
    w.totalTimeS * 1000,
    typeof wire.totalDistance === "number" ? wire.totalDistance * 100 : undefined,
    w.energy,
    wire.hrdata?.workoutAvgHR ?? undefined,
    wire.hrdata?.workoutMaxHR ?? undefined,
    typeof wire.totalAscent === "number" ? wire.totalAscent : undefined,
    typeof wire.totalDescent === "number" ? wire.totalDescent : undefined,
    0,
  ]);

  fit.define(3, 34, [
    [253, "uint32"],
    [0, "uint32"],
    [1, "uint16"],
    [2, "enum"],
    [3, "enum"],
    [4, "enum"],
    [5, "uint32"],
  ]);
  const offsetS = (wire.timeOffsetInMinutes ?? 0) * 60;
  fit.write(3, [fitTime(w.stopMs), w.totalTimeS * 1000, 1, 0, 26, 1, fitTime(w.stopMs) + offsetS]);
  return fit.finish();
}

// ---------------------------------------------------------------------------------------------
// 24/7 data: nights, days, samples
// ---------------------------------------------------------------------------------------------

interface SleepSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly hrAvg: number;
  readonly hrMin: number;
}

interface Night extends SleepSegment {
  readonly wakeDay: number;
  readonly solS: number;
  readonly wasoS: number;
  readonly wboS: number;
  readonly deepS: number;
  readonly lightS: number;
  readonly remS: number;
  readonly hrv: number;
  readonly hrvCount: number;
  readonly spo2Max: number;
  readonly quality: number;
  readonly feeling: number;
}

interface Nap extends SleepSegment {
  readonly day: number;
  readonly solS: number;
  readonly deepS: number;
  readonly lightS: number;
}

interface DayContext {
  readonly day: number;
  /** The night that ends this morning, and the one that starts this evening. */
  readonly night: Night;
  readonly next: Night;
  readonly nap?: Nap;
  readonly workouts: readonly DemoWorkout[];
  readonly baseSteps: number;
  /** The watch is on the charger (no samples). */
  readonly charge?: readonly [number, number];
  /** Recovery balance at waking up (0..1). */
  readonly b0: number;
}

/** Steps through the day: weights per local hour (commutes, lunch, evening). */
const STEP_WEIGHTS = [0, 0, 0, 0, 0, 0.1, 0.6, 1.6, 1.2, 0.6, 0.5, 0.7, 1.5, 0.8, 0.5, 0.5, 0.7, 1.5, 1.2, 0.8, 0.6, 0.4, 0.2, 0.05] as const;
const STEP_WEIGHT_SUM = STEP_WEIGHTS.reduce((a: number, b: number) => a + b, 0);

/** The recovery balance drops by this much over a day awake, workouts not counted. */
const DAY_DRAIN = 0.42;

export interface TimelineOptions {
  timeZone: string;
  /** Local day number of the first day with data. */
  firstDay: number;
  /** The current time: nothing after it exists yet. */
  nowMs: number;
  /** The workouts of a local day (by start), sorted by start time. */
  workoutsOfDay: (day: number) => readonly DemoWorkout[];
}

/**
 * The 24/7 data of the demo person, computed on demand. Build one per request: it caches the
 * nights and days it needed, and nothing outlives it.
 */
export class DemoTimeline {
  readonly zone: ZoneClock;
  /** Local midnight at the start of the first day with data. */
  readonly dataStartMs: number;
  private readonly nights = new Map<number, Night>();
  private readonly naps = new Map<number, Nap | null>();
  private readonly days = new Map<number, DayContext>();

  constructor(private readonly opts: TimelineOptions) {
    this.zone = new ZoneClock(opts.timeZone);
    this.dataStartMs = this.zone.instant(opts.firstDay, 0);
  }

  private dayLoad(day: number): number {
    return this.opts.workoutsOfDay(day).reduce((sum, w) => sum + w.load, 0);
  }

  /** The night that ends on the morning of `wakeDay`. */
  private night(wakeDay: number): Night {
    const cached = this.nights.get(wakeDay);
    if (cached) return cached;
    const r = new Rng(hash32(SALT.night, wakeDay));
    const before = weekdayOf(wakeDay - 1);
    const startMinute = 22 * 60 + 15 + r.int(0, 75) + (before === 5 || before === 6 ? 30 : 0);
    const endMinute = 6 * 60 + 5 + r.int(0, 60) + (weekdayOf(wakeDay) >= 6 ? 55 : 0);
    const startMs = this.zone.instant(wakeDay - 1, startMinute) + r.int(0, 59_999);
    let endMs = this.zone.instant(wakeDay, endMinute) + r.int(0, 59_999);
    // Up in time for an early workout.
    const first = this.opts.workoutsOfDay(wakeDay)[0];
    if (first && endMs > first.startMs - 15 * MINUTE_MS) endMs = first.startMs - 15 * MINUTE_MS - r.int(0, 599_999);
    const hard = Math.min(1, this.dayLoad(wakeDay - 1) / 150);
    const durationS = Math.round((endMs - startMs) / 1000);
    const solS = r.int(4, 20) * 60 + r.int(0, 59);
    const wboS = r.int(0, 8) * 60;
    const wasoS = r.int(8, 35) * 60 + r.int(0, 59);
    const asleep = durationS - solS - wboS - wasoS;
    const deepS = Math.round(asleep * r.range(0.15, 0.22));
    const remS = Math.round(asleep * r.range(0.18, 0.25));
    const hrAvg = roundTo(r.range(50, 55) + 3 * hard, 1);
    const quality = Math.round(clamp(r.range(66, 94) - 10 * hard - (wasoS > 1800 ? 5 : 0), 40, 100));
    const night: Night = {
      wakeDay,
      startMs,
      endMs,
      solS,
      wasoS,
      wboS,
      deepS,
      remS,
      lightS: asleep - deepS - remS,
      hrAvg,
      hrMin: roundTo(hrAvg - r.range(4, 7), 1),
      hrv: Math.round(r.range(52, 74) - 10 * hard),
      hrvCount: Math.round(asleep / 300),
      spo2Max: roundTo(r.range(0.96, 0.99), 2),
      quality,
      feeling: quality >= 86 ? (r.chance(0.5) ? 5 : 4) : quality >= 74 ? (r.chance(0.6) ? 4 : 3) : r.chance(0.6) ? 3 : 2,
    };
    this.nights.set(wakeDay, night);
    return night;
  }

  /** An afternoon nap, some days (more often at weekends), never close to a workout. */
  private nap(day: number): Nap | undefined {
    const cached = this.naps.get(day);
    if (cached !== undefined) return cached ?? undefined;
    const r = new Rng(hash32(SALT.nap, day));
    let nap: Nap | null = null;
    if (r.chance(weekdayOf(day) >= 6 ? 0.25 : 0.06)) {
      const startMs = this.zone.instant(day, 13 * 60 + 15 + r.int(0, 55)) + r.int(0, 59_999);
      const durationS = r.int(20, 42) * 60 + r.int(0, 59);
      const endMs = startMs + durationS * 1000;
      const near = this.opts.workoutsOfDay(day).some((w) => w.startMs < endMs + 30 * MINUTE_MS && w.stopMs > startMs - 30 * MINUTE_MS);
      if (!near) {
        const solS = r.int(2, 6) * 60;
        const deepS = r.int(0, 6) * 60;
        const hrAvg = roundTo(r.range(56, 62), 1);
        nap = { day, startMs, endMs, solS, deepS, lightS: durationS - solS - deepS, hrAvg, hrMin: roundTo(hrAvg - r.range(3, 5), 1) };
      }
    }
    this.naps.set(day, nap);
    return nap ?? undefined;
  }

  private day(day: number): DayContext {
    const cached = this.days.get(day);
    if (cached) return cached;
    const night = this.night(day);
    const next = this.night(day + 1);
    const workouts = this.opts.workoutsOfDay(day);
    const r = new Rng(hash32(SALT.life, day));
    const baseSteps = r.int(5200, 9800) + (weekdayOf(day) >= 6 ? 800 : 0);
    let charge: readonly [number, number] | undefined;
    if (r.chance(0.12)) {
      const start = this.zone.instant(day, 20 * 60 + 30 + r.int(0, 50));
      const end = start + r.int(25, 45) * MINUTE_MS;
      if (!workouts.some((w) => w.startMs < end && w.stopMs > start)) charge = [start, end];
    }
    const hard = Math.min(1, this.dayLoad(day - 1) / 150);
    // Never below 0.62 and the day drains at least DAY_DRAIN: so the balance always rises at night.
    const b0 = clamp(0.62 + 0.3 * clamp((night.quality - 60) / 35, 0, 1) + 0.07 * (1 - hard) - 0.02 + 0.04 * r.next(), 0.62, 0.99);
    const nap = this.nap(day);
    const ctx: DayContext = { day, night, next, workouts, baseSteps, b0, ...(charge ? { charge } : {}), ...(nap ? { nap } : {}) };
    this.days.set(day, ctx);
    return ctx;
  }

  /** The sleep (night or nap) at an instant, if any. */
  private sleepAt(ctx: DayContext, t: number): SleepSegment | undefined {
    for (const seg of [ctx.night, ctx.next, ctx.nap]) if (seg && t >= seg.startMs && t < seg.endMs) return seg;
    return undefined;
  }

  // -------------------------------------------------------------------------------------------
  // Activity samples
  // -------------------------------------------------------------------------------------------

  /** The activity entry of the 10 minutes from `t`, or undefined when the watch was not worn. */
  private activityAt(t: number): WireActivityEntry | undefined {
    const ctx = this.day(this.zone.day(t));
    if (ctx.charge && t >= ctx.charge[0] && t < ctx.charge[1]) return undefined;
    const tEnd = t + ACTIVITY_INTERVAL_MS;
    const n = Math.round(t / ACTIVITY_INTERVAL_MS);
    const rnd = (k: number) => unit3(SALT.sample, n, k);

    // The part of the 10 minutes spent in workouts, from their 10-minute slots.
    let wSec = 0;
    let wHr = 0;
    let wMin = Infinity;
    let wMax = -Infinity;
    let wSteps = 0;
    let wJ = 0;
    let altSum = 0;
    let altN = 0;
    let afterWorkout = 0;
    for (const w of ctx.workouts) {
      if (t >= w.stopMs && t < w.stopMs + 2 * HOUR_MS) afterWorkout = Math.max(afterWorkout, 12 * Math.exp(-(t - w.stopMs) / (40 * MINUTE_MS)));
      if (w.stopMs <= t || w.startMs >= tEnd) continue;
      const b = w.tenMinutes.find((x) => x.t === t);
      if (!b) continue;
      wSec += b.sec;
      wHr += b.hrSec;
      wMin = Math.min(wMin, b.hrMin);
      wMax = Math.max(wMax, b.hrMax);
      wSteps += b.steps;
      altSum += b.altSum;
      altN += b.altN;
      wJ += (w.energy * J_PER_KCAL * b.sec) / w.totalTimeS;
    }
    const rest = clamp(1 - wSec / 600, 0, 1);
    const minute = this.zone.minuteOfDay(t);
    const sleep = this.sleepAt(ctx, t + ACTIVITY_INTERVAL_MS / 2);

    let hr: number;
    let hrMin: number;
    let hrMax: number;
    let steps = 0;
    let joules: number;
    let spo2: number | undefined;
    let hrv: number | undefined;
    if (sleep) {
      const f = clamp((t - sleep.startMs) / (sleep.endMs - sleep.startMs), 0, 1);
      hr = sleep.hrAvg + 0.6 * (sleep.hrAvg - sleep.hrMin) * (1 - 2 * f) + 1.5 * (2 * rnd(1) - 1);
      hrMin = hr - 2 - 3 * rnd(2);
      hrMax = hr + 2 + 4 * rnd(3);
      joules = REST_J_PER_SAMPLE * 0.92 * rest;
      if (sleep === ctx.night || sleep === ctx.next) {
        const night = sleep as Night;
        spo2 = roundTo(Math.max(0.94, night.spo2Max - 0.025 * rnd(4)), 2);
        hrv = Math.round(night.hrv + 12 * (rnd(5) - 0.5));
      }
    } else {
      steps = Math.round(((ctx.baseSteps * STEP_WEIGHTS[Math.floor(minute / 60)]!) / (STEP_WEIGHT_SUM * 6)) * (0.45 + 1.1 * rnd(6)) * rest);
      const stepLoad = Math.min(1.5, steps / 220);
      hr = 61 + 4 * Math.sin((2 * Math.PI * (minute - 600)) / 1440) + 14 * stepLoad + afterWorkout + 4 * (2 * rnd(7) - 1);
      hrMin = hr - 4 - 6 * rnd(8);
      hrMax = hr + 5 + 18 * rnd(9) * (0.3 + stepLoad);
      joules = REST_J_PER_SAMPLE * 1.08 * rest + steps * J_PER_STEP;
      if (minute % 60 < 10 && rnd(10) < 0.5) spo2 = roundTo(0.95 + 0.04 * rnd(11), 2);
    }
    if (wSec > 0) {
      const workoutHr = wHr / wSec;
      hr = workoutHr * (1 - rest) + hr * rest;
      hrMin = rest > 0.05 ? Math.min(hrMin, wMin) : wMin;
      hrMax = rest > 0.05 ? Math.max(hrMax, wMax) : wMax;
      steps += Math.round(wSteps);
      joules += wJ;
    }
    const altitude = altN > 0 ? altSum / altN : HOME_ALTITUDE + 1.5 * Math.sin(t / 3_700_000) + 0.6 * rnd(12);
    return {
      HR: roundTo(hr, 1),
      StepCount: steps,
      EnergyConsumption: roundTo(joules, 2),
      ...(spo2 !== undefined ? { SpO2: spo2 } : {}),
      Altitude: roundTo(altitude, 1),
      HRExt: { Min: Math.round(Math.min(hrMin, hr)), Max: Math.round(Math.max(hrMax, hr)) },
      ...(hrv !== undefined ? { HRV: hrv } : {}),
    };
  }

  /** Raw entries of [fromMs, toMs): complete 10-minute samples up to now, from the first data day. */
  private activityEntries(fromMs: number, toMs: number): Array<readonly [number, WireActivityEntry]> {
    const out: Array<readonly [number, WireActivityEntry]> = [];
    const start = Math.ceil(Math.max(fromMs, this.dataStartMs) / ACTIVITY_INTERVAL_MS) * ACTIVITY_INTERVAL_MS;
    for (let t = start; t < toMs && t + ACTIVITY_INTERVAL_MS <= this.opts.nowMs; t += ACTIVITY_INTERVAL_MS) {
      const entry = this.activityAt(t);
      if (entry) out.push([t, entry]);
    }
    return out;
  }

  /** /247samples/activity: samples with a timestamp in [fromMs, toMs). */
  activity(fromMs: number, toMs: number): WireSample<WireActivityEntry>[] {
    return this.activityEntries(fromMs, toMs).map(([t, entryData]) => ({ timestamp: iso(t), entryData }));
  }

  // -------------------------------------------------------------------------------------------
  // Sleep
  // -------------------------------------------------------------------------------------------

  /** /247samples/sleep: nights and naps that start in [fromMs, toMs) and have ended by now. */
  sleep(fromMs: number, toMs: number): WireSample<WireSleepEntry>[] {
    const out: WireSample<WireSleepEntry>[] = [];
    const first = Math.max(this.opts.firstDay, this.zone.day(Math.max(fromMs, this.dataStartMs - DAY_MS)) - 1);
    const last = this.zone.day(Math.min(toMs, this.opts.nowMs)) + 1;
    const keep = (seg: SleepSegment) => seg.startMs >= fromMs && seg.startMs < toMs && seg.endMs <= this.opts.nowMs;
    for (let day = first; day <= last; day++) {
      const night = this.night(day);
      if (keep(night)) out.push(this.nightEntry(night));
      const nap = this.nap(day);
      if (nap && keep(nap)) out.push(this.napEntry(nap));
    }
    return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  private nightEntry(n: Night): WireSample<WireSleepEntry> {
    return {
      timestamp: iso(n.startMs),
      entryData: {
        BedtimeStart: iso(n.startMs),
        BedtimeEnd: iso(n.endMs),
        DateTime: iso(n.startMs),
        Duration: Math.round((n.endMs - n.startMs) / 1000),
        DeepSleepDuration: n.deepS,
        LightSleepDuration: n.lightS,
        REMSleepDuration: n.remS,
        HRAvg: n.hrAvg,
        HRMin: n.hrMin,
        AvgHRV: n.hrv,
        AvgHRVSampleCount: n.hrvCount,
        MaxSpo2: n.spo2Max,
        Altitude: HOME_ALTITUDE,
        SleepQualityScore: n.quality,
        Feeling: n.feeling,
        IsNap: false,
        SleepOnsetLatencyDuration: n.solS,
        WakeAfterSleepOnsetDuration: n.wasoS,
        WakeBeforeOffBedDuration: n.wboS,
        SleepId: Math.floor(n.startMs / 1000),
        BodyResourcesInsightId: null,
      },
    };
  }

  private napEntry(n: Nap): WireSample<WireSleepEntry> {
    return {
      timestamp: iso(n.startMs),
      entryData: {
        BedtimeStart: iso(n.startMs),
        BedtimeEnd: iso(n.endMs),
        DateTime: iso(n.startMs),
        Duration: Math.round((n.endMs - n.startMs) / 1000),
        DeepSleepDuration: n.deepS,
        LightSleepDuration: n.lightS,
        REMSleepDuration: 0,
        HRAvg: n.hrAvg,
        HRMin: n.hrMin,
        AvgHRV: null,
        AvgHRVSampleCount: 0,
        MaxSpo2: null,
        Altitude: HOME_ALTITUDE,
        SleepQualityScore: null,
        Feeling: null,
        IsNap: true,
        SleepOnsetLatencyDuration: n.solS,
        WakeAfterSleepOnsetDuration: 0,
        WakeBeforeOffBedDuration: 0,
        SleepId: Math.floor(n.startMs / 1000),
        BodyResourcesInsightId: null,
      },
    };
  }

  // -------------------------------------------------------------------------------------------
  // Recovery
  // -------------------------------------------------------------------------------------------

  /** Balance while awake: the morning value, drained by the day and by the workouts so far. */
  private balanceAwake(ctx: DayContext, t: number): number {
    const span = Math.max(HOUR_MS, ctx.next.startMs - ctx.night.endMs);
    let b = ctx.b0 - DAY_DRAIN * clamp((t - ctx.night.endMs) / span, 0, 1.1);
    for (const w of ctx.workouts) b -= Math.min(0.45, w.load / 400) * clamp((t - w.startMs) / (w.stopMs - w.startMs), 0, 1);
    return clamp(b, 0.05, 1);
  }

  /** Balance at night: rises from the bedtime value to the next morning's. */
  private balanceAsleep(from: number, to: number, f: number): number {
    return from + (to - from) * clamp(f, 0, 1) ** 0.8;
  }

  private balanceAt(t: number): number {
    const ctx = this.day(this.zone.day(t));
    if (t < ctx.night.startMs) return this.balanceAwake(this.day(ctx.day - 1), t);
    if (t < ctx.night.endMs) {
      const prev = this.day(ctx.day - 1);
      const from = this.balanceAwake(prev, ctx.night.startMs);
      return this.balanceAsleep(from, ctx.b0, (t - ctx.night.startMs) / (ctx.night.endMs - ctx.night.startMs));
    }
    if (t < ctx.next.startMs) return this.balanceAwake(ctx, t);
    const next = this.day(ctx.day + 1);
    const from = this.balanceAwake(ctx, ctx.next.startMs);
    return this.balanceAsleep(from, next.b0, (t - ctx.next.startMs) / (ctx.next.endMs - ctx.next.startMs));
  }

  /** StressState: 0 invalid (watch off), 1 relaxing (asleep, quiet evenings), 2 active, 3 passive. */
  private stressAt(t: number): number {
    const ctx = this.day(this.zone.day(t));
    if (ctx.charge && t >= ctx.charge[0] && t < ctx.charge[1]) return 0;
    if (this.sleepAt(ctx, t)) return 1;
    if (ctx.workouts.some((w) => t >= w.startMs && t < w.stopMs)) return 2;
    const r = unit(SALT.recovery, Math.round(t / RECOVERY_INTERVAL_MS));
    const minute = this.zone.minuteOfDay(t);
    if (minute >= 19 * 60 + 30 && r < 0.4) return 1;
    return r > 0.93 ? 2 : 3;
  }

  /** /247samples/recovery: one sample every 30 minutes in [fromMs, toMs), up to now. */
  recovery(fromMs: number, toMs: number): WireSample<WireRecoveryEntry>[] {
    const out: WireSample<WireRecoveryEntry>[] = [];
    const start = Math.ceil(Math.max(fromMs, this.dataStartMs) / RECOVERY_INTERVAL_MS) * RECOVERY_INTERVAL_MS;
    for (let t = start; t < toMs && t + RECOVERY_INTERVAL_MS <= this.opts.nowMs; t += RECOVERY_INTERVAL_MS) {
      out.push({ timestamp: iso(t), entryData: { Balance: roundTo(this.balanceAt(t), 2), StressState: this.stressAt(t) } });
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Daily statistics
  // -------------------------------------------------------------------------------------------

  /**
   * /247samples/daily-activity-statistics: one value per 24 hours from `startMs` (the buckets
   * follow the `startdate` asked, as in Suunto's example) up to `endMs` (inclusive, to the
   * second). The sums of the activity samples of each bucket: steps, and energy in joules. A
   * bucket without samples has the value null.
   */
  dailyStatistics(startMs: number, endMs: number): WireDailyStatistic[] {
    const stop = endMs + 1000;
    const buckets = Math.max(1, Math.ceil((stop - startMs) / DAY_MS));
    const steps: Array<number | null> = new Array<number | null>(buckets).fill(null);
    const energy: Array<number | null> = new Array<number | null>(buckets).fill(null);
    for (const [t, e] of this.activityEntries(startMs, stop)) {
      const k = Math.floor((t - startMs) / DAY_MS);
      steps[k] = (steps[k] ?? 0) + (e.StepCount ?? 0);
      energy[k] = (energy[k] ?? 0) + (e.EnergyConsumption ?? 0);
    }
    const series = (name: string, values: Array<number | null>, decimals: number): WireDailyStatistic => ({
      Name: name,
      Aggregation: "sum",
      Sources: [
        {
          Name: DAILY_SOURCE_NAME,
          Samples: values.map((v, k) => ({ TimeISO8601: iso(startMs + k * DAY_MS).slice(0, 23), Value: v === null ? null : roundTo(v, decimals) })),
        },
      ],
    });
    return [series("energyconsumption", energy, 4), series("stepcount", steps, 0)];
  }
}

// ---------------------------------------------------------------------------------------------
// Routes and points of interest
// ---------------------------------------------------------------------------------------------

/** A route point as GPX holds it; `name`/`type` make it a waypoint. */
export interface DemoRoutePoint {
  lat: number;
  lon: number;
  ele?: number;
  name?: string;
  type?: string;
  desc?: string;
}

/** A route of the demo account: what /v2/route returns, the points of its GPX, and its revision. */
export interface DemoRoute {
  route: WireRoute;
  points: DemoRoutePoint[];
  /** suunto:revision of the exported GPX. */
  revision: number;
}

/** Average speeds Suunto's examples show for routes (m/s), by first activity. */
const ROUTE_SPEED: Readonly<Record<number, number>> = { 1: 2.7777777, 2: 6.9444447, 3: 3.8888888, 11: 1.1111112, 22: 2.5 };
const DEFAULT_ROUTE_SPEED = 2.2222223;

function routePoint(p: DemoRoutePoint): WireRoutePoint {
  return { altitude: Math.round(p.ele ?? 0), latitude: roundTo(p.lat, 6), longitude: roundTo(p.lon, 6) };
}

/** A route object from its points, as /v2/route returns it (the name is in `description`). */
export function makeRoute(opts: {
  id: string;
  name: string;
  points: DemoRoutePoint[];
  activityIds: readonly number[];
  createdMs: number;
  modifiedMs: number;
  watchEnabled: boolean;
}): DemoRoute {
  const pts = opts.points;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1]!, pts[i]!);
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const middle = pts[Math.floor(pts.length / 2)]!;
  const route: WireRoute = {
    id: opts.id,
    description: opts.name,
    visibility: "PRIVATE",
    activityIds: [...opts.activityIds],
    startPoint: routePoint(pts[0]!),
    centerPoint: routePoint({ lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2, ...(middle.ele !== undefined ? { ele: middle.ele } : {}) }),
    endPoint: routePoint(pts[pts.length - 1]!),
    created: opts.createdMs,
    averageSpeed: ROUTE_SPEED[opts.activityIds[0] ?? 1] ?? DEFAULT_ROUTE_SPEED,
    totalDistance: Math.round(total),
    modified: opts.modifiedMs,
    watchEnabled: opts.watchEnabled,
    turnWaypointsEnabled: false,
  };
  return { route, points: pts.map((p) => ({ ...p })), revision: opts.modifiedMs };
}

interface SampleRouteDef {
  name: string;
  place: DemoPlace;
  perimeter: number;
  points: number;
  profile: Profile;
  gain: number;
  activityIds: number[];
  createdDaysAgo: number;
  modifiedDaysAgo: number;
  watchEnabled: boolean;
  waypoints: Array<{ at: number; name: string; type: string }>;
}

const SAMPLE_ROUTES: readonly SampleRouteDef[] = [
  {
    name: "Lake Serein loop",
    place: DEMO_PLACES.lake,
    perimeter: 8200,
    points: 82,
    profile: "loop",
    gain: 14,
    activityIds: [1],
    createdDaysAgo: 210,
    modifiedDaysAgo: 35,
    watchEnabled: true,
    waypoints: [{ at: 0.42, name: "Old Mill viewpoint", type: "Sight" }],
  },
  {
    name: "Pine Ridge trail",
    place: DEMO_PLACES.ridge,
    perimeter: 14_300,
    points: 110,
    profile: "climb",
    gain: 920,
    activityIds: [11, 22],
    createdDaysAgo: 160,
    modifiedDaysAgo: 160,
    watchEnabled: true,
    waypoints: [
      { at: 0.3, name: "Larch Hollow spring", type: "Water" },
      { at: 0.5, name: "Pine Ridge summit", type: "Peak" },
    ],
  },
  {
    name: "Valmora Pass ride",
    place: DEMO_PLACES.valmora,
    perimeter: 61_800,
    points: 160,
    profile: "two_climbs",
    gain: 1180,
    activityIds: [2],
    createdDaysAgo: 95,
    modifiedDaysAgo: 60,
    watchEnabled: false,
    waypoints: [],
  },
  {
    name: "Larch Valley ski track",
    place: DEMO_PLACES.larch,
    perimeter: 15_000,
    points: 90,
    profile: "loop",
    gain: 70,
    activityIds: [3],
    createdDaysAgo: 400,
    modifiedDaysAgo: 300,
    watchEnabled: true,
    waypoints: [],
  },
];

/** The points of a sample route (a closed loop, with its waypoints as named points). */
function sampleRoutePoints(def: SampleRouteDef): DemoRoutePoint[] {
  const out: DemoRoutePoint[] = [];
  for (let i = 0; i <= def.points; i++) {
    const f = i / def.points;
    const pos = loopPoint(def.place, def.perimeter, f % 1);
    const wp = def.waypoints.find((w) => Math.round(w.at * def.points) === i);
    out.push({
      lat: roundTo(pos.lat, 6),
      lon: roundTo(pos.lon, 6),
      ele: roundTo(profileAltitude(def.profile, def.place.alt, def.gain, 1, f), 1),
      ...(wp ? { name: wp.name, type: wp.type } : {}),
    });
  }
  return out;
}

/** The 4 routes of the demo account, dated relative to the reset. */
export function sampleRoutes(resetAtMs: number): DemoRoute[] {
  return SAMPLE_ROUTES.map((def, i) => {
    const createdMs = resetAtMs - def.createdDaysAgo * DAY_MS - (3 + i) * HOUR_MS - 17_317 * (i + 1);
    const modifiedMs = Math.max(createdMs, resetAtMs - def.modifiedDaysAgo * DAY_MS - (5 + i) * HOUR_MS - 4_211 * (i + 1));
    return makeRoute({
      id: demoId(createdMs, 0xa0000 + i),
      name: def.name,
      points: sampleRoutePoints(def),
      activityIds: def.activityIds,
      createdMs,
      modifiedMs,
      watchEnabled: def.watchEnabled,
    });
  });
}

/** The 5 points of interest of the demo account, dated relative to the reset (times in seconds). */
export function samplePois(resetAtMs: number): WirePoi[] {
  const ridgeRoute = SAMPLE_ROUTES[1]!;
  const lakeRoute = SAMPLE_ROUTES[0]!;
  const at = (def: SampleRouteDef, f: number) => ({
    ...loopPoint(def.place, def.perimeter, f),
    alt: profileAltitude(def.profile, def.place.alt, def.gain, 1, f),
  });
  const defs = [
    { name: "Pine Ridge summit", type: 34, activityId: 11, daysAgo: 150, ...at(ridgeRoute, 0.5) },
    { name: "Larch Hollow spring", type: 12, activityId: 11, daysAgo: 150, ...at(ridgeRoute, 0.3) },
    { name: "Pine Ridge trailhead parking", type: 3, activityId: 11, daysAgo: 149, ...at(ridgeRoute, 0) },
    { name: "Old Mill viewpoint", type: 22, activityId: 1, daysAgo: 64, ...at(lakeRoute, 0.42) },
    { name: "Lake Serein north shore", type: 14, activityId: 85, daysAgo: 21, ...at(lakeRoute, 0.25) },
  ];
  return defs.map((d, i) => {
    const creation = Math.floor((resetAtMs - d.daysAgo * DAY_MS - (2 + i) * HOUR_MS) / 1000) - 37 * i;
    return {
      key: demoId(creation * 1000, 0xb0000 + i),
      creation,
      modified: creation,
      point: { x: roundTo(d.lon, 6), y: roundTo(d.lat, 6), z: roundTo(d.alt, 1), name: d.name, type: d.type },
      activityId: d.activityId,
      country: "CH",
      locality: "CH",
      watchEnabled: true,
    };
  });
}
