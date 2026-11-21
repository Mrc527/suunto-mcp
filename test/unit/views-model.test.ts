/** views/src/model.ts: reading tool results and the geometry of the charts. */
import { describe, expect, it } from "vitest";
import {
  barAt,
  duration,
  fmt,
  linePath,
  localDateTime,
  locationPoints,
  nearestByT,
  niceRange,
  projectTrack,
  readResult,
  shortKey,
  sleepBars,
  statsSeries,
  streamPoints,
} from "../../views/src/model.js";

describe("readResult", () => {
  it("reads the JSON text the tools answer with, and prefers structuredContent", () => {
    expect(readResult({ content: [{ type: "text", text: '{"a":1}' }] })).toEqual({ ok: true, data: { a: 1 } });
    expect(readResult({ content: [{ type: "text", text: '{"a":1}' }], structuredContent: { b: 2 } })).toEqual({ ok: true, data: { b: 2 } });
  });

  it("turns errors, text that is not a JSON object, and nothing into a message", () => {
    expect(readResult({ isError: true, content: [{ type: "text", text: "Suunto is not connected." }] })).toEqual({ ok: false, message: "Suunto is not connected." });
    expect(readResult({ isError: true, content: [] })).toEqual({ ok: false, message: "The tool call failed." });
    expect(readResult({ content: [{ type: "text", text: "plain words" }] })).toEqual({ ok: false, message: "plain words" });
    expect(readResult({ content: [{ type: "text", text: "[1,2]" }] })).toEqual({ ok: false, message: "[1,2]" });
    expect(readResult({ content: [] })).toEqual({ ok: false, message: "The result holds no data." });
    expect(readResult(undefined)).toEqual({ ok: false, message: "No result." });
  });
});

describe("formatting", () => {
  it("writes durations as h:mm, or m:ss under an hour on request", () => {
    expect(duration(0)).toBe("0:00");
    expect(duration(2917)).toBe("0:48");
    expect(duration(19161)).toBe("5:19");
    expect(duration(2477, true)).toBe("41:17");
    expect(duration(3725, true)).toBe("1:02");
    expect(duration(undefined)).toBe("–");
    expect(duration(-5)).toBe("–");
  });

  it("writes numbers without trailing zeros, and the workout's own local time", () => {
    expect(fmt(8.55, 2)).toBe("8.55");
    expect(fmt(8.5, 2)).toBe("8.5");
    expect(fmt(1497.94)).toBe("1,497.9");
    expect(fmt(undefined)).toBe("–");
    expect(localDateTime("2026-11-19T07:07:48+01:00")).toBe("2026-11-19 07:07");
    expect(localDateTime("2026-11-19")).toBe("2026-11-19");
    expect(localDateTime(undefined)).toBe("–");
  });

  it("shortens axis labels", () => {
    expect(shortKey("2026-W07")).toBe("W07");
    expect(shortKey("2026-05")).toBe("May 26");
    expect(shortKey("2026-11-03")).toBe("11-03");
    expect(shortKey("2026")).toBe("2026");
  });
});

describe("streams", () => {
  it("keeps only points with numbers, and only real coordinates", () => {
    expect(streamPoints({ points: [{ t: 0, v: 90 }, { t: 1 }, { t: "2", v: 3 }, null, { t: 3, v: 95 }] })).toEqual([
      { t: 0, v: 90 },
      { t: 3, v: 95 },
    ]);
    expect(streamPoints(undefined)).toEqual([]);
    expect(locationPoints({ points: [{ t: 0, lat: 46.9, lon: 8.4 }, { t: 1, lat: 95, lon: 8 }, { t: 2, lat: 46.9 }] })).toEqual([{ t: 0, lat: 46.9, lon: 8.4 }]);
  });

  it("projects a track into the box, keeping its shape and north up", () => {
    const square = [
      { t: 0, lat: 0, lon: 0 },
      { t: 1, lat: 0, lon: 1 },
      { t: 2, lat: 1, lon: 1 },
      { t: 3, lat: 1, lon: 0 },
    ];
    const p = projectTrack(square, 200, 100, 0);
    // A square stays square (100 x 100), centred in the 200 x 100 box.
    expect(p.map(({ x, y }) => [Math.round(x), Math.round(y)])).toEqual([
      [50, 100],
      [150, 100],
      [150, 0],
      [50, 0],
    ]);
    expect(projectTrack([], 10, 10)).toEqual([]);
    // One point does not divide by zero.
    expect(projectTrack([{ t: 0, lat: 46, lon: 8 }], 10, 10).every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
  });

  it("finds the nearest point in time", () => {
    const pts = [{ t: 0 }, { t: 10 }, { t: 20 }, { t: 30 }];
    expect(nearestByT(pts, -5)).toBe(0);
    expect(nearestByT(pts, 14)).toBe(1);
    expect(nearestByT(pts, 16)).toBe(2);
    expect(nearestByT(pts, 99)).toBe(3);
    expect(nearestByT([], 5)).toBe(-1);
  });

  it("draws a line through the points with some room above and below", () => {
    expect(niceRange([])).toEqual({ min: 0, max: 1 });
    expect(niceRange([5, 5])).toEqual({ min: expect.closeTo(3.84), max: expect.closeTo(6.16) });
    expect(linePath([], 100, 50)).toBe("");
    expect(linePath([{ t: 0, v: 0 }, { t: 10, v: 10 }], 100, 50, { min: 0, max: 10 })).toBe("M0.0,50.0L100.0,0.0");
  });
});

describe("sleep and statistics", () => {
  it("makes one bar per night with the awake time, naps left out, in date order", () => {
    const bars = sleepBars({
      sleeps: [
        { date: "2026-11-02", is_nap: false, duration_s: 1000, deep_s: 100, light_s: 500, rem_s: 200 },
        { date: "2026-11-01", is_nap: false, duration_s: 900, deep_s: 300, light_s: 300, rem_s: 300 },
        { date: "2026-11-02", is_nap: true, duration_s: 600, deep_s: 0, light_s: 600, rem_s: 0 },
      ],
    });
    expect(bars.map((b) => [b.date, b.deep, b.light, b.rem, b.awake])).toEqual([
      ["2026-11-01", 300, 300, 300, 0],
      ["2026-11-02", 100, 500, 200, 200],
    ]);
    expect(sleepBars({})).toEqual([]);
  });

  it("reads one metric per period", () => {
    const data = { groups: [{ key: "2026-W01", total_distance: 12.5, count: 2 }, { key: "2026-W02", count: 1 }] };
    expect(statsSeries(data, "total_distance").map((s) => [s.key, s.value])).toEqual([
      ["2026-W01", 12.5],
      ["2026-W02", 0],
    ]);
    expect(statsSeries({}, "count")).toEqual([]);
  });

  it("picks the bar under the pointer, also at the edges", () => {
    expect(barAt(0, 4)).toBe(0);
    expect(barAt(0.49, 4)).toBe(1);
    expect(barAt(1, 4)).toBe(3);
    expect(barAt(-0.2, 4)).toBe(0);
    expect(barAt(1.5, 4)).toBe(3);
  });
});
