/**
 * Date helpers. All conversions between wall-clock time and instants use the built-in Intl API,
 * so any IANA time zone known to the Node.js runtime is supported.
 */

import { UserFacingError } from "./errors.js";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock components of an instant in a time zone. */
export function toWallTime(date: Date, tz: string): WallTime {
  const parts = partsFormatter(tz).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `tz` from UTC at the given instant, in minutes (e.g. +60 for Europe/Rome in winter). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const w = toWallTime(date, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

/**
 * Convert a wall-clock time in `tz` to the matching instant. For times that do not exist (DST gap)
 * the result is shifted forward; for ambiguous times (DST overlap) the earlier instant is used.
 */
export function wallTimeToDate(w: WallTime, tz: string): Date {
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const DAY = 86_400_000;
  // At most one offset transition happens in a 2 day window, so the offsets one day before and
  // after cover every possible interpretation of the wall-clock time.
  const offsets = [...new Set([tzOffsetMinutes(new Date(asUtc - DAY), tz), tzOffsetMinutes(new Date(asUtc + DAY), tz)])];
  const matches = (ms: number) => {
    const c = toWallTime(new Date(ms), tz);
    return (
      c.year === w.year && c.month === w.month && c.day === w.day && c.hour === w.hour && c.minute === w.minute
    );
  };
  const valid = offsets.map((o) => asUtc - o * 60000).filter(matches);
  if (valid.length > 0) {
    // Ambiguous (DST overlap): use the earlier instant.
    return new Date(Math.min(...valid));
  }
  // Non-existent (DST gap): shift forward by applying the offset in effect before the transition.
  return new Date(asUtc - Math.min(...offsets) * 60000);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;

export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value.trim());
}

/** Parse a YYYY-MM-DD string into its components. */
export function parseDateOnly(value: string): { year: number; month: number; day: number } {
  const m = value.trim().match(DATE_ONLY);
  if (!m) throw new UserFacingError(`Expected a date in YYYY-MM-DD format but got "${value}"`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new UserFacingError(`Invalid calendar date "${value}"`);
  }
  return { year, month, day };
}

/**
 * Parse a user supplied date/time into an instant.
 * - `2026-11-10T09:00:00Z` / `2026-11-10T09:00:00+01:00`: absolute instant.
 * - `2026-11-10T09:00` (no offset): wall-clock time in `tz`.
 * - `2026-11-10`: midnight at the start of that day in `tz`.
 */
export function parseDateTimeInput(value: string, tz: string): Date {
  const v = value.trim();
  if (!v) throw new UserFacingError("Empty date/time value");
  if (DATE_ONLY.test(v)) {
    const d = parseDateOnly(v);
    return wallTimeToDate({ ...d, hour: 0, minute: 0, second: 0 }, tz);
  }
  const local = v.match(LOCAL_DATE_TIME);
  if (local && !HAS_ZONE.test(v)) {
    const w: WallTime = {
      year: Number(local[1]),
      month: Number(local[2]),
      day: Number(local[3]),
      hour: Number(local[4]),
      minute: Number(local[5]),
      second: Number(local[6] ?? "0"),
    };
    if (w.month < 1 || w.month > 12 || w.day < 1 || w.day > 31 || w.hour > 23 || w.minute > 59 || w.second > 59) {
      throw new UserFacingError(`Invalid date/time "${value}"`);
    }
    return wallTimeToDate(w, tz);
  }
  // Only full ISO 8601 date-times with an offset are accepted here; anything else (e.g. "Nov 10")
  // would be read in the server's own time zone or silently roll over invalid dates.
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i);
  if (!iso) {
    throw new UserFacingError(
      `Could not parse date/time "${value}". Use ISO 8601, e.g. 2026-11-10T09:30 (local time), 2026-11-10T08:30:00Z or 2026-11-10.`,
    );
  }
  parseDateOnly(`${iso[1]}-${iso[2]}-${iso[3]}`);
  if (Number(iso[4]) > 23 || Number(iso[5]) > 59 || Number(iso[6] ?? "0") > 59) throw new UserFacingError(`Invalid date/time "${value}"`);
  const ms = Date.parse(v.replace(" ", "T"));
  if (Number.isNaN(ms)) throw new UserFacingError(`Invalid date/time "${value}"`);
  return new Date(ms);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Format an instant as ISO 8601 with the offset of `tz`, e.g. 2026-11-10T09:00:00+01:00. */
export function formatInZone(date: Date, tz: string): string {
  const w = toWallTime(date, tz);
  const offset = tzOffsetMinutes(date, tz);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const off = offset === 0 && tz === "UTC" ? "Z" : `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}:${pad(w.second)}${off}`;
}

export function formatDateOnly(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(value: string, days: number): string {
  const d = parseDateOnly(value);
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return formatDateOnly(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayInZone(tz: string, now = new Date()): string {
  const w = toWallTime(now, tz);
  return formatDateOnly(w.year, w.month, w.day);
}

// ---------------------------------------------------------------------------------------------
// Helpers for MCP for Suunto (activity data)
// ---------------------------------------------------------------------------------------------

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** The instant of local midnight at the start of a YYYY-MM-DD date in `tz`. */
export function startOfDay(date: string, tz: string): Date {
  return wallTimeToDate({ ...parseDateOnly(date), hour: 0, minute: 0, second: 0 }, tz);
}

/** The local calendar date (YYYY-MM-DD) of an instant in `tz`. */
export function localDateOf(ms: number, tz: string): string {
  const w = toWallTime(new Date(ms), tz);
  return formatDateOnly(w.year, w.month, w.day);
}

/** Whole days from date `a` to date `b` (both YYYY-MM-DD); negative when `b` is before `a`. */
export function daysBetween(a: string, b: string): number {
  const x = parseDateOnly(a);
  const y = parseDateOnly(b);
  return Math.round((Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day)) / DAY_MS);
}

/** An offset from UTC in minutes as "+HH:MM" (for example 120 -> "+02:00", -330 -> "-05:30"). */
export function formatOffset(minutes: number): string {
  const m = Math.round(minutes);
  const sign = m >= 0 ? "+" : "-";
  const abs = Math.abs(m);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * An instant as ISO 8601 in a fixed offset from UTC, for example a workout that started at
 * 05:30Z with an offset of 120 minutes: "2026-05-01T07:30:00+02:00".
 */
export function formatWithOffset(ms: number, offsetMinutes: number): string {
  const d = new Date(Math.floor(ms / 1000) * 1000 + Math.round(offsetMinutes) * MINUTE_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${formatOffset(offsetMinutes)}`
  );
}

/** An instant in UTC as "YYYY-MM-DDTHH:MM:SS" without an offset (what Suunto's daily statistics take). */
export function formatUtcNoOffset(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().slice(0, 19);
}

/** The ISO week of a YYYY-MM-DD date, for example "2026-W45" (weeks start on Monday). */
export function isoWeek(date: string): string {
  const { year, month, day } = parseDateOnly(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  const weekday = d.getUTCDay() || 7; // Monday 1 ... Sunday 7
  // The Thursday of this week decides the year the week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - weekday);
  const weekYear = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(weekYear, 0, 1)) / DAY_MS + 1) / 7);
  return `${weekYear}-W${pad(week)}`;
}

/**
 * A timestamp from Suunto as epoch milliseconds. ISO 8601 with "Z" or an offset is read as it is;
 * without a zone it is UTC (Suunto stores and answers in UTC, and Date.parse would otherwise use
 * the server's own zone). undefined for anything that is not an ISO date-time.
 */
export function parseUtcTimestamp(value: string): number | undefined {
  const v = value.trim().replace(" ", "T");
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/i.test(v)) return undefined;
  const full = v.includes("T") ? v : `${v}T00:00:00`;
  const ms = Date.parse(HAS_ZONE.test(full) ? full : `${full}Z`);
  return Number.isNaN(ms) ? undefined : ms;
}

/** True when an ISO 8601 date-time names a local offset other than "Z" (for example "+02:00"). */
export function hasLocalOffset(value: string): boolean {
  return /T\d{2}:\d{2}.*[+-]\d{2}:?\d{2}$/.test(value.trim());
}

/** The instant the local clock in `tz` showed the start of the hour that holds `ms` (DST safe). */
export function localHourStart(ms: number, tz: string): number {
  const w = toWallTime(new Date(ms), tz);
  return Math.floor(ms / 1000) * 1000 - (w.minute * 60 + w.second) * 1000;
}

/** Every YYYY-MM-DD date from `from` to `to`, both included ([] when `to` is before `from`). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}
