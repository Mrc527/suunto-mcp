import { describe, expect, it } from "vitest";
import { CachedBackend, LONG_TTL_MS, SHORT_TTL_MS } from "../../src/activity/cache.js";
import type { ActivityBackend, WireDailyStatistic, WirePoiInput, WireRoute, WireWorkoutList } from "../../src/activity/types.js";

// Invented test data only.
const HOUR = 3_600_000;
/** 10:20 UTC: the current hour started at 10:00. */
const START = Date.parse("2026-11-10T10:20:00Z");
const HOUR_START = Date.parse("2026-11-10T10:00:00Z");

interface Fake extends ActivityBackend {
  calls: string[];
  count(name: string): number;
  /** The next call of this operation throws. */
  failNext: Set<string>;
  /** Calls of this operation wait until release() is called. */
  hold(name: string): () => void;
}

function fakeBackend(): Fake {
  const calls: string[] = [];
  const failNext = new Set<string>();
  const holds = new Map<string, Promise<void>>();
  let n = 0;
  const op = async (name: string) => {
    calls.push(name);
    const held = holds.get(name);
    if (held) await held;
    if (failNext.delete(name)) throw new Error(`${name} failed`);
    return ++n;
  };
  const list = (i: number): WireWorkoutList => ({ payload: [{ workoutKey: `w${i}`, totalTime: 60 }], metadata: { workoutcount: 1 } });
  const route = (i: number): WireRoute => ({ id: `r${i}`, description: `Route ${i}` });
  return {
    kind: "suunto",
    calls,
    failNext,
    count: (name) => calls.filter((c) => c === name).length,
    hold(name) {
      let release!: () => void;
      holds.set(
        name,
        new Promise<void>((resolve) => {
          release = () => {
            holds.delete(name);
            resolve();
          };
        }),
      );
      return release;
    },
    listWorkouts: async () => list(await op("listWorkouts")),
    getWorkout: async (key) => ({ workoutKey: key, totalTime: await op("getWorkout") }),
    exportFit: async () => Buffer.from([0x0e, 0x10, await op("exportFit")]),
    activitySamples: async () => [{ timestamp: "2026-11-10T09:00:00Z", entryData: { HR: await op("activitySamples") } }],
    sleep: async () => [{ timestamp: "2026-11-10T06:00:00Z", entryData: { Duration: await op("sleep") } }],
    recovery: async () => [{ timestamp: "2026-11-10T06:00:00Z", entryData: { Balance: (await op("recovery")) / 100 } }],
    dailyStatistics: async (): Promise<WireDailyStatistic[]> => [{ Name: "stepcount", Sources: [{ Samples: [{ TimeISO8601: "2026-11-09T00:00:00", Value: await op("dailyStatistics") }] }] }],
    listRoutes: async () => [route(await op("listRoutes"))],
    getRoute: async (id) => ({ ...route(await op("getRoute")), id }),
    exportRouteGpx: async () => `<gpx>${await op("exportRouteGpx")}</gpx>`,
    importRouteGpx: async () => route(await op("importRouteGpx")),
    listPois: async () => [{ pointOfInterest: { key: `p${await op("listPois")}`, point: { x: 7.9, y: 46.5, type: 26 } } }],
    createPoi: async (poi: WirePoiInput) => ({ pointOfInterest: { key: `p${await op("createPoi")}`, point: { ...poi.point } } }),
    account: async () => {
      calls.push("account");
      return { username: "cachetester" };
    },
    close: async () => {
      calls.push("close");
    },
  };
}

function setup(opts: { maxEntries?: number; maxBytes?: number } = {}) {
  const inner = fakeBackend();
  let now = START;
  const cache = new CachedBackend(inner, { now: () => now, ...opts });
  return {
    inner,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const LIST = { since: 1, until: 2, limit: 20, offset: 0, byModificationTime: false };
const POI: WirePoiInput = { point: { x: 7.9, y: 46.5, name: "Spring", type: 26 }, watchEnabled: true };

describe("CachedBackend", () => {
  it("keeps workout lists for 2 minutes, keyed by every query field", async () => {
    const { inner, cache, advance } = setup();
    expect(cache.kind).toBe("suunto");
    const first = await cache.listWorkouts(LIST);
    expect(await cache.listWorkouts(LIST)).toEqual(first);
    expect(inner.count("listWorkouts")).toBe(1);
    await cache.listWorkouts({ ...LIST, offset: 20 });
    await cache.listWorkouts({ ...LIST, byModificationTime: true });
    expect(inner.count("listWorkouts")).toBe(3);
    advance(SHORT_TTL_MS - 1);
    await cache.listWorkouts(LIST);
    expect(inner.count("listWorkouts")).toBe(3);
    advance(1);
    await cache.listWorkouts(LIST);
    expect(inner.count("listWorkouts")).toBe(4);
  });

  it("keeps a workout by key and FIT files for 30 minutes", async () => {
    const { inner, cache, advance } = setup();
    await cache.getWorkout("w1", ["SummaryExtension"]);
    await cache.getWorkout("w1", ["SummaryExtension"]);
    await cache.getWorkout("w1", []);
    await cache.getWorkout("w2", ["SummaryExtension"]);
    expect(inner.count("getWorkout")).toBe(3);
    const fit = await cache.exportFit("w1");
    expect(Buffer.isBuffer(fit)).toBe(true);
    advance(LONG_TTL_MS - 1);
    expect(await cache.exportFit("w1")).toEqual(fit);
    await cache.getWorkout("w1", ["SummaryExtension"]);
    expect(inner.count("exportFit")).toBe(1);
    expect(inner.count("getWorkout")).toBe(3);
    advance(1);
    await cache.exportFit("w1");
    expect(inner.count("exportFit")).toBe(2);
  });

  it("hands out copies: changing an answer does not change the cache", async () => {
    const { cache } = setup();
    const a = await cache.listWorkouts(LIST);
    a.payload[0]!.workoutKey = "changed";
    a.payload.push({ workoutKey: "extra" });
    const b = await cache.listWorkouts(LIST);
    expect(b.payload).toEqual([{ workoutKey: "w1", totalTime: 60 }]);
    const fit = await cache.exportFit("w1");
    fit[0] = 0xff;
    expect((await cache.exportFit("w1"))[0]).toBe(0x0e);
  });

  it("keeps 24/7 windows that ended before the current hour for 30 minutes, others for 2", async () => {
    const { inner, cache, advance } = setup();
    const past = [HOUR_START - 28 * 24 * HOUR, HOUR_START] as const;
    await cache.activitySamples(...past);
    await cache.sleep(...past);
    await cache.recovery(...past);
    advance(LONG_TTL_MS - 1);
    await cache.activitySamples(...past);
    await cache.sleep(...past);
    await cache.recovery(...past);
    expect(inner.calls.filter((c) => ["activitySamples", "sleep", "recovery"].includes(c))).toHaveLength(3);
    advance(1);
    await cache.sleep(...past);
    expect(inner.count("sleep")).toBe(2);

    // A window into the current hour: kept 2 minutes.
    const { inner: inner2, cache: cache2, advance: advance2 } = setup();
    const from = HOUR_START - 2 * HOUR;
    await cache2.recovery(from, START - 1);
    advance2(SHORT_TTL_MS - 1);
    await cache2.recovery(from, START - 1);
    expect(inner2.count("recovery")).toBe(1);
    advance2(1);
    await cache2.recovery(from, START - 1);
    expect(inner2.count("recovery")).toBe(2);
  });

  it("serves a window that ends now to a later call with the same start", async () => {
    const { inner, cache, advance } = setup();
    const from = HOUR_START - 24 * HOUR;
    await cache.activitySamples(from, START - 1);
    advance(30_000);
    // The service asks up to "now" every time: the end moved, the start did not.
    await cache.activitySamples(from, START + 30_000 - 1);
    expect(inner.count("activitySamples")).toBe(1);
    // An earlier end is not served from a longer window.
    await cache.activitySamples(from, START - 60_000);
    expect(inner.count("activitySamples")).toBe(2);
    // Another start is another entry.
    await cache.activitySamples(from + HOUR, START + 30_000);
    expect(inner.count("activitySamples")).toBe(3);
  });

  it("keeps daily statistics by their end date", async () => {
    const { inner, cache, advance } = setup();
    await cache.dailyStatistics("2026-10-12T23:00:00", "2026-11-08T22:59:59");
    await cache.dailyStatistics("2026-11-09T23:00:00", "2026-11-10T22:59:59");
    advance(SHORT_TTL_MS);
    await cache.dailyStatistics("2026-10-12T23:00:00", "2026-11-08T22:59:59");
    await cache.dailyStatistics("2026-11-09T23:00:00", "2026-11-10T22:59:59");
    // The finished days were kept; today's were asked again.
    expect(inner.count("dailyStatistics")).toBe(3);
  });

  it("keeps routes, route GPX and points of interest for 2 minutes", async () => {
    const { inner, cache, advance } = setup();
    const q = { page: 0, size: 20, sort: "desc" as const };
    for (let i = 0; i < 2; i++) {
      await cache.listRoutes(q);
      await cache.getRoute("r1");
      await cache.exportRouteGpx("r1");
      await cache.listPois({ limit: 50, offset: 0 });
    }
    expect(inner.calls).toEqual(["listRoutes", "getRoute", "exportRouteGpx", "listPois"]);
    advance(SHORT_TTL_MS);
    await cache.listRoutes(q);
    await cache.listPois({ limit: 50, offset: 0 });
    expect(inner.count("listRoutes")).toBe(2);
    expect(inner.count("listPois")).toBe(2);
  });

  it("never keeps errors", async () => {
    const { inner, cache } = setup();
    inner.failNext.add("getWorkout");
    await expect(cache.getWorkout("w1", [])).rejects.toThrow(/getWorkout failed/);
    expect((await cache.getWorkout("w1", [])).workoutKey).toBe("w1");
    expect(inner.count("getWorkout")).toBe(2);
    expect(cache.size).toBe(1);
  });

  it("shares one request between identical calls at the same time", async () => {
    const { inner, cache } = setup();
    const release = inner.hold("listWorkouts");
    const calls = [cache.listWorkouts(LIST), cache.listWorkouts(LIST), cache.listWorkouts(LIST)];
    release();
    const answers = await Promise.all(calls);
    expect(inner.count("listWorkouts")).toBe(1);
    expect(answers[0]).toEqual(answers[2]);
    // Each caller still gets its own copy.
    expect(answers[0]).not.toBe(answers[1]);
  });

  it("clears the routes after a route import, and the POIs after a new point, even when the write failed", async () => {
    const { inner, cache } = setup();
    const q = { page: 0, size: 20, sort: "desc" as const };
    await cache.listRoutes(q);
    await cache.getRoute("r1");
    await cache.listPois({ limit: 50, offset: 0 });
    await cache.listWorkouts(LIST);
    await cache.importRouteGpx("<gpx/>", [1]);
    await cache.listRoutes(q);
    await cache.getRoute("r1");
    await cache.listPois({ limit: 50, offset: 0 });
    await cache.listWorkouts(LIST);
    expect(inner.count("listRoutes")).toBe(2);
    expect(inner.count("getRoute")).toBe(2);
    // Other groups are kept.
    expect(inner.count("listPois")).toBe(1);
    expect(inner.count("listWorkouts")).toBe(1);

    await cache.createPoi(POI);
    await cache.listPois({ limit: 50, offset: 0 });
    expect(inner.count("listPois")).toBe(2);

    // A write that may have reached Suunto: the next list must not come from the cache.
    inner.failNext.add("importRouteGpx");
    await expect(cache.importRouteGpx("<gpx/>", [])).rejects.toThrow(/importRouteGpx failed/);
    await cache.listRoutes(q);
    expect(inner.count("listRoutes")).toBe(3);
    inner.failNext.add("createPoi");
    await expect(cache.createPoi(POI)).rejects.toThrow(/createPoi failed/);
    await cache.listPois({ limit: 50, offset: 0 });
    expect(inner.count("listPois")).toBe(3);
  });

  it("does not keep a list that was read while a route import ran", async () => {
    const { inner, cache } = setup();
    const q = { page: 0, size: 20, sort: "desc" as const };
    const release = inner.hold("listRoutes");
    const listing = cache.listRoutes(q);
    await cache.importRouteGpx("<gpx/>", [1]);
    release();
    await listing;
    await cache.listRoutes(q);
    expect(inner.count("listRoutes")).toBe(2);
  });

  it("drops the least recently used entries beyond 200 entries or the byte limit", async () => {
    const { inner, cache } = setup({ maxEntries: 3 });
    await cache.getWorkout("a", []);
    await cache.getWorkout("b", []);
    await cache.getWorkout("c", []);
    await cache.getWorkout("a", []); // a is now the most recently used
    await cache.getWorkout("d", []); // b goes
    expect(cache.size).toBe(3);
    await cache.getWorkout("a", []);
    await cache.getWorkout("c", []);
    await cache.getWorkout("d", []);
    expect(inner.count("getWorkout")).toBe(4);
    await cache.getWorkout("b", []);
    expect(inner.count("getWorkout")).toBe(5);

    const small = setup({ maxBytes: 300 });
    await small.cache.exportRouteGpx("r1");
    await small.cache.listWorkouts(LIST);
    expect(small.cache.bytes).toBeGreaterThan(0);
    expect(small.cache.bytes).toBeLessThanOrEqual(300);
    // An answer larger than the whole cache is never kept.
    const big = new CachedBackend({ ...fakeBackend(), exportFit: async () => Buffer.alloc(301) }, { maxBytes: 300 });
    await big.exportFit("w1");
    expect(big.size).toBe(0);
  });

  it("passes account() and close() through, and forgets everything on close", async () => {
    const { inner, cache } = setup();
    expect(await cache.account()).toEqual({ username: "cachetester" });
    expect(await cache.account()).toEqual({ username: "cachetester" });
    expect(inner.count("account")).toBe(2);
    await cache.listWorkouts(LIST);
    expect(cache.size).toBe(1);
    await cache.close();
    expect(inner.count("close")).toBe(1);
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });
});
