/**
 * The demo Suunto data: the invented sample data, the in-memory backend (it must behave like the
 * Suunto Cloud API as far as the ActivityService can tell: wire shapes, units, paging, filters,
 * extension selection, the 28-day limit of the 24/7 endpoints), FIT files, routes, POIs, and the
 * demo registry with its daily reset.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { WireExtension, WireWorkout } from "../../src/activity/types.js";
import {
  DemoActivityBackend,
  DemoActivityStore,
  DemoNotFoundError,
  DemoSuuntoError,
  MAX_WINDOW_MS,
  parseGpxRoutes,
} from "../../src/demo/activity.js";
import {
  ACTIVITY_INTERVAL_MS,
  DATA_DAYS,
  DEMO_PLACES,
  MAX_STREAM_POINTS,
  RECOVERY_INTERVAL_MS,
  STREAM_STEP_S,
  ZoneClock,
  fitCrc16,
  haversine,
  monthOfDay,
} from "../../src/demo/activity-data.js";
import {
  DEMO_ADDRESS,
  DEMO_NAME,
  DEMO_NOTICE,
  DEMO_TIME_ZONE,
  DEMO_USERNAME,
  DemoRegistry,
  lastDemoReset,
  nextDemoReset,
} from "../../src/demo/index.js";
import { tzOffsetMinutes } from "../../src/util/dates.js";
import { NotFoundError } from "../../src/util/errors.js";

const NOW = Date.parse("2026-11-10T12:00:00Z");
const TZ = "Europe/Zurich";
const DAY = 86_400_000;
const zone = new ZoneClock(TZ);

// Making the sample data takes about 0.1 s: the read-only tests share one store.
let store: DemoActivityStore;
let backend: DemoActivityBackend;
let all: WireWorkout[];

async function listAll(b: DemoActivityBackend, byModificationTime = false): Promise<WireWorkout[]> {
  const out: WireWorkout[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await b.listWorkouts({ since: 0, limit: 100, offset, byModificationTime });
    out.push(...page.payload);
    if (page.payload.length < 100) return out;
  }
}

beforeAll(async () => {
  store = new DemoActivityStore({ now: () => NOW, timeZone: TZ });
  backend = new DemoActivityBackend(store);
  all = await listAll(backend);
});

afterEach(() => {
  vi.useRealTimers();
});

async function expectStatus(promise: Promise<unknown>, status: number, message?: RegExp): Promise<Error> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  expect((error as { status?: number }).status).toBe(status);
  if (message) expect((error as Error).message).toMatch(message);
  return error as Error;
}

const ext = (w: WireWorkout, type: string): WireExtension | undefined => w.extensions?.find((e) => e.type === type);
const byActivity = (id: number) => all.filter((w) => w.activityId === id);
const localDay = (ms: number) => zone.day(ms);
const localMinute = (ms: number) => zone.minuteOfDay(ms);

// ---------------------------------------------------------------------------------------------

describe("sample workouts", () => {
  it("cover about 120 days before now, 4 to 6 a week, none in the future", () => {
    expect(all.length).toBeGreaterThan(70);
    const today = localDay(NOW);
    for (const w of all) {
      expect(localDay(w.startTime!)).toBeGreaterThanOrEqual(today - DATA_DAYS);
      expect(w.stopTime!).toBeLessThanOrEqual(NOW);
      expect(w.created!).toBeLessThanOrEqual(NOW);
    }
    expect(Math.min(...all.map((w) => localDay(w.startTime!)))).toBeLessThanOrEqual(today - DATA_DAYS + 3);
    // Whole weeks inside the window (Monday to Sunday).
    const weeks = new Map<number, number>();
    for (const w of all) {
      const day = localDay(w.startTime!);
      const monday = day - ((new Date(day * DAY).getUTCDay() + 6) % 7);
      weeks.set(monday, (weeks.get(monday) ?? 0) + 1);
    }
    const full = [...weeks].filter(([monday]) => monday > today - DATA_DAYS && monday + 6 < today).map(([, n]) => n);
    expect(full.length).toBeGreaterThanOrEqual(15);
    // The dive Saturday has two workouts: that week can have one more.
    for (const n of full) expect(n).toBeGreaterThanOrEqual(4);
    for (const n of full) expect(n).toBeLessThanOrEqual(7);
    expect(full.filter((n) => n <= 6).length).toBeGreaterThanOrEqual(full.length - 1);
  });

  it("mix running, trail running, cycling, hiking, swimming, strength and two scuba dives", () => {
    const ids = new Set(all.map((w) => w.activityId));
    for (const id of [1, 22, 2, 11, 21, 23, 78]) expect(ids).toContain(id);
    const dives = byActivity(78);
    expect(dives).toHaveLength(2);
    expect(localDay(dives[0]!.startTime!)).toBe(localDay(dives[1]!.startTime!));
    expect(new Date(localDay(dives[0]!.startTime!) * DAY).getUTCDay()).toBe(6); // a Saturday
    // Runs include intervals and long runs.
    const runs = byActivity(1);
    expect(runs.some((w) => /Intervals/.test(w.workoutName ?? ""))).toBe(true);
    expect(Math.max(...runs.map((w) => w.totalTime!))).toBeGreaterThan(80 * 60);
    // Hikes climb.
    for (const h of byActivity(11)) expect(h.totalAscent!).toBeGreaterThan(400);
  });

  it("swim in open water only in summer and ski only in winter", async () => {
    for (const w of byActivity(85)) expect([6, 7, 8, 9]).toContain(monthOfDay(localDay(w.startTime!)));
    expect(byActivity(3)).toHaveLength(0);
    const winter = new DemoActivityStore({ now: () => Date.parse("2027-02-20T12:00:00Z"), timeZone: TZ });
    const list = await listAll(new DemoActivityBackend(winter));
    const skis = list.filter((w) => w.activityId === 3);
    expect(skis.length).toBeGreaterThan(3);
    for (const w of skis) expect([12, 1, 2, 3]).toContain(monthOfDay(localDay(w.startTime!)));
    for (const w of list.filter((w) => w.activityId === 85)) expect([6, 7, 8, 9]).toContain(monthOfDay(localDay(w.startTime!)));
  });

  it("use the wire units of the Suunto API", () => {
    for (const w of all) {
      expect(w.workoutKey).toMatch(/^[0-9a-f]{24}$/);
      // Epoch milliseconds, and the offset of Europe/Zurich at the end of the workout.
      expect(w.startTime!).toBeGreaterThan(1e12);
      expect(w.stopTime!).toBeGreaterThan(w.startTime!);
      expect(w.timeOffsetInMinutes).toBe(tzOffsetMinutes(new Date(w.stopTime!), TZ));
      // totalTime in seconds, without pauses.
      expect(w.totalTime!).toBeGreaterThan(20 * 60);
      expect(w.totalTime!).toBeLessThan(6 * 3600);
      expect(w.stopTime! - w.startTime!).toBeGreaterThanOrEqual(Math.floor(w.totalTime! * 1000) - 1);
      if (typeof w.totalDistance === "number") {
        // avgSpeed in m/s (3900 m in 2686 s is 1.45), avgPace in min/km.
        expect(w.avgSpeed!).toBeCloseTo(w.totalDistance / w.totalTime!, 2);
        expect(w.avgPace!).toBeCloseTo(w.totalTime! / 60 / (w.totalDistance / 1000), 1);
        expect(w.maxSpeed!).toBeGreaterThanOrEqual(w.avgSpeed! - 0.01);
      }
      expect(Number.isInteger(w.energyConsumption)).toBe(true);
      expect(w.energyConsumption!).toBeGreaterThan(100);
      expect(w.energyConsumption!).toBeLessThan(4000);
      const hr = w.hrdata!;
      expect(hr.workoutAvgHR!).toBeGreaterThan(60);
      expect(hr.workoutAvgHR!).toBeLessThanOrEqual(hr.workoutMaxHR!);
      expect(hr.workoutMaxHR!).toBeLessThanOrEqual(188);
      expect(hr.userMaxHR).toBe(188);
      const summary = ext(w, "SummaryExtension")!;
      expect(w.extensions).toHaveLength(1);
      // Kelvin and Hz, as in Suunto's example (avgTemperature 302.45, avgCadence 0.98).
      expect(summary.avgTemperature as number).toBeGreaterThan(260);
      expect(summary.avgTemperature as number).toBeLessThan(320);
      if (summary.avgCadence !== null) {
        expect(summary.avgCadence as number).toBeLessThan(4);
        // The workout's own cadence is per minute.
        expect(typeof w.cadence === "object" && w.cadence ? w.cadence.avg : 0).toBeCloseTo((summary.avgCadence as number) * 60, -1);
      }
      if (w.startPosition) {
        // x is the longitude, y the latitude.
        expect(w.startPosition.x!).toBeGreaterThan(8);
        expect(w.startPosition.x!).toBeLessThan(9);
        expect(w.startPosition.y!).toBeGreaterThan(46);
        expect(w.startPosition.y!).toBeLessThan(48);
      }
    }
    const runs = byActivity(1);
    for (const r of runs) {
      expect(r.avgSpeed!).toBeGreaterThan(2.4);
      expect(r.avgSpeed!).toBeLessThan(4.5);
    }
  });

  it("are deterministic and keyed by the calendar day", async () => {
    const twin = new DemoActivityStore({ now: () => NOW, timeZone: TZ });
    expect(await listAll(new DemoActivityBackend(twin))).toEqual(all);
    const from = NOW - 60 * DAY;
    expect(await new DemoActivityBackend(twin).activitySamples(from, from + 10 * DAY)).toEqual(await backend.activitySamples(from, from + 10 * DAY));
    // One day later: the same workouts on the same days (the dive Saturday moves with the reset).
    const later = new DemoActivityStore({ now: () => NOW + DAY, timeZone: TZ });
    const old = (list: WireWorkout[]) => list.filter((w) => w.startTime! < NOW - 40 * DAY && w.startTime! > NOW - 110 * DAY);
    expect(old(await listAll(new DemoActivityBackend(later)))).toEqual(old(all));
  });

  it("are hidden until they have been synced after they ended", async () => {
    let now = NOW;
    const s = new DemoActivityStore({ now: () => now, timeZone: TZ });
    const b = new DemoActivityBackend(s);
    const w = s.workouts.at(-3)!;
    now = w.createdMs - 1;
    expect((await listAll(b)).some((x) => x.workoutKey === w.key)).toBe(false);
    await expectStatus(b.getWorkout(w.key, []), 404);
    now = w.createdMs;
    expect((await listAll(b)).some((x) => x.workoutKey === w.key)).toBe(true);
    expect((await b.getWorkout(w.key, [])).workoutKey).toBe(w.key);
  });
});

// ---------------------------------------------------------------------------------------------

describe("the workout list (GET /v3/workouts)", () => {
  it("answers with the envelope, newest first, and pages with limit and offset", async () => {
    const page = await backend.listWorkouts({ since: 0, limit: 10, offset: 0, byModificationTime: false });
    expect(page.error).toBeNull();
    expect(page.metadata?.workoutcount).toBe("10");
    expect(page.metadata?.until).toBe(String(NOW));
    const next = await backend.listWorkouts({ since: 0, limit: 10, offset: 10, byModificationTime: false });
    expect([...page.payload, ...next.payload]).toEqual(all.slice(0, 20));
    const starts = all.map((w) => w.startTime!);
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
    const tail = await backend.listWorkouts({ since: 0, limit: 100, offset: all.length - 2, byModificationTime: false });
    expect(tail.payload).toHaveLength(2);
  });

  it("filters on the start time with since inclusive and until exclusive", async () => {
    const pivot = all[5]!.startTime!;
    const since = await backend.listWorkouts({ since: pivot, limit: 100, offset: 0, byModificationTime: false });
    expect(since.payload.map((w) => w.workoutKey)).toEqual(all.slice(0, 6).map((w) => w.workoutKey));
    const until = await backend.listWorkouts({ since: 0, until: pivot, limit: 100, offset: 0, byModificationTime: false });
    expect(until.payload[0]!.workoutKey).toBe(all[6]!.workoutKey);
    const none = await backend.listWorkouts({ since: NOW - 30 * DAY, until: NOW - 30 * DAY, limit: 10, offset: 0, byModificationTime: false });
    expect(none.payload).toEqual([]);
  });

  it("filters on the modification time when asked", async () => {
    const edited = all.filter((w) => w.isEdited === true);
    expect(edited.length).toBeGreaterThan(0);
    const w = edited[0]!;
    expect(w.lastModified!).toBeGreaterThan(w.created!);
    const q = { since: w.lastModified!, until: w.lastModified! + 1, limit: 10, offset: 0 };
    expect((await backend.listWorkouts({ ...q, byModificationTime: true })).payload.map((x) => x.workoutKey)).toEqual([w.workoutKey]);
    expect((await backend.listWorkouts({ ...q, byModificationTime: false })).payload).toEqual([]);
    const byModification = await listAll(backend, true);
    const mods = byModification.map((x) => x.lastModified!);
    expect(mods).toEqual([...mods].sort((a, b) => b - a));
  });

  it("refuses a bad page like Suunto (HTTP 400)", async () => {
    await expectStatus(backend.listWorkouts({ limit: 0, offset: 0, byModificationTime: false }), 400);
    await expectStatus(backend.listWorkouts({ limit: 10, offset: -1, byModificationTime: false }), 400);
  });
});

// ---------------------------------------------------------------------------------------------

describe("one workout (GET /v3/workouts/{key})", () => {
  const runKey = () => byActivity(1)[0]!.workoutKey!;
  const rideKey = () => byActivity(2)[0]!.workoutKey!;

  it("returns only the extensions asked for, in that order", async () => {
    const w = await backend.getWorkout(runKey(), ["HeartrateStreamExtension", "SummaryExtension", "PowerStreamExtension", "DiveHeaderExtension"]);
    expect(w.extensions!.map((e) => e.type)).toEqual(["HeartrateStreamExtension", "SummaryExtension"]);
    const plain = await backend.getWorkout(runKey(), []);
    expect(plain.extensions!.map((e) => e.type)).toEqual(["SummaryExtension"]);
    // A copy: changing it changes nothing in the store.
    plain.totalTime = 1;
    expect((await backend.getWorkout(runKey(), [])).totalTime).not.toBe(1);
  });

  it("refuses an unknown extension name with HTTP 400, like Suunto", async () => {
    await expectStatus(backend.getWorkout(runKey(), ["SummaryExtension", "HeartRateStreamExtension"]), 400, /HeartRateStreamExtension/);
  });

  it("has streams every 10 seconds with the API's units", async () => {
    const key = rideKey();
    const summary = all.find((w) => w.workoutKey === key)!;
    const names = [
      "HeartrateStreamExtension",
      "SpeedStreamExtension",
      "AltitudeStreamExtension",
      "CadenceStreamExtension",
      "PowerStreamExtension",
      "TemperatureStreamExtension",
      "DistanceDeltaStreamExtension",
      "LocationStreamExtension",
      "IntensityExtension",
      "WeatherExtension",
      "FitnessExtension",
    ];
    const w = await backend.getWorkout(key, names);
    expect(w.extensions!.map((e) => e.type)).toEqual(names);
    type Point = { timestamp: number; value: number };
    const points = (type: string) => (ext(w, type)!.points as Point[]) ?? [];
    const hr = points("HeartrateStreamExtension");
    expect(hr.length).toBeLessThanOrEqual(MAX_STREAM_POINTS);
    expect(hr[0]!.timestamp).toBe(summary.startTime);
    expect(hr.at(-1)!.timestamp).toBe(summary.stopTime);
    expect(hr[1]!.timestamp - hr[0]!.timestamp).toBe(STREAM_STEP_S * 1000);
    for (const p of hr) {
      expect(p.value).toBeGreaterThanOrEqual(60);
      expect(p.value).toBeLessThanOrEqual(188);
    }
    expect(Math.max(...hr.map((p) => p.value))).toBe(summary.hrdata!.workoutMaxHR);
    // m/s, metres, Hz, W, kelvin.
    expect(Math.max(...points("SpeedStreamExtension").map((p) => p.value))).toBeCloseTo(summary.maxSpeed!, 1);
    expect(Math.max(...points("SpeedStreamExtension").map((p) => p.value))).toBeLessThan(25);
    expect(Math.min(...points("AltitudeStreamExtension").map((p) => p.value))).toBeCloseTo(summary.minAltitude!, 0);
    for (const p of points("CadenceStreamExtension")) expect(p.value).toBeLessThan(4);
    expect(Math.max(...points("PowerStreamExtension").map((p) => p.value))).toBeGreaterThan(100);
    for (const p of points("TemperatureStreamExtension")) expect(p.value).toBeGreaterThan(250);
    const distance = points("DistanceDeltaStreamExtension").reduce((s, p) => s + p.value, 0);
    expect(distance).toBeCloseTo(summary.totalDistance!, -1);
    const loc = ext(w, "LocationStreamExtension")!.locationPoints as Array<{ timestamp: number; latitude: number; longitude: number; altitude: number }>;
    expect(loc).toHaveLength(hr.length);
    expect(loc[0]!.latitude).toBeCloseTo(summary.startPosition!.y!, 4);
    expect(loc[0]!.longitude).toBeCloseTo(summary.startPosition!.x!, 4);
    const zones = (ext(w, "IntensityExtension")!.zones as { heartRate: Record<string, { totalTime: number }> }).heartRate;
    expect(Object.values(zones).reduce((s, z) => s + z.totalTime, 0)).toBeCloseTo(summary.totalTime!, 0);
    expect(ext(w, "WeatherExtension")!.temperature as number).toBeGreaterThan(250);
  });

  it("gives the dives a dive header and a depth stream", async () => {
    const dives = byActivity(78);
    for (const [i, d] of dives.entries()) {
      expect(d.extensionTypes).toContain("DEPTHSTREAM");
      expect(d.startPosition).toBeDefined();
      expect(d.totalDistance).toBeUndefined();
      const w = await backend.getWorkout(d.workoutKey!, ["DiveHeaderExtension", "DepthStreamExtension", "TemperatureStreamExtension"]);
      const header = ext(w, "DiveHeaderExtension")!;
      const depth = ext(w, "DepthStreamExtension")!.points as Array<{ value: number }>;
      expect(header.maxDepth as number).toBeGreaterThan(10);
      expect(header.maxDepth as number).toBeLessThan(26);
      expect(Math.max(...depth.map((p) => p.value))).toBeCloseTo(header.maxDepth as number, 1);
      expect(header.avgDepth as number).toBeLessThan(header.maxDepth as number);
      expect(header.diveTime).toBe(d.totalTime);
      expect(header.diveNumberInSeries).toBe(i === 0 ? 2 : 1); // newest first
      expect(header.maxDepthTemperature as number).toBeGreaterThan(273);
      expect(header.maxDepthTemperature as number).toBeLessThan(300);
      expect(depth[0]!.value).toBe(0);
      expect(depth.at(-1)!.value).toBe(0);
    }
  });

  it("gives a hike its summit break", async () => {
    const hike = byActivity(11)[0]!;
    expect(hike.stopTime! - hike.startTime!).toBeGreaterThan(hike.totalTime! * 1000 + 20 * 60_000);
    const w = await backend.getWorkout(hike.workoutKey!, ["PauseMarkerExtension"]);
    const markers = ext(w, "PauseMarkerExtension")!.pauseMarkers as Array<{ startTime: number; endTime: number }>;
    expect(markers).toHaveLength(1);
    expect(markers[0]!.endTime - markers[0]!.startTime).toBeCloseTo(hike.stopTime! - hike.startTime! - hike.totalTime! * 1000, -2);
  });

  it("answers wrong keys like Suunto: 500 for a malformed key, 404 for an unknown one", async () => {
    await expectStatus(backend.getWorkout("not-a-key", []), 500, /check the key/);
    const error = await expectStatus(backend.getWorkout("0123456789abcdef01234567", []), 404);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).toBeInstanceOf(DemoNotFoundError);
    await expectStatus(backend.exportFit("0123456789abcdef01234567"), 404);
  });
});

// ---------------------------------------------------------------------------------------------

/** Walk the records of a FIT file: definitions, then data messages that follow them. */
function walkFit(buf: Buffer): Array<{ global: number; fields: Map<number, Buffer> }> {
  const headerSize = buf[0]!;
  const end = headerSize + buf.readUInt32LE(4);
  const defs = new Map<number, { global: number; fields: Array<{ num: number; size: number }> }>();
  const out: Array<{ global: number; fields: Map<number, Buffer> }> = [];
  let at = headerSize;
  while (at < end) {
    const header = buf[at++]!;
    expect(header & 0x80).toBe(0); // normal headers only
    const local = header & 0x0f;
    if (header & 0x40) {
      at++; // reserved
      expect(buf[at++]).toBe(0); // little endian
      const global = buf.readUInt16LE(at);
      at += 2;
      const n = buf[at++]!;
      const fields: Array<{ num: number; size: number }> = [];
      for (let i = 0; i < n; i++, at += 3) fields.push({ num: buf[at]!, size: buf[at + 1]! });
      defs.set(local, { global, fields });
    } else {
      const def = defs.get(local);
      expect(def).toBeDefined();
      const fields = new Map<number, Buffer>();
      for (const f of def!.fields) {
        fields.set(f.num, buf.subarray(at, at + f.size));
        at += f.size;
      }
      out.push({ global: def!.global, fields });
    }
  }
  expect(at).toBe(end);
  return out;
}

describe("FIT export", () => {
  it("uses the CRC-16 of the FIT protocol", () => {
    // The FIT CRC is CRC-16/ARC: the standard check value of "123456789" is 0xBB3D.
    expect(fitCrc16(Buffer.from("123456789", "ascii"))).toBe(0xbb3d);
    expect(fitCrc16(Buffer.alloc(0))).toBe(0);
  });

  it("is a valid FIT file: 14-byte header, .FIT, both CRCs, file_id, records, session", async () => {
    for (const summary of [byActivity(1)[0]!, byActivity(78)[0]!, byActivity(23)[0]!]) {
      const fit = await backend.exportFit(summary.workoutKey!);
      expect(fit[0]).toBe(14);
      expect(fit.readUInt32LE(4)).toBe(fit.length - 16);
      expect(fit.subarray(8, 12).toString("ascii")).toBe(".FIT");
      expect(fit.readUInt16LE(12)).toBe(fitCrc16(fit.subarray(0, 12)));
      expect(fit.readUInt16LE(fit.length - 2)).toBe(fitCrc16(fit.subarray(0, fit.length - 2)));
      // The CRC over a whole file, its CRC included, is 0.
      expect(fitCrc16(fit)).toBe(0);

      const messages = walkFit(fit);
      expect(messages[0]!.global).toBe(0); // file_id first
      expect(messages[0]!.fields.get(0)![0]).toBe(4); // type: activity
      const records = messages.filter((m) => m.global === 20);
      expect(records.length).toBeGreaterThan(2);
      expect(records.length).toBeLessThanOrEqual(30);
      const times = records.map((r) => r.fields.get(253)!.readUInt32LE(0));
      expect(times).toEqual([...times].sort((a, b) => a - b));
      // FIT time: seconds since 1989-12-31T00:00:00Z.
      expect(times[0]).toBe(Math.floor(summary.startTime! / 1000) - 631_065_600);
      const sessions = messages.filter((m) => m.global === 18);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]!.fields.get(8)!.readUInt32LE(0)).toBe(Math.round(summary.totalTime! * 1000));
      expect(sessions[0]!.fields.get(16)![0]).toBe(summary.hrdata!.workoutAvgHR);
      expect(messages.filter((m) => m.global === 34)).toHaveLength(1);
    }
  });
});

// ---------------------------------------------------------------------------------------------

describe("24/7 data (/247samples)", () => {
  it("has activity samples every 10 minutes, in UTC, with the API's units", async () => {
    const samples = await backend.activitySamples(NOW - 3 * DAY, NOW);
    expect(samples.length).toBeGreaterThan(3 * 144 - 30);
    let last = 0;
    for (const s of samples) {
      expect(s.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
      const t = Date.parse(s.timestamp);
      expect(t % ACTIVITY_INTERVAL_MS).toBe(0);
      expect(t).toBeGreaterThan(last);
      last = t;
      const e = s.entryData;
      expect(Number.isInteger(e.StepCount)).toBe(true);
      // Joules per 10 minutes: about 49 kJ at rest, much more in a workout.
      expect(e.EnergyConsumption!).toBeGreaterThan(40_000);
      expect(e.EnergyConsumption!).toBeLessThan(1_000_000);
      expect(e.HR!).toBeGreaterThan(35);
      expect(e.HR!).toBeLessThan(190);
      expect(e.HRExt!.Min!).toBeLessThanOrEqual(e.HR!);
      expect(e.HRExt!.Max!).toBeGreaterThanOrEqual(e.HR!);
      if (e.SpO2 !== undefined) {
        expect(e.SpO2).toBeGreaterThanOrEqual(0.94);
        expect(e.SpO2).toBeLessThanOrEqual(0.99);
      }
      if (e.HRV !== undefined) expect(e.HRV).toBeGreaterThan(20);
      expect(e.Altitude!).toBeGreaterThan(300);
    }
    // Only complete samples, up to now.
    expect(last + ACTIVITY_INTERVAL_MS).toBeLessThanOrEqual(NOW);
    expect(samples.some((s) => s.entryData.SpO2 !== undefined)).toBe(true);
    expect(samples.some((s) => s.entryData.HRV !== undefined)).toBe(true);
  });

  it("has no data before the first day or after now", async () => {
    expect(await backend.activitySamples(NOW - 200 * DAY, NOW - 180 * DAY)).toEqual([]);
    expect(await backend.activitySamples(NOW, NOW + 5 * DAY)).toEqual([]);
    expect(await backend.sleep(NOW - 200 * DAY, NOW - 180 * DAY)).toEqual([]);
    expect(await backend.recovery(NOW + DAY, NOW + 2 * DAY)).toEqual([]);
  });

  it("refuses windows longer than 28 days with HTTP 400, like Suunto", async () => {
    const from = NOW - 40 * DAY;
    await expectStatus(backend.activitySamples(from, from + MAX_WINDOW_MS + 1), 400, /28 days/);
    await expectStatus(backend.sleep(from, from + 29 * DAY), 400);
    await expectStatus(backend.recovery(from, from + 29 * DAY), 400);
    await expectStatus(backend.dailyStatistics("2026-09-01T00:00:00", "2026-09-30T00:00:00"), 400);
    await expectStatus(backend.activitySamples(from, from - 1), 400);
    await expectStatus(backend.dailyStatistics("2026-09-01", "2026-09-02T00:00:00"), 400);
    // Exactly 28 days is fine.
    expect((await backend.activitySamples(from, from + MAX_WINDOW_MS)).length).toBeGreaterThan(27 * 144);
    expect((await backend.dailyStatistics("2026-09-01T00:00:00", "2026-09-28T23:59:59")).length).toBe(2);
  });

  it("answers a 28-day request in less than 50 ms", async () => {
    const from = NOW - 28 * DAY;
    await backend.activitySamples(from, NOW);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const samples = await backend.activitySamples(from, NOW);
      best = Math.min(best, performance.now() - t0);
      expect(samples.length).toBeGreaterThan(27 * 144);
    }
    expect(best).toBeLessThan(50);
    // The window crosses the end of summer time (25 October): no gaps but the charging breaks.
    const times = (await backend.activitySamples(from, NOW)).map((s) => Date.parse(s.timestamp));
    for (let i = 1; i < times.length; i++) {
      const step = times[i]! - times[i - 1]!;
      expect(step % ACTIVITY_INTERVAL_MS).toBe(0);
      expect(step).toBeLessThanOrEqual(6 * ACTIVITY_INTERVAL_MS);
    }
  });

  it("sleeps every night, with deep, light and REM sleep, and naps sometimes", async () => {
    const nights = (await backend.sleep(NOW - 28 * DAY, NOW)).filter((s) => !s.entryData.IsNap);
    expect(nights.length).toBeGreaterThanOrEqual(27);
    expect(nights.length).toBeLessThanOrEqual(29);
    for (const n of nights) {
      const e = n.entryData;
      expect(n.timestamp).toBe(e.BedtimeStart);
      expect(n.timestamp).toMatch(/Z$/);
      const start = Date.parse(e.BedtimeStart!);
      const end = Date.parse(e.BedtimeEnd!);
      expect(end).toBeLessThanOrEqual(NOW);
      expect(e.Duration).toBe(Math.round((end - start) / 1000));
      expect(e.DeepSleepDuration! + e.LightSleepDuration! + e.REMSleepDuration!).toBeLessThan(e.Duration!);
      expect(e.DeepSleepDuration!).toBeGreaterThan(0);
      expect(e.REMSleepDuration!).toBeGreaterThan(0);
      const bed = localMinute(start);
      expect(bed >= 22 * 60 || bed < 60).toBe(true);
      expect(localMinute(end)).toBeGreaterThanOrEqual(5 * 60);
      expect(localMinute(end)).toBeLessThan(9 * 60);
      expect(e.HRMin!).toBeLessThan(e.HRAvg!);
      expect(e.MaxSpo2!).toBeGreaterThanOrEqual(0.94);
      expect(e.MaxSpo2!).toBeLessThanOrEqual(1);
      expect(e.SleepQualityScore!).toBeGreaterThanOrEqual(0);
      expect(e.SleepQualityScore!).toBeLessThanOrEqual(100);
      expect([1, 2, 3, 4, 5]).toContain(e.Feeling);
    }
    // Over the whole 120 days (in 28-day requests) there are naps.
    const naps = [];
    for (let from = NOW - DATA_DAYS * DAY; from < NOW; from += 28 * DAY) naps.push(...(await backend.sleep(from, Math.min(NOW, from + 28 * DAY))).filter((s) => s.entryData.IsNap));
    expect(naps.length).toBeGreaterThan(0);
    for (const nap of naps) expect(nap.entryData.Duration!).toBeLessThan(3600);
  });

  it("matches the night in the activity samples: no steps, low heart rate, HRV", async () => {
    const night = (await backend.sleep(NOW - 3 * DAY, NOW)).find((s) => !s.entryData.IsNap)!;
    const start = Date.parse(night.entryData.BedtimeStart!);
    const end = Date.parse(night.entryData.BedtimeEnd!);
    const inside = await backend.activitySamples(start + 10 * 60_000, end - 20 * 60_000);
    expect(inside.length).toBeGreaterThan(30);
    for (const s of inside) {
      expect(s.entryData.StepCount).toBe(0);
      expect(s.entryData.HR!).toBeLessThan(70);
      expect(s.entryData.HRV).toBeDefined();
    }
  });

  it("has recovery every 30 minutes: it falls with a hard workout and rises at night", async () => {
    const from = NOW - 28 * DAY;
    const rec = await backend.recovery(from, NOW);
    expect(rec.length).toBeGreaterThan(27 * 48);
    const at = new Map(rec.map((r) => [Date.parse(r.timestamp), r.entryData]));
    for (const [t, e] of at) {
      expect(t % RECOVERY_INTERVAL_MS).toBe(0);
      expect(e.Balance!).toBeGreaterThanOrEqual(0);
      expect(e.Balance!).toBeLessThanOrEqual(1);
      expect([0, 1, 2, 3]).toContain(e.StressState);
    }
    const slot = (ms: number, after: boolean) => (after ? Math.ceil(ms / RECOVERY_INTERVAL_MS) : Math.floor(ms / RECOVERY_INTERVAL_MS)) * RECOVERY_INTERVAL_MS;
    const recent = all.filter((w) => w.startTime! > from + DAY);
    const hardest = recent.reduce((a, b) => (b.recoveryTime! > a.recoveryTime! ? b : a));
    const before = at.get(slot(hardest.startTime!, false))!;
    const after = at.get(slot(hardest.stopTime!, true))!;
    expect(before.Balance! - after.Balance!).toBeGreaterThan(0.1);
    expect(at.get(slot(hardest.startTime! + 20 * 60_000, true))!.StressState).toBe(2);
    for (const night of (await backend.sleep(from, NOW - DAY)).filter((s) => !s.entryData.IsNap)) {
      const bed = at.get(slot(Date.parse(night.entryData.BedtimeStart!), true));
      const wake = at.get(slot(Date.parse(night.entryData.BedtimeEnd!), false));
      if (!bed || !wake) continue;
      expect(wake.Balance!).toBeGreaterThan(bed.Balance!);
      expect(bed.StressState).toBe(1);
    }
  });

  it("has daily statistics that match the activity samples", async () => {
    // Seven local days, as the service asks: from local midnight, written in UTC without an offset.
    const firstDay = localDay(NOW) - 8;
    const start = zone.instant(firstDay, 0);
    const end = zone.instant(firstDay + 7, 0) - 1000;
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
    const stats = await backend.dailyStatistics(iso(start), iso(end));
    expect(stats.map((s) => s.Name)).toEqual(["energyconsumption", "stepcount"]);
    const samples = await backend.activitySamples(start, end + 1000);
    for (const stat of stats) {
      expect(stat.Aggregation).toBe("sum");
      const values = stat.Sources![0]!.Samples!;
      expect(values).toHaveLength(7);
      values.forEach((v, k) => {
        expect(v.TimeISO8601).toBe(new Date(start + k * DAY).toISOString().slice(0, 23));
        const inDay = samples.filter((s) => Math.floor((Date.parse(s.timestamp) - start) / DAY) === k);
        const field = stat.Name === "stepcount" ? "StepCount" : "EnergyConsumption";
        const sum = inDay.reduce((a, s) => a + (s.entryData[field] as number), 0);
        expect(v.Value!).toBeCloseTo(sum, 0);
      });
    }
    const steps = stats[1]!.Sources![0]!.Samples!.map((s) => s.Value!);
    for (const n of steps) {
      expect(n).toBeGreaterThan(4000);
      expect(n).toBeLessThan(50_000);
    }
    // Before the first day of data: null.
    const early = await backend.dailyStatistics(iso(NOW - 125 * DAY), iso(NOW - 118 * DAY));
    expect(early[0]!.Sources![0]!.Samples![0]!.Value).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test">
  <metadata><name>Copper Hill &amp; back</name><author><name>someone</name></author></metadata>
  <rte>
    <rtept lat="46.95" lon="8.40"><ele>450</ele><name>Start</name><type>Begin</type></rtept>
    <rtept lat="46.955" lon="8.405"><ele>480.5</ele></rtept>
    <rtept lat="46.96" lon="8.41"><elevation>520</elevation><name>Copper Hill top</name><type>Peak</type></rtept>
  </rte>
</gpx>`;

describe("routes (/v2/route)", () => {
  it("lists the 4 sample routes in pages, sorted by modification time, with since", async () => {
    const desc = await backend.listRoutes({ page: 0, size: 5, sort: "desc" });
    expect(desc.map((r) => r.description)).toHaveLength(4);
    expect(new Set(desc.map((r) => r.description))).toEqual(new Set(["Lake Serein loop", "Pine Ridge trail", "Valmora Pass ride", "Larch Valley ski track"]));
    const mods = desc.map((r) => r.modified!);
    expect(mods).toEqual([...mods].sort((a, b) => b - a));
    const asc = await backend.listRoutes({ page: 0, size: 5, sort: "asc" });
    expect(asc).toEqual([...desc].reverse());
    const page1 = await backend.listRoutes({ page: 1, size: 3, sort: "desc" });
    expect(page1).toEqual(desc.slice(3));
    const since = await backend.listRoutes({ page: 0, size: 5, sort: "desc", since: desc[1]!.modified! });
    expect(since).toEqual(desc.slice(0, 2));
    for (const r of desc) {
      expect(r.id).toMatch(/^[0-9a-f]{24}$/);
      expect(r.created!).toBeLessThan(NOW);
      expect(r.totalDistance!).toBeGreaterThan(5000);
      expect(r.activityIds!.length).toBeGreaterThan(0);
      expect(r.startPoint!.latitude).toBeGreaterThan(46);
    }
    await expectStatus(backend.listRoutes({ page: -1, size: 5, sort: "asc" }), 400);
  });

  it("exports GPX like Suunto's export", async () => {
    const route = (await backend.listRoutes({ page: 0, size: 5, sort: "asc" })).find((r) => r.description === "Pine Ridge trail")!;
    const gpx = await backend.exportRouteGpx(route.id);
    expect(gpx).toContain('creator="Suunto app"');
    expect(gpx).toContain(`<suunto:id>${route.id}</suunto:id>`);
    expect(gpx).toContain(`<author><name>${DEMO_USERNAME}</name></author>`);
    expect(gpx).toContain("<suunto:activityId>11</suunto:activityId><suunto:activityId>22</suunto:activityId>");
    expect(gpx).toContain("<suunto:name>Pine Ridge summit</suunto:name><suunto:type>Peak</suunto:type>");
    const [parsed] = parseGpxRoutes(gpx);
    expect(parsed!.name).toBe("Pine Ridge trail");
    let length = 0;
    for (let i = 1; i < parsed!.points.length; i++) length += haversine(parsed!.points[i - 1]!, parsed!.points[i]!);
    expect(length).toBeCloseTo(route.totalDistance!, -1);
    await expectStatus(backend.exportRouteGpx("0123456789abcdef01234567"), 404);
    await expectStatus(backend.getRoute("0123456789abcdef01234567"), 404);
  });

  it("imports a GPX route and exports it again (round trip)", async () => {
    const s = new DemoActivityStore({ now: () => NOW, timeZone: TZ });
    const b = new DemoActivityBackend(s);
    const route = (await b.importRouteGpx(GPX, [11]))!;
    expect(route.id).toMatch(/^[0-9a-f]{24}$/);
    expect(route.description).toBe("Copper Hill & back");
    expect(route.activityIds).toEqual([11]);
    expect(route.created).toBe(NOW);
    expect(route.watchEnabled).toBe(true);
    expect(route.startPoint).toEqual({ altitude: 450, latitude: 46.95, longitude: 8.4 });
    expect(route.totalDistance).toBe(Math.round(haversine({ lat: 46.95, lon: 8.4 }, { lat: 46.955, lon: 8.405 }) + haversine({ lat: 46.955, lon: 8.405 }, { lat: 46.96, lon: 8.41 })));
    expect(await b.getRoute(route.id)).toEqual(route);
    expect((await b.listRoutes({ page: 0, size: 10, sort: "desc" }))[0]).toEqual(route);
    const [back] = parseGpxRoutes(await b.exportRouteGpx(route.id));
    expect(back).toEqual({
      name: "Copper Hill & back",
      points: [
        { lat: 46.95, lon: 8.4, ele: 450, name: "Start", type: "Begin" },
        { lat: 46.955, lon: 8.405, ele: 480.5 },
        { lat: 46.96, lon: 8.41, ele: 520, name: "Copper Hill top", type: "Peak" },
      ],
    });
  });

  it("imports each rte and trk as its own route, for running unless told", async () => {
    const s = new DemoActivityStore({ now: () => NOW, timeZone: TZ });
    const b = new DemoActivityBackend(s);
    const gpx = `<gpx version="1.1"><trk><name>Track one</name><trkseg><trkpt lat="46.9" lon="8.3"/><trkpt lat="46.91" lon="8.31"/></trkseg></trk>
      <rte><desc>Second</desc><rtept lat="46.8" lon="8.2"/><rtept lat="46.81" lon="8.21"/></rte></gpx>`;
    const first = (await b.importRouteGpx(gpx, []))!;
    expect(first.description).toBe("Track one");
    expect(first.activityIds).toEqual([1]);
    expect(s.routes.map((r) => r.route.description).slice(-2)).toEqual(["Track one", "Second"]);
  });

  it("refuses GPX that Suunto would refuse (HTTP 400)", async () => {
    const s = new DemoActivityStore({ now: () => NOW, timeZone: TZ });
    const b = new DemoActivityBackend(s);
    await expectStatus(b.importRouteGpx("hello", [1]), 400);
    await expectStatus(b.importRouteGpx('<!DOCTYPE gpx [<!ENTITY x "y">]><gpx><rte><rtept lat="1" lon="1"/></rte></gpx>', [1]), 400);
    await expectStatus(b.importRouteGpx("<gpx><metadata><name>Empty</name></metadata></gpx>", [1]), 400);
    await expectStatus(b.importRouteGpx('<gpx><rte><rtept lat="95" lon="1"/></rte></gpx>', [1]), 400);
    await expectStatus(b.importRouteGpx(GPX, [-1]), 400);
    expect(s.routes).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------------------------

describe("points of interest (/v2/poi)", () => {
  it("lists the 5 sample POIs, newest first", async () => {
    const pois = await backend.listPois({ limit: 50, offset: 0 });
    expect(pois).toHaveLength(5);
    expect(new Set(pois.map((p) => p.pointOfInterest.point.type))).toEqual(new Set([34, 12, 3, 22, 14]));
    const created = pois.map((p) => p.pointOfInterest.creation!);
    expect(created).toEqual([...created].sort((a, b) => b - a));
    for (const { pointOfInterest: p } of pois) {
      expect(p.key).toMatch(/^[0-9a-f]{24}$/);
      // Seconds, like Suunto's example (1602074065).
      expect(p.creation!).toBeLessThan(1e11);
      expect(p.point.x).toBeGreaterThan(8); // longitude
      expect(p.point.y).toBeGreaterThan(46); // latitude
      expect(p.watchEnabled).toBe(true);
      expect(p.point.name).toBeTruthy();
    }
    expect(await backend.listPois({ limit: 2, offset: 4 })).toEqual(pois.slice(4));
  });

  it("creates a POI, and refuses what Suunto refuses", async () => {
    const s = new DemoActivityStore({ now: () => NOW, timeZone: TZ });
    const b = new DemoActivityBackend(s);
    const made = await b.createPoi({ point: { x: 8.45, y: 46.95, z: 610, name: "Quiet bench", type: 22 }, activityId: 11, watchEnabled: true });
    expect(made.pointOfInterest).toMatchObject({ creation: NOW / 1000, point: { x: 8.45, y: 46.95, z: 610, name: "Quiet bench", type: 22 }, activityId: 11, watchEnabled: true });
    expect(made.pointOfInterest.key).toMatch(/^[0-9a-f]{24}$/);
    expect((await b.listPois({ limit: 1, offset: 0 }))[0]).toEqual(made);
    const bad = (poi: unknown) => b.createPoi(poi as Parameters<typeof b.createPoi>[0]);
    await expectStatus(bad({ point: { x: 8, y: 46, name: "x", type: 22 }, watchEnabled: false }), 400, /watchEnabled/);
    await expectStatus(bad({ point: { x: 8, y: 46, name: "x", type: 50 }, watchEnabled: true }), 400, /PoiType/);
    await expectStatus(bad({ point: { y: 46, name: "x", type: 22 }, watchEnabled: true }), 400);
    await expectStatus(bad({ point: { x: 200, y: 46, name: "x", type: 22 }, watchEnabled: true }), 400);
    expect(s.pois).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------------------------

describe("the demo account", () => {
  it("is Alex Demo, Suunto user alexdemo, in Europe/Zurich", async () => {
    expect(DEMO_NAME).toBe("Alex Demo");
    expect(DEMO_ADDRESS).toBe("alex.demo@example.com");
    expect(DEMO_USERNAME).toBe("alexdemo");
    expect(DEMO_TIME_ZONE).toBe("Europe/Zurich");
    expect(await backend.account()).toEqual({ username: "alexdemo" });
    expect(backend.kind).toBe("demo");
    expect(DEMO_NOTICE).toMatch(/demo account/);
    expect(DEMO_NOTICE).toMatch(/04:00 \(Europe\/Zurich\)/);
    // The writing rules: never the em dash character (U+2014).
    expect(DEMO_NOTICE.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  it("uses only invented places", () => {
    expect(Object.values(DEMO_PLACES).map((p) => p.name)).toEqual(["Lake Serein", "Pine Ridge", "Valmora", "Larch Valley", "Aster Sports Hall"]);
  });

  it("throws added routes and POIs away on reset", async () => {
    let now = NOW;
    const s = new DemoActivityStore({ now: () => now, timeZone: TZ });
    const b = new DemoActivityBackend(s);
    await b.importRouteGpx(GPX, [1]);
    await b.createPoi({ point: { x: 8.45, y: 46.95, name: "Bench", type: 22 }, watchEnabled: true });
    expect(s.routes).toHaveLength(5);
    expect(s.pois).toHaveLength(6);
    now = NOW + DAY;
    s.reset();
    expect(s.resetAt).toBe(NOW + DAY);
    expect(s.routes).toHaveLength(4);
    expect(s.pois).toHaveLength(5);
  });
});

describe("DemoRegistry", () => {
  it("finds the daily reset at 04:00 in Zurich, also across DST changes", () => {
    const iso = (d: Date) => d.toISOString();
    // Winter (UTC+1): 04:00 is 03:00 UTC.
    expect(iso(lastDemoReset(new Date("2026-11-08T13:00:00Z")))).toBe("2026-11-08T03:00:00.000Z");
    expect(iso(nextDemoReset(new Date("2026-11-08T13:00:00Z")))).toBe("2026-11-09T03:00:00.000Z");
    expect(iso(lastDemoReset(new Date("2026-11-09T02:59:59Z")))).toBe("2026-11-08T03:00:00.000Z");
    expect(iso(lastDemoReset(new Date("2026-11-09T03:00:00Z")))).toBe("2026-11-09T03:00:00.000Z");
    // Summer (UTC+2): 04:00 is 02:00 UTC.
    expect(iso(nextDemoReset(new Date("2026-07-01T12:00:00Z")))).toBe("2026-07-02T02:00:00.000Z");
    // The night the clocks go back (25 October 2026) and forward (29 March 2026).
    expect(iso(nextDemoReset(new Date("2026-10-25T00:30:00Z")))).toBe("2026-10-25T03:00:00.000Z");
    expect(iso(nextDemoReset(new Date("2026-03-29T00:30:00Z")))).toBe("2026-03-29T02:00:00.000Z");
  });

  it("resets an account on its next use once 04:00 has passed, and throws additions away", async () => {
    let now = new Date("2026-11-08T13:00:00Z");
    const registry = new DemoRegistry({ clock: () => now });
    try {
      const account = registry.account("u1");
      expect(account.generation).toBe(1);
      expect(account.activity.resetAt).toBe(now.getTime());
      await new DemoActivityBackend(account.activity).importRouteGpx(GPX, [1]);
      expect(account.activity.routes).toHaveLength(5);

      // After midnight but before 04:00: nothing changes.
      now = new Date("2026-11-08T23:30:00Z");
      expect(registry.account("u1").generation).toBe(1);
      now = new Date("2026-11-09T02:59:00Z");
      expect(registry.account("u1").generation).toBe(1);
      expect(account.activity.routes).toHaveLength(5);

      // From 04:00 the first use resets the store: fresh data, relative to the new day.
      now = new Date("2026-11-09T03:01:00Z");
      expect(registry.account("u1").generation).toBe(2);
      expect(account.activity.routes).toHaveLength(4);
      expect(registry.account("u1").resetAt).toEqual(now);
      expect(account.activity.resetAt).toBe(now.getTime());
      expect(account.activity.now()).toBe(now.getTime());
    } finally {
      registry.clear();
    }
  });

  it("resets every account with one timer that does not keep the process alive", () => {
    vi.useFakeTimers({ now: new Date("2026-11-08T13:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
    const registry = new DemoRegistry();
    try {
      const a = registry.account("a");
      const b = registry.account("b");
      a.activity.pois.push({ ...a.activity.pois[0]!, key: "added" });
      const timer = (registry as unknown as { timer: NodeJS.Timeout }).timer;
      expect(vi.getTimerCount()).toBe(1);
      expect(timer.hasRef()).toBe(false);

      vi.advanceTimersByTime(14 * 3600_000 - 1000); // 03:59:59 in Zurich
      expect(a.generation).toBe(1);
      vi.advanceTimersByTime(2000); // 04:00:01
      expect(a.generation).toBe(2);
      expect(b.generation).toBe(2);
      expect(a.activity.pois).toHaveLength(5);
      // And again the next day.
      vi.advanceTimersByTime(24 * 3600_000);
      expect(a.generation).toBe(3);

      // No accounts, no timer.
      registry.forget("a");
      registry.forget("b");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      registry.clear();
    }
  });

  it("reset() resets one account or all of them", () => {
    const registry = new DemoRegistry({ clock: () => new Date(NOW) });
    try {
      registry.account("a");
      registry.account("b");
      expect(registry.reset("a")).toBe(1);
      expect(registry.peek("a")!.generation).toBe(2);
      expect(registry.peek("b")!.generation).toBe(1);
      expect(registry.reset("unknown")).toBe(0);
      expect(registry.reset()).toBe(2);
      expect(registry.peek("b")!.generation).toBe(2);
      expect(registry.size).toBe(2);
    } finally {
      registry.clear();
    }
  });
});

describe("errors", () => {
  it("carry the HTTP status Suunto would answer with", () => {
    expect(new DemoSuuntoError(400, "x").status).toBe(400);
    expect(new DemoNotFoundError("x").status).toBe(404);
  });
});
