/**
 * The data side of the views: reading tool results and turning them into chart geometry. No DOM
 * here, so it is tested on its own.
 */

export type Obj = Record<string, unknown>;

export function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A tool result as the host hands it to the view. */
export interface ToolResultLike {
  isError?: boolean;
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
}

export type ReadResult = { ok: true; data: Obj } | { ok: false; message: string };

/**
 * The data of a tool result. The tools answer with their JSON as text (so text-only clients and
 * the model see the same), so that is read when there is no structuredContent.
 */
export function readResult(result: ToolResultLike | undefined): ReadResult {
  const text = (result?.content ?? [])
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("\n");
  if (!result) return { ok: false, message: "No result." };
  if (result.isError) return { ok: false, message: text || "The tool call failed." };
  if (isObject(result.structuredContent)) return { ok: true, data: result.structuredContent };
  try {
    const parsed: unknown = JSON.parse(text);
    if (isObject(parsed)) return { ok: true, data: parsed };
  } catch {
    // Not JSON: shown as it is.
  }
  return { ok: false, message: text || "The result holds no data." };
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Seconds as h:mm (or m:ss under an hour when seconds is true). */
export function duration(seconds: number | undefined, withSeconds = false): string {
  if (seconds === undefined || seconds < 0) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (withSeconds && h === 0) return `${m}:${String(sec).padStart(2, "0")}`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** A number for display, with at most the given decimals and no trailing zeros. */
export function fmt(value: number | undefined, decimals = 1): string {
  if (value === undefined) return "–";
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/** "2026-11-19T07:07:48+01:00" as "2026-11-19 07:07", in the workout's own local time. */
export function localDateTime(iso: string | undefined): string {
  if (!iso) return "–";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : iso;
}

export interface Point {
  t: number;
  v: number;
}

/** The {t, v} points of a stream, without the ones that are not numbers. */
export function streamPoints(stream: unknown): Point[] {
  if (!isObject(stream) || !Array.isArray(stream.points)) return [];
  const out: Point[] = [];
  for (const p of stream.points) {
    if (isObject(p) && num(p.t) !== undefined && num(p.v) !== undefined) out.push({ t: p.t as number, v: p.v as number });
  }
  return out;
}

export interface GeoPoint {
  t: number;
  lat: number;
  lon: number;
}

export function locationPoints(stream: unknown): GeoPoint[] {
  if (!isObject(stream) || !Array.isArray(stream.points)) return [];
  const out: GeoPoint[] = [];
  for (const p of stream.points) {
    if (!isObject(p)) continue;
    const t = num(p.t);
    const lat = num(p.lat);
    const lon = num(p.lon);
    if (t !== undefined && lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) out.push({ t, lat, lon });
  }
  return out;
}

export interface Projected {
  x: number;
  y: number;
  t: number;
}

/**
 * GPS points projected into a width x height box (equirectangular, longitude scaled by the
 * cosine of the mean latitude, so the track keeps its shape), centred with a margin.
 */
export function projectTrack(points: readonly GeoPoint[], width: number, height: number, margin = 8): Projected[] {
  if (points.length === 0) return [];
  const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const xs = points.map((p) => p.lon * k);
  const ys = points.map((p) => p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((width - 2 * margin) / spanX, (height - 2 * margin) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return points.map((p, i) => ({ x: offX + (xs[i]! - minX) * scale, y: height - (offY + (ys[i]! - minY) * scale), t: p.t }));
}

/** Index of the point whose t is closest to t (points sorted by t). */
export function nearestByT<T extends { t: number }>(points: readonly T[], t: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1]!.t - t) <= Math.abs(points[lo]!.t - t)) return lo - 1;
  return lo;
}

export interface Scale {
  min: number;
  max: number;
}

/** A value range with some room above and below, never empty. */
export function niceRange(values: readonly number[]): Scale {
  if (values.length === 0) return { min: 0, max: 1 };
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  return { min: min - pad, max: max + pad };
}

/** SVG path data of a line through the points, in a width x height box. */
export function linePath(points: readonly Point[], width: number, height: number, range = niceRange(points.map((p) => p.v))): string {
  if (points.length === 0) return "";
  const t0 = points[0]!.t;
  const t1 = points[points.length - 1]!.t;
  const spanT = t1 - t0 || 1;
  return points
    .map((p, i) => {
      const x = ((p.t - t0) / spanT) * width;
      const y = height - ((p.v - range.min) / (range.max - range.min)) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

export interface SleepBar {
  date: string;
  deep: number;
  light: number;
  rem: number;
  awake: number;
  night: Obj;
}

/** One bar per night (naps left out): deep, light, REM and awake seconds. */
export function sleepBars(data: Obj): SleepBar[] {
  const sleeps = Array.isArray(data.sleeps) ? data.sleeps.filter(isObject) : [];
  return sleeps
    .filter((s) => s.is_nap !== true)
    .map((s) => {
      const deep = num(s.deep_s) ?? 0;
      const light = num(s.light_s) ?? 0;
      const rem = num(s.rem_s) ?? 0;
      const total = num(s.duration_s) ?? deep + light + rem;
      return { date: str(s.date) ?? "", deep, light, rem, awake: Math.max(0, total - deep - light - rem), night: s };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type StatsMetric = "total_distance" | "total_duration_s" | "total_ascent" | "count" | "total_energy_kcal";

/** The per-period values of one metric from suunto_workout_stats groups. */
export function statsSeries(data: Obj, metric: StatsMetric): Array<{ key: string; value: number; group: Obj }> {
  const groups = Array.isArray(data.groups) ? data.groups.filter(isObject) : [];
  return groups.map((g) => ({ key: str(g.key) ?? "", value: num(g[metric]) ?? 0, group: g }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A short axis label: 2026-W19 as W19, 2026-05 as May 26, 2026-05-03 as 05-03. */
export function shortKey(key: string): string {
  const week = /^\d{4}-W(\d{2})$/.exec(key);
  if (week) return `W${week[1]}`;
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  if (month) return `${MONTHS[Number(month[2]) - 1] ?? month[2]} ${month[1]!.slice(2)}`;
  const day = /^\d{4}-(\d{2}-\d{2})$/.exec(key);
  if (day) return day[1]!;
  return key;
}

/** The bar under a pointer at fraction x (0-1) of the chart width, for n bars. */
export function barAt(x: number, n: number): number {
  return Math.min(n - 1, Math.max(0, Math.floor(x * n)));
}
