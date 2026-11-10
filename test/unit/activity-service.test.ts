import { describe, expect, it } from "vitest";
import { CachedBackend, SHORT_TTL_MS } from "../../src/activity/cache.js";
import { ActivityService, checkGpx, ReadOnlyError, type ListWorkoutsResult, type ServiceOptions } from "../../src/activity/service.js";
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
} from "../../src/activity/types.js";
import { DAY_MS, formatUtcNoOffset, HOUR_MS, startOfDay } from "../../src/util/dates.js";
import { NotFoundError, UserFacingError } from "../../src/util/errors.js";

// Invented test data only.
const TZ = "Europe/Zurich";
const NOW = Date.parse("2026-11-10T09:00:00Z");

interface Call {
  op: string;
  args: unknown[];
}

/** A number from a text that looks random but is always the same (for a shuffled list). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** An error like the call limiter's when the per-minute limit is reached (a short wait). */
function rateLimitError(): Error {
  return Object.assign(new UserFacingError("Suunto's call limit for this service is reached. Try again in 50 seconds."), { kind: "rate_limit", waitMs: 50_000 });
}

/** An in-memory backend that records every call and checks the API's window rules. */
class FakeBackend implements ActivityBackend {
  readonly kind = "demo" as const;
  calls: Call[] = [];
  workouts: WireWorkout[] = [];
  /**
   * The order the fake "Suunto" lists workouts in: by start time (newest or oldest first), by
   * modification time (newest first), or shuffled. The real order is not documented.
   */
  order: "desc" | "asc" | "modified" | "shuffled" = "desc";
  /** After this many workout list requests, every further one fails with the call limit. */
  rateLimitAfter?: number;
  /** The error of those requests (default: the per-minute limit). */
  rateLimit: () => Error = rateLimitError;
  activity: WireSample<WireActivityEntry>[] = [];
  sleeps: WireSample<WireSleepEntry>[] = [];
  recoveries: WireSample<WireRecoveryEntry>[] = [];
  daily: (startdate: string, enddate: string) => WireDailyStatistic[] = () => [];
  routes: WireRoute[] = [];
  pois: WirePoiEnvelope[] = [];
  importAnswer: WireRoute | undefined;
  /** Routes that appear in the list after an import that answered without a route. */
  routesAfterImport: WireRoute[] = [];
  fit = Buffer.from("FIT-DATA");
  fail?: Error;

  private record(op: string, ...args: unknown[]): void {
    this.calls.push({ op, args });
    if (this.fail) throw this.fail;
  }

  ops(op: string): Call[] {
    return this.calls.filter((c) => c.op === op);
  }

  async listWorkouts(q: ListWorkoutsQuery): Promise<WireWorkoutList> {
    this.record("listWorkouts", q);
    if (this.rateLimitAfter !== undefined && this.ops("listWorkouts").length > this.rateLimitAfter) throw this.rateLimit();
    expect(q.limit).toBeGreaterThanOrEqual(1);
    expect(q.limit).toBeLessThanOrEqual(100);
    expect(q.byModificationTime).toBe(false);
    const inRange = this.workouts.filter((w) => (q.since === undefined || w.startTime! >= q.since) && (q.until === undefined || w.startTime! < q.until));
    const sortKey = (w: WireWorkout): number => {
      if (this.order === "desc") return -w.startTime!;
      if (this.order === "asc") return w.startTime!;
      if (this.order === "modified") return -(w.lastModified ?? w.startTime!);
      return hash(w.workoutKey!);
    };
    inRange.sort((a, b) => sortKey(a) - sortKey(b));
    const payload = inRange.slice(q.offset, q.offset + q.limit);
    return { error: null, payload, metadata: { workoutcount: String(payload.length) } };
  }

  async getWorkout(key: string, extensions: readonly string[]): Promise<WireWorkout> {
    this.record("getWorkout", key, extensions);
    const w = this.workouts.find((x) => x.workoutKey === key);
    if (!w) throw new NotFoundError(`Suunto has no workout with the key ${key}.`);
    return w;
  }

  async exportFit(key: string): Promise<Buffer> {
    this.record("exportFit", key);
    return this.fit;
  }

  private window<T>(op: string, list: WireSample<T>[], fromMs: number, toMs: number): WireSample<T>[] {
    this.record(op, fromMs, toMs);
    expect(toMs - fromMs).toBeLessThanOrEqual(28 * DAY_MS);
    expect(toMs).toBeGreaterThan(fromMs);
    return list.filter((s) => {
      const t = Date.parse(s.timestamp);
      return t >= fromMs && t <= toMs;
    });
  }

  async activitySamples(fromMs: number, toMs: number) {
    return this.window("activitySamples", this.activity, fromMs, toMs);
  }

  async sleep(fromMs: number, toMs: number) {
    return this.window("sleep", this.sleeps, fromMs, toMs);
  }

  async recovery(fromMs: number, toMs: number) {
    return this.window("recovery", this.recoveries, fromMs, toMs);
  }

  async dailyStatistics(startdate: string, enddate: string): Promise<WireDailyStatistic[]> {
    this.record("dailyStatistics", startdate, enddate);
    expect(Date.parse(`${enddate}Z`) - Date.parse(`${startdate}Z`)).toBeLessThan(28 * DAY_MS);
    return this.daily(startdate, enddate);
  }

  async listRoutes(q: ListRoutesQuery): Promise<WireRoute[]> {
    this.record("listRoutes", q);
    const sorted = [...this.routes].sort((a, b) => (q.sort === "desc" ? b.created! - a.created! : a.created! - b.created!));
    const filtered = q.since === undefined ? sorted : sorted.filter((r) => (r.modified ?? 0) >= q.since!);
    return filtered.slice(q.page * q.size, (q.page + 1) * q.size);
  }

  async getRoute(id: string): Promise<WireRoute> {
    this.record("getRoute", id);
    const r = this.routes.find((x) => x.id === id);
    if (!r) throw new NotFoundError(`Suunto has no route with the id ${id}.`);
    return r;
  }

  async exportRouteGpx(id: string): Promise<string> {
    this.record("exportRouteGpx", id);
    return id === "big" ? `<gpx>${"x".repeat(1024 * 1024 + 10)}</gpx>` : `<gpx version="1.1"><rte><name>R</name></rte></gpx>`;
  }

  async importRouteGpx(gpx: string, activityIds: readonly number[]): Promise<WireRoute | undefined> {
    this.record("importRouteGpx", gpx.length, activityIds);
    this.routes.push(...this.routesAfterImport);
    return this.importAnswer;
  }

  async listPois(q: { limit: number; offset: number }): Promise<WirePoiEnvelope[]> {
    this.record("listPois", q);
    return this.pois.slice(q.offset, q.offset + q.limit);
  }

  async createPoi(poi: WirePoiInput): Promise<WirePoiEnvelope> {
    this.record("createPoi", poi);
    return { pointOfInterest: { ...poi, key: "poi-new-1", creation: 1778400000 } };
  }

  async account(): Promise<SuuntoAccount> {
    this.record("account");
    return { username: "testuser", tokenExpiresAt: "2026-11-11T09:00:00.000Z" };
  }

  async close(): Promise<void> {}
}

function service(backend: ActivityBackend, opts: Partial<ServiceOptions> = {}): ActivityService {
  return new ActivityService(backend, { readOnly: false, units: "metric", timeZone: TZ, now: () => NOW, ...opts });
}

/** A workout that starts `hoursAgo` hours before NOW. */
function workout(n: number, hoursAgo: number, activityId = 1, extra: Partial<WireWorkout> = {}): WireWorkout {
  return {
    workoutKey: `w${String(n).padStart(4, "0")}`,
    activityId,
    startTime: NOW - hoursAgo * HOUR_MS,
    timeOffsetInMinutes: 60,
    totalTime: 3600,
    totalDistance: 10_000,
    totalAscent: 100,
    energyConsumption: 600,
    hrdata: { workoutAvgHR: 140, workoutMaxHR: 170 },
    ...extra,
  };
}

const ms = (iso: string) => Date.parse(iso);

/** A workout key as Suunto writes it: 24 hex characters. */
const KEY = "5b190f5c52ce7b316acbd520";

const keys = (r: ListWorkoutsResult) => r.workouts.map((w) => w.workout_key);

/** The keys of the workouts by start time, newest first: what every page must show. */
function newestKeys(list: readonly WireWorkout[], filter: (w: WireWorkout) => boolean = () => true): string[] {
  return list
    .filter(filter)
    .sort((a, b) => b.startTime! - a.startTime!)
    .map((w) => w.workoutKey!);
}

describe("workout list", () => {
  it("asks for the last 30 local days by start time, in one request", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 30 }, (_, i) => workout(i, i * 12));
    const r = await service(b).listWorkouts({});
    expect(b.ops("listWorkouts").map((c) => c.args[0])).toEqual([
      { since: ms("2026-10-11T22:00:00Z"), until: ms("2026-11-10T23:00:00Z"), limit: 100, offset: 0, byModificationTime: false },
    ]);
    expect(r).toMatchObject({ from: "2026-10-12", to: "2026-11-10", count: 20, total_in_range: 30, next_offset: 20, units: { distance: "km" } });
    expect(r.workouts[0]!.workout_key).toBe("w0000");
    expect(r.note).toBeUndefined();
    const next = await service(b).listWorkouts({ offset: 20 });
    expect(keys(next)).toEqual(["w0020", "w0021", "w0022", "w0023", "w0024", "w0025", "w0026", "w0027", "w0028", "w0029"]);
    expect(next.total_in_range).toBe(30);
    expect(next.next_offset).toBeUndefined();
  });

  it("gives the same pages in any order of Suunto's list: by start time either way, by modification time, or none", async () => {
    // 400 workouts, 2 hours apart. Every 7th was edited lately, so by modification time old
    // workouts come before newer ones (a page can still look newest first by start time).
    const make = () => Array.from({ length: 400 }, (_, i) => workout(i, i * 2 + 1, 1, { lastModified: i % 7 === 3 ? NOW - i * 1000 : NOW - i * 2 * HOUR_MS }));
    const expected = newestKeys(make());
    for (const order of ["desc", "asc", "modified", "shuffled"] as const) {
      const b = new FakeBackend();
      b.order = order;
      b.workouts = make();
      for (const [offset, limit] of [[0, 1], [0, 4], [0, 20], [40, 10], [95, 100], [390, 20]] as const) {
        const r = await service(b).listWorkouts({ from: "2026-09-01", offset, limit });
        const what = `${order}, offset ${offset}, limit ${limit}`;
        expect(keys(r), what).toEqual(expected.slice(offset, offset + limit));
        expect(r.next_offset, what).toBe(offset + limit < 400 ? offset + limit : undefined);
        expect(r.note, what).toBeUndefined();
      }
      // A short page costs a few requests at most, never a read of the whole range.
      b.calls = [];
      await service(b).listWorkouts({ from: "2026-09-01", limit: 5 });
      expect(b.ops("listWorkouts").length, order).toBeLessThanOrEqual(3);
    }
  });

  it("shows the real newest workouts of a long range when Suunto lists oldest first", async () => {
    const b = new FakeBackend();
    b.order = "asc";
    // 1500 workouts, 29 hours apart: almost 5 years.
    b.workouts = Array.from({ length: 1500 }, (_, i) => workout(i, i * 29, i % 2 ? 2 : 1));
    const r = await service(b).listWorkouts({ from: "2020-01-01", limit: 3 });
    expect(keys(r)).toEqual(["w0000", "w0001", "w0002"]);
    expect(r).toMatchObject({ next_offset: 3 });
    expect(r.note).toBeUndefined();
    expect(b.ops("listWorkouts")).toHaveLength(1);
    const runs = await service(b).listWorkouts({ from: "2020-01-01", sport: "run", limit: 3 });
    expect(keys(runs)).toEqual(["w0000", "w0002", "w0004"]);
  });

  it("filters by sport, newest first, and pages, reading only as far back as the page needs", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 250 }, (_, i) => workout(i, i, [1, 22, 2, 11][i % 4]!));
    const r = await service(b).listWorkouts({ from: "2026-10-01", sport: "run", limit: 5, offset: 5 });
    expect(r.sport).toBe("run");
    expect(r.sports_matched).toEqual(expect.arrayContaining(["Running", "Trail running"]));
    expect(keys(r)).toEqual(["w0009", "w0012", "w0013", "w0016", "w0017"]);
    expect(r.workouts.every((w) => w.sport === "Running" || w.sport === "Trail running")).toBe(true);
    expect(r.next_offset).toBe(10);
    // Not the whole range was read, so the total is not known.
    expect(r.total_in_range).toBeUndefined();
    expect(b.ops("listWorkouts").length).toBeLessThanOrEqual(3);
    const all = await service(b).listWorkouts({ from: "2026-10-01", sport: "TRAIL RUNNING", limit: 100 });
    expect(all.total_in_range).toBe(63);
    expect(keys(all)).toEqual(newestKeys(b.workouts, (w) => w.activityId === 22));
  });

  it("stops reading as soon as the page is complete, also with a sport filter", async () => {
    const b = new FakeBackend();
    // 1100 workouts, 4 an hour.
    b.workouts = Array.from({ length: 1100 }, (_, i) => workout(i, i / 4, i % 2 ? 1 : 2));
    const r = await service(b).listWorkouts({ sport: "bike" });
    expect(keys(r)).toEqual(newestKeys(b.workouts, (w) => w.activityId === 2).slice(0, 20));
    expect(r).toMatchObject({ count: 20, next_offset: 20 });
    expect(r.note).toBeUndefined();
    expect(b.ops("listWorkouts").length).toBeLessThanOrEqual(4);
  });

  it("says which part of the range was read when the 1000 workout cap is hit, and how to read on", async () => {
    const b = new FakeBackend();
    b.order = "asc";
    // 1500 workouts, 2 hours apart; only the oldest is a dive.
    b.workouts = Array.from({ length: 1500 }, (_, i) => workout(i, i * 2, i === 1499 ? 78 : 1));
    const r = await service(b).listWorkouts({ from: "2026-01-01", sport: "dive" });
    expect(r).toMatchObject({ count: 0, workouts: [] });
    expect(r.total_in_range).toBeUndefined();
    expect(r.next_offset).toBeUndefined();
    expect(r.note).toMatch(/^Only the newest 1\d{3} workouts of this range were read \(back to 2026-\S+\), so older workouts are missing\. For older workouts, ask again with to set to 2026-\S+\.$/);
    expect(b.ops("listWorkouts").length).toBeLessThanOrEqual(15);
    const to = r.note!.match(/to set to (\S+)\.$/)![1]!;
    const older = await service(b).listWorkouts({ from: "2026-01-01", to, sport: "dive" });
    expect(keys(older)).toEqual(["w1499"]);
  });

  it("gives no next page when a page of 100 holds the last workouts of the range", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 100 }, (_, i) => workout(i, i * 6));
    const r = await service(b).listWorkouts({ limit: 100 });
    expect(r).toMatchObject({ count: 100, total_in_range: 100 });
    expect(r.next_offset).toBeUndefined();
  });

  it("keeps what was read when Suunto's call limit is reached in the middle, and says so", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 1500 }, (_, i) => workout(i, i * 2, i === 1499 ? 78 : 1));
    // The first window (60 days, 720 workouts) takes 8 requests; the next one is stopped.
    b.rateLimitAfter = 9;
    const r = await service(b).listWorkouts({ from: "2026-01-01", sport: "dive" });
    expect(r.count).toBe(0);
    // The limiter's own message, with its own wait.
    expect(r.note).toMatch(
      /^Only the workouts back to 2026-\S+ were read, and older ones are missing: Suunto's call limit for this service is reached\. Try again in 50 seconds\. For older workouts, ask again with to set to 2026-\S+\.$/,
    );
    // Nothing read yet: the error itself.
    const c = new FakeBackend();
    c.rateLimitAfter = 0;
    await expect(service(c).listWorkouts({})).rejects.toThrow(/call limit/);
  });

  it("passes a daily or weekly call limit on as an error, not as a partial answer that says to try again in a minute", async () => {
    const long = [
      // The server's daily limit per user, and Suunto's weekly quota (HTTP 403).
      Object.assign(new UserFacingError("You reached this service's daily limit of 100 Suunto requests for your account. Try again tomorrow."), {
        kind: "rate_limit",
        waitMs: 15 * HOUR_MS,
      }),
      Object.assign(new UserFacingError("Suunto's call limit for this service is reached (HTTP 403). Try again in 3 days."), { kind: "rate_limit", status: 403, waitMs: 3 * DAY_MS }),
      // Suunto's quota without a wait: not known to be short.
      Object.assign(new UserFacingError("Suunto's call limit for this service is reached (HTTP 403). Try again later."), { kind: "rate_limit", status: 403 }),
    ];
    for (const error of long) {
      const b = new FakeBackend();
      b.workouts = Array.from({ length: 1500 }, (_, i) => workout(i, i * 6));
      b.rateLimitAfter = 3;
      b.rateLimit = () => error;
      await expect(service(b).workoutStats({})).rejects.toBe(error);
      await expect(service(b).listWorkouts({ from: "2026-01-01", sport: "dive" })).rejects.toBe(error);
    }
    // Suunto's per-minute limit (429) without a wait is short: the windows read so far are kept.
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 1500 }, (_, i) => workout(i, i * 6));
    b.rateLimitAfter = 3;
    b.rateLimit = () => Object.assign(new UserFacingError("Suunto's call limit for this service is reached (HTTP 429). Try again later."), { kind: "rate_limit", status: 429 });
    const r = await service(b).workoutStats({});
    expect(r.count).toBeGreaterThan(0);
    expect(r.note).toContain("Suunto's call limit for this service is reached (HTTP 429). Try again later.");
  });

  it("reads a long range with a sport that rarely or never matches in about one request per 100 workouts", async () => {
    for (const perDay of [1, 2, 4]) {
      for (const limit of [1, 3, 20]) {
        // Newest first, no dives at all: the scan reads until the 1000 workout cap.
        const b = new FakeBackend();
        b.workouts = Array.from({ length: perDay * 7 * 365 }, (_, i) => workout(i, (i + 0.5) * (24 / perDay)));
        const r = await service(b).listWorkouts({ from: "2020-01-01", sport: "Scuba diving", limit });
        expect(r.count).toBe(0);
        expect(r.note, `${perDay}/day, limit ${limit}`).toMatch(/^Only the newest 1\d{3} workouts/);
        expect(b.ops("listWorkouts").length, `${perDay}/day, limit ${limit}`).toBeLessThanOrEqual(12);
        // With the per-minute limit as the budget (10 requests), most of the 1000 are still read.
        const c = new FakeBackend();
        c.workouts = b.workouts;
        const capped = await service(c, { maxScanRequests: 10 }).listWorkouts({ from: "2020-01-01", sport: "Scuba diving", limit });
        expect(c.ops("listWorkouts").length).toBe(10);
        const from = capped.note!.match(/back to (\S+) were read/)![1]!;
        const read = b.workouts.filter((w) => w.startTime! >= Date.parse(from)).length;
        expect(read, `${perDay}/day, limit ${limit}`).toBeGreaterThanOrEqual(800);
        expect(capped.note).toMatch(/needs more than the 10 Suunto requests one call may send/);
      }
    }
  });

  it("sends the same requests when the same list is asked again a moment later, so the cache serves it", async () => {
    // 4 workouts a day: the first window (30 days) is full and split at a whole hour.
    for (const args of [{ limit: 5 }, { from: "2025-01-01", limit: 10 }]) {
      let now = NOW;
      const b = new FakeBackend();
      b.workouts = Array.from({ length: 1600 }, (_, i) => workout(i, (i + 0.5) * 6));
      const s = service(new CachedBackend(b, { now: () => now }), { now: () => now });
      const first = await s.listWorkouts(args);
      const sent = b.ops("listWorkouts").length;
      expect(sent).toBeGreaterThan(1);
      now += 1000;
      const again = await s.listWorkouts(args);
      expect(b.ops("listWorkouts").length).toBe(sent);
      expect(keys(again)).toEqual(keys(first));
    }
  });

  it("refuses unknown sports with examples, and bad ranges", async () => {
    const s = service(new FakeBackend());
    await expect(s.listWorkouts({ sport: "quidditch" })).rejects.toThrow(/Unknown sport "quidditch".*run, trail, bike/);
    await expect(s.listWorkouts({ from: "2026-11-05", to: "2026-11-01" })).rejects.toThrow(/must be before/);
    await expect(s.listWorkouts({ from: "2026-02-30" })).rejects.toThrow(UserFacingError);
    await expect(s.listWorkouts({ limit: 101 } as never)).rejects.toThrow(/Invalid arguments/);
    await expect(s.listWorkouts({ colour: "red" } as never)).rejects.toThrow(/Invalid arguments/);
  });

  it("takes date-times with an offset", async () => {
    const b = new FakeBackend();
    await service(b).listWorkouts({ from: "2026-11-01T06:00:00+01:00", to: "2026-11-02T06:00:00Z" });
    expect(b.ops("listWorkouts")[0]!.args[0]).toMatchObject({ since: ms("2026-11-01T05:00:00Z"), until: ms("2026-11-02T06:00:00Z") });
  });
});

describe("one workout", () => {
  it("asks for the summary and lap extensions and only the streams needed, in one fixed order", async () => {
    const b = new FakeBackend();
    b.workouts = [workout(1, 5, 1, { workoutKey: KEY, extensions: [{ type: "SpeedStreamExtension", points: [{ timestamp: NOW - 5 * HOUR_MS, value: 3 }] }] })];
    const w = await service(b).getWorkout({ workout_key: KEY, samples: ["pace", "speed", "heart_rate", "speed"] });
    const ext = b.ops("getWorkout")[0]!.args[1] as string[];
    expect(ext).toEqual([
      "SummaryExtension",
      "IntensityExtension",
      "FitnessExtension",
      "WeatherExtension",
      "DiveHeaderExtension",
      "SwimmingHeaderExtension",
      "SkiExtension",
      "ManualLapStreamExtension",
      "DistanceLapExtension",
      "DurationLapExtension",
      "VerticalLapExtension",
      "HeartrateStreamExtension",
      "SpeedStreamExtension",
    ]);
    expect(Object.keys(w.samples ?? {})).toEqual(["heart_rate", "speed", "pace"]);
    expect(w.samples?.speed?.points).toEqual([{ t: 0, v: 10.8 }]);
    // The same streams in another order are the same request (one cache entry).
    await service(b).getWorkout({ workout_key: KEY, samples: ["speed", "heart_rate", "pace"] });
    expect(b.ops("getWorkout")[1]!.args[1]).toEqual(ext);
    const cached = new CachedBackend(b);
    await service(cached).getWorkout({ workout_key: KEY, samples: ["heart_rate", "altitude"] });
    await service(cached).getWorkout({ workout_key: KEY, samples: ["altitude", "heart_rate"] });
    expect(b.ops("getWorkout")).toHaveLength(3);
    await expect(service(b).getWorkout({ workout_key: KEY, max_points: 5 })).rejects.toThrow(/max_points/);
  });

  it("checks that a workout key is 24 hex characters before anything reaches Suunto", async () => {
    const b = new FakeBackend();
    const s = service(b);
    for (const bad of ["Morning_Run", "12345", KEY.slice(1), `${KEY}0`, `${KEY.slice(0, 23)}g`, "../etc", ""]) {
      await expect(s.getWorkout({ workout_key: bad }), bad).rejects.toThrow(/workout_key: A workout key is 24 hex characters .*Use workout_key from suunto_list_workouts/);
      await expect(s.exportFit({ workout_key: bad }), bad).rejects.toThrow(/24 hex characters/);
    }
    expect(b.calls).toHaveLength(0);
    await expect(s.exportFit({ workout_key: KEY.toUpperCase() })).resolves.toMatchObject({ bytes: 8 });
  });

  it("refuses FIT files over 8 MB and names the file", async () => {
    const b = new FakeBackend();
    const ok = await service(b).exportFit({ workout_key: KEY });
    expect(ok).toMatchObject({ workout_key: KEY, bytes: 8, file_name: `suunto-workout-${KEY}.fit` });
    b.fit = Buffer.alloc(8 * 1024 * 1024 + 1);
    await expect(service(b).exportFit({ workout_key: KEY })).rejects.toThrow(/8\.0 MB, more than the 8 MB/);
    // SuuntoApi stops reading at 8 MB ("too large"): the same message, without the exact size.
    b.fail = Object.assign(new UserFacingError("The answer from Suunto (the FIT file of the workout) is larger than 8 MB, more than this server reads."), { kind: "too_large" });
    await expect(service(b).exportFit({ workout_key: KEY })).rejects.toThrow(
      `The FIT file of workout ${KEY} is larger than 8 MB, more than the 8 MB this tool can send. Export it in the Suunto App instead, or use suunto_get_workout with samples for the data.`,
    );
  });
});

describe("statistics", () => {
  function statsBackend(): FakeBackend {
    const b = new FakeBackend();
    const at = (n: number, iso: string, activityId: number, seconds: number, metres: number, hr?: number): WireWorkout => ({
      workoutKey: `s${n}`,
      activityId,
      startTime: ms(iso),
      timeOffsetInMinutes: 60,
      totalTime: seconds,
      totalDistance: metres,
      totalAscent: 50,
      energyConsumption: 300,
      ...(hr ? { hrdata: { workoutAvgHR: hr } } : {}),
    });
    b.workouts = [
      at(1, "2026-11-01T08:00:00Z", 1, 3600, 10_000, 150), // Sunday: ISO week 44
      at(2, "2026-11-02T08:00:00Z", 1, 1800, 5000, 120), // Monday: week 45
      at(3, "2026-11-03T08:00:00Z", 2, 7200, 60_000), // no heart rate
      at(4, "2026-10-15T08:00:00Z", 11, 10_800, 12_000, 110),
    ];
    return b;
  }

  it("adds up totals, weights the heart rate by time and finds the longest and farthest", async () => {
    const r = await service(statsBackend()).workoutStats({ from: "2026-10-01", to: "2026-11-09" });
    expect(r).toMatchObject({
      from: "2026-10-01",
      to: "2026-11-09",
      group_by: "none",
      count: 4,
      total_duration: "6:30:00",
      total_duration_s: 23_400,
      total_distance: 87,
      total_ascent: 200,
      total_energy_kcal: 1200,
      avg_hr: 120,
      longest: { workout_key: "s4", sport: "Hiking", duration: "3:00:00", duration_s: 10_800 },
      farthest: { workout_key: "s3", sport: "Cycling", distance: 60 },
      first_date: "2026-10-15",
      last_date: "2026-11-03",
    });
    expect(Object.keys(r).at(-1)).toBe("units");
  });

  it("groups by ISO week (Monday first), month, year and sport", async () => {
    const s = service(statsBackend());
    const weeks = await s.workoutStats({ from: "2026-10-01", group_by: "week" });
    expect(weeks.groups?.map((g) => [g.key, g.count])).toEqual([
      ["2026-W42", 1],
      ["2026-W44", 1],
      ["2026-W45", 2],
    ]);
    const months = await s.workoutStats({ from: "2026-10-01", group_by: "month" });
    expect(months.groups?.map((g) => [g.key, g.count])).toEqual([
      ["2026-10", 1],
      ["2026-11", 3],
    ]);
    const years = await s.workoutStats({ group_by: "year" });
    expect(years.groups?.map((g) => [g.key, g.count])).toEqual([["2026", 4]]);
    const sports = await s.workoutStats({ group_by: "sport" });
    expect(sports.groups?.map((g) => [g.key, g.total_duration])).toEqual([
      ["Hiking", "3:00:00"],
      ["Cycling", "2:00:00"],
      ["Running", "1:30:00"],
    ]);
    const running = await s.workoutStats({ sport: "running" });
    expect(running).toMatchObject({ sport: "running", count: 2, avg_hr: 140 });
  });

  it("counts the newest 2000 workouts at most, in any list order, and says so", async () => {
    for (const order of ["desc", "asc", "modified", "shuffled"] as const) {
      const b = new FakeBackend();
      b.order = order;
      b.workouts = Array.from({ length: 2050 }, (_, i) => workout(i, i, 1, { lastModified: NOW - ((i * 7919) % 2050) * 1000 }));
      const r = await service(b).workoutStats({});
      expect(r.count, order).toBe(2000);
      // The newest is counted, the 50 oldest are not.
      expect(r.last_date, order).toBe("2026-11-10");
      expect(r.note, order).toMatch(/^More than 2000 workouts are in this range; only the newest 2000 were counted \(back to 2026-08-\S+\)\. Use a shorter range \(from, to\)\.$/);
      expect(b.ops("listWorkouts").length, order).toBeLessThanOrEqual(25);
    }
  });

  it("counts the newest years of a long range when Suunto lists oldest first", async () => {
    const b = new FakeBackend();
    b.order = "asc";
    // 2500 workouts, 35 hours apart: since the end of 2016.
    b.workouts = Array.from({ length: 2500 }, (_, i) => workout(i, i * 35));
    const r = await service(b).workoutStats({ from: "2016-01-01", group_by: "year" });
    expect(r.count).toBe(2000);
    expect(r.groups?.map((g) => g.key)).toEqual(["2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
    expect(r.note).toMatch(/only the newest 2000 were counted/);
  });

  it("reads a year of workouts in about as many requests as pages of 100 would take", async () => {
    for (const [n, most] of [[50, 2], [300, 4], [1500, 17]] as const) {
      const b = new FakeBackend();
      b.order = "asc";
      b.workouts = Array.from({ length: n }, (_, i) => workout(i, (i * 364 * 24) / n));
      const r = await service(b).workoutStats({});
      expect(r.count, `${n}`).toBe(n);
      expect(r.note, `${n}`).toBeUndefined();
      expect(b.ops("listWorkouts").length, `${n}`).toBeLessThanOrEqual(most);
    }
  });

  it("counts what was read when Suunto's call limit is reached in the middle, and says so", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 1500 }, (_, i) => workout(i, i * 6));
    b.rateLimitAfter = 6;
    const r = await service(b).workoutStats({});
    expect(r.count).toBeGreaterThan(0);
    expect(r.count).toBeLessThan(1460);
    expect(r.last_date).toBe("2026-11-10");
    expect(r.note).toMatch(
      /^Only the workouts back to (2026-\S+) were read, and older ones are missing: Suunto's call limit for this service is reached\. Try again in 50 seconds\. So the numbers count only the workouts from \1 to 2026-11-10\. For the older part, ask again with to set to \1\.$/,
    );
  });

  it("sends at most the per-minute call limit of requests, and says how far back it counted", async () => {
    const b = new FakeBackend();
    // 1500 workouts in the last year (about 4 a day).
    b.workouts = Array.from({ length: 1500 }, (_, i) => workout(i, (i * 364 * 24) / 1500));
    const r = await service(b, { maxScanRequests: 10 }).workoutStats({});
    expect(b.ops("listWorkouts")).toHaveLength(10);
    // About 85 workouts per request.
    expect(r.count).toBeGreaterThanOrEqual(800);
    expect(r.count).toBeLessThan(1500);
    expect(r.note).toMatch(
      /^Reading all of this range needs more than the 10 Suunto requests one call may send, so only the workouts back to (2026-\S+) were read and older ones are missing\. So the numbers count only the workouts from \1 to 2026-11-10\. For the older part, ask again with to set to \1\.$/,
    );
    // The older part, asked as the note says, is counted in another call.
    const to = r.note!.match(/to set to (\S+)\.$/)![1]!;
    const older = await service(b, { maxScanRequests: 10 }).workoutStats({ from: "2025-11-11", to });
    expect(older.count + r.count).toBe(1500);
  });
});

describe("daily activity", () => {
  it("asks in windows of whole local days, each under 28 days, one after another", async () => {
    const b = new FakeBackend();
    const r = await service(b).dailyActivity({ from: "2026-08-01", to: "2026-10-31" });
    const calls = b.ops("dailyStatistics").map((c) => c.args);
    expect(r.days).toHaveLength(92);
    expect(calls).toEqual([
      ["2026-07-31T22:00:00", "2026-08-28T21:59:59"],
      ["2026-08-28T22:00:00", "2026-09-25T21:59:59"],
      ["2026-09-25T22:00:00", "2026-10-23T21:59:59"],
      ["2026-10-23T22:00:00", "2026-10-31T22:59:59"],
    ]);
  });

  it("splits 28 local days that span the autumn DST change (28 days and 1 hour)", async () => {
    const b = new FakeBackend();
    await service(b).dailyActivity({ from: "2026-10-01", to: "2026-10-28" });
    expect(b.ops("dailyStatistics").map((c) => c.args)).toEqual([
      ["2026-09-30T22:00:00", "2026-10-27T22:59:59"],
      ["2026-10-27T23:00:00", "2026-10-28T22:59:59"],
    ]);
    const c = new FakeBackend();
    await service(c).dailyActivity({ from: "2026-02-01", to: "2026-02-28" });
    expect(c.ops("dailyStatistics")).toHaveLength(1);
  });

  it("maps each sample back to its local date across DST, with totals and averages", async () => {
    const b = new FakeBackend();
    // Suunto answers one sample every 24 hours from the startdate (in UTC).
    b.daily = (startdate, enddate) => {
      const start = Date.parse(`${startdate}Z`);
      const end = Date.parse(`${enddate}Z`);
      const samples = [];
      for (let t = start, i = 0; t < end; t += DAY_MS, i++) samples.push({ TimeISO8601: formatUtcNoOffset(t), Value: 1000 + i });
      return [{ Name: "stepcount", Aggregation: "sum", Sources: [{ Name: "watch", Samples: samples }] }];
    };
    const r = await service(b).dailyActivity({ from: "2026-10-23", to: "2026-10-27" });
    expect(r.days).toEqual([
      { date: "2026-10-23", steps: 1000, energy_kcal: null },
      { date: "2026-10-24", steps: 1001, energy_kcal: null },
      { date: "2026-10-25", steps: 1002, energy_kcal: null },
      { date: "2026-10-26", steps: 1003, energy_kcal: null },
      { date: "2026-10-27", steps: 1004, energy_kcal: null },
    ]);
    expect(r).toMatchObject({ days_with_data: 5, totals: { steps: 5010, energy_kcal: 0 }, averages: { steps: 1002 }, time_zone: TZ });
    const spring = await service(b).dailyActivity({ from: "2026-03-27", to: "2026-03-31" });
    expect(spring.days.map((d) => d.steps)).toEqual([1000, 1001, 1002, 1003, 1004]);
  });

  it("does not ask for days in the future, and refuses more than 92 days", async () => {
    const b = new FakeBackend();
    const r = await service(b).dailyActivity({ from: "2026-12-01", to: "2026-12-31" });
    expect(b.ops("dailyStatistics")).toHaveLength(0);
    expect(r.days_with_data).toBe(0);
    await expect(service(b).dailyActivity({ from: "2026-01-01", to: "2026-04-03" })).rejects.toThrow(/93 days.*at most 92 days/);
    await expect(service(b).dailyActivity({ from: "2026-01-01T00:00:00Z", to: "2026-01-02" } as never)).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe("24/7 samples and recovery", () => {
  it("splits 28 days into windows the API accepts and buckets by local day", async () => {
    const b = new FakeBackend();
    for (let t = ms("2026-10-01T00:00:00Z"); t < ms("2026-10-29T00:00:00Z"); t += 6 * HOUR_MS) {
      b.activity.push({ timestamp: new Date(t).toISOString(), entryData: { HR: 60, StepCount: 100 } });
    }
    const r = await service(b).activitySamples({ from: "2026-10-01", to: "2026-10-28" });
    const windows = b.ops("activitySamples").map((c) => c.args as number[]);
    expect(windows.length).toBe(2);
    expect(windows[0]![0]).toBe(startOfDay("2026-10-01", TZ).getTime());
    expect(windows[0]![1]).toBe(windows[1]![0]! - 1);
    expect(windows[1]![1]).toBe(startOfDay("2026-10-29", TZ).getTime() - 1);
    for (const [from, to] of windows) expect(to! - from!).toBeLessThan(28 * DAY_MS);
    expect(r.resolution).toBe("day");
    expect(r.count).toBe(28);
    expect(r.points[0]).toMatchObject({ start: "2026-10-01T00:00:00+02:00", end: "2026-10-02T00:00:00+02:00", hr_avg: 60, steps: 400, samples: 4 });
    expect(r.points.at(-1)).toMatchObject({ start: "2026-10-28T00:00:00+01:00" });
  });

  it("defaults to hours for up to 2 days and limits raw samples to 2 days", async () => {
    const b = new FakeBackend();
    b.activity = [{ timestamp: "2026-11-09T07:05:00Z", entryData: { HR: 70 } }];
    const r = await service(b).activitySamples({ from: "2026-11-08", to: "2026-11-09" });
    expect(r.resolution).toBe("hour");
    expect(r.points).toEqual([{ start: "2026-11-09T08:00:00+01:00", end: "2026-11-09T09:00:00+01:00", hr_avg: 70, hr_min: 70, hr_max: 70, samples: 1 }]);
    await expect(service(b).activitySamples({ from: "2026-11-01", to: "2026-11-09", resolution: "raw" })).rejects.toThrow(/raw takes at most 2 days/);
    await expect(service(b).activitySamples({ from: "2026-10-01", to: "2026-10-30" })).rejects.toThrow(/at most 28 days/);
    // Date-times: at most 28 days, with an hour of slack for DST.
    await expect(service(b).activitySamples({ from: "2026-10-01T00:00:00Z", to: "2026-10-29T00:30:00Z" })).resolves.toMatchObject({ resolution: "day" });
  });

  it("never asks for the future", async () => {
    const b = new FakeBackend();
    await service(b).activitySamples({ from: "2026-11-10", to: "2026-11-12" } as never).catch(() => undefined);
    await service(b).recovery({ from: "2026-11-09", to: "2026-11-10" });
    const [from, to] = b.ops("recovery")[0]!.args as number[];
    expect(from).toBe(startOfDay("2026-11-09", TZ).getTime());
    expect(to).toBe(NOW - 1);
  });

  it("gives recovery per day with a summary over the range", async () => {
    const b = new FakeBackend();
    b.recoveries = [
      { timestamp: "2026-11-08T10:00:00Z", entryData: { Balance: 0.5, StressState: 2 } },
      { timestamp: "2026-11-08T23:30:00Z", entryData: { Balance: 0.9, StressState: 1 } }, // 00:30 local on 11-09
      { timestamp: "2026-11-09T10:00:00Z", entryData: { Balance: 0.7, StressState: 4 } },
    ];
    const r = await service(b).recovery({ from: "2026-11-08", to: "2026-11-09" });
    expect(r.resolution).toBe("day");
    expect(r.points.map((p) => [p.start, p.balance_pct_avg, p.stress_states])).toEqual([
      ["2026-11-08T00:00:00+01:00", 50, { active: 1 }],
      ["2026-11-09T00:00:00+01:00", 80, { relaxing: 1, stressful: 1 }],
    ]);
    expect(r.summary).toEqual({ balance_pct_min: 50, balance_pct_avg: 70, balance_pct_max: 90, samples: 3 });
    await expect(service(b).recovery({ from: "2026-11-01", to: "2026-11-09", resolution: "raw" })).rejects.toThrow(/raw takes at most 2 days/);
  });
});

describe("sleep", () => {
  const night = (start: string, end: string, extra: Partial<WireSleepEntry> = {}): WireSample<WireSleepEntry> => ({
    timestamp: start,
    entryData: { BedtimeStart: start, BedtimeEnd: end, Duration: (Date.parse(end) - Date.parse(start)) / 1000, HRAvg: 50, SleepQualityScore: 80, ...extra },
  });

  it("asks from 18:00 the evening before and keeps sleeps by their local wake-up date", async () => {
    const b = new FakeBackend();
    b.sleeps = [
      night("2026-11-01T21:00:00Z", "2026-11-02T05:00:00Z"), // wakes up on 11-02 (before the range)
      night("2026-11-02T21:30:00Z", "2026-11-03T05:30:00Z", { SleepId: 7 }), // 11-03
      night("2026-11-02T21:30:00Z", "2026-11-03T05:30:00Z", { SleepId: 7 }), // the same sleep twice (window edges)
      night("2026-11-03T12:00:00Z", "2026-11-03T12:30:00Z", { IsNap: true, HRAvg: 70 }), // nap on 11-03
      night("2026-11-04T22:00:00Z", "2026-11-04T23:30:00Z"), // wakes up at 00:30 local on 11-05
      night("2026-11-05T22:00:00Z", "2026-11-06T06:00:00Z"), // 11-06 (after the range)
    ];
    const r = await service(b).sleep({ from: "2026-11-03", to: "2026-11-05" });
    const [from, to] = b.ops("sleep")[0]!.args as number[];
    expect(new Date(from!).toISOString()).toBe("2026-11-02T17:00:00.000Z");
    expect(new Date(to!).toISOString()).toBe("2026-11-05T22:59:59.999Z");
    expect(r.sleeps.map((s) => [s.date, s.is_nap])).toEqual([
      ["2026-11-03", false],
      ["2026-11-03", true],
      ["2026-11-05", false],
    ]);
    expect(r.count).toBe(3);
    // Averages leave the nap out.
    expect(r.averages).toMatchObject({ duration: "4:45", duration_s: 17_100, hr_avg: 50, quality_score: 80 });
  });

  it("keeps the wake-up date right across the spring DST change", async () => {
    const b = new FakeBackend();
    b.sleeps = [night("2026-03-28T22:30:00Z", "2026-03-29T05:30:00Z")];
    const r = await service(b).sleep({ from: "2026-03-29", to: "2026-03-29" });
    expect(r.sleeps[0]).toMatchObject({ date: "2026-03-29", bedtime_start: "2026-03-28T23:30:00+01:00", bedtime_end: "2026-03-29T07:30:00+02:00" });
    await expect(service(b).sleep({ from: "2026-01-01", to: "2026-05-01" })).rejects.toThrow(/at most 92 days/);
  });
});

describe("routes and points of interest", () => {
  function routes(n: number): WireRoute[] {
    return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, description: `Route ${i}`, activityIds: [1], totalDistance: 1000 * (i + 1), created: 1_700_000_000_000 + i * 1000, modified: 1_700_000_000_000 + i * 1000 }));
  }

  it("lists routes newest first with page and size from offset and limit", async () => {
    const b = new FakeBackend();
    b.routes = routes(45);
    const first = await service(b).listRoutes({ limit: 20 });
    expect(b.ops("listRoutes")[0]!.args[0]).toEqual({ page: 0, size: 20, sort: "desc" });
    expect(first.routes[0]).toMatchObject({ route_id: "r44", name: "Route 44", distance: 45, sports: ["Running"] });
    expect(first.next_offset).toBe(20);
    b.calls = [];
    const odd = await service(b).listRoutes({ limit: 20, offset: 30 });
    expect(b.ops("listRoutes").map((c) => c.args[0])).toEqual([
      { page: 1, size: 20, sort: "desc" },
      { page: 2, size: 20, sort: "desc" },
    ]);
    expect(odd.routes.map((r) => r.route_id)).toEqual(["r14", "r13", "r12", "r11", "r10", "r9", "r8", "r7", "r6", "r5", "r4", "r3", "r2", "r1", "r0"]);
    expect(odd.next_offset).toBeUndefined();
  });

  it("gets a route as a summary or as GPX (at most 1 MB)", async () => {
    const b = new FakeBackend();
    b.routes = routes(2);
    expect(await service(b).getRoute({ route_id: "r1", units: "imperial" })).toMatchObject({ route_id: "r1", distance: 1.24, units: { distance: "mi" } });
    expect(await service(b).getRoute({ route_id: "r1", format: "gpx" })).toMatchObject({ route_id: "r1", format: "gpx", gpx: expect.stringContaining("<gpx") });
    await expect(service(b).getRoute({ route_id: "big", format: "gpx" })).rejects.toThrow(/more than the 1 MB/);
  });

  it("lists points of interest with the next offset", async () => {
    const b = new FakeBackend();
    b.pois = Array.from({ length: 3 }, (_, i) => ({ pointOfInterest: { key: `p${i}`, point: { x: 7.5, y: 46 + i / 10, z: 1000, name: `Point ${i}`, type: 34 } } }));
    const r = await service(b).listPois({ limit: 2 });
    expect(r).toMatchObject({ count: 2, next_offset: 2, pois: [{ poi_key: "p0", type: "Peak", altitude: 1000 }, { poi_key: "p1" }] });
    expect((await service(b).listPois({ limit: 2, offset: 2 })).next_offset).toBeUndefined();
  });
});

describe("GPX checks", () => {
  const good = `<?xml version="1.0" encoding="UTF-8"?>
<!-- made by hand -->
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Meta name</name></metadata>
  <trk><name>Lake &amp; Ridge</name><trkseg>
    <trkpt lat="46.5" lon="7.9"><ele>1500</ele><name>Start</name></trkpt>
    <trkpt lat='46.51' lon='7.91'><ele>1520</ele></trkpt>
  </trkseg></trk>
</gpx>`;

  it("accepts a good GPX and reads its name", () => {
    expect(checkGpx(good)).toEqual({ name: "Lake & Ridge", routes: 1, points: 2 });
    expect(checkGpx(`﻿<gpx:gpx xmlns:gpx="x"><gpx:rte><gpx:rtept lat="1" lon="2"/><gpx:rtept lat="1.1" lon="2.1"/></gpx:rte></gpx:gpx>`)).toEqual({ routes: 1, points: 2 });
    expect(checkGpx(good.replace("<name>Lake &amp; Ridge</name>", ""))).toMatchObject({ name: "Meta name" });
  });

  it("refuses DOCTYPE, ENTITY, other roots, too few points and bad positions", () => {
    expect(() => checkGpx(`<!DOCTYPE gpx [<!ENTITY x "y">]>${good}`)).toThrow(/DOCTYPE/);
    expect(() => checkGpx(good.replace("<metadata>", '<!ENTITY a "b"><metadata>'))).toThrow(/ENTITY/);
    expect(() => checkGpx("<kml><Document/></kml>")).toThrow(/root element must be <gpx>/);
    expect(() => checkGpx("route.gpx")).toThrow(/root element must be <gpx>/);
    expect(() => checkGpx('<gpx><wpt lat="1" lon="2"/></gpx>')).toThrow(/no <rte> or <trk>/);
    expect(() => checkGpx('<gpx><rte><rtept lat="1" lon="2"/></rte></gpx>')).toThrow(/at least 2/);
    expect(() => checkGpx('<gpx><rte><rtept lat="91" lon="2"/><rtept lat="1" lon="2"/></rte></gpx>')).toThrow(/Point 1 .*lat between -90 and 90/);
    expect(() => checkGpx('<gpx><rte><rtept lat="1" lon="2"/><rtept lat="1"/></rte></gpx>')).toThrow(/Point 2/);
    expect(() => checkGpx(`<gpx>${" ".repeat(5 * 1024 * 1024)}</gpx>`)).toThrow(/limit is 5 MB/);
    // An empty coordinate is not 0.
    expect(() => checkGpx('<gpx><rte><rtept lat="" lon=" "/><rtept lat="1" lon="2"/></rte></gpx>')).toThrow(/Point 1/);
  });

  it("checks a 5 MB GPX full of unclosed tags in linear time (well under a second)", () => {
    const points = '<rtept lat="1" lon="1"/><rtept lat="1" lon="2"/>';
    const head = `<gpx><rte>${points}</rte>`;
    const limit = 5 * 1024 * 1024;
    /** `prefix`, then `piece` repeated up to 5 MB, then `suffix`. */
    const fill = (piece: string, prefix = head, suffix = "") => prefix + piece.repeat(Math.floor((limit - prefix.length - suffix.length) / piece.length)) + suffix;
    const cases: Array<[string, string, (gpx: string) => void]> = [
      ["unclosed points", fill("<rtept"), (g) => expect(checkGpx(g)).toEqual({ routes: 1, points: 2 })],
      ["only unclosed points", fill("<rtept", "<gpx><rte>"), (g) => expect(() => checkGpx(g)).toThrow(/has 0 route or track points/)],
      ["unclosed metadata", fill("<metadata"), (g) => expect(checkGpx(g)).toEqual({ routes: 1, points: 2 })],
      ["metadata without an end", fill("<metadata>"), (g) => expect(checkGpx(g)).toEqual({ routes: 1, points: 2 })],
      ["names without an end", fill("<name>", "<gpx><rte>", `${points}</rte></gpx>`), (g) => expect(checkGpx(g)).toEqual({ routes: 1, points: 2 })],
      ["unclosed routes before the track", fill("<rte <", "<gpx>", `<trk><name>T</name>${points.replace(/rtept/g, "trkpt")}</trk></gpx>`), (g) => expect(checkGpx(g)).toMatchObject({ name: "T", points: 2 })],
      ["CDATA without an end in a name", fill("<![CDATA[", "<gpx><rte><name>", `</name>${points}</rte></gpx>`), (g) => expect(checkGpx(g)).toMatchObject({ routes: 1, points: 2 })],
      ["a long attribute without its quote", `<gpx><rte><rtept lon="1" lat="${" ".repeat(5_000_000)}/>${points}</rte></gpx>`, (g) => expect(() => checkGpx(g)).toThrow(/Point 1 /)],
      ["a long attribute", `<gpx><rte><rtept lon="1" lat="${" ".repeat(5_000_000)}1"/>${points}</rte></gpx>`, (g) => expect(checkGpx(g)).toEqual({ routes: 1, points: 3 })],
      ["unclosed comments at the start", fill("<!--", ""), (g) => expect(() => checkGpx(g)).toThrow(/root element must be <gpx>/)],
      ["unclosed declarations at the start", fill("<?", ""), (g) => expect(() => checkGpx(g)).toThrow(/root element must be <gpx>/)],
    ];
    for (const [what, gpx, check] of cases) {
      expect(Buffer.byteLength(gpx), what).toBeLessThanOrEqual(limit);
      const started = performance.now();
      check(gpx);
      expect(performance.now() - started, what).toBeLessThan(1000);
    }
  });

  it("accepts UTF-8 only, or plain ASCII under a single-byte encoding", () => {
    const route = '<gpx version="1.1"><rte><name>Zürich, Üetliberg</name><rtept lat="47.37" lon="8.54"/><rtept lat="47.35" lon="8.49"/></rte></gpx>';
    expect(checkGpx(`<?xml version="1.0" encoding="UTF-8"?>${route}`)).toMatchObject({ name: "Zürich, Üetliberg" });
    expect(checkGpx(`<?xml version="1.0" encoding='utf8' standalone="yes"?>\n${route}`)).toMatchObject({ points: 2 });
    expect(checkGpx(`<?xml version="1.0"?>${route}`)).toMatchObject({ points: 2 });
    // Suunto would read the UTF-8 bytes as Latin-1 and garble the name.
    expect(() => checkGpx(`<?xml version="1.0" encoding="ISO-8859-1"?>${route}`)).toThrow(/encoding="ISO-8859-1".*Change the declaration to encoding="UTF-8"/);
    expect(() => checkGpx(`<?xml version="1.0" encoding="UTF-16"?>${route}`)).toThrow(/encoding="UTF-16"/);
    // Plain ASCII is the same in UTF-8 and Latin-1.
    const ascii = route.replace("Zürich, Üetliberg", "Zurich, Uetliberg");
    expect(checkGpx(`<?xml version="1.0" encoding="ISO-8859-1"?>${ascii}`)).toMatchObject({ name: "Zurich, Uetliberg" });
    // UTF-7 could hide a DOCTYPE from the check ("+ADw-" is "<"): never accepted.
    expect(() => checkGpx(`<?xml version="1.0" encoding="UTF-7"?>+ADw-!DOCTYPE x+AD4-${ascii}`)).toThrow(/encoding="UTF-7"/);
  });
});

describe("long answers and the response cache", () => {
  it("sums up 200,000 recovery samples (no spread of wire arrays into a call)", async () => {
    const b = new FakeBackend();
    const from = ms("2026-11-08T00:00:00Z");
    b.recoveries = Array.from({ length: 200_000 }, (_, i) => ({ timestamp: new Date(from + i * 800).toISOString(), entryData: { Balance: (i % 100) / 100 } }));
    const r = await service(b).recovery({ from: "2026-11-08", to: "2026-11-09" });
    expect(r.summary).toMatchObject({ balance_pct_min: 0, balance_pct_max: 99, samples: 200_000 });
  });

  it("shares one request between two identical sleep calls at the same time", async () => {
    const b = new FakeBackend();
    // A clock that moves on every reading: each call asks up to its own "now" (09:30 and later).
    let tick = NOW + 30 * 60_000;
    const clock = () => tick++;
    const s = service(new CachedBackend(b, { now: clock }), { now: clock });
    await Promise.all([s.sleep({ from: "2026-11-04", to: "2026-11-10" }), s.sleep({ from: "2026-11-04", to: "2026-11-10" })]);
    expect(b.ops("sleep")).toHaveLength(1);
  });

  it("serves the window up to now from the cache also when the earlier windows of the call were slow", async () => {
    // 92 days of sleep: 4 windows. Each request takes 2 s, so the last window is asked more than
    // 5 s after the call fixed its end ("now").
    let now = ms("2026-11-10T09:20:00Z");
    const b = new FakeBackend();
    const slow = new Proxy(b, {
      get(target, prop, receiver) {
        if (prop !== "sleep") return Reflect.get(target, prop, receiver);
        return async (...args: [number, number]) => {
          await new Promise((r) => setTimeout(r, 2));
          now += 2000;
          return target.sleep(...args);
        };
      },
    });
    const s = service(new CachedBackend(slow, { now: () => now }), { now: () => now });
    await s.sleep({ from: "2026-08-11", to: "2026-11-10" });
    expect(b.ops("sleep")).toHaveLength(4);
    now += 10_000;
    await s.sleep({ from: "2026-08-11", to: "2026-11-10" });
    expect(b.ops("sleep")).toHaveLength(4);
    // Two identical calls at the same time share every window, the last one too.
    now += SHORT_TTL_MS;
    await Promise.all([s.sleep({ from: "2026-08-11", to: "2026-11-10" }), s.sleep({ from: "2026-08-11", to: "2026-11-10" })]);
    expect(b.ops("sleep")).toHaveLength(5);
  });

  it("asks again for samples up to now after a call that ended earlier in the hour", async () => {
    let now = ms("2026-11-10T10:50:00Z");
    const b = new FakeBackend();
    for (let t = ms("2026-11-10T10:00:00Z"); t <= now; t += 10 * 60_000) b.activity.push({ timestamp: new Date(t).toISOString(), entryData: { HR: 60 } });
    const s = service(new CachedBackend(b, { now: () => now }), { now: () => now, timeZone: "UTC" });
    const early = await s.activitySamples({ from: "2026-11-10T10:00:00Z", to: "2026-11-10T10:05:00Z", resolution: "raw" });
    expect(early.count).toBe(1);
    now += 60_000;
    const late = await s.activitySamples({ from: "2026-11-10T10:00:00Z", to: "2026-11-10T11:00:00Z", resolution: "raw" });
    expect(late.count).toBe(6);
    expect(b.ops("activitySamples")).toHaveLength(2);
  });
});

describe("writes", () => {
  const gpx = '<gpx version="1.1"><rte><name>Evening loop</name><rtept lat="46.5" lon="7.9"/><rtept lat="46.6" lon="7.95"/></rte></gpx>';

  it("imports a route with the sports as activity ids", async () => {
    const b = new FakeBackend();
    b.importAnswer = { id: "new1", description: "Evening loop", activityIds: [22, 11], totalDistance: 12_345 };
    const r = await service(b).importRoute({ gpx, sports: ["Trail running", "hike", "Trail running"] });
    expect(b.ops("importRouteGpx")[0]!.args[1]).toEqual([22, 11]);
    expect(r).toMatchObject({ added: true, routes_in_file: 1, points: 2, route: { route_id: "new1", name: "Evening loop", distance: 12.35, sports: ["Trail running", "Hiking"] } });
    await expect(service(b).importRoute({ gpx, sports: ["quidditch"] })).rejects.toThrow(/Unknown sport "quidditch"/);
  });

  it("finds the new route when Suunto's answer has none, by name first", async () => {
    const b = new FakeBackend();
    b.routes = [{ id: "old", description: "Evening loop", activityIds: [1], created: NOW - DAY_MS, modified: NOW - DAY_MS }];
    b.routesAfterImport = [
      { id: "other", description: "Something else", activityIds: [1], created: NOW + 2000, modified: NOW + 2000 },
      { id: "mine", description: "Evening loop", activityIds: [1], created: NOW + 1000, modified: NOW + 1000 },
    ];
    const r = await service(b).importRoute({ gpx });
    expect(r.route?.route_id).toBe("mine");
    const q = b.ops("listRoutes")[0]!.args[0] as ListRoutesQuery;
    expect(q).toMatchObject({ page: 0, sort: "desc", since: NOW - 2 * 60_000 });
  });

  it("says the route was added when it cannot be found, also when the lookup fails", async () => {
    const b = new FakeBackend();
    const r = await service(b).importRoute({ gpx });
    expect(r).toMatchObject({ added: true, note: expect.stringMatching(/added the route but did not send its details/) });
    expect(r.route).toBeUndefined();
    const failing = new FakeBackend();
    failing.listRoutes = async () => {
      throw new Error("network down");
    };
    await expect(service(failing).importRoute({ gpx })).resolves.toMatchObject({ added: true });
  });

  it("creates a point of interest with the type by name and the altitude in metres", async () => {
    const b = new FakeBackend();
    const r = await service(b, { units: "imperial" }).createPoi({ name: " Summit cairn ", latitude: 46.55, longitude: 7.98, altitude: 13_000, type: "peak", sport: "Hiking" });
    expect(b.ops("createPoi")[0]!.args[0]).toEqual({ point: { x: 7.98, y: 46.55, z: 3962.4, name: "Summit cairn", type: 34 }, activityId: 11, watchEnabled: true });
    expect(r).toMatchObject({ added: true, poi: { poi_key: "poi-new-1", name: "Summit cairn", type: "Peak", altitude: 13_000, sport: "Hiking" }, units: { elevation: "ft" } });
    const generic = await service(b).createPoi({ name: "Car", latitude: 1, longitude: 2, altitude_m: 400 });
    expect((b.ops("createPoi")[1]!.args[0] as WirePoiInput).point).toEqual({ x: 2, y: 1, z: 400, name: "Car", type: 26 });
    expect(generic.poi.type).toBe("POI");
  });

  it("checks point of interest input", async () => {
    const s = service(new FakeBackend());
    await expect(s.createPoi({ name: "x", latitude: 91, longitude: 0 })).rejects.toThrow(/latitude/);
    await expect(s.createPoi({ name: "", latitude: 1, longitude: 0 })).rejects.toThrow(/Give a name/);
    await expect(s.createPoi({ name: "x".repeat(61), latitude: 1, longitude: 0 })).rejects.toThrow(/at most 60/);
    await expect(s.createPoi({ name: "x", latitude: 1, longitude: 0, type: "castle" })).rejects.toThrow(/Unknown point of interest type "castle".*Peak/);
    await expect(s.createPoi({ name: "x", latitude: 1, longitude: 0, altitude: 1, altitude_m: 1 })).rejects.toThrow(/not both/);
    await expect(s.createPoi({ name: "x", latitude: 1, longitude: 0, altitude: 10_000 })).rejects.toThrow(/between -1000 and 9000 m/);
  });

  it("refuses every write on a read-only account before calling Suunto", async () => {
    const b = new FakeBackend();
    const s = service(b, { readOnly: true });
    await expect(s.importRoute({ gpx })).rejects.toBeInstanceOf(ReadOnlyError);
    await expect(s.createPoi({ name: "x", latitude: 1, longitude: 2 })).rejects.toBeInstanceOf(ReadOnlyError);
    expect(b.calls).toHaveLength(0);
  });
});

describe("account and check", () => {
  it("passes the account through and counts the last 30 days", async () => {
    const b = new FakeBackend();
    b.workouts = [workout(1, 24), workout(2, 24 * 40)];
    const s = service(b);
    expect(await s.account()).toEqual({ username: "testuser", tokenExpiresAt: "2026-11-11T09:00:00.000Z" });
    expect(await s.check()).toEqual({ ok: true, workouts_last_30_days: 1 });
    const q = b.ops("listWorkouts")[0]!.args[0];
    expect(q).toEqual({ since: ms("2026-10-11T22:00:00Z"), until: ms("2026-11-10T23:00:00Z"), limit: 100, offset: 0, byModificationTime: false });
    // The same request as the first one of suunto_list_workouts without arguments.
    await s.listWorkouts({});
    expect(b.ops("listWorkouts")[1]!.args[0]).toEqual(q);
    expect(s.backend).toBe(b);
  });

  it("is served from the cache when asked again, and says when the count is capped at 100", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 120 }, (_, i) => workout(i, i));
    const s = service(new CachedBackend(b, { now: () => NOW }));
    expect(await s.check()).toEqual({ ok: true, workouts_last_30_days: 100, workouts_last_30_days_capped: true });
    await s.check();
    expect(b.ops("listWorkouts")).toHaveLength(1);
  });

  it("answers ok false with the error instead of throwing", async () => {
    const b = new FakeBackend();
    b.fail = new UserFacingError("Suunto refused the sign-in. Connect Suunto again.");
    expect(await service(b).check()).toEqual({ ok: false, error: "Suunto refused the sign-in. Connect Suunto again." });
  });
});
