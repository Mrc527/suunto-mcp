import { describe, expect, it } from "vitest";
import {
  availableSamples,
  convertFields,
  dateOfDailySample,
  downsample,
  relativeTimes,
  snakeCase,
  toDaySummaries,
  toPoiSummary,
  toRecoveryPoints,
  toRouteSummary,
  toSamplePoints,
  toSleepNight,
  toWorkout,
  toWorkoutSummary,
} from "../../src/activity/format.js";
import type { WireActivityEntry, WireDailyStatistic, WireRecoveryEntry, WireSample, WireSleepEntry, WireWorkout } from "../../src/activity/types.js";
import { startOfDay } from "../../src/util/dates.js";

// The workout of the documented list example (docs/suunto-api.md 3.4), as Suunto wrote it.
const LIST_EXAMPLE: WireWorkout = {
  activityId: 11,
  startTime: 1526196562327,
  totalTime: 2686.03,
  totalDistance: 3900.0,
  totalAscent: 88.75,
  totalDescent: 128.52,
  startPosition: { x: 23.842736666666667, y: 61.453113333333334 },
  stopPosition: { x: 23.844015, y: 61.45330166666667 },
  centerPosition: { x: 23.831098333333333, y: 61.45186 },
  maxSpeed: 2.6,
  recoveryTime: 0,
  cumulativeRecoveryTime: 0,
  rankings: { totalTimeOnRouteRanking: { originalRanking: 1, originalNumberOfWorkouts: 1 } },
  extensions: [
    {
      type: "SummaryExtension",
      pte: 2.0,
      feeling: null,
      avgTemperature: 302.44998,
      maxTemperature: null,
      peakEpoc: 14.5,
      avgPower: null,
      maxPower: null,
      avgCadence: 0.9801348,
      maxCadence: null,
      ascentTime: 1178.0,
      descentTime: 1043.0,
      performanceLevel: null,
    },
  ],
  extensionTypes: ["DISTANCEDELTA", "ALTITUDESTREAM", "LOCATIONSTREAM", "EPOCSTREAM", "SUMMARY", "SPEEDSTREAM", "HEARTRATESTREAM", "VERTICALSPEEDSTREAM", "SEALEVELPRESSURESTREAM", "CADENCESTREAM", "INTENSITY"],
  minAltitude: 128.2,
  maxAltitude: 173.6,
  workoutKey: "5b190f5c52ce7b316acbd520",
  avgPace: 11.48,
  commentCount: 0,
  pictureCount: 0,
  viewCount: 0,
  cadence: { max: 0, avg: 0 },
  hrdata: { userMaxHR: 0, workoutMaxHR: 145, workoutAvgHR: 114, hrmax: 145, max: 0, avg: 114 },
  avgSpeed: 1.45,
  energyConsumption: 360,
};

describe("workouts", () => {
  it("formats the documented list example (no offset: the user's zone)", () => {
    const s = toWorkoutSummary(LIST_EXAMPLE, "metric", "Europe/Helsinki");
    expect(s).toEqual({
      workout_key: "5b190f5c52ce7b316acbd520",
      sport: "Hiking",
      activity_id: 11,
      start: "2018-05-13T10:29:22+03:00",
      end: "2018-05-13T11:14:08+03:00",
      duration: "0:44:46",
      duration_s: 2686,
      distance: 3.9,
      ascent: 89,
      descent: 129,
      avg_speed: 5.2,
      max_speed: 9.4,
      avg_pace: "11:30",
      avg_hr: 114,
      max_hr: 145,
      energy_kcal: 360,
    });
  });

  it("uses the workout's own offset and reads startTime in seconds", () => {
    const w: WireWorkout = { workoutKey: "a1", activityId: 1, startTime: 1777613400, timeOffsetInMinutes: 120, totalTime: 1800, totalDistance: 5000 };
    const s = toWorkoutSummary(w, "metric", "UTC");
    expect(s.start).toBe("2026-05-01T07:30:00+02:00");
    expect(s.end).toBe("2026-05-01T08:00:00+02:00");
    expect(s.avg_pace).toBe("6:00");
    expect(s.avg_speed).toBe(10);
    const stop = toWorkoutSummary({ ...w, startTime: 1777613400000, stopTime: 1777615500000 }, "metric", "UTC");
    expect(stop.end).toBe("2026-05-01T08:05:00+02:00");
  });

  it("gives a swimming pace per 100 m and no pace for cycling", () => {
    const swim = toWorkoutSummary({ workoutKey: "s", activityId: 21, startTime: 1777613400000, totalTime: 2300, totalDistance: 2000 }, "metric", "UTC");
    expect(swim.avg_pace).toBe("1:55 /100 m");
    const ride = toWorkoutSummary({ workoutKey: "r", activityId: 2, startTime: 1777613400000, totalTime: 3600, totalDistance: 30000 }, "imperial", "UTC");
    expect(ride.avg_pace).toBeUndefined();
    expect(ride.distance).toBe(18.64);
    expect(ride.avg_speed).toBe(18.6);
  });

  it("converts the SummaryExtension and the workout fields", () => {
    const w = toWorkout({ ...LIST_EXAMPLE, timeOffsetInMinutes: 180, description: "Morning loop" }, "metric", "UTC");
    expect(w.summary).toEqual({
      pte: 2,
      avg_temperature: 29.3,
      peak_epoc: 14.5,
      avg_cadence_rpm: 59,
      ascent_time: "0:19:38",
      ascent_time_s: 1178,
      descent_time: "0:17:23",
      descent_time_s: 1043,
    });
    expect(w.utc_offset).toBe("+03:00");
    expect(w.start).toBe("2018-05-13T10:29:22+03:00");
    expect(w.description).toBe("Morning loop");
    expect(w.min_altitude).toBe(128);
    expect(w.max_altitude).toBe(174);
    // The workout's cadence object is all zeros: the summary's Hz value is used.
    expect(w.avg_cadence).toBe(59);
    expect(w.start_position).toEqual({ latitude: 61.453113, longitude: 23.842737 });
    expect(w.end_position).toEqual({ latitude: 61.453302, longitude: 23.844015 });
    expect(w.available_data).toEqual(["heart_rate", "altitude", "speed", "pace", "cadence", "distance", "location"]);
    expect(w.units.temperature).toBe("°C");
    expect(w.samples).toBeUndefined();
    expect(w.laps).toBeUndefined();
  });

  it("converts to imperial", () => {
    const w = toWorkout(LIST_EXAMPLE, "imperial", "UTC");
    expect(w.distance).toBe(2.42);
    expect(w.ascent).toBe(291);
    expect(w.avg_speed).toBe(3.2);
    expect(w.avg_pace).toBe("18:30");
    expect(w.summary?.avg_temperature).toBe(84.7);
    expect(w.units).toMatchObject({ distance: "mi", elevation: "ft", speed: "mph", pace: "min/mi", temperature: "°F" });
  });

  it("converts heart rate zones, fitness, weather, dive, swimming and ski extensions", () => {
    const w = toWorkout(
      {
        workoutKey: "d1",
        activityId: 78,
        startTime: 1777613400000,
        totalTime: 2700,
        extensions: [
          {
            type: "IntensityExtension",
            overallIntensity: 1.2,
            zones: {
              heartRate: { zone1: { totalTime: 600, lowerLimit: 1.5 }, zone2: { totalTime: 1200.4, lowerLimit: 2 } },
              power: { zone1: { totalTime: 30, lowerLimit: 150 } },
            },
          },
          { type: "FitnessExtension", vo2Max: 51.234, maxHeartRate: 3.15, fitnessAge: 35 },
          { type: "WeatherExtension", temperature: 283.15, windSpeed: 5, humidity: 80, weatherIcon: "02d" },
          { type: "DiveHeaderExtension", maxDepth: 30.25, avgDepth: 18.4, diveTime: 2700, maxDepthTemperature: 291.15, gasesUsed: ["Air"], algorithm: "Buhlmann 16 GF", minGF: 0.3 },
          { type: "SwimmingHeaderExtension", poolLength: 25, avgSwolf: 38 },
          { type: "SkiExtension", statistics: { numberOfRuns: 7, descentDistance: 8400, descentMaxSpeedMetersPerSecond: 20 } },
          { type: "SomethingNew", value: 1 },
        ],
      },
      "metric",
      "Europe/Zurich",
    );
    expect(w.intensity).toEqual({
      heart_rate_zones: [
        { zone: 1, time: "0:10:00", time_s: 600, lower_limit: 90 },
        { zone: 2, time: "0:20:00", time_s: 1200, lower_limit: 120 },
      ],
      power_zones: [{ zone: 1, time: "0:00:30", time_s: 30, lower_limit_w: 150 }],
      overall_intensity: 1.2,
    });
    expect(w.fitness).toEqual({ vo2_max: 51.234, max_heart_rate: 189, fitness_age: 35 });
    const flat = toWorkout({ workoutKey: "z", extensions: [{ type: "IntensityExtension", zones: { zone1: { totalTime: 60 }, zone2: 120 } }] }, "metric", "UTC");
    expect(flat.intensity).toEqual({ heart_rate_zones: [{ zone: 1, time: "0:01:00", time_s: 60 }, { zone: 2, time: "0:02:00", time_s: 120 }] });
    expect(w.weather).toEqual({ temperature: 10, wind_speed: 18, humidity: 80, weather_icon: "02d" });
    expect(w.dive).toEqual({
      max_depth: 30.3,
      avg_depth: 18.4,
      dive_time: "0:45:00",
      dive_time_s: 2700,
      max_depth_temperature: 18,
      gases_used: ["Air"],
      algorithm: "Buhlmann 16 GF",
      min_gf: 0.3,
    });
    expect(w.swimming).toEqual({ pool_length: 25, avg_swolf: 38 });
    expect(w.ski).toEqual({ statistics: { number_of_runs: 7, descent_distance: 8.4, descent_max_speed_meters_per_second: 72 } });
    expect(w.utc_offset).toBe("+02:00");
  });

  it("reads laps with durations, and lap markers as laps between the presses", () => {
    const start = 1777613400000;
    const withTable = toWorkout(
      {
        workoutKey: "l1",
        activityId: 1,
        startTime: start,
        totalTime: 900,
        extensions: [
          {
            type: "DistanceLapExtension",
            lapTable: [
              { lapNumber: 1, timestamp: start, duration: 300, distance: 1000, hr: { avg: 2.5, max: 2.8, min: 2 }, ascent: 5 },
              { lapNumber: 2, timestamp: start + 300_000, duration: 290, distance: 1000, avgHR: 152 },
            ],
          },
        ],
      },
      "metric",
      "UTC",
    );
    expect(withTable.laps).toEqual([
      { lap: 1, type: "distance", start_s: 0, duration: "0:05:00", duration_s: 300, distance: 1, avg_hr: 150, max_hr: 168, avg_speed: 12, avg_pace: "5:00", ascent: 5, heart_rate: { max: 168, min: 120 } },
      { lap: 2, type: "distance", start_s: 300, duration: "0:04:50", duration_s: 290, distance: 1, avg_hr: 152, avg_speed: 12.4, avg_pace: "4:50" },
    ]);
    const markers = toWorkout(
      {
        workoutKey: "l2",
        activityId: 1,
        startTime: start,
        totalTime: 900,
        extensions: [{ type: "ManualLapStreamExtension", points: [{ timestamp: start + 400_000 }, { timestamp: start + 700_000 }] }],
      },
      "metric",
      "UTC",
    );
    expect(markers.laps?.map((l) => [l.lap, l.start_s, l.duration_s])).toEqual([
      [1, 0, 400],
      [2, 400, 300],
      [3, 700, 200],
    ]);
  });
});

describe("streams", () => {
  const start = 1777613400000;
  const base: WireWorkout = { workoutKey: "s1", activityId: 1, startTime: start, totalTime: 600, totalDistance: 1200 };

  it("converts heart rate in Hz to bpm, keeps min/avg/max of the full stream and downsamples", () => {
    const points = Array.from({ length: 601 }, (_, i) => ({ timestamp: start + i * 1000, value: 2 + (i % 10) / 100 }));
    const w = toWorkout({ ...base, extensions: [{ type: "HeartrateStreamExtension", points }] }, "metric", "UTC", { samples: ["heart_rate"], maxPoints: 50 });
    const hr = w.samples?.heart_rate;
    expect(hr?.unit).toBe("bpm");
    expect(hr?.original_points).toBe(601);
    expect(hr?.min).toBe(120);
    expect(hr?.max).toBe(125);
    expect(hr?.avg).toBe(123);
    expect(hr?.points.length).toBeLessThanOrEqual(50);
    expect(hr?.points[0]).toEqual({ t: 0, v: 120 });
    expect(hr?.points.at(-1)).toEqual({ t: 600, v: 120 });
  });

  it("keeps bpm values, reads ISO and relative times, and converts speed, pace, altitude and temperature", () => {
    const iso = (s: number) => new Date(start + s * 1000).toISOString();
    const w = toWorkout(
      {
        ...base,
        extensions: [
          { type: "HeartrateStreamExtension", points: [{ timestamp: iso(0), value: 100 }, { timestamp: iso(60), value: 140 }] },
          { type: "SpeedStreamExtension", points: [{ timestamp: 0, value: 2.5 }, { timestamp: 30, value: 0 }, { timestamp: 60, value: 3.3333 }] },
          { type: "AltitudeStreamExtension", points: [{ timestamp: start, altitude: 500.4 }, { timestamp: start + 60_000, altitude: 510.6 }] },
          { type: "TemperatureStreamExtension", points: [{ timestamp: start, value: 293.15 }] },
        ],
      },
      "metric",
      "UTC",
      { samples: ["heart_rate", "speed", "pace", "altitude", "temperature", "power"] },
    );
    const s = w.samples!;
    expect(s.heart_rate?.points).toEqual([
      { t: 0, v: 100 },
      { t: 60, v: 140 },
    ]);
    expect(s.speed).toMatchObject({ unit: "km/h", min: 0, max: 12, points: [{ t: 0, v: 9 }, { t: 30, v: 0 }, { t: 60, v: 12 }] });
    // Standing still has no pace; the average pace is the pace of the average speed.
    expect(s.pace).toMatchObject({ unit: "min/km", min: 5, max: 6.67, avg: 5.71, points: [{ t: 0, v: 6.67 }, { t: 60, v: 5 }] });
    expect(s.altitude).toMatchObject({ unit: "m", points: [{ t: 0, v: 500 }, { t: 60, v: 511 }] });
    expect(s.temperature).toMatchObject({ unit: "°C", points: [{ t: 0, v: 20 }] });
    expect(s.power).toEqual({ unit: "W", original_points: 0, points: [] });
  });

  it("adds up distance deltas, keeps running totals, and reads location points", () => {
    const deltas = [0, 400, 400, 400];
    const w = toWorkout(
      {
        ...base,
        extensions: [
          { type: "DistanceDeltaStreamExtension", points: deltas.map((d, i) => ({ timestamp: start + i * 200_000, value: d })) },
          {
            type: "LocationStreamExtension",
            locationPoints: [
              { timestamp: start, latitude: 46.1234567, longitude: 7.5, altitude: 1000 },
              { timestamp: start + 1000, latitude: 0, longitude: 0 },
              { timestamp: start + 2000, latitude: 46.2, longitude: 7.6 },
            ],
          },
        ],
      },
      "metric",
      "UTC",
      { samples: ["distance", "location"] },
    );
    expect(w.samples?.distance).toMatchObject({ unit: "km", min: 0, max: 1.2, points: [{ t: 0, v: 0 }, { t: 200, v: 0.4 }, { t: 400, v: 0.8 }, { t: 600, v: 1.2 }] });
    expect(w.samples?.distance?.avg).toBeUndefined();
    expect(w.samples?.location).toEqual({
      unit: "deg",
      original_points: 3,
      points: [
        { t: 0, lat: 46.123457, lon: 7.5 },
        { t: 2, lat: 46.2, lon: 7.6 },
      ],
    });
    const totals = toWorkout(
      { ...base, extensions: [{ type: "DistanceDeltaStreamExtension", points: [0, 300, 700, 1200].map((d, i) => ({ timestamp: start + i * 200_000, value: d })) }] },
      "imperial",
      "UTC",
      { samples: ["distance"] },
    );
    expect(totals.samples?.distance?.max).toBe(0.75);
  });

  it("downsamples evenly in time and keeps the first and last point", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i < 900 ? i : 900 + (i - 900) * 10, v: i }));
    const out = downsample(pts, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out[0]).toBe(pts[0]);
    expect(out.at(-1)).toBe(pts[999]);
    // Times are strictly increasing and spread over the whole span.
    for (let i = 1; i < out.length; i++) expect(out[i]!.t).toBeGreaterThan(out[i - 1]!.t);
    const gaps = out.slice(1).map((p, i) => p.t - out[i]!.t);
    expect(Math.max(...gaps)).toBeLessThan(40);
    expect(downsample(pts.slice(0, 5), 10)).toHaveLength(5);
    const flat = Array.from({ length: 50 }, () => ({ t: 0, v: 1 }));
    expect(downsample(flat, 10)).toHaveLength(10);
  });

  it("reads point times in every known form", () => {
    expect(relativeTimes([1777613400000, 1777613460000], 1777613400000, 60)).toEqual([0, 60]);
    expect(relativeTimes([1777613400, 1777613430], 1777613400000, 60)).toEqual([0, 30]);
    expect(relativeTimes(["2026-05-01T05:30:10Z"], 1777613400000, 60)).toEqual([10]);
    expect(relativeTimes([0, 30_000, 60_000], 1777613400000, 60)).toEqual([0, 30, 60]);
    expect(relativeTimes([undefined, undefined, undefined], 1777613400000, 60)).toEqual([0, 30, 60]);
  });

  it("lists the samples a workout has", () => {
    expect(availableSamples(["POWERSTREAM", "summary", "depthstream", 5])).toEqual(["power", "depth"]);
    expect(availableSamples(null)).toEqual([]);
  });
});

describe("generic extension fields", () => {
  it("uses snake_case and converts known units, also nested", () => {
    expect(snakeCase("avgTemperature")).toBe("avg_temperature");
    expect(snakeCase("HRExt")).toBe("hr_ext");
    expect(snakeCase("vo2Max")).toBe("vo2_max");
    expect(convertFields({ type: "X", cadence: { avg: 1.4, max: 90 }, gear: { name: "Suunto Race", softwareVersion: "2.1" }, pauseDuration: 65, startTime: 1777613400000 }, "metric")).toEqual({
      cadence: { avg_rpm: 84, max_rpm: 90 },
      gear: { name: "Suunto Race", software_version: "2.1" },
      pause_duration: "0:01:05",
      pause_duration_s: 65,
      start_time: "2026-05-01T05:30:00.000Z",
    });
  });
});

describe("24/7 data", () => {
  // The documented example of /247samples/activity.
  const ACTIVITY: WireSample<WireActivityEntry>[] = [
    { timestamp: "2019-02-11T12:00:00Z", entryData: { HR: 72, StepCount: 100, EnergyConsumption: 8000, SpO2: 0.5, Altitude: 50, HRExt: { Min: 60, Max: 80 }, HRV: 12 } },
    { timestamp: "2019-02-11T12:10:00Z", entryData: { HR: 65, StepCount: 50, EnergyConsumption: 5000, SpO2: 0.3, Altitude: 10, HRExt: { Min: 60, Max: 80 }, HRV: 12 } },
  ];

  it("formats raw activity samples in the user's zone", () => {
    expect(toSamplePoints(ACTIVITY, { tz: "Europe/Zurich", units: "metric", resolution: "raw" })).toEqual([
      { start: "2019-02-11T13:00:00+01:00", hr_avg: 72, hr_min: 60, hr_max: 80, steps: 100, energy_kcal: 1.9, spo2_pct: 50, hrv_ms: 12, altitude: 50, samples: 1 },
      { start: "2019-02-11T13:10:00+01:00", hr_avg: 65, hr_min: 60, hr_max: 80, steps: 50, energy_kcal: 1.2, spo2_pct: 30, hrv_ms: 12, altitude: 10, samples: 1 },
    ]);
  });

  it("sums activity samples per hour and per local day", () => {
    const hour = toSamplePoints(ACTIVITY, { tz: "Europe/Zurich", units: "imperial", resolution: "hour" });
    expect(hour).toEqual([
      { start: "2019-02-11T13:00:00+01:00", end: "2019-02-11T14:00:00+01:00", hr_avg: 69, hr_min: 60, hr_max: 80, steps: 150, energy_kcal: 3.1, spo2_pct: 40, hrv_ms: 12, altitude: 98, samples: 2 },
    ]);
    const day = toSamplePoints(ACTIVITY, { tz: "America/Los_Angeles", units: "metric", resolution: "day" });
    expect(day[0]).toMatchObject({ start: "2019-02-11T00:00:00-08:00", end: "2019-02-12T00:00:00-08:00", steps: 150, energy_kcal: 3, samples: 2 });
  });

  it("keeps the two 02:00 hours of the autumn DST change apart, and the short spring day short", () => {
    const tz = "Europe/Zurich";
    const at = (iso: string): WireSample<WireActivityEntry> => ({ timestamp: iso, entryData: { StepCount: 10 } });
    const autumn = toSamplePoints([at("2026-10-25T00:10:00Z"), at("2026-10-25T01:10:00Z")], { tz, units: "metric", resolution: "hour" });
    expect(autumn.map((p) => p.start)).toEqual(["2026-10-25T02:00:00+02:00", "2026-10-25T02:00:00+01:00"]);
    expect(autumn.map((p) => p.end)).toEqual(["2026-10-25T02:00:00+01:00", "2026-10-25T03:00:00+01:00"]);
    const spring = toSamplePoints([at("2026-03-29T00:30:00Z"), at("2026-03-29T01:30:00Z")], { tz, units: "metric", resolution: "hour" });
    expect(spring.map((p) => p.start)).toEqual(["2026-03-29T01:00:00+01:00", "2026-03-29T03:00:00+02:00"]);
    const days = toSamplePoints([at("2026-03-28T23:30:00Z"), at("2026-03-29T21:30:00Z"), at("2026-03-29T22:30:00Z")], { tz, units: "metric", resolution: "day" });
    expect(days).toEqual([
      { start: "2026-03-29T00:00:00+01:00", end: "2026-03-30T00:00:00+02:00", steps: 20, samples: 2 },
      { start: "2026-03-30T00:00:00+02:00", end: "2026-03-31T00:00:00+02:00", steps: 10, samples: 1 },
    ]);
  });

  it("formats the documented sleep example", () => {
    const sample: WireSample<WireSleepEntry> = {
      timestamp: "2021-01-24T21:54:52.217Z",
      entryData: {
        DeepSleepDuration: 4225,
        LightSleepDuration: 11556,
        REMSleepDuration: 12345,
        Duration: 28126,
        Feeling: 3,
        HRAvg: 60,
        HRMin: 55,
        SleepQualityScore: 12,
        BodyResourcesInsightId: null,
        SleepId: null,
        BedtimeStart: "2021-01-24T21:54:52.217Z",
        BedtimeEnd: "2021-01-25T05:43:38.217Z",
        MaxSpo2: 0.5,
        Altitude: 50,
        AvgHRV: 12,
        AvgHRVSampleCount: 23,
        IsNap: false,
        SleepOnsetLatencyDuration: 100,
        WakeAfterSleepOnsetDuration: 100,
        WakeBeforeOffBedDuration: 100,
        DateTime: "2021-01-24T21:54:52.217Z",
      },
    };
    expect(toSleepNight(sample, "Europe/Zurich")).toEqual({
      date: "2021-01-25",
      is_nap: false,
      bedtime_start: "2021-01-24T22:54:52+01:00",
      bedtime_end: "2021-01-25T06:43:38+01:00",
      duration: "7:49",
      duration_s: 28126,
      deep: "1:10",
      deep_s: 4225,
      light: "3:13",
      light_s: 11556,
      rem: "3:26",
      rem_s: 12345,
      hr_avg: 60,
      hr_min: 55,
      hrv_avg_ms: 12,
      spo2_max_pct: 50,
      quality_score: 12,
      feeling: 3,
      sleep_onset_latency_s: 100,
      awake_after_sleep_onset_s: 100,
    });
    // Without BedtimeEnd the wake-up is the start plus the duration.
    const night = toSleepNight({ timestamp: "2021-01-24T21:54:52Z", entryData: { Duration: 28_800, IsNap: true } }, "Asia/Tokyo");
    expect(night).toMatchObject({ date: "2021-01-25", is_nap: true, bedtime_end: "2021-01-25T14:54:52+09:00" });
  });

  it("formats the documented recovery example, raw and per day", () => {
    const samples: WireSample<WireRecoveryEntry>[] = [
      { timestamp: "2025-01-05T16:00:00Z", entryData: { Balance: 0.82, StressState: 2 } },
      { timestamp: "2025-01-05T17:00:00Z", entryData: { Balance: 0.85, StressState: 1 } },
    ];
    expect(toRecoveryPoints(samples, { tz: "UTC", resolution: "raw" })).toEqual([
      { start: "2025-01-05T16:00:00Z", balance_pct_avg: 82, stress_state: 2, samples: 1 },
      { start: "2025-01-05T17:00:00Z", balance_pct_avg: 85, stress_state: 1, samples: 1 },
    ]);
    expect(toRecoveryPoints(samples, { tz: "Europe/Zurich", resolution: "day" })).toEqual([
      {
        start: "2025-01-05T00:00:00+01:00",
        end: "2025-01-06T00:00:00+01:00",
        balance_pct_avg: 84,
        balance_pct_min: 82,
        balance_pct_max: 85,
        stress_states: { active: 1, relaxing: 1 },
        samples: 2,
      },
    ]);
  });

  it("maps the documented daily statistics example to local dates", () => {
    const stats: WireDailyStatistic[] = [
      {
        Name: "energyconsumption",
        Aggregation: "sum",
        Sources: [
          {
            Name: "suunto-247-3e0f7c17-2775-477a-a12f-a50ff0170860",
            Samples: [
              { TimeISO8601: "2019-02-11T02:00:00.000", Value: null },
              { TimeISO8601: "2019-02-12T02:00:00.000", Value: 640580.3985 },
            ],
          },
        ],
      },
      {
        Name: "stepcount",
        Aggregation: "sum",
        Sources: [
          {
            Name: "suunto-247-3e0f7c17-2775-477a-a12f-a50ff0170860",
            Samples: [
              { TimeISO8601: "2019-02-11T02:00:00.000", Value: null },
              { TimeISO8601: "2019-02-12T02:00:00.000", Value: 4617 },
            ],
          },
        ],
      },
    ];
    // A zone where local midnight is 02:00 UTC, as in the documented call.
    const tz = "America/Noronha";
    const days = ["2019-02-11", "2019-02-12"].map((date) => ({ date, ms: startOfDay(date, tz).getTime() }));
    expect(toDaySummaries(stats, days, tz)).toEqual([
      { date: "2019-02-11", steps: null, energy_kcal: null },
      { date: "2019-02-12", steps: 4617, energy_kcal: 153 },
    ]);
  });

  it("matches daily samples to local dates across the autumn DST change", () => {
    const tz = "Europe/Zurich";
    const dates = ["2026-10-24", "2026-10-25", "2026-10-26"];
    const days = dates.map((date) => ({ date, ms: startOfDay(date, tz).getTime() }));
    // Suunto steps 24 hours from the startdate we sent (local midnight at UTC+2).
    expect(dateOfDailySample("2026-10-23T22:00:00.000", days, tz)).toBe("2026-10-24");
    expect(dateOfDailySample("2026-10-24T22:00:00.000", days, tz)).toBe("2026-10-25");
    expect(dateOfDailySample("2026-10-25T22:00:00.000", days, tz)).toBe("2026-10-26");
    // Local noon with an offset: the date part.
    expect(dateOfDailySample("2026-09-27T12:00:00+02:00", days, tz)).toBe("2026-09-27");
    // Far from any midnight and without an offset: the local date of the instant.
    expect(dateOfDailySample("2026-10-25T10:00:00", days, tz)).toBe("2026-10-25");
    // Two watches on one day are added up; a null and a value of one watch give the value.
    const stats: WireDailyStatistic[] = [
      {
        Name: "stepcount",
        Sources: [
          { Name: "a", Samples: [{ TimeISO8601: "2026-10-24T22:00:00", Value: null }, { TimeISO8601: "2026-10-24T22:00:00", Value: 1000 }] },
          { Name: "b", Samples: [{ TimeISO8601: "2026-10-24T22:00:00", Value: "500" as unknown as number }] },
        ],
      },
    ];
    expect(toDaySummaries(stats, days, tz)[1]).toEqual({ date: "2026-10-25", steps: 1500, energy_kcal: null });
  });
});

describe("routes and points of interest", () => {
  it("formats the documented route example (the name is in the description)", () => {
    const r = toRouteSummary(
      {
        id: "604bcfc20a76e57785370afe",
        description: "Kerava - Sipoo",
        visibility: "PRIVATE",
        activityIds: [3],
        startPoint: { altitude: 61, latitude: 60.39826, longitude: 25.13782 },
        centerPoint: { altitude: 37, latitude: 60.350983, longitude: 25.15516 },
        endPoint: { altitude: 45, latitude: 60.314384, longitude: 25.113018 },
        created: 1615581137000,
        averageSpeed: 2.2222223,
        totalDistance: 13696,
        modified: 1640418238351,
        watchEnabled: true,
        turnWaypointsEnabled: false,
      },
      "metric",
      "Europe/Helsinki",
    );
    expect(r).toEqual({
      route_id: "604bcfc20a76e57785370afe",
      name: "Kerava - Sipoo",
      distance: 13.7,
      sports: ["Cross-country skiing"],
      start: { latitude: 60.39826, longitude: 25.13782, altitude: 61 },
      end: { latitude: 60.314384, longitude: 25.113018, altitude: 45 },
      created: "2021-03-12T22:32:17+02:00",
      modified: "2021-12-25T09:43:58+02:00",
      watch_enabled: true,
    });
    const named = toRouteSummary({ id: "x", name: "Loop", description: "Around the lake", activityIds: [1, 999] }, "imperial", "UTC");
    expect(named).toEqual({ route_id: "x", name: "Loop", description: "Around the lake", sports: ["Running", "Activity 999"] });
  });

  it("formats the documented point of interest example (times in seconds)", () => {
    const p = toPoiSummary(
      {
        pointOfInterest: {
          creation: 1602074065,
          modified: 1602074065,
          point: { x: 45.1, y: 32.2, z: 11.5, name: "Beautiful POI", type: 1 },
          activityId: 1,
          country: "FI",
          locality: "FI",
          watchEnabled: true,
          key: "5e3be95baba83c5b1781593b",
        },
      },
      "metric",
      "UTC",
    );
    expect(p).toEqual({
      poi_key: "5e3be95baba83c5b1781593b",
      name: "Beautiful POI",
      latitude: 32.2,
      longitude: 45.1,
      altitude: 12,
      type: "Home",
      type_id: 1,
      sport: "Running",
      created: "2020-10-07T12:34:25Z",
      watch_enabled: true,
    });
    expect(toPoiSummary({ pointOfInterest: { point: { x: 200, y: 10, type: 34 } } }, "metric", "UTC")).toBeUndefined();
  });
});
