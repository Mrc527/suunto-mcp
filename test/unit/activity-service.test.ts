import { describe, expect, it } from "vitest";
import { ActivityService, checkGpx, ReadOnlyError, type ServiceOptions } from "../../src/activity/service.js";
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

/** An in-memory backend that records every call and checks the API's window rules. */
class FakeBackend implements ActivityBackend {
  readonly kind = "demo" as const;
  calls: Call[] = [];
  workouts: WireWorkout[] = [];
  /** The order the fake "Suunto" lists workouts in. */
  order: "desc" | "asc" = "desc";
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
    expect(q.limit).toBeGreaterThanOrEqual(1);
    expect(q.limit).toBeLessThanOrEqual(100);
    expect(q.byModificationTime).toBe(false);
    const inRange = this.workouts.filter((w) => (q.since === undefined || w.startTime! >= q.since) && (q.until === undefined || w.startTime! < q.until));
    inRange.sort((a, b) => (this.order === "desc" ? b.startTime! - a.startTime! : a.startTime! - b.startTime!));
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

describe("workout list", () => {
  it("asks for the last 30 local days by start time, newest first, one request", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 30 }, (_, i) => workout(i, i * 12));
    const r = await service(b).listWorkouts({});
    const q = b.ops("listWorkouts")[0]!.args[0] as ListWorkoutsQuery;
    expect(q).toMatchObject({ since: ms("2026-10-11T22:00:00Z"), until: ms("2026-11-10T23:00:00Z"), limit: 21, offset: 0 });
    expect(b.calls).toHaveLength(1);
    expect(r.from).toBe("2026-10-12");
    expect(r.to).toBe("2026-11-10");
    expect(r.count).toBe(20);
    expect(r.workouts[0]!.workout_key).toBe("w0000");
    expect(r.next_offset).toBe(20);
    expect(r.total_in_range).toBeUndefined();
    expect(r.units.distance).toBe("km");
    const next = await service(b).listWorkouts({ offset: 20 });
    expect(next.workouts.map((w) => w.workout_key)).toEqual(["w0020", "w0021", "w0022", "w0023", "w0024", "w0025", "w0026", "w0027", "w0028", "w0029"]);
    expect(next.total_in_range).toBe(30);
    expect(next.next_offset).toBeUndefined();
  });

  it("reads the whole range and sorts here when Suunto lists oldest first", async () => {
    const b = new FakeBackend();
    b.order = "asc";
    b.workouts = Array.from({ length: 150 }, (_, i) => workout(i, i * 4));
    const page1 = await service(b).listWorkouts({ limit: 10 });
    expect(page1.workouts.map((w) => w.workout_key)).toEqual(["w0000", "w0001", "w0002", "w0003", "w0004", "w0005", "w0006", "w0007", "w0008", "w0009"]);
    expect(page1.total_in_range).toBe(150);
    expect(page1.next_offset).toBe(10);
    // One page to find the order, then pages of 100.
    expect(b.ops("listWorkouts").map((c) => (c.args[0] as ListWorkoutsQuery).limit)).toEqual([11, 100, 100]);
    b.calls = [];
    const page2 = await service(b).listWorkouts({ limit: 10, offset: 145 });
    expect(page2.workouts.map((w) => w.workout_key)).toEqual(["w0145", "w0146", "w0147", "w0148", "w0149"]);
    expect(page2.next_offset).toBeUndefined();
    expect(page2.total_in_range).toBe(150);
    // A short last page tells the total: one more request instead of reading the whole range.
    expect(b.ops("listWorkouts").map((c) => (c.args[0] as ListWorkoutsQuery).limit)).toEqual([11, 5]);
  });

  it("finds the last workout of a page of one, in either order", async () => {
    for (const order of ["asc", "desc"] as const) {
      const b = new FakeBackend();
      b.order = order;
      b.workouts = Array.from({ length: 21 }, (_, i) => workout(i, i * 4));
      const r = await service(b).listWorkouts({ offset: 20 });
      expect(r.workouts.map((w) => w.workout_key), order).toEqual(["w0020"]);
      expect(r.total_in_range).toBe(21);
      expect(b.ops("listWorkouts").length).toBeLessThanOrEqual(2);
      const past = await service(b).listWorkouts({ offset: 40 });
      expect(past).toMatchObject({ count: 0, workouts: [] });
    }
  });

  it("filters by sport over the whole range, newest first, and pages", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 250 }, (_, i) => workout(i, i, [1, 22, 2, 11][i % 4]!));
    const r = await service(b).listWorkouts({ from: "2026-10-01", sport: "run", limit: 5, offset: 5 });
    expect(r.sport).toBe("run");
    expect(r.sports_matched).toEqual(expect.arrayContaining(["Running", "Trail running"]));
    expect(r.total_in_range).toBe(126);
    expect(r.workouts.map((w) => w.workout_key)).toEqual(["w0009", "w0012", "w0013", "w0016", "w0017"]);
    expect(r.workouts.every((w) => w.sport === "Running" || w.sport === "Trail running")).toBe(true);
    expect(r.next_offset).toBe(10);
    expect(b.ops("listWorkouts")).toHaveLength(3);
    const exact = await service(b).listWorkouts({ from: "2026-10-01", sport: "TRAIL RUNNING" });
    expect(exact.total_in_range).toBe(63);
  });

  it("says when the 1000 workout cap of the sport filter is hit", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 1100 }, (_, i) => workout(i, i / 4, i % 2 ? 1 : 2));
    const r = await service(b).listWorkouts({ sport: "bike" });
    expect(b.ops("listWorkouts")).toHaveLength(10);
    expect(r.total_in_range).toBeUndefined();
    expect(r.note).toMatch(/more than 1000 workouts/);
    expect(r.count).toBe(20);
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
  it("asks for the summary and lap extensions and only the streams needed", async () => {
    const b = new FakeBackend();
    b.workouts = [workout(1, 5, 1, { extensions: [{ type: "SpeedStreamExtension", points: [{ timestamp: NOW - 5 * HOUR_MS, value: 3 }] }] })];
    const w = await service(b).getWorkout({ workout_key: "w0001", samples: ["speed", "pace", "speed"] });
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
      "SpeedStreamExtension",
    ]);
    expect(Object.keys(w.samples ?? {})).toEqual(["speed", "pace"]);
    expect(w.samples?.speed?.points).toEqual([{ t: 0, v: 10.8 }]);
    await expect(service(b).getWorkout({ workout_key: "../etc" })).rejects.toThrow(/workout key/);
    await expect(service(b).getWorkout({ workout_key: "w0001", max_points: 5 })).rejects.toThrow(/max_points/);
  });

  it("refuses FIT files over 8 MB and names the file", async () => {
    const b = new FakeBackend();
    const ok = await service(b).exportFit({ workout_key: "w0001" });
    expect(ok).toMatchObject({ workout_key: "w0001", bytes: 8, file_name: "suunto-workout-w0001.fit" });
    b.fit = Buffer.alloc(8 * 1024 * 1024 + 1);
    await expect(service(b).exportFit({ workout_key: "w0001" })).rejects.toThrow(/8\.0 MB, more than the 8 MB/);
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

  it("reads at most 2000 workouts and says so", async () => {
    const b = new FakeBackend();
    b.workouts = Array.from({ length: 2050 }, (_, i) => workout(i, i));
    const r = await service(b).workoutStats({});
    expect(r.count).toBe(2000);
    expect(r.note).toMatch(/More than 2000/);
    expect(b.ops("listWorkouts")).toHaveLength(20);
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
    expect(b.ops("listWorkouts")[0]!.args[0]).toMatchObject({ since: NOW - 30 * DAY_MS, until: NOW, limit: 100, offset: 0 });
    expect(s.backend).toBe(b);
  });

  it("answers ok false with the error instead of throwing", async () => {
    const b = new FakeBackend();
    b.fail = new UserFacingError("Suunto refused the sign-in. Connect Suunto again.");
    expect(await service(b).check()).toEqual({ ok: false, error: "Suunto refused the sign-in. Connect Suunto again." });
  });
});
