import { describe, expect, it } from "vitest";
import * as U from "../../src/activity/units.js";

describe("unit labels", () => {
  it("names the units of an answer", () => {
    expect(U.unitLabels("metric")).toEqual({ distance: "km", elevation: "m", speed: "km/h", pace: "min/km", temperature: "°C", energy: "kcal", heart_rate: "bpm" });
    expect(U.unitLabels("imperial")).toEqual({ distance: "mi", elevation: "ft", speed: "mph", pace: "min/mi", temperature: "°F", energy: "kcal", heart_rate: "bpm" });
    // A copy: changing it does not change the next answer.
    const labels = U.unitLabels("metric");
    labels.distance = "mi";
    expect(U.unitLabels("metric").distance).toBe("km");
  });
});

describe("conversions", () => {
  it("rounds without float noise", () => {
    expect(U.round(1.005, 2)).toBe(1.01);
    expect(U.round(-0.0001, 2)).toBe(0);
    expect(Object.is(U.round(-0.4), 0)).toBe(true);
  });

  it("reads numbers defensively", () => {
    expect(U.num(3)).toBe(3);
    expect(U.num("4.5")).toBe(4.5);
    expect(U.num("")).toBeUndefined();
    expect(U.num(null)).toBeUndefined();
    expect(U.num(Number.NaN)).toBeUndefined();
    expect(U.num("abc")).toBeUndefined();
  });

  it("converts distances and elevations", () => {
    expect(U.distance(3900, "metric")).toBe(3.9);
    expect(U.distance(10_000, "imperial")).toBe(6.21);
    expect(U.distance(42_195, "imperial")).toBe(26.22);
    expect(U.elevation(88.75, "metric")).toBe(89);
    expect(U.elevation(1000, "imperial")).toBe(3281);
    expect(U.depth(30.25, "metric")).toBe(30.3);
    expect(U.depth(30, "imperial")).toBe(98.4);
    expect(U.elevationToMetres(3281, "imperial")).toBe(1000.05);
    expect(U.elevationToMetres(1200, "metric")).toBe(1200);
  });

  it("converts speeds and paces from m/s", () => {
    expect(U.speed(1.45, "metric")).toBe(5.2);
    expect(U.speed(2.78, "imperial")).toBe(6.2);
    expect(U.paceFromSpeed(1000 / 330, "metric")).toBe("5:30");
    expect(U.paceFromSpeed(1000 / 330, "imperial")).toBe("8:51");
    expect(U.paceFromSpeed(0, "metric")).toBeUndefined();
    expect(U.paceFromMinPerKm(11.48, "metric")).toBe("11:29");
    expect(U.paceFromMinPerKm(5.5, "imperial")).toBe("8:51");
    expect(U.paceFromMinPerKm(0, "metric")).toBeUndefined();
    expect(U.paceMinutesFromSpeed(1000 / 300, "metric")).toBe(5);
    expect(U.swimPaceFromSpeed(100 / 115, "metric")).toBe("1:55 /100 m");
    expect(U.swimPaceFromSpeed(91.44 / 100, "imperial")).toBe("1:40 /100 yd");
  });

  it("converts temperatures from kelvin (and leaves Celsius as it is)", () => {
    expect(U.temperatureFromKelvin(302.44998, "metric")).toBe(29.3);
    expect(U.temperatureFromKelvin(302.44998, "imperial")).toBe(84.7);
    expect(U.temperatureFromKelvin(273.15, "metric")).toBe(0);
    expect(U.temperatureFromKelvin(21.5, "metric")).toBe(21.5);
    expect(U.temperatureFromCelsius(-40, "imperial")).toBe(-40);
  });

  it("converts energy, per-second rates and fractions", () => {
    expect(U.kcalFromJoules(4184)).toBe(1);
    expect(U.kcalFromJoules(640_580.3985)).toBe(153);
    expect(U.kcalFromJoules(8000, 1)).toBe(1.9);
    expect(U.perMinuteFromHz(0.9801348)).toBe(59);
    expect(U.perMinute(2.5)).toBe(150);
    expect(U.perMinute(145)).toBe(145);
    expect(U.percent(0.96)).toBe(96);
    expect(U.percent(96)).toBe(96);
  });

  it("formats durations", () => {
    expect(U.formatDuration(3725)).toBe("1:02:05");
    expect(U.formatDuration(2686.03)).toBe("0:44:46");
    expect(U.formatDuration(-5)).toBe("0:00:00");
    expect(U.formatDuration(90_000)).toBe("25:00:00");
    expect(U.formatHoursMinutes(27_000)).toBe("7:30");
    expect(U.formatHoursMinutes(28_126)).toBe("7:49");
    expect(U.formatPace(329.6)).toBe("5:30");
  });
});
