/**
 * THE CONTRACT of MCP for Suunto (see docs/DESIGN.md section 5).
 *
 * Three levels:
 * - wire types: exactly what the Suunto Cloud API returns (docs/suunto-api.md). Every field is
 *   optional or nullable, because the API leaves fields out and old workouts lack many of them;
 * - ActivityBackend: raw operations against Suunto (src/suunto/api.ts) or the demo
 *   (src/demo/activity.ts). No validation, no unit conversion, no windows longer than the API
 *   allows;
 * - domain types: what the tools return (built in src/activity/format.ts, in the user's units).
 */

// ---------------------------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------------------------

/** Units of answers and unit-bearing inputs. Suunto has no units setting we can read. */
export type UnitChoice = "metric" | "imperial";

/** The unit of every number in an answer, given once per answer as `units`. */
export interface UnitLabels {
  distance: "km" | "mi";
  elevation: "m" | "ft";
  speed: "km/h" | "mph";
  pace: "min/km" | "min/mi";
  temperature: "°C" | "°F";
  energy: "kcal";
  heart_rate: "bpm";
}

// ---------------------------------------------------------------------------------------------
// Wire level: workouts (/v3/workouts)
// ---------------------------------------------------------------------------------------------

/** A position. x is the longitude and y the latitude (degrees); z the altitude in metres. */
export interface WirePoint {
  x?: number | null;
  y?: number | null;
  z?: number | null;
}

export interface WireHrData {
  userMaxHR?: number | null;
  workoutMaxHR?: number | null;
  workoutAvgHR?: number | null;
  hrmax?: number | null;
  max?: number | null;
  avg?: number | null;
}

/** One entry of a workout's `extensions` array. Its fields depend on `type`. */
export interface WireExtension {
  type: string;
  [field: string]: unknown;
}

/**
 * A workout as /v3/workouts returns it. Units on the wire: times in seconds, distances and
 * altitudes in metres, speeds in m/s, avgPace in min/km, energyConsumption in kcal,
 * temperatures in kelvin (inside extensions), startTime/stopTime/created in epoch milliseconds
 * (the schema text says seconds, the examples are milliseconds: values below 1e11 are seconds).
 */
export interface WireWorkout {
  workoutKey?: string | null;
  /** Some answers name the key `key`. */
  key?: string | null;
  workoutId?: number | null;
  activityId?: number | null;
  workoutName?: string | null;
  description?: string | null;
  startTime?: number | null;
  stopTime?: number | null;
  /** Offset of the workout's local time from UTC, in minutes (0 for UTC). */
  timeOffsetInMinutes?: number | null;
  totalTime?: number | null;
  totalDistance?: number | null;
  totalAscent?: number | null;
  totalDescent?: number | null;
  avgSpeed?: number | null;
  maxSpeed?: number | null;
  avgPace?: number | null;
  energyConsumption?: number | null;
  stepCount?: number | null;
  recoveryTime?: number | null;
  cumulativeRecoveryTime?: number | null;
  minAltitude?: number | null;
  maxAltitude?: number | null;
  hrdata?: WireHrData | null;
  /** An object on most answers; a number on some. */
  cadence?: { max?: number | null; avg?: number | null } | number | null;
  startPosition?: WirePoint | null;
  stopPosition?: WirePoint | null;
  centerPosition?: WirePoint | null;
  created?: number | null;
  lastModified?: number | null;
  isEdited?: boolean | null;
  pictureCount?: number | null;
  commentCount?: number | null;
  extensionTypes?: string[] | null;
  extensions?: WireExtension[] | null;
  [field: string]: unknown;
}

/** The envelope of a workout list. `metadata.workoutcount` may be a string. */
export interface WireWorkoutList {
  error?: { code?: string | null; description?: string | null } | null;
  payload: WireWorkout[];
  metadata?: { workoutcount?: string | number | null; until?: string | number | null; [field: string]: unknown } | null;
}

/** Query of one page of workouts. Times in epoch milliseconds; `until` is exclusive. */
export interface ListWorkoutsQuery {
  since?: number;
  until?: number;
  /** 1 to 100. */
  limit: number;
  offset: number;
  /** false: since/until filter on the start time (what the tools use). */
  byModificationTime: boolean;
}

// ---------------------------------------------------------------------------------------------
// Wire level: 24/7 data (/247samples)
// ---------------------------------------------------------------------------------------------

/** One 24/7 record. `timestamp` is an ISO 8601 date-time in UTC. */
export interface WireSample<T> {
  timestamp: string;
  entryData: T;
}

/** /247samples/activity. EnergyConsumption in joules, SpO2 0..1, HRV in ms, Altitude in metres. */
export interface WireActivityEntry {
  HR?: number | null;
  HRExt?: { Min?: number | null; Max?: number | null } | null;
  StepCount?: number | null;
  EnergyConsumption?: number | null;
  SpO2?: number | null;
  HRV?: number | null;
  Altitude?: number | null;
  [field: string]: unknown;
}

/** /247samples/sleep. Durations in seconds, SpO2 0..1, times ISO 8601 (UTC). */
export interface WireSleepEntry {
  Duration?: number | null;
  DeepSleepDuration?: number | null;
  LightSleepDuration?: number | null;
  REMSleepDuration?: number | null;
  BedtimeStart?: string | null;
  BedtimeEnd?: string | null;
  DateTime?: string | null;
  HRAvg?: number | null;
  HRMin?: number | null;
  AvgHRV?: number | null;
  AvgHRVSampleCount?: number | null;
  MaxSpo2?: number | null;
  Altitude?: number | null;
  SleepQualityScore?: number | null;
  Feeling?: number | null;
  IsNap?: boolean | null;
  SleepOnsetLatencyDuration?: number | null;
  WakeAfterSleepOnsetDuration?: number | null;
  WakeBeforeOffBedDuration?: number | null;
  SleepId?: number | string | null;
  BodyResourcesInsightId?: number | string | null;
  [field: string]: unknown;
}

/** /247samples/recovery. Balance 0..1; StressState a small integer (see suunto-api.md). */
export interface WireRecoveryEntry {
  Balance?: number | null;
  StressState?: number | null;
  [field: string]: unknown;
}

/**
 * /247samples/daily-activity-statistics: one entry per metric ("stepcount", "energyconsumption"
 * in joules), each with sources (watches) and one sample per day. TimeISO8601 has no offset: it is
 * UTC, aligned to the `startdate` given.
 */
export interface WireDailyStatistic {
  Name: string;
  Aggregation?: string | null;
  Sources?: Array<{ Name?: string | null; Samples?: Array<{ TimeISO8601: string; Value: number | null }> | null }> | null;
}

// ---------------------------------------------------------------------------------------------
// Wire level: routes (/v2/route) and points of interest (/v2/poi)
// ---------------------------------------------------------------------------------------------

export interface WireRoutePoint {
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
}

/** A route as /v2/route returns it. totalDistance in metres, averageSpeed in m/s, times epoch ms. */
export interface WireRoute {
  id: string;
  name?: string | null;
  description?: string | null;
  activityIds?: number[] | null;
  totalDistance?: number | null;
  averageSpeed?: number | null;
  startPoint?: WireRoutePoint | null;
  endPoint?: WireRoutePoint | null;
  centerPoint?: WireRoutePoint | null;
  created?: number | null;
  modified?: number | null;
  watchEnabled?: boolean | null;
  turnWaypointsEnabled?: boolean | null;
  visibility?: string | null;
  [field: string]: unknown;
}

/** Query of one page of routes (the API pages by page number and page size). */
export interface ListRoutesQuery {
  page: number;
  size: number;
  sort: "asc" | "desc";
  /** Only routes modified since this time (epoch ms). */
  since?: number;
}

/** A point of interest. point.x longitude, point.y latitude, point.z altitude (m); type: PoiType. */
export interface WirePoi {
  key?: string | null;
  creation?: number | null;
  modified?: number | null;
  point: { x: number; y: number; z?: number | null; name?: string | null; type: number };
  activityId?: number | null;
  country?: string | null;
  locality?: string | null;
  watchEnabled?: boolean | null;
  [field: string]: unknown;
}

/** List and create answers wrap each point as { pointOfInterest: WirePoi }. */
export interface WirePoiEnvelope {
  pointOfInterest: WirePoi;
}

/** Body of a POI create request. watchEnabled must be true. */
export interface WirePoiInput {
  point: { x: number; y: number; z?: number; name: string; type: number };
  activityId?: number;
  watchEnabled: true;
  creation?: number;
  modified?: number;
}

// ---------------------------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------------------------

/** The connected Suunto account (from the access token claims; no network for the demo). */
export interface SuuntoAccount {
  /** The Suunto App username (the access token's `user` claim). */
  username: string;
  /** When the current access token expires (ISO 8601), once known. */
  tokenExpiresAt?: string;
}

/** Raw operations against Suunto (or the demo). */
export interface ActivityBackend {
  readonly kind: "suunto" | "demo";
  listWorkouts(q: ListWorkoutsQuery): Promise<WireWorkoutList>;
  /** `extensions`: extension names for the `extensions` query parameter (may be empty). */
  getWorkout(key: string, extensions: readonly string[]): Promise<WireWorkout>;
  exportFit(key: string): Promise<Buffer>;
  /** Times in epoch milliseconds; the window is at most 28 days. */
  activitySamples(fromMs: number, toMs: number): Promise<WireSample<WireActivityEntry>[]>;
  sleep(fromMs: number, toMs: number): Promise<WireSample<WireSleepEntry>[]>;
  recovery(fromMs: number, toMs: number): Promise<WireSample<WireRecoveryEntry>[]>;
  /** `startdate`/`enddate`: "YYYY-MM-DDTHH:MM:SS" in UTC (no offset); at most 28 days. */
  dailyStatistics(startdate: string, enddate: string): Promise<WireDailyStatistic[]>;
  listRoutes(q: ListRoutesQuery): Promise<WireRoute[]>;
  getRoute(id: string): Promise<WireRoute>;
  exportRouteGpx(id: string): Promise<string>;
  /** Returns the new route when the API answers with it, else undefined. */
  importRouteGpx(gpx: string, activityIds: readonly number[]): Promise<WireRoute | undefined>;
  listPois(q: { limit: number; offset: number }): Promise<WirePoiEnvelope[]>;
  createPoi(poi: WirePoiInput): Promise<WirePoiEnvelope>;
  account(): Promise<SuuntoAccount>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Domain level (what tools return), in the units of the answer
// ---------------------------------------------------------------------------------------------

export interface Position {
  latitude: number;
  longitude: number;
  /** In units.elevation. */
  altitude?: number;
}

/** One workout in a list. */
export interface WorkoutSummary {
  workout_key: string;
  /** Activity name from the activity id (for example "Running"), or "Activity <id>". */
  sport: string;
  activity_id: number | null;
  name?: string;
  /** Local start time of the workout, ISO 8601 with offset, e.g. 2026-05-01T07:30:00+02:00. */
  start: string;
  end?: string;
  /** h:mm:ss */
  duration: string;
  duration_s: number;
  /** units.distance, 2 decimals. */
  distance?: number;
  /** units.elevation, whole numbers. */
  ascent?: number;
  descent?: number;
  /** units.speed, 1 decimal. */
  avg_speed?: number;
  max_speed?: number;
  /** m:ss per units.pace (only for sports where pace makes sense: on foot, swimming per 100). */
  avg_pace?: string;
  avg_hr?: number;
  max_hr?: number;
  energy_kcal?: number;
  steps?: number;
  /** Recovery time the watch suggested after this workout, in hours (1 decimal). */
  recovery_time_h?: number;
}

/** One stream of a workout, downsampled. `t` is seconds from the workout start. */
export interface WorkoutStream {
  /** Unit of `v` (for example "bpm", "m", "km/h", "min/km", "°C", "rpm", "W"); "deg" for location. */
  unit: string;
  /** Points before downsampling. */
  original_points: number;
  min?: number;
  avg?: number;
  max?: number;
  points: Array<{ t: number; v: number } | { t: number; lat: number; lon: number }>;
}

export interface WorkoutLap {
  /** Lap number, from 1. */
  lap: number;
  /** Seconds from the workout start. */
  start_s?: number;
  duration?: string;
  duration_s?: number;
  distance?: number;
  avg_hr?: number;
  max_hr?: number;
  avg_speed?: number;
  avg_pace?: string;
  ascent?: number;
  descent?: number;
  [field: string]: unknown;
}

/** A full workout. */
export interface Workout extends WorkoutSummary {
  description?: string;
  /** The workout's offset from UTC, "+HH:MM". */
  utc_offset: string;
  min_altitude?: number;
  max_altitude?: number;
  avg_cadence?: number;
  max_cadence?: number;
  start_position?: Position;
  end_position?: Position;
  /** Converted fields of SummaryExtension (temperatures, power, cadence, feeling, PTE, EPOC, ...). */
  summary?: Record<string, unknown>;
  /** Heart rate zones, intensity, fitness (VO2max), weather, dive, swimming and ski headers, as present. */
  intensity?: Record<string, unknown>;
  fitness?: Record<string, unknown>;
  weather?: Record<string, unknown>;
  dive?: Record<string, unknown>;
  swimming?: Record<string, unknown>;
  ski?: Record<string, unknown>;
  laps?: WorkoutLap[];
  /** Requested streams (suunto_get_workout `samples`), by name. */
  samples?: Record<string, WorkoutStream>;
  /** The extension types Suunto has for this workout (which streams can be asked for). */
  available_data: string[];
  units: UnitLabels;
}

/** One day of /247samples/daily-activity-statistics. */
export interface DaySummary {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  steps: number | null;
  energy_kcal: number | null;
}

/** One bucket (or one raw sample) of 24/7 activity samples, in the user's time zone. */
export interface SamplePoint {
  /** Local time, ISO 8601 with offset. */
  start: string;
  /** End of the bucket (exclusive); absent for raw samples. */
  end?: string;
  hr_avg?: number;
  hr_min?: number;
  hr_max?: number;
  steps?: number;
  energy_kcal?: number;
  spo2_pct?: number;
  hrv_ms?: number;
  /** units.elevation */
  altitude?: number;
  /** Number of raw samples in the bucket. */
  samples: number;
}

export interface SleepNight {
  /** Local date of waking up (BedtimeEnd), YYYY-MM-DD. */
  date: string;
  is_nap: boolean;
  /** Local times, ISO 8601 with offset. */
  bedtime_start?: string;
  bedtime_end?: string;
  /** h:mm */
  duration?: string;
  duration_s?: number;
  deep?: string;
  deep_s?: number;
  light?: string;
  light_s?: number;
  rem?: string;
  rem_s?: number;
  hr_avg?: number;
  hr_min?: number;
  hrv_avg_ms?: number;
  spo2_max_pct?: number;
  quality_score?: number;
  feeling?: number;
  sleep_onset_latency_s?: number;
  awake_after_sleep_onset_s?: number;
}

export interface RecoveryPoint {
  /** Local time, ISO 8601 with offset. */
  start: string;
  end?: string;
  /** Recovery balance in percent (0 to 100). */
  balance_pct_avg?: number;
  balance_pct_min?: number;
  balance_pct_max?: number;
  /** Raw samples: the stress state value; buckets: how many samples had each value. */
  stress_state?: number;
  stress_states?: Record<string, number>;
  samples: number;
}

export interface RouteSummary {
  route_id: string;
  name?: string;
  description?: string;
  /** units.distance */
  distance?: number;
  sports: string[];
  start?: Position;
  end?: Position;
  created?: string;
  modified?: string;
  watch_enabled?: boolean;
}

export interface PoiSummary {
  poi_key?: string;
  name?: string;
  latitude: number;
  longitude: number;
  /** units.elevation */
  altitude?: number;
  /** PoiType name, for example "Peak". */
  type: string;
  type_id: number;
  sport?: string;
  created?: string;
  watch_enabled?: boolean;
}
