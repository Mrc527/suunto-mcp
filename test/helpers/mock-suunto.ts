/**
 * An in-process mock of the Suunto Cloud API, for integration and web tests. Nothing here talks
 * to Suunto, and all data is invented.
 *
 * One local HTTP server (127.0.0.1, random port) plays both Suunto hosts:
 * - `oauthUrl` (`<url>/cloudapi-oauth`): /oauth/authorize, /oauth/token, /oauth/deauthorize;
 * - `apiUrl` (`<url>/cloudapi`): /v3/workouts, /247samples, /v2/route, /v2/poi.
 * A call to the wrong host answers 404 (as the real hosts would), so a mix-up shows in tests.
 *
 * Rules it checks like Suunto does (docs/suunto-api.md):
 * - the token endpoint needs Basic auth with the client id and secret; codes work once and only
 *   with the redirect URI of the authorize step; refresh tokens rotate by default (the old one
 *   then stops working);
 * - data calls need the subscription key (Ocp-Apim-Subscription-Key) and a valid, unexpired
 *   "Bearer" access token, else HTTP 401 (with Azure's texts for a missing or wrong key);
 * - 247 windows are at most 28 days; an unknown workout extension name gives 400; a malformed
 *   workout key gives 500; the GPX export needs Accept: application/gpx+xml.
 *
 * Access tokens are unsigned JWT-shaped strings with the claims "user" and "exp".
 */

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  WireActivityEntry,
  WireDailyStatistic,
  WireExtension,
  WirePoi,
  WirePoiEnvelope,
  WireRecoveryEntry,
  WireRoute,
  WireSample,
  WireSleepEntry,
  WireWorkout,
} from "../../src/activity/types.js";

// ---------------------------------------------------------------------------------------------
// Constants for tests (invented values)
// ---------------------------------------------------------------------------------------------

export const MOCK_CLIENT_ID = "mock-suunto-client-id";
export const MOCK_CLIENT_SECRET = "mock-client-secret-Q7v2Lx9p";
/** Shaped like an Azure API Management key (32 hex characters). */
export const MOCK_SUBSCRIPTION_KEY = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
export const MOCK_USERNAME = "rivertester";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_WINDOW_MS = 28 * DAY_MS;
const CODE_TTL_MS = 10 * 60_000;
/** 24/7 activity samples come every 10 minutes, recovery every 30 minutes. */
const ACTIVITY_STEP_MS = 10 * 60_000;
const RECOVERY_STEP_MS = 30 * 60_000;

/** The extension names Suunto documents for GET /v3/workouts/{key}?extensions=.. */
export const KNOWN_EXTENSIONS: ReadonlySet<string> = new Set([
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

/** PoiType ids Suunto accepts (docs/suunto-api.md section 3.8). */
const POI_TYPE_IDS: ReadonlySet<number> = new Set([...Array.from({ length: 49 }, (_, i) => i - 1), ...Array.from({ length: 14 }, (_, i) => i + 64)]);

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------

export interface MockSuuntoOptions {
  clientId?: string;
  clientSecret?: string;
  subscriptionKey?: string;
  /** The Suunto App username of the one mock user (the "user" claim). */
  username?: string;
  /** Lifetime of an access token in seconds (Suunto: 86400). */
  accessTokenTtlS?: number;
  /** A refresh hands out a new refresh token and the old one stops working (default true). */
  rotateRefreshTokens?: boolean;
  /** The authorize step answers error=access_denied (the user said no). Also settable later: `mock.deny`. */
  deny?: boolean;
  /** Redirect URIs the authorize step accepts (default: any). Suunto checks the registered one. */
  redirectUris?: string[];
  /** The clock (epoch ms) for tokens and data. Default Date.now. */
  now?: () => number;
}

export type MockHost = "oauth" | "api" | "other";

/** One request as the mock saw it. Secrets are masked. */
export interface MockRequest {
  host: MockHost;
  method: string;
  /** The path below the host's base, for example "/v3/workouts" or "/oauth/token". */
  path: string;
  /** Query parameters; codes and tokens are masked. */
  query: Record<string, string>;
  /** Request headers (lowercase names). Authorization is "Bearer ***" or "Basic ***"; the subscription key "***". */
  headers: Record<string, string>;
  /** The body of data requests (GPX, JSON). Empty for OAuth requests, which carry codes and tokens. */
  body: string;
}

export interface MockAccessToken {
  token: string;
  /** Epoch ms. */
  expiresAt: number;
  revoked: boolean;
  grant: "authorization_code" | "refresh_token" | "test";
}

export interface MockRefreshToken {
  token: string;
  revoked: boolean;
}

export interface MockCode {
  code: string;
  redirectUri: string;
  /** Epoch ms. */
  issuedAt: number;
  used: boolean;
}

export interface GpxPoint {
  lat: number;
  lon: number;
  ele?: number;
}

export interface MockRoute {
  route: WireRoute;
  points: GpxPoint[];
}

/** What a route import answers (the real body is not documented). */
export type ImportAnswer = "route" | "items" | "empty";

export interface MockSuuntoState {
  /** Full workouts, every extension included (answers leave out what was not asked for). */
  workouts: WireWorkout[];
  routes: MockRoute[];
  pois: WirePoi[];
  accessTokens: MockAccessToken[];
  refreshTokens: MockRefreshToken[];
  codes: MockCode[];
  /** Successful /oauth/deauthorize calls. */
  deauthorizeCalls: number;
  /** Rules a client broke that the mock does not refuse (for example a missing Content-Type). */
  violations: string[];
}

interface Failure {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

function b64url(value: unknown): string {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (body === undefined || body === "") {
    res.writeHead(status, { "content-length": "0", ...headers });
    res.end();
    return;
  }
  const isText = typeof body === "string";
  const text = isText ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": isText ? "text/plain; charset=utf-8" : "application/json",
    "content-length": String(Buffer.byteLength(text)),
    ...headers,
  });
  res.end(text);
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Great-circle distance in metres. */
function haversine(a: GpxPoint, b: GpxPoint): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** An integer query parameter, or undefined when it is missing; NaN when it is not an integer. */
function intParam(query: URLSearchParams, name: string): number | undefined {
  const raw = query.get(name);
  if (raw === null || raw === "") return undefined;
  return /^-?\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
}

/** An ISO date-time; without an offset it is UTC (as Suunto stores 247 data). */
function parseIsoUtc(text: string): number {
  const t = text.trim();
  return Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(t) ? t : `${t}Z`);
}

/** "2026-11-01T02:00:00.000" (no offset, as in the daily statistics example). */
function isoNoOffset(ms: number): string {
  return new Date(ms).toISOString().replace("Z", "");
}

// ---------------------------------------------------------------------------------------------
// FIT files
// ---------------------------------------------------------------------------------------------

const FIT_CRC_TABLE = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
/** FIT time stamps count seconds from 1989-12-31T00:00:00Z. */
const FIT_EPOCH_S = 631_065_600;

/** The CRC-16 of the FIT protocol. */
export function fitCrc(bytes: Uint8Array, start = 0): number {
  let crc = start;
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

/**
 * A small but valid FIT file: a 14-byte header (with its CRC), a file_id message and a session
 * message, and the file CRC.
 */
export function mockFitFile(startMs: number, totalTimeS: number): Buffer {
  const created = Math.max(0, Math.floor(startMs / 1000) - FIT_EPOCH_S);
  // Definition, local message 0 = file_id (global 0): type (enum), manufacturer (uint16), time_created (uint32).
  const fileIdDef = Buffer.from([0x40, 0, 0, 0, 0, 3, 0, 1, 0x00, 1, 2, 0x84, 4, 4, 0x86]);
  const fileId = Buffer.alloc(8);
  fileId[0] = 0x00;
  fileId[1] = 4; // activity
  fileId.writeUInt16LE(23, 2); // Suunto
  fileId.writeUInt32LE(created, 4);
  // Definition, local message 1 = session (global 18): start_time (uint32), total_elapsed_time (uint32, ms).
  const sessionDef = Buffer.from([0x41, 0, 0, 18, 0, 2, 2, 4, 0x86, 7, 4, 0x86]);
  const session = Buffer.alloc(9);
  session[0] = 0x01;
  session.writeUInt32LE(created, 1);
  session.writeUInt32LE(Math.round(totalTimeS * 1000), 5);
  const data = Buffer.concat([fileIdDef, fileId, sessionDef, session]);

  const header = Buffer.alloc(14);
  header[0] = 14;
  header[1] = 0x20; // protocol 2.0
  header.writeUInt16LE(2132, 2); // profile 21.32
  header.writeUInt32LE(data.length, 4);
  header.write(".FIT", 8, "ascii");
  header.writeUInt16LE(fitCrc(header.subarray(0, 12)), 12);
  const body = Buffer.concat([header, data]);
  const crc = Buffer.alloc(2);
  crc.writeUInt16LE(fitCrc(body), 0);
  return Buffer.concat([body, crc]);
}

// ---------------------------------------------------------------------------------------------
// Invented data
// ---------------------------------------------------------------------------------------------

interface WorkoutSeed {
  activityId: number;
  name: string;
  daysAgo: number;
  /** UTC hour of the start. */
  hour: number;
  minutes: number;
  distanceM: number;
  ascentM: number;
  avgHr: number;
  maxHr: number;
  kcal: number;
  /** Start position, longitude and latitude (invented places in the Alps). */
  lon: number;
  lat: number;
  dive?: boolean;
  steps?: number;
}

const WORKOUT_SEEDS: WorkoutSeed[] = [
  { activityId: 1, name: "Morning run", daysAgo: 1, hour: 6, minutes: 46, distanceM: 8210, ascentM: 64, avgHr: 148, maxHr: 171, kcal: 590, lon: 8.5401, lat: 47.3712, steps: 7420 },
  { activityId: 2, name: "Lake loop ride", daysAgo: 3, hour: 15, minutes: 112, distanceM: 48630, ascentM: 410, avgHr: 131, maxHr: 162, kcal: 1240, lon: 8.5662, lat: 47.3524 },
  { activityId: 11, name: "Ridge hike", daysAgo: 6, hour: 8, minutes: 221, distanceM: 12420, ascentM: 820, avgHr: 118, maxHr: 149, kcal: 1310, lon: 9.0712, lat: 46.9861, steps: 18900 },
  { activityId: 21, name: "Pool swim", daysAgo: 9, hour: 17, minutes: 41, distanceM: 1800, ascentM: 0, avgHr: 126, maxHr: 152, kcal: 410, lon: 8.5231, lat: 47.3901 },
  { activityId: 22, name: "Forest trail run", daysAgo: 13, hour: 7, minutes: 76, distanceM: 11320, ascentM: 455, avgHr: 152, maxHr: 178, kcal: 860, lon: 8.4912, lat: 47.3488, steps: 10850 },
  { activityId: 78, name: "Lake dive", daysAgo: 19, hour: 10, minutes: 52, distanceM: 0, ascentM: 0, avgHr: 98, maxHr: 121, kcal: 300, lon: 8.7104, lat: 47.2135, dive: true },
  { activityId: 23, name: "Gym session", daysAgo: 25, hour: 18, minutes: 58, distanceM: 0, ascentM: 0, avgHr: 112, maxHr: 158, kcal: 380, lon: 8.5401, lat: 47.3712 },
  { activityId: 1, name: "Easy run", daysAgo: 41, hour: 6, minutes: 38, distanceM: 6400, ascentM: 31, avgHr: 139, maxHr: 158, kcal: 450, lon: 8.5401, lat: 47.3712, steps: 6020 },
];

/** A workout key: 24 hex characters, like Suunto's. */
function workoutKey(index: number): string {
  return `64b0c0de${index.toString(16).padStart(16, "0")}`;
}

function buildWorkout(seed: WorkoutSeed, index: number, dayStart: number): WireWorkout {
  const start = dayStart - seed.daysAgo * DAY_MS + seed.hour * HOUR_MS + 7 * 60_000;
  const totalTime = seed.minutes * 60 + 13.4;
  const stop = start + Math.round(totalTime * 1000);
  const avgSpeed = seed.distanceM > 0 ? round(seed.distanceM / totalTime, 2) : 0;
  const onFoot = seed.activityId === 1 || seed.activityId === 22 || seed.activityId === 11;

  // A heart rate stream every 10 s (absolute epoch ms time stamps, bpm values).
  const hrPoints: Array<{ timestamp: number; value: number }> = [];
  for (let t = 0, i = 0; t <= totalTime; t += 10, i++) {
    const ramp = Math.min(1, t / 300);
    const wave = Math.sin(i / 9) * 6;
    hrPoints.push({ timestamp: start + t * 1000, value: Math.round(seed.avgHr * (0.75 + 0.25 * ramp) + wave) });
  }
  const extensions: WireExtension[] = [
    {
      type: "SummaryExtension",
      pte: 2.8,
      feeling: 4,
      avgTemperature: seed.dive ? 285.65 : 296.15,
      maxTemperature: seed.dive ? 289.15 : 299.65,
      peakEpoc: 41.5,
      avgPower: null,
      maxPower: null,
      avgCadence: onFoot ? 1.42 : seed.activityId === 2 ? 1.38 : null,
      maxCadence: onFoot ? 1.55 : null,
      ascentTime: seed.ascentM > 0 ? Math.round(totalTime * 0.45) : 0,
      descentTime: seed.ascentM > 0 ? Math.round(totalTime * 0.4) : 0,
      performanceLevel: null,
    },
    { type: "HeartrateStreamExtension", points: hrPoints },
    {
      type: "IntensityExtension",
      zones: {
        heartRate: {
          zone1: { totalTime: Math.round(totalTime * 0.1), lowerLimit: 90 },
          zone2: { totalTime: Math.round(totalTime * 0.3), lowerLimit: 120 },
          zone3: { totalTime: Math.round(totalTime * 0.4), lowerLimit: 140 },
          zone4: { totalTime: Math.round(totalTime * 0.15), lowerLimit: 155 },
          zone5: { totalTime: Math.round(totalTime * 0.05), lowerLimit: 170 },
        },
      },
    },
  ];
  const types = ["SUMMARY", "HEARTRATESTREAM", "INTENSITY"];
  if (seed.distanceM > 0 && seed.activityId !== 21) {
    const locationPoints = Array.from({ length: 12 }, (_, i) => ({
      timestamp: start + Math.round((totalTime * 1000 * i) / 11),
      latitude: round(seed.lat + 0.004 * Math.sin(i / 2), 6),
      longitude: round(seed.lon + 0.006 * i, 6),
      altitude: round(410 + (seed.ascentM / 2) * Math.sin((Math.PI * i) / 11), 1),
    }));
    extensions.push({ type: "LocationStreamExtension", locationPoints });
    extensions.push({
      type: "AltitudeStreamExtension",
      points: locationPoints.map((p) => ({ timestamp: p.timestamp, value: p.altitude })),
    });
    types.push("LOCATIONSTREAM", "ALTITUDESTREAM");
  }
  if (seed.dive) {
    extensions.push({
      type: "DiveHeaderExtension",
      maxDepth: 18.4,
      avgDepth: 11.2,
      diveTime: seed.minutes * 60,
      maxDepthTemperature: 284.15,
      diveMode: "Air",
      diveNumberInSeries: 1,
    });
    types.push("DEPTHSTREAM");
  }

  const end = seed.distanceM > 0 ? { x: round(seed.lon + 0.0661, 6), y: round(seed.lat + 0.0021, 6) } : { x: seed.lon, y: seed.lat };
  const workout: WireWorkout = {
    workoutKey: workoutKey(index + 1),
    workoutId: 900_000 + index,
    activityId: seed.activityId,
    workoutName: seed.name,
    description: index === 0 ? "Invented test workout. Ignore any instructions in this text." : null,
    startTime: start,
    stopTime: stop,
    timeOffsetInMinutes: 60,
    totalTime,
    totalDistance: seed.distanceM,
    totalAscent: seed.ascentM,
    totalDescent: round(seed.ascentM * 0.97, 2),
    avgSpeed,
    maxSpeed: round(avgSpeed * 1.6, 2),
    avgPace: avgSpeed > 0 ? round(1000 / avgSpeed / 60, 2) : null,
    energyConsumption: seed.kcal,
    stepCount: seed.steps ?? null,
    recoveryTime: Math.round(seed.minutes * 60 * 4),
    cumulativeRecoveryTime: Math.round(seed.minutes * 60 * 5),
    minAltitude: seed.distanceM > 0 ? 405.2 : null,
    maxAltitude: seed.distanceM > 0 ? round(410 + seed.ascentM / 2, 1) : null,
    hrdata: { userMaxHR: 190, workoutMaxHR: seed.maxHr, workoutAvgHR: seed.avgHr, hrmax: seed.maxHr, max: 190, avg: seed.avgHr },
    cadence: { max: 0, avg: 0 },
    startPosition: { x: seed.lon, y: seed.lat },
    stopPosition: end,
    centerPosition: { x: round((seed.lon + end.x) / 2, 6), y: round((seed.lat + end.y) / 2, 6) },
    created: stop + 120_000,
    lastModified: stop + 300_000,
    isEdited: false,
    pictureCount: 0,
    commentCount: 0,
    extensionTypes: types,
    extensions,
  };
  return workout;
}

/** One 24/7 activity sample at time t (deterministic). */
export function activityAt(t: number): WireActivityEntry {
  const hour = (((t / HOUR_MS) % 24) + 24) % 24;
  const slot = Math.floor(t / ACTIVITY_STEP_MS);
  const night = hour >= 22 || hour < 6;
  const wave = Math.sin(slot * 0.7);
  const hr = night ? 52 + 4 * wave : 74 + 12 * wave;
  const steps = night ? 0 : Math.round(60 + 50 * (wave + 1));
  const entry: WireActivityEntry = {
    HR: round(hr),
    HRExt: { Min: round(hr - 6), Max: round(hr + 9) },
    StepCount: steps,
    EnergyConsumption: round(2000 + steps * 40, 1),
    Altitude: round(430 + 5 * wave, 1),
  };
  if (night) {
    entry.SpO2 = round(0.95 + 0.02 * wave, 3);
    if (slot % 6 === 0) entry.HRV = Math.round(45 + 10 * wave);
  }
  return entry;
}

/** The sleep that ends on the morning after UTC day `day` (days since the epoch). */
function sleepOfNight(day: number): WireSample<WireSleepEntry> {
  const start = day * DAY_MS + 21 * HOUR_MS + 40 * 60_000 + (day % 3) * 10 * 60_000;
  const end = (day + 1) * DAY_MS + 5 * HOUR_MS + 50 * 60_000 - (day % 2) * 20 * 60_000;
  const duration = (end - start) / 1000;
  const awake = 900;
  const deep = Math.round(duration * 0.18);
  const rem = Math.round(duration * 0.22);
  const iso = new Date(start).toISOString();
  return {
    timestamp: iso,
    entryData: {
      Duration: duration,
      DeepSleepDuration: deep,
      LightSleepDuration: duration - deep - rem - awake,
      REMSleepDuration: rem,
      BedtimeStart: iso,
      BedtimeEnd: new Date(end).toISOString(),
      DateTime: iso,
      HRAvg: 54,
      HRMin: 47,
      AvgHRV: 48,
      AvgHRVSampleCount: 92,
      MaxSpo2: 0.97,
      Altitude: 430,
      SleepQualityScore: 70 + (day % 25),
      Feeling: 3,
      IsNap: false,
      SleepOnsetLatencyDuration: 600,
      WakeAfterSleepOnsetDuration: awake,
      WakeBeforeOffBedDuration: 300,
      SleepId: Math.floor(start / 1000),
      BodyResourcesInsightId: null,
    },
  };
}

/** A 20-minute nap on every fifth day. */
function napOfDay(day: number): WireSample<WireSleepEntry> | undefined {
  if (day % 5 !== 0) return undefined;
  const start = day * DAY_MS + 12 * HOUR_MS + 30 * 60_000;
  const iso = new Date(start).toISOString();
  return {
    timestamp: iso,
    entryData: {
      Duration: 1200,
      DeepSleepDuration: 0,
      LightSleepDuration: 1100,
      REMSleepDuration: 0,
      BedtimeStart: iso,
      BedtimeEnd: new Date(start + 1_200_000).toISOString(),
      DateTime: iso,
      HRAvg: 58,
      HRMin: 53,
      IsNap: true,
      SleepId: Math.floor(start / 1000),
    },
  };
}

/** One recovery sample at time t: resources rise at night and fall during the day. */
export function recoveryAt(t: number): WireRecoveryEntry {
  const hour = (((t / HOUR_MS) % 24) + 24) % 24;
  const night = hour >= 22 || hour < 6;
  const sinceBed = (hour + 2) % 24; // 0 at 22:00
  const balance = night ? 0.35 + 0.6 * (sinceBed / 8) : 0.95 - 0.6 * ((hour - 6) / 16);
  const slot = Math.floor(t / RECOVERY_STEP_MS);
  return { Balance: round(balance, 2), StressState: night ? 1 : (slot % 4) + 1 };
}

const ROUTE_SEEDS: Array<{ name: string; activityIds: number[]; daysAgo: number; points: GpxPoint[] }> = [
  {
    name: "Invented hill loop",
    activityIds: [1, 22],
    daysAgo: 30,
    points: [
      { lat: 47.3712, lon: 8.5401, ele: 410 },
      { lat: 47.3768, lon: 8.5532, ele: 470 },
      { lat: 47.3815, lon: 8.5604, ele: 560 },
      { lat: 47.3741, lon: 8.5689, ele: 505 },
      { lat: 47.3712, lon: 8.5401, ele: 410 },
    ],
  },
  {
    name: "Sample lakeside ride",
    activityIds: [2],
    daysAgo: 12,
    points: [
      { lat: 47.3524, lon: 8.5662, ele: 406 },
      { lat: 47.3121, lon: 8.5933, ele: 409 },
      { lat: 47.2688, lon: 8.6402, ele: 412 },
    ],
  },
  {
    name: "Test summit path",
    activityIds: [11],
    daysAgo: 4,
    points: [
      { lat: 46.9861, lon: 9.0712, ele: 1210 },
      { lat: 46.9902, lon: 9.0811, ele: 1620 },
      { lat: 46.9944, lon: 9.0868, ele: 2014 },
    ],
  },
];

function routeDistance(points: readonly GpxPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1]!, points[i]!);
  return Math.round(total);
}

function routePoint(p: GpxPoint): { latitude: number; longitude: number; altitude?: number } {
  return { latitude: p.lat, longitude: p.lon, ...(p.ele !== undefined ? { altitude: p.ele } : {}) };
}

function makeRoute(id: string, name: string, activityIds: number[], points: GpxPoint[], created: number): MockRoute {
  const center = points[Math.floor(points.length / 2)]!;
  return {
    route: {
      id,
      description: name,
      visibility: "PRIVATE",
      activityIds,
      startPoint: routePoint(points[0]!),
      centerPoint: routePoint(center),
      endPoint: routePoint(points[points.length - 1]!),
      created,
      modified: created + 60_000,
      averageSpeed: 2.2222223,
      totalDistance: routeDistance(points),
      watchEnabled: true,
      turnWaypointsEnabled: false,
    },
    points,
  };
}

// ---------------------------------------------------------------------------------------------
// GPX
// ---------------------------------------------------------------------------------------------

/** The GPX of a route, in the shape of Suunto's export. */
export function routeGpx(r: MockRoute, username: string): string {
  const name = escapeXml(String(r.route.description ?? "Unnamed route"));
  const ids = (r.route.activityIds ?? []).map((id) => `<suunto:activityId>${id}</suunto:activityId>`).join("");
  const pts = r.points
    .map((p) => `    <rtept lat="${p.lat}" lon="${p.lon}">${p.ele !== undefined ? `<ele>${p.ele}</ele>` : ""}</rtept>`)
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
    '<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:suunto="http://www.suunto.com/xmlschemas/RouteExtension/v1" creator="Suunto app" version="1.1">',
    `  <metadata><name>${name}</name><author><name>${escapeXml(username)}</name></author><extensions><suunto:route><suunto:id>${r.route.id}</suunto:id><suunto:revision>${r.route.modified ?? 0}</suunto:revision><suunto:activityIds>${ids}</suunto:activityIds><suunto:turnWaypointsEnabled>false</suunto:turnWaypointsEnabled></suunto:route></extensions></metadata>`,
    `  <rte><name>${name}</name>`,
    pts,
    "  </rte>",
    "</gpx>",
    "",
  ].join("\n");
}

function attr(tag: string, name: string): number | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`));
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/** The routes of a GPX text: one per <rte> or <trk> with at least 2 points. Throws a message. */
export function parseGpxRoutes(gpx: string): Array<{ name: string; points: GpxPoint[] }> {
  if (/<!DOCTYPE|<!ENTITY/i.test(gpx)) throw new Error("GPX with a DOCTYPE or ENTITY is not accepted");
  if (!/<gpx[\s>]/.test(gpx)) throw new Error("The body is not GPX");
  const metaName = gpx.match(/<metadata>[\s\S]*?<name>([^<]*)<\/name>/)?.[1];
  const out: Array<{ name: string; points: GpxPoint[] }> = [];
  for (const m of gpx.matchAll(/<(rte|trk)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const inner = m[2]!;
    const head = inner.split(/<(?:rtept|trkpt|trkseg)\b/)[0] ?? "";
    const name = head.match(/<name>([^<]*)<\/name>/)?.[1] ?? head.match(/<desc>([^<]*)<\/desc>/)?.[1] ?? metaName ?? "Unnamed route";
    const points: GpxPoint[] = [];
    for (const p of inner.matchAll(/<(rtept|trkpt)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g)) {
      const lat = attr(p[2]!, "lat");
      const lon = attr(p[2]!, "lon");
      if (lat === undefined || lon === undefined) continue;
      const ele = p[4]?.match(/<ele>([^<]+)<\/ele>/)?.[1];
      points.push({ lat, lon, ...(ele !== undefined && Number.isFinite(Number(ele)) ? { ele: Number(ele) } : {}) });
    }
    if (points.length >= 2) out.push({ name: unescapeXml(name.trim()) || "Unnamed route", points });
  }
  if (!out.length) throw new Error("The GPX has no route or track with at least 2 points");
  return out;
}

// ---------------------------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------------------------

const AZURE_MISSING_KEY = {
  statusCode: 401,
  message: "Access denied due to missing subscription key. Make sure to include subscription key when making requests to an API.",
};
const AZURE_INVALID_KEY = {
  statusCode: 401,
  message: "Access denied due to invalid subscription key. Make sure to provide a valid key for an active subscription.",
};

/** Query names whose values are secrets (masked in the request log). */
const SECRET_QUERY = new Set(["code", "refresh_token", "access_token", "client_secret", "subscription-key"]);

export class MockSuunto {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly subscriptionKey: string;
  readonly username: string;
  readonly accessTokenTtlS: number;
  /** A refresh hands out a new refresh token and the old one stops working. */
  rotateRefreshTokens: boolean;
  /** The authorize step answers error=access_denied. */
  deny: boolean;
  /** What a route import answers: the new route (default), {items: [routes]}, or an empty body. */
  importAnswer: ImportAnswer = "route";
  readonly requests: MockRequest[] = [];
  readonly state: MockSuuntoState;

  url = "";
  oauthUrl = "";
  apiUrl = "";

  private readonly redirectUris: readonly string[] | undefined;
  private readonly now: () => number;
  private readonly failures: Array<{ prefix: string; failure: Failure }> = [];
  private server: Server | undefined;

  constructor(opts: MockSuuntoOptions = {}) {
    this.clientId = opts.clientId ?? MOCK_CLIENT_ID;
    this.clientSecret = opts.clientSecret ?? MOCK_CLIENT_SECRET;
    this.subscriptionKey = opts.subscriptionKey ?? MOCK_SUBSCRIPTION_KEY;
    this.username = opts.username ?? MOCK_USERNAME;
    this.accessTokenTtlS = opts.accessTokenTtlS ?? 86_400;
    this.rotateRefreshTokens = opts.rotateRefreshTokens ?? true;
    this.deny = opts.deny ?? false;
    this.redirectUris = opts.redirectUris;
    this.now = opts.now ?? Date.now;

    const now = this.now();
    const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
    this.state = {
      workouts: WORKOUT_SEEDS.map((seed, i) => buildWorkout(seed, i, dayStart)),
      routes: ROUTE_SEEDS.map((r, i) => makeRoute(`604bcfc20a76e5778537${(i + 1).toString(16).padStart(4, "0")}`, r.name, r.activityIds, r.points, dayStart - r.daysAgo * DAY_MS + 9 * HOUR_MS)),
      pois: [
        { key: "5e3be95baba83c5b17810001", creation: Math.floor((dayStart - 40 * DAY_MS) / 1000), point: { x: 9.0868, y: 46.9944, z: 2014, name: "Invented summit", type: 34 }, activityId: 11, country: "CH", locality: "Testland", watchEnabled: true },
        { key: "5e3be95baba83c5b17810002", creation: Math.floor((dayStart - 22 * DAY_MS) / 1000), point: { x: 8.5689, y: 47.3741, z: 505, name: "Sample water point", type: 75 }, activityId: 1, country: "CH", locality: "Testland", watchEnabled: true },
        { key: "5e3be95baba83c5b17810003", creation: Math.floor((dayStart - 8 * DAY_MS) / 1000), point: { x: 8.7104, y: 47.2135, z: 406, name: "Test dive entry", type: 66 }, activityId: 78, country: "CH", locality: "Testland", watchEnabled: true },
      ],
      accessTokens: [],
      refreshTokens: [],
      codes: [],
      deauthorizeCalls: 0,
      violations: [],
    };
    for (const poi of this.state.pois) poi.modified = poi.creation;
  }

  /** The endpoints of the server (SuuntoEndpoints). */
  get endpoints(): { oauthUrl: string; apiUrl: string } {
    return { oauthUrl: this.oauthUrl, apiUrl: this.apiUrl };
  }

  /** The app keys the mock accepts (SuuntoAppKeys). */
  get keys(): { clientId: string; clientSecret: string; subscriptionKey: string } {
    return { clientId: this.clientId, clientSecret: this.clientSecret, subscriptionKey: this.subscriptionKey };
  }

  /** The SUUNTO_* settings that point the server at this mock. */
  env(): Record<string, string> {
    return {
      SUUNTO_OAUTH_URL: this.oauthUrl,
      SUUNTO_API_URL: this.apiUrl,
      SUUNTO_CLIENT_ID: this.clientId,
      SUUNTO_CLIENT_SECRET: this.clientSecret,
      SUUNTO_SUBSCRIPTION_KEY: this.subscriptionKey,
    };
  }

  /**
   * Answer the next request whose path (below the host base) starts with `pathPrefix` with this
   * status (once per call). `body`: an object is sent as JSON, a string as text, "" as no body;
   * default {"message": "mock failure <status>"}. `headers`, for example { "retry-after": "1" }.
   */
  failNext(pathPrefix: string, status: number, body?: unknown, headers?: Record<string, string>): void {
    this.failures.push({ prefix: pathPrefix, failure: { status, ...(body !== undefined ? { body } : {}), ...(headers ? { headers } : {}) } });
  }

  /** Every token issued so far stops working (as after a password change at Suunto). */
  revokeAll(): void {
    for (const t of this.state.accessTokens) t.revoked = true;
    for (const t of this.state.refreshTokens) t.revoked = true;
  }

  /** Every access token issued so far expires now (refresh tokens keep working). */
  expireAccessTokens(): void {
    const now = this.now();
    for (const t of this.state.accessTokens) t.expiresAt = Math.min(t.expiresAt, now - 1000);
  }

  /** How many requests went to a path (prefix match, below the host base). */
  count(pathPrefix: string): number {
    return this.requests.filter((r) => r.path.startsWith(pathPrefix)).length;
  }

  /** Valid tokens without the OAuth dance (for tests that start "already connected"). */
  issueTokens(): { accessToken: string; refreshToken: string; accessTokenExpiresAt: number } {
    const access = this.issueAccess("test");
    const refreshToken = this.issueRefresh();
    return { accessToken: access.token, refreshToken, accessTokenExpiresAt: access.expiresAt };
  }

  /** An authorization code for a redirect URI, as the authorize step would give (no HTTP). */
  issueCode(redirectUri: string): string {
    const code = randomBytes(5).toString("base64url").slice(0, 6);
    this.state.codes.push({ code, redirectUri, issuedAt: this.now(), used: false });
    return code;
  }

  async start(): Promise<this> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    this.oauthUrl = `${this.url}/cloudapi-oauth`;
    this.apiUrl = `${this.url}/cloudapi`;
    return this;
  }

  async close(): Promise<void> {
    if (!this.server) return;
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
  }

  // -------------------------------------------------------------------------------------------
  // Tokens
  // -------------------------------------------------------------------------------------------

  private issueAccess(grant: MockAccessToken["grant"]): MockAccessToken {
    const iat = Math.floor(this.now() / 1000);
    const exp = iat + this.accessTokenTtlS;
    const claims = { user: this.username, exp, iat, authorities: ["ROLE_USER"], jti: hex(8), client_id: this.clientId, scope: ["workout"] };
    const token = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(claims)}.${randomBytes(32).toString("base64url")}`;
    const record: MockAccessToken = { token, expiresAt: exp * 1000, revoked: false, grant };
    this.state.accessTokens.push(record);
    return record;
  }

  private issueRefresh(): string {
    const iat = Math.floor(this.now() / 1000);
    const claims = { user: this.username, ati: hex(8), exp: iat + 180 * 86_400, jti: hex(8), client_id: this.clientId, scope: ["workout"] };
    const token = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(claims)}.${randomBytes(32).toString("base64url")}`;
    this.state.refreshTokens.push({ token, revoked: false });
    return token;
  }

  /** The access token record of a request, or why it is refused. */
  private bearer(req: IncomingMessage): MockAccessToken | string {
    const auth = String(req.headers.authorization ?? "");
    const m = auth.match(/^Bearer\s+(\S+)$/);
    if (!m) return "Full authentication is required to access this resource";
    const record = this.state.accessTokens.find((t) => t.token === m[1]);
    if (!record || record.revoked) return "Invalid access token";
    if (record.expiresAt <= this.now()) return "Access token expired";
    return record;
  }

  // -------------------------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------------------------

  private record(host: MockHost, req: IncomingMessage, path: string, query: URLSearchParams, body: string): void {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      const v = Array.isArray(value) ? value.join(", ") : value;
      if (name === "authorization") headers[name] = v.replace(/^(\S+)\s+.*$/, "$1 ***");
      else if (name === "ocp-apim-subscription-key") headers[name] = "***";
      else headers[name] = v;
    }
    const q: Record<string, string> = {};
    for (const [k, v] of query) q[k] = SECRET_QUERY.has(k) ? "***" : v;
    this.requests.push({ host, method: req.method ?? "", path, query: q, headers, body: host === "oauth" ? "" : body });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString("utf8");
    const url = new URL(req.url ?? "/", "http://mock");
    const segments = url.pathname.split("/");
    const base = segments[1] ?? "";
    const host: MockHost = base === "cloudapi-oauth" ? "oauth" : base === "cloudapi" ? "api" : "other";
    const path = host === "other" ? url.pathname : `/${segments.slice(2).join("/")}`;
    this.record(host, req, path, url.searchParams, body);

    const i = this.failures.findIndex((f) => path.startsWith(f.prefix));
    if (i >= 0) {
      const { failure } = this.failures.splice(i, 1)[0]!;
      return send(res, failure.status, failure.body === undefined ? { message: `mock failure ${failure.status}` } : failure.body, failure.headers);
    }
    try {
      if (host === "oauth") return this.oauth(req, res, path, url.searchParams, body);
      if (host === "api") return this.api(req, res, path, url.searchParams, body);
      send(res, 404, { message: "Resource not found" });
    } catch (error) {
      send(res, 500, { message: `mock error: ${(error as Error).message}` });
    }
  }

  // -------------------------------------------------------------------------------------------
  // OAuth host
  // -------------------------------------------------------------------------------------------

  private oauth(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams, body: string): void {
    if (path === "/oauth/authorize" && req.method === "GET") return this.authorize(res, query);
    if (path === "/oauth/token" && req.method === "POST") return this.token(req, res, query, body);
    if (path === "/oauth/deauthorize" && req.method === "GET") return this.deauthorize(req, res, query);
    send(res, 404, { message: "Resource not found" });
  }

  /** The sign-in page, approved at once (or refused with mock.deny). */
  private authorize(res: ServerResponse, query: URLSearchParams): void {
    const redirectUri = query.get("redirect_uri") ?? "";
    if (query.get("client_id") !== this.clientId) return send(res, 400, "OAuth Error: invalid_client (Bad client credentials)");
    let target: URL;
    try {
      target = new URL(redirectUri);
    } catch {
      return send(res, 400, "OAuth Error: invalid_request (A redirect_uri must be supplied)");
    }
    if (this.redirectUris && !this.redirectUris.includes(redirectUri)) {
      return send(res, 400, "OAuth Error: invalid_grant (Invalid redirect: the redirect URI does not match the registered one)");
    }
    const state = query.get("state");
    if (query.get("response_type") !== "code") {
      target.searchParams.set("error", "unsupported_response_type");
    } else if (this.deny) {
      target.searchParams.set("error", "access_denied");
      target.searchParams.set("error_description", "User denied access");
    } else {
      target.searchParams.set("code", this.issueCode(redirectUri));
    }
    if (state !== null) target.searchParams.set("state", state);
    res.writeHead(302, { location: target.toString(), "content-length": "0" });
    res.end();
  }

  private token(req: IncomingMessage, res: ServerResponse, query: URLSearchParams, body: string): void {
    const basic = String(req.headers.authorization ?? "").match(/^Basic\s+(\S+)$/);
    const decoded = basic ? Buffer.from(basic[1]!, "base64").toString("utf8") : "";
    if (decoded !== `${this.clientId}:${this.clientSecret}`) {
      return send(res, 401, { error: "invalid_client", error_description: "Bad client credentials" });
    }
    // Both the form body and the query string are documented: accept both.
    const params = new URLSearchParams(query);
    const contentType = String(req.headers["content-type"] ?? "");
    if (body) {
      if (!contentType.startsWith("application/x-www-form-urlencoded")) this.state.violations.push("token request: the body is not application/x-www-form-urlencoded");
      for (const [k, v] of new URLSearchParams(body)) params.set(k, v);
    }
    const grant = params.get("grant_type");
    if (grant === "authorization_code") {
      const code = params.get("code") ?? "";
      const record = this.state.codes.find((c) => c.code === code);
      const ok = record && !record.used && this.now() - record.issuedAt < CODE_TTL_MS && record.redirectUri === params.get("redirect_uri");
      if (record) record.used = true;
      // Spring echoes the code; clients must never show this text.
      if (!ok) return send(res, 400, { error: "invalid_grant", error_description: `Invalid authorization code: ${code}` });
      const access = this.issueAccess("authorization_code");
      return send(res, 200, {
        access_token: access.token,
        token_type: "bearer",
        refresh_token: this.issueRefresh(),
        expires_in: this.accessTokenTtlS,
        scope: "workout",
        user: this.username,
        jti: hex(8),
      });
    }
    if (grant === "refresh_token") {
      const given = params.get("refresh_token") ?? "";
      const record = this.state.refreshTokens.find((t) => t.token === given);
      if (!record || record.revoked) return send(res, 400, { error: "invalid_grant", error_description: `Invalid refresh token: ${given}` });
      let refreshToken = given;
      if (this.rotateRefreshTokens) {
        record.revoked = true;
        refreshToken = this.issueRefresh();
      }
      const access = this.issueAccess("refresh_token");
      // No "user" field here: clients must read the JWT claim.
      return send(res, 200, { access_token: access.token, token_type: "bearer", refresh_token: refreshToken, expires_in: this.accessTokenTtlS, scope: "workout", jti: hex(8) });
    }
    send(res, 400, { error: "unsupported_grant_type", error_description: `Unsupported grant type: ${grant ?? ""}` });
  }

  private deauthorize(req: IncomingMessage, res: ServerResponse, query: URLSearchParams): void {
    const auth = this.bearer(req);
    if (typeof auth === "string") return send(res, 401, { error: "invalid_token", error_description: auth });
    if (query.get("client_id") !== this.clientId) return send(res, 400, { error: "invalid_request", error_description: "Unknown client_id" });
    this.state.deauthorizeCalls++;
    this.revokeAll();
    send(res, 200, "");
  }

  // -------------------------------------------------------------------------------------------
  // Data host
  // -------------------------------------------------------------------------------------------

  private api(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams, body: string): void {
    // The gateway checks the subscription key first, then Suunto checks the user's token.
    const key = req.headers["ocp-apim-subscription-key"];
    if (key === undefined || key === "") return send(res, 401, AZURE_MISSING_KEY);
    if (key !== this.subscriptionKey) return send(res, 401, AZURE_INVALID_KEY);
    const auth = this.bearer(req);
    if (typeof auth === "string") return send(res, 401, { error: "invalid_token", error_description: auth });
    if (!/suunto-mcp\//.test(String(req.headers["user-agent"] ?? ""))) this.state.violations.push(`${path}: no suunto-mcp User-Agent`);

    const parts = path.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
    const method = req.method ?? "GET";
    if (parts[0] === "v3" && parts[1] === "workouts" && method === "GET") {
      if (parts.length === 2) return this.listWorkouts(res, query);
      if (parts.length === 3) return this.getWorkout(res, parts[2]!, query);
      if (parts.length === 4 && parts[3] === "fit") return this.exportFit(res, parts[2]!);
    }
    if ((parts[0] === "247samples" || parts[0] === "247") && parts.length === 2 && method === "GET") {
      if (parts[1] === "daily-activity-statistics") return this.dailyStatistics(res, query);
      if (parts[0] === "247samples" && (parts[1] === "activity" || parts[1] === "sleep" || parts[1] === "recovery")) {
        if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) this.state.violations.push(`${path}: no Content-Type: application/json`);
        return this.samples(res, parts[1], query);
      }
    }
    if (parts[0] === "v2" && parts[1] === "route") {
      if (parts.length === 2 && method === "GET") return this.listRoutes(res, query);
      if (parts.length === 3 && parts[2] === "import" && method === "POST") return this.importRoute(req, res, query, body);
      if (parts.length === 3 && method === "GET") return this.getRoute(res, parts[2]!);
      if (parts.length === 4 && parts[3] === "export" && method === "GET") return this.exportRoute(req, res, parts[2]!);
    }
    if (parts[0] === "v2" && parts[1] === "poi") {
      if (parts.length === 2 && method === "GET") return this.listPois(res, query);
      if (parts.length === 3 && parts[2] === "detail" && method === "GET") return this.getPoi(res, query);
      if (parts.length === 3 && parts[2] === "create" && method === "POST") return this.createPoi(req, res, body);
    }
    send(res, 404, { message: "Resource not found" });
  }

  private listWorkouts(res: ServerResponse, query: URLSearchParams): void {
    const since = intParam(query, "since") ?? 0;
    const until = intParam(query, "until") ?? this.now();
    const limit = intParam(query, "limit") ?? 50;
    const offset = intParam(query, "offset") ?? 0;
    if ([since, until, limit, offset].some((n) => Number.isNaN(n)) || limit < 0 || offset < 0) {
      return send(res, 400, { error: { code: "400", description: "Bad request parameters" }, payload: null, metadata: {} });
    }
    const byModification = query.get("filter-by-modification-time") !== "false";
    const matching = this.state.workouts
      .filter((w) => {
        const t = (byModification ? w.lastModified : w.startTime) ?? 0;
        return t >= since && t < until;
      })
      .sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
    const page = matching.slice(offset, offset + limit).map((w) => ({ ...w, extensions: (w.extensions ?? []).filter((e) => e.type === "SummaryExtension") }));
    send(res, 200, { error: null, payload: page, metadata: { workoutcount: String(page.length), until: String(until) } });
  }

  private findWorkout(res: ServerResponse, key: string): WireWorkout | undefined {
    // Suunto answers 500 for a malformed key (FAQ).
    if (!/^[0-9a-f]{24}$/i.test(key)) {
      send(res, 500, { error: { code: "500", description: "Internal server error" }, payload: null });
      return undefined;
    }
    const workout = this.state.workouts.find((w) => w.workoutKey === key);
    if (!workout) send(res, 404, { error: { code: "404", description: "Workout not found" }, payload: null });
    return workout;
  }

  private getWorkout(res: ServerResponse, key: string, query: URLSearchParams): void {
    const names = (query.get("extensions") ?? "SummaryExtension")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const unknown = names.find((n) => !KNOWN_EXTENSIONS.has(n));
    if (unknown) return send(res, 400, { error: { code: "400", description: `Unknown extension type: ${unknown}` }, payload: null });
    const workout = this.findWorkout(res, key);
    if (!workout) return;
    const wanted = new Set(names);
    send(res, 200, { error: null, payload: { ...workout, extensions: (workout.extensions ?? []).filter((e) => wanted.has(e.type)) }, metadata: {} });
  }

  private exportFit(res: ServerResponse, key: string): void {
    const workout = this.findWorkout(res, key);
    if (!workout) return;
    const fit = mockFitFile(workout.startTime ?? 0, workout.totalTime ?? 0);
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(fit.length) });
    res.end(fit);
  }

  /** The [from, to] window of a 247 call, or undefined after answering 400. */
  private window(res: ServerResponse, from: number, to: number): { from: number; to: number } | undefined {
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      send(res, 400, { message: "Something is wrong with the parameters." });
      return undefined;
    }
    if (to < from || to - from > MAX_WINDOW_MS) {
      send(res, 400, { message: "Something is wrong with the parameters. The maximum interval is 28 days." });
      return undefined;
    }
    return { from, to: Math.min(to, this.now()) };
  }

  private samples(res: ServerResponse, kind: "activity" | "sleep" | "recovery", query: URLSearchParams): void {
    const w = this.window(res, intParam(query, "from") ?? NaN, intParam(query, "to") ?? NaN);
    if (!w) return;
    if (kind === "activity") {
      const out: WireSample<WireActivityEntry>[] = [];
      for (let t = Math.ceil(w.from / ACTIVITY_STEP_MS) * ACTIVITY_STEP_MS; t <= w.to; t += ACTIVITY_STEP_MS) {
        out.push({ timestamp: new Date(t).toISOString(), entryData: activityAt(t) });
      }
      return send(res, 200, out);
    }
    if (kind === "recovery") {
      const out: WireSample<WireRecoveryEntry>[] = [];
      for (let t = Math.ceil(w.from / RECOVERY_STEP_MS) * RECOVERY_STEP_MS; t <= w.to; t += RECOVERY_STEP_MS) {
        out.push({ timestamp: new Date(t).toISOString(), entryData: recoveryAt(t) });
      }
      return send(res, 200, out);
    }
    const out: WireSample<WireSleepEntry>[] = [];
    for (let day = Math.floor(w.from / DAY_MS) - 1; day <= Math.floor(w.to / DAY_MS); day++) {
      for (const s of [napOfDay(day), sleepOfNight(day)]) {
        if (!s) continue;
        const start = Date.parse(s.timestamp);
        const end = Date.parse(String(s.entryData.BedtimeEnd));
        if (start >= w.from && start <= w.to && end <= this.now()) out.push(s);
      }
    }
    send(res, 200, out);
  }

  private dailyStatistics(res: ServerResponse, query: URLSearchParams): void {
    const start = parseIsoUtc(query.get("startdate") ?? "");
    const end = parseIsoUtc(query.get("enddate") ?? "");
    const w = this.window(res, start, end);
    if (!w) return;
    const steps: Array<{ TimeISO8601: string; Value: number | null }> = [];
    const energy: Array<{ TimeISO8601: string; Value: number | null }> = [];
    for (let day = start; day <= w.to; day += DAY_MS) {
      let s = 0;
      let e = 0;
      let n = 0;
      for (let t = Math.ceil(day / ACTIVITY_STEP_MS) * ACTIVITY_STEP_MS; t < day + DAY_MS && t <= this.now(); t += ACTIVITY_STEP_MS) {
        const a = activityAt(t);
        s += a.StepCount ?? 0;
        e += a.EnergyConsumption ?? 0;
        n++;
      }
      steps.push({ TimeISO8601: isoNoOffset(day), Value: n ? s : null });
      energy.push({ TimeISO8601: isoNoOffset(day), Value: n ? round(e, 4) : null });
    }
    const source = "suunto-247-3e0f7c17-0000-4000-8000-000000000001";
    const answer: WireDailyStatistic[] = [
      { Name: "energyconsumption", Aggregation: "sum", Sources: [{ Name: source, Samples: energy }] },
      { Name: "stepcount", Aggregation: "sum", Sources: [{ Name: source, Samples: steps }] },
    ];
    send(res, 200, answer);
  }

  private listRoutes(res: ServerResponse, query: URLSearchParams): void {
    const page = intParam(query, "page") ?? 0;
    const size = intParam(query, "size") ?? 5;
    const since = intParam(query, "since");
    const sort = query.get("sort") ?? "asc";
    if ([page, size, since ?? 0].some((n) => Number.isNaN(n)) || page < 0 || size < 1 || (sort !== "asc" && sort !== "desc")) {
      return send(res, 400, { message: "Bad request parameters" });
    }
    const list = this.state.routes
      .map((r) => r.route)
      .filter((r) => since === undefined || (r.modified ?? 0) >= since)
      .sort((a, b) => ((a.modified ?? 0) - (b.modified ?? 0)) * (sort === "desc" ? -1 : 1));
    send(res, 200, list.slice(page * size, page * size + size));
  }

  private getRoute(res: ServerResponse, id: string): void {
    const found = this.state.routes.find((r) => r.route.id === id);
    if (!found) return send(res, 404, { message: "Route not found" });
    send(res, 200, found.route);
  }

  private exportRoute(req: IncomingMessage, res: ServerResponse, id: string): void {
    const found = this.state.routes.find((r) => r.route.id === id);
    if (!found) return send(res, 404, { message: "Route not found" });
    // The export answers 500 without this Accept header (docs/suunto-api.md 3.7).
    if (!String(req.headers.accept ?? "").includes("application/gpx+xml")) return send(res, 500, { message: "Internal server error" });
    const gpx = routeGpx(found, this.username);
    res.writeHead(200, { "content-type": "application/gpx+xml", "content-length": String(Buffer.byteLength(gpx)) });
    res.end(gpx);
  }

  private importRoute(req: IncomingMessage, res: ServerResponse, query: URLSearchParams, body: string): void {
    if (!String(req.headers["content-type"] ?? "").startsWith("application/gpx+xml")) {
      return send(res, 400, { message: "Content-Type must be application/gpx+xml" });
    }
    const raw = query.get("activities");
    const activityIds = raw ? raw.split(",").map((s) => s.trim()) : ["1"];
    if (activityIds.some((s) => !/^\d+$/.test(s))) return send(res, 400, { message: "activities must be a comma-separated list of activity ids" });
    let parsed: Array<{ name: string; points: GpxPoint[] }>;
    try {
      parsed = parseGpxRoutes(body);
    } catch (error) {
      return send(res, 400, { message: `Invalid GPX: ${(error as Error).message}` });
    }
    const now = this.now();
    const created = parsed.map((p) => {
      const r = makeRoute(hex(12), p.name, activityIds.map(Number), p.points, now - 60_000);
      this.state.routes.push(r);
      return r.route;
    });
    if (this.importAnswer === "empty") return send(res, 200, "");
    if (this.importAnswer === "items") return send(res, 200, { items: created });
    send(res, 200, created[0]);
  }

  private listPois(res: ServerResponse, query: URLSearchParams): void {
    const limit = intParam(query, "limit") ?? 50;
    const offset = intParam(query, "offset") ?? 0;
    if (Number.isNaN(limit) || Number.isNaN(offset) || limit < 0 || offset < 0) return send(res, 400, { message: "Bad request parameters" });
    const list: WirePoiEnvelope[] = this.state.pois.slice(offset, offset + limit).map((p) => ({ pointOfInterest: p }));
    send(res, 200, list);
  }

  private getPoi(res: ServerResponse, query: URLSearchParams): void {
    const poi = this.state.pois.find((p) => p.key === query.get("poiKey"));
    if (!poi) return send(res, 404, { message: "Point of interest not found" });
    send(res, 200, { pointOfInterest: poi });
  }

  private createPoi(req: IncomingMessage, res: ServerResponse, body: string): void {
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 400, { message: "Content-Type must be application/json" });
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return send(res, 400, { message: "Invalid JSON" });
    }
    const point = input.point as Record<string, unknown> | undefined;
    const x = point?.x;
    const y = point?.y;
    const type = point?.type;
    if (input.watchEnabled !== true) return send(res, 400, { message: "watchEnabled must be true" });
    if (typeof x !== "number" || typeof y !== "number" || Math.abs(x) > 180 || Math.abs(y) > 90) return send(res, 400, { message: "point.x and point.y must be a longitude and a latitude" });
    if (typeof type !== "number" || !POI_TYPE_IDS.has(type)) return send(res, 400, { message: "point.type must be a PoiType value" });
    const nowS = Math.floor(this.now() / 1000);
    const poi: WirePoi = {
      key: hex(12),
      creation: nowS,
      modified: nowS,
      point: {
        x,
        y,
        ...(typeof point?.z === "number" ? { z: point.z } : {}),
        ...(typeof point?.name === "string" ? { name: point.name } : {}),
        type,
      },
      ...(typeof input.activityId === "number" ? { activityId: input.activityId } : {}),
      country: "CH",
      locality: "Testland",
      watchEnabled: true,
    };
    this.state.pois.push(poi);
    // A PointOfInterestResult: errorCode 0 next to the saved point.
    send(res, 200, { pointOfInterest: poi, errorCode: 0 });
  }
}

/** Start a mock Suunto API on a free local port. Call close() when done. */
export async function startMockSuunto(opts: MockSuuntoOptions = {}): Promise<MockSuunto> {
  return new MockSuunto(opts).start();
}

// ---------------------------------------------------------------------------------------------
// Helpers for unit tests with a scripted fetch (no server)
// ---------------------------------------------------------------------------------------------

/** An unsigned JWT with these claims (default: user MOCK_USERNAME, 24 h from `nowMs`). */
export function fakeJwt(opts: { nowMs?: number; lifetimeS?: number; claims?: Record<string, unknown> } = {}): string {
  const iat = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const claims = { user: MOCK_USERNAME, exp: iat + (opts.lifetimeS ?? 86_400), iat, jti: hex(6), ...opts.claims };
  return `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(claims)}.c2lnbmF0dXJl`;
}

export interface RecordedFetch {
  url: string;
  method: string;
  /** Lowercase header names. */
  headers: Record<string, string>;
  /** A string body as sent ("" for none). */
  body: string;
}

export type FetchResponder = (req: RecordedFetch, index: number) => Response | Promise<Response>;

/** A fetch that records every request and answers with the responder (which may throw). */
export function scriptedFetch(responder: FetchResponder): { fetch: typeof fetch; requests: RecordedFetch[] } {
  const requests: RecordedFetch[] = [];
  const fn = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    const body = typeof init.body === "string" ? init.body : init.body instanceof Uint8Array ? Buffer.from(init.body).toString("utf8") : "";
    const req: RecordedFetch = { url: String(input), method: (init.method ?? "GET").toUpperCase(), headers, body };
    requests.push(req);
    return responder(req, requests.length - 1);
  };
  return { fetch: fn as typeof fetch, requests };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** A token endpoint success. */
export function tokenResponse(accessToken: string, refreshToken?: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ access_token: accessToken, token_type: "bearer", ...(refreshToken ? { refresh_token: refreshToken } : {}), expires_in: 86_400, scope: "workout", ...extra });
}

/** A fetch error before anything was sent (the connection never opened). */
export function refusedError(): Error {
  return Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" }) });
}

/** A fetch error after the request may have been sent. */
export function resetError(): Error {
  return Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }) });
}

/** A fetch error of the timeout signal. */
export function timeoutError(): Error {
  return Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
}
