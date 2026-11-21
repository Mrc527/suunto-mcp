/** views/src/model.ts: reading tool results and the geometry of the charts. */
import { describe, expect, it } from "vitest";
import {
  barAt,
  clock,
  duration,
  fmt,
  lapTable,
  linePath,
  localDateTime,
  locationPoints,
  napCount,
  nearestByT,
  niceRange,
  paceText,
  projectTrack,
  readResult,
  shortKey,
  sleepBars,
  statsSeries,
  streamPoints,
  workoutFacts,
  unitChoice,
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

  it("writes elapsed and zone times as m:ss, h:mm:ss from an hour on", () => {
    expect(clock(20)).toBe("0:20");
    expect(clock(2477)).toBe("41:17");
    expect(clock(4800)).toBe("1:20:00");
    expect(clock(3725.4)).toBe("1:02:05");
    expect(clock(undefined)).toBe("–");
  });

  it("writes paces as m:ss without rolling minutes into hours", () => {
    expect(paceText(5.6833)).toBe("5:41");
    expect(paceText(99.5)).toBe("99:30");
    expect(paceText(4.999)).toBe("5:00");
    expect(paceText(undefined)).toBe("–");
  });

  it("knows the units of an answer, for the calls the view makes", () => {
    expect(unitChoice({ distance: "mi" })).toBe("imperial");
    expect(unitChoice({ distance: "km" })).toBe("metric");
    expect(unitChoice({})).toBeUndefined();
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
    // A second line on the same time axis: from second 5 to 10 of a 0-20 s chart.
    expect(linePath([{ t: 5, v: 0 }, { t: 10, v: 10 }], 100, 50, { min: 0, max: 10 }, { t0: 0, t1: 20 })).toBe("M25.0,50.0L50.0,0.0");
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

  it("does not call a night without stages awake, and counts naps", () => {
    const data = {
      sleeps: [
        { date: "2026-11-03", is_nap: false, duration_s: 27000 },
        { date: "2026-11-03", is_nap: true, duration_s: 1200 },
        { date: "2026-11-04", is_nap: true, duration_s: 900 },
      ],
    };
    expect(sleepBars(data).map((b) => [b.stages, b.awake, b.total])).toEqual([[false, 0, 27000]]);
    // Only some stages: the rest is unknown, not awake.
    expect(sleepBars({ sleeps: [{ date: "2026-11-05", duration_s: 28800, deep_s: 3600 }] }).map((b) => [b.stages, b.awake])).toEqual([[false, 0]]);
    expect(napCount(data)).toBe(2);
    expect(napCount({})).toBe(0);
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

describe("workout facts", () => {
  const metric = { distance: "km", elevation: "m", speed: "km/h", pace: "min/km", temperature: "°C" };
  const facts = (data: Record<string, unknown>) => Object.fromEntries(workoutFacts(data).map((s) => [s.title, Object.fromEntries(s.items)]));

  it("shows a dive's data in its units, and leaves out what is not there", () => {
    const dive = { max_depth: 40.3, avg_depth: 25.5, dive_time_s: 2666.5, max_depth_temperature: 47.6, gases_used: ["EAN32", "", 7], dive_mode: "Nitrox", algorithm: "Buhlmann 16 GF", min_gf: 30, max_gf: 70, surface_time_s: 0 };
    expect(facts({ units: { ...metric, elevation: "ft", temperature: "°F" }, dive, summary: { pte: 1.5, feeling: 5 }, recovery_time_h: 6 })).toEqual({
      Dive: { "Max depth": "40.3 ft", "Avg depth": "25.5 ft", "Dive time": "44:27", "Temp. at max depth": "47.6 °F", Gas: "EAN32", Mode: "Nitrox", Algorithm: "Buhlmann 16 GF 30/70" },
      Effort: { "Training effect": "1.5", "Recovery time": "6 h", Feeling: "5 of 5" },
    });
    expect(facts({ units: metric, dive: { surface_time_s: 6240, algorithm: "Buhlmann 16 GF" } }).Dive).toEqual({ Algorithm: "Buhlmann 16 GF", "Surface interval": "1:44:00" });
  });

  it("shows a swim's strokes, and no top speed for it", () => {
    expect(facts({ units: metric, swimming: { avg_swolf: 40, avg_stroke_rate: 28, pool_length: 25 }, max_speed: 4.1 })).toEqual({ Swim: { SWOLF: "40", "Stroke rate": "28 /min", "Pool length": "25 m" } });
  });

  it("shows movement, effort and weather for a ride", () => {
    const ride = {
      units: metric,
      max_speed: 52.4,
      descent: 812,
      max_altitude: 1204.6,
      avg_cadence: 80,
      summary: { pte: 3.2, peak_epoc: 61.7, feeling: 4, avg_power_w: 125, max_power_w: 215, avg_cadence_rpm: 84 },
      fitness: { vo2_max: 50.5 },
      weather: { temperature: 7.3, humidity: 77, wind_speed: 4.3 },
      recovery_time_h: 29,
    };
    expect(facts(ride)).toEqual({
      Details: { "Max speed": "52.4 km/h", Descent: "812 m", "Max altitude": "1,205 m", "Avg cadence": "84 rpm", "Avg power": "125 W", "Max power": "215 W" },
      Effort: { "Training effect": "3.2", "Peak EPOC": "61.7", "Recovery time": "29 h", Feeling: "4 of 5", VO2max: "50.5" },
      Conditions: { "Air temperature": "7.3 °C", Wind: "4.3 km/h", Humidity: "77 %" },
    });
  });

  it("has no sections for a workout without these data, and ignores a feeling outside 1-5", () => {
    expect(workoutFacts({ units: metric, summary: { feeling: 9 } })).toEqual([]);
    expect(workoutFacts({})).toEqual([]);
  });
});

describe("lap table", () => {
  const units = { distance: "km", elevation: "m", speed: "km/h", pace: "min/km" };

  it("keeps the columns some lap has, with a dash where one lap has nothing", () => {
    const laps = [
      { lap: 1, duration_s: 300, distance: 1, avg_pace: "5:00", avg_speed: 12, avg_hr: 140, ascent: 12 },
      { lap: 2, duration_s: 290, distance: 1, avg_pace: "4:50", avg_speed: 12.4, avg_hr: 151 },
    ];
    // Pace wins over speed: they say the same.
    expect(lapTable({ units, laps })).toEqual({
      head: ["Lap", "Time", "Distance", "Pace", "Avg HR", "Ascent"],
      rows: [
        ["1", "5:00", "1 km", "5:00 min/km", "140", "12 m"],
        ["2", "4:50", "1 km", "4:50 min/km", "151", "–"],
      ],
    });
  });

  it("uses speed when no lap has a pace, and keeps a swim's own pace unit", () => {
    expect(lapTable({ units, laps: [{ lap: 1, avg_speed: 30 }, { lap: 2, avg_speed: 28.5 }] })!.head).toEqual(["Lap", "Speed"]);
    expect(lapTable({ units, laps: [{ lap: 1, avg_pace: "1:58 /100 m" }, { lap: 2, avg_pace: "2:01 /100 m" }] })!.rows.map((r) => r[1])).toEqual(["1:58 /100 m", "2:01 /100 m"]);
  });

  it("has no table for fewer than two laps", () => {
    expect(lapTable({ units, laps: [{ lap: 1, duration_s: 300 }] })).toBeUndefined();
    expect(lapTable({ units })).toBeUndefined();
  });
});
