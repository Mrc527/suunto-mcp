/**
 * Metric and imperial units for MCP for Suunto.
 *
 * Suunto sends SI values (seconds, metres, m/s, kelvin, joules for 24/7 energy, Hz for cadence in
 * extensions) and has no units setting we can read, so every answer is converted here and names
 * its units once (`units`, see UnitLabels in types.ts).
 *
 * Rounding: distances 2 decimals (km or mi), elevations whole numbers (m or ft), depths 1 decimal,
 * speeds 1 decimal (km/h or mph), temperatures 1 decimal, energy and heart rate whole numbers.
 */

import type { UnitChoice, UnitLabels } from "./types.js";

export const M_PER_KM = 1000;
export const M_PER_MI = 1609.344;
export const M_PER_FT = 0.3048;
export const M_PER_YD = 0.9144;
/** 1 kcal = 4184 J (thermochemical calorie, what Suunto uses). */
export const J_PER_KCAL = 4184;
/** Below this many kelvin a temperature is taken to be Celsius already (no wrist or water is at -123 degrees C). */
export const KELVIN_THRESHOLD = 150;
/** Below this value a cadence or heart rate is in Hz (per second): 4 Hz is 240 per minute. */
export const HZ_THRESHOLD = 4;

export const METRIC_LABELS: Readonly<UnitLabels> = Object.freeze({
  distance: "km",
  elevation: "m",
  speed: "km/h",
  pace: "min/km",
  temperature: "°C",
  energy: "kcal",
  heart_rate: "bpm",
});

export const IMPERIAL_LABELS: Readonly<UnitLabels> = Object.freeze({
  distance: "mi",
  elevation: "ft",
  speed: "mph",
  pace: "min/mi",
  temperature: "°F",
  energy: "kcal",
  heart_rate: "bpm",
});

/** The unit labels of an answer. */
export function unitLabels(units: UnitChoice): UnitLabels {
  return { ...(units === "imperial" ? IMPERIAL_LABELS : METRIC_LABELS) };
}

/** Round to a number of decimals, without float noise (and without "-0"). */
export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  const r = Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** A finite number, or undefined (for wire fields that may be null, strings or garbage). */
export function num(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Conversions from SI
// ---------------------------------------------------------------------------------------------

/** Metres as km or mi, 2 decimals. */
export function distance(metres: number, units: UnitChoice): number {
  return round(metres / (units === "imperial" ? M_PER_MI : M_PER_KM), 2);
}

/** Metres as m or ft (whole numbers unless `decimals` says otherwise). */
export function elevation(metres: number, units: UnitChoice, decimals = 0): number {
  return round(units === "imperial" ? metres / M_PER_FT : metres, decimals);
}

/** Metres as m or ft, 1 decimal (depths and pool lengths, where whole numbers are too coarse). */
export function depth(metres: number, units: UnitChoice): number {
  return elevation(metres, units, 1);
}

/** m or ft (the call's units) back to metres, 2 decimals. */
export function elevationToMetres(value: number, units: UnitChoice): number {
  return round(units === "imperial" ? value * M_PER_FT : value, 2);
}

/** m/s as km/h or mph, 1 decimal. */
export function speed(metresPerSecond: number, units: UnitChoice): number {
  return round(units === "imperial" ? (metresPerSecond * 3600) / M_PER_MI : metresPerSecond * 3.6, 1);
}

/** Seconds per km or mi at a speed in m/s; undefined when standing still. */
export function paceSecondsFromSpeed(metresPerSecond: number, units: UnitChoice): number | undefined {
  if (!(metresPerSecond > 0.05)) return undefined;
  return (units === "imperial" ? M_PER_MI : M_PER_KM) / metresPerSecond;
}

/** Seconds per 100 m or per 100 yd (swimming) at a speed in m/s; undefined when standing still. */
export function swimPaceSecondsFromSpeed(metresPerSecond: number, units: UnitChoice): number | undefined {
  if (!(metresPerSecond > 0.01)) return undefined;
  return (units === "imperial" ? 100 * M_PER_YD : 100) / metresPerSecond;
}

/** Seconds as "m:ss" (for paces), for example 330 -> "5:30". */
export function formatPace(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Swimming pace per 100 m or per 100 yd from m/s, with its unit in the text ("1:55 /100 m"),
 * because units.pace (min/km or min/mi) does not fit swimming.
 */
export function swimPaceFromSpeed(metresPerSecond: number, units: UnitChoice): string | undefined {
  const s = swimPaceSecondsFromSpeed(metresPerSecond, units);
  return s === undefined || s > 3600 ? undefined : `${formatPace(s)} /100 ${units === "imperial" ? "yd" : "m"}`;
}

/** Pace "m:ss" per km or mi from m/s. */
export function paceFromSpeed(metresPerSecond: number, units: UnitChoice): string | undefined {
  const s = paceSecondsFromSpeed(metresPerSecond, units);
  return s === undefined || s > 6000 ? undefined : formatPace(s);
}

/** Pace "m:ss" per km or mi from Suunto's avgPace (decimal minutes per km). */
export function paceFromMinPerKm(minutesPerKm: number, units: UnitChoice): string | undefined {
  if (!(minutesPerKm > 0) || minutesPerKm > 100) return undefined;
  const secondsPerKm = minutesPerKm * 60;
  return formatPace(units === "imperial" ? (secondsPerKm * M_PER_MI) / M_PER_KM : secondsPerKm);
}

/** Pace as decimal minutes per km or mi (for streams, where points are numbers), 2 decimals. */
export function paceMinutesFromSpeed(metresPerSecond: number, units: UnitChoice): number | undefined {
  const s = paceSecondsFromSpeed(metresPerSecond, units);
  return s === undefined ? undefined : round(s / 60, 2);
}

/** Degrees Celsius in the answer's unit, 1 decimal. */
export function temperatureFromCelsius(celsius: number, units: UnitChoice): number {
  return round(units === "imperial" ? (celsius * 9) / 5 + 32 : celsius, 1);
}

/** Kelvin in the answer's unit, 1 decimal. Values below KELVIN_THRESHOLD are taken as Celsius already. */
export function temperatureFromKelvin(kelvin: number, units: UnitChoice): number {
  return temperatureFromCelsius(kelvin > KELVIN_THRESHOLD ? kelvin - 273.15 : kelvin, units);
}

/** Joules as kcal, whole numbers unless `decimals` says otherwise. */
export function kcalFromJoules(joules: number, decimals = 0): number {
  return round(joules / J_PER_KCAL, decimals);
}

/** Hz (per second) as per minute (bpm or rpm), whole numbers. */
export function perMinuteFromHz(hz: number): number {
  return round(hz * 60);
}

/** A cadence or heart rate as per minute: values below HZ_THRESHOLD are Hz and multiplied by 60. */
export function perMinute(value: number): number {
  return value < HZ_THRESHOLD ? perMinuteFromHz(value) : round(value);
}

/** A fraction 0..1 as a percentage (values above 1 are taken as a percentage already). */
export function percent(fraction: number, decimals = 0): number {
  return round(fraction <= 1 ? fraction * 100 : fraction, decimals);
}

// ---------------------------------------------------------------------------------------------
// Durations
// ---------------------------------------------------------------------------------------------

/** Seconds as "h:mm:ss", for example 3725 -> "1:02:05". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Seconds as "h:mm", for example 27000 -> "7:30". */
export function formatHoursMinutes(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}
