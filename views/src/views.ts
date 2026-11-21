/**
 * The three views: workouts (list and one workout), training statistics, and sleep. Each renders
 * into a root element from the data of a tool result; calls to other tools go through callTool.
 */

import { el, message, svg, tiles, toggles } from "./dom.js";
import {
  duration,
  fmt,
  isObject,
  lapTable,
  linePath,
  localDateTime,
  locationPoints,
  nearestByT,
  niceRange,
  num,
  type Obj,
  projectTrack,
  readResult,
  sleepBars,
  type SleepBar,
  type StatsMetric,
  statsSeries,
  str,
  streamPoints,
  type ToolResultLike,
  barAt,
  clock,
  napCount,
  paceText,
  shortKey,
  unitChoice,
  workoutFacts,
} from "./model.js";

export type CallTool = (name: string, args: Record<string, unknown>) => Promise<ToolResultLike>;

/** The streams the workout view asks for, in the order of its metric buttons. Depth first: a dive opens on its profile. */
const CHART_STREAMS = ["depth", "heart_rate", "altitude", "speed", "pace", "cadence", "power", "temperature"] as const;
const STREAM_LABELS: Record<string, string> = {
  depth: "Depth",
  heart_rate: "Heart rate",
  altitude: "Altitude",
  speed: "Speed",
  pace: "Pace",
  cadence: "Cadence",
  power: "Power",
  temperature: "Temperature",
};
/** Points per stream the view asks for: enough for a smooth line, small enough for the answer. */
const VIEW_MAX_POINTS = 400;

/** Labels under n bars, every few bars so they fit. */
function axis(keys: readonly string[]): HTMLElement {
  const every = Math.max(1, Math.ceil(keys.length / 8));
  const width = (100 * every) / keys.length;
  return el("div", { class: "axis" }, ...keys.filter((_, i) => i % every === 0).map((k) => el("span", { style: `width:${width.toFixed(3)}%` }, shortKey(k))));
}

/** Calls describe(i) for the bar under the pointer, so gaps between bars do not matter. */
function onBarHover(plot: SVGSVGElement, n: number, describe: (i: number) => void): void {
  plot.addEventListener("pointermove", (e) => {
    const box = plot.getBoundingClientRect();
    if (box.width > 0) describe(barAt((e.clientX - box.left) / box.width, n));
  });
}

function units(data: Obj): Obj {
  return isObject(data.units) ? data.units : {};
}

/** The units of the answer, for the calls the view makes: a workout opens in the list's units. */
function unitsArg(data: Obj): { units?: "metric" | "imperial" } {
  const choice = unitChoice(units(data));
  return choice ? { units: choice } : {};
}

function unitOf(data: Obj, key: string, fallback: string): string {
  return str(units(data)[key]) ?? fallback;
}

// ---------------------------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------------------------

export function renderWorkouts(root: HTMLElement, data: Obj, callTool: CallTool): void {
  if (Array.isArray(data.workouts)) renderWorkoutList(root, data, callTool);
  else renderWorkout(root, data, callTool);
}

function renderWorkoutList(root: HTMLElement, data: Obj, callTool: CallTool): void {
  const workouts = (data.workouts as unknown[]).filter(isObject);
  const dist = unitOf(data, "distance", "km");
  const range = str(data.from) && str(data.to) ? `${localDateTime(str(data.from))} – ${localDateTime(str(data.to))}` : undefined;
  root.replaceChildren(el("h2", {}, "Workouts"));
  if (range) root.append(el("p", { class: "sub" }, range));
  if (workouts.length === 0) {
    root.append(message("No workouts in this range."));
    return;
  }
  const list = el("ul", { class: "workout-list" });
  for (const w of workouts) {
    const key = str(w.workout_key);
    const button = el(
      "button",
      { type: "button", class: "workout-row", "data-key": key },
      el("span", { class: "when" }, localDateTime(str(w.start))),
      el("span", { class: "what" }, el("strong", {}, str(w.sport) ?? "Workout"), str(w.name) ? ` · ${str(w.name)}` : ""),
      el("span", { class: "figures" }, [num(w.distance) !== undefined ? `${fmt(num(w.distance), 2)} ${dist}` : undefined, duration(num(w.duration_s)), num(w.avg_hr) !== undefined ? `${num(w.avg_hr)} bpm` : undefined].filter(Boolean).join(" · ")),
    );
    if (!key) button.disabled = true;
    button.addEventListener("click", () => {
      if (!key) return;
      root.replaceChildren(message("Loading the workout…"));
      void callTool("suunto_get_workout", { workout_key: key, ...unitsArg(data) })
        .then((result) => {
          const read = readResult(result);
          if (!read.ok) {
            root.replaceChildren(message(read.message, "error"));
            return;
          }
          renderWorkout(root, read.data, callTool, () => renderWorkoutList(root, data, callTool));
        })
        .catch((error: unknown) => root.replaceChildren(message(`Could not load the workout: ${(error as Error).message}`, "error")));
    });
    list.append(el("li", {}, button));
  }
  root.append(list);
  if (num(data.next_offset) !== undefined) root.append(el("p", { class: "sub" }, `${workouts.length} shown; ask for more to see the next page.`));
}

function renderWorkout(root: HTMLElement, data: Obj, callTool: CallTool, onBack?: () => void): void {
  const dist = unitOf(data, "distance", "km");
  const elev = unitOf(data, "elevation", "m");
  const speed = unitOf(data, "speed", "km/h");
  const pace = unitOf(data, "pace", "min/km");
  const head: Array<Node | undefined> = [];
  if (onBack) {
    const back = el("button", { type: "button", class: "back" }, "← All workouts");
    back.addEventListener("click", onBack);
    head.push(back);
  }
  head.push(el("h2", {}, str(data.name) ?? str(data.sport) ?? "Workout"), el("p", { class: "sub" }, [str(data.sport), localDateTime(str(data.start))].filter(Boolean).join(" · ")));
  if (str(data.description)) head.push(el("p", { class: "note" }, str(data.description)!));
  const figures: Array<[string, string]> = [];
  if (num(data.distance) !== undefined) figures.push(["Distance", `${fmt(num(data.distance), 2)} ${dist}`]);
  figures.push(["Duration", duration(num(data.duration_s))]);
  // Swims give their pace with its own unit ("1:58 /100 m").
  if (str(data.avg_pace) && num(data.distance)) figures.push(["Pace", str(data.avg_pace)!.includes("/") ? str(data.avg_pace)! : `${str(data.avg_pace)} ${pace}`]);
  else if (num(data.avg_speed) !== undefined) figures.push(["Speed", `${fmt(num(data.avg_speed))} ${speed}`]);
  if (num(data.ascent) !== undefined) figures.push(["Ascent", `${fmt(num(data.ascent), 0)} ${elev}`]);
  if (num(data.avg_hr) !== undefined) figures.push(["Avg HR", `${num(data.avg_hr)} bpm`]);
  if (num(data.max_hr) !== undefined) figures.push(["Max HR", `${num(data.max_hr)} bpm`]);
  if (num(data.energy_kcal) !== undefined) figures.push(["Energy", `${fmt(num(data.energy_kcal), 0)} kcal`]);
  root.replaceChildren(...head.filter((n): n is Node => n !== undefined), tiles(figures));
  const zones = heartRateZones(data);
  if (zones) root.append(zones);
  for (const facts of workoutFacts(data)) root.append(el("section", { class: "facts", "aria-label": facts.title }, el("h3", {}, facts.title), tiles(facts.items)));
  const laps = lapTable(data);
  if (laps) {
    const table = el(
      "table",
      { class: "laps" },
      el("thead", {}, el("tr", {}, ...laps.head.map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, ...laps.rows.map((row) => el("tr", {}, ...row.map((cell) => el("td", {}, cell))))),
    );
    root.append(el("section", { class: "laps-wrap", "aria-label": "Laps" }, el("h3", {}, "Laps"), el("div", { class: "scroll" }, table)));
  }

  const samples = isObject(data.samples) ? data.samples : undefined;
  if (samples) {
    // Loaded already: never offer the (costly) load again, even when nothing is drawable.
    const parts = routeAndCharts(data, samples);
    root.append(...(parts.length > 0 ? parts : [message("No route or chart data for this workout.")]));
    return;
  }
  const available = Array.isArray(data.available_data) ? data.available_data.filter((s): s is string => typeof s === "string") : [];
  const wanted = [...CHART_STREAMS, "location"].filter((s) => available.includes(s));
  const key = str(data.workout_key);
  if (!key || wanted.length === 0) return;
  // Loaded on request: every load is a Suunto API call, and hosts show a view again whenever the
  // conversation is reopened.
  const load = el("button", { type: "button", class: "primary" }, wanted.includes("location") ? "Show route and charts" : "Show charts");
  load.addEventListener("click", () => {
    load.disabled = true;
    load.textContent = "Loading…";
    void callTool("suunto_get_workout", { workout_key: key, samples: wanted, max_points: VIEW_MAX_POINTS, ...unitsArg(data) })
      .then((result) => {
        const read = readResult(result);
        if (!read.ok) {
          load.replaceWith(message(read.message, "error"));
          return;
        }
        renderWorkout(root, read.data, callTool, onBack);
      })
      .catch((error: unknown) => load.replaceWith(message(`Could not load the samples: ${(error as Error).message}`, "error")));
  });
  root.append(load);
}

function heartRateZones(data: Obj): HTMLElement | undefined {
  const intensity = isObject(data.intensity) ? data.intensity : undefined;
  const zones = intensity && Array.isArray(intensity.heart_rate_zones) ? intensity.heart_rate_zones.filter(isObject) : [];
  const total = zones.reduce((s, z) => s + (num(z.time_s) ?? 0), 0);
  if (zones.length === 0 || total <= 0) return undefined;
  const rows = zones.map((z) => {
    const share = (num(z.time_s) ?? 0) / total;
    return el(
      "div",
      { class: "zone" },
      el("span", { class: "zone-name" }, `Zone ${num(z.zone) ?? "?"}`),
      el("span", { class: "zone-bar" }, el("span", { class: `zone-fill z${num(z.zone) ?? 0}`, style: `width:${(share * 100).toFixed(1)}%` })),
      el("span", { class: "zone-time" }, clock(num(z.time_s))),
    );
  });
  return el("section", { class: "zones", "aria-label": "Time in heart rate zones" }, el("h3", {}, "Heart rate zones"), ...rows);
}

/** The route (from the watch's own GPS points, no map tiles) and one chart with a metric toggle. */
function routeAndCharts(data: Obj, samples: Obj): HTMLElement[] {
  const out: HTMLElement[] = [];
  const track = locationPoints(samples.location);
  const RW = 600;
  const RH = 260;
  const projected = projectTrack(track, RW, RH);
  const marker = svg("circle", { r: 6, class: "marker", visibility: "hidden" });
  if (projected.length > 1) {
    const d = projected.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
    const start = projected[0]!;
    const end = projected[projected.length - 1]!;
    out.push(
      el(
        "section",
        { class: "route", "aria-label": "Route" },
        el("h3", {}, "Route"),
        svg(
          "svg",
          { viewBox: `0 0 ${RW} ${RH}`, role: "img", "aria-label": "Route of the workout" },
          svg("path", { d, class: "track" }),
          svg("circle", { cx: start.x.toFixed(1), cy: start.y.toFixed(1), r: 5, class: "start" }),
          svg("circle", { cx: end.x.toFixed(1), cy: end.y.toFixed(1), r: 5, class: "end" }),
          marker,
        ),
      ),
    );
  }

  const streams = CHART_STREAMS.filter((s) => streamPoints(samples[s]).length > 1);
  if (streams.length === 0) return out;
  // A dive computer measures the water; on land the watch's sensor reads near the wrist.
  const labelOf = (name: string) => (name === "temperature" && isObject(data.dive) ? "Water temperature" : STREAM_LABELS[name]!);
  const CW = 600;
  const CH = 160;
  const chart = el("section", { class: "chart" });
  const detail = el("p", { class: "detail", "aria-live": "polite" }, " ");
  const draw = (name: string) => {
    const stream = samples[name];
    const points = streamPoints(stream);
    const unit = isObject(stream) ? (str(stream.unit) ?? "") : "";
    // The dive profile carries the water temperature as a second line, on its own scale.
    const over = name === "depth" ? samples.temperature : undefined;
    const overPoints = streamPoints(over);
    const overUnit = isObject(over) ? (str(over.unit) ?? "") : "";
    const hasOver = overPoints.length > 1;
    const range = niceRange(points.map((p) => p.v));
    // Pace is better when lower: draw it upside down, like the Suunto App. Depth is a dive profile:
    // the surface on the top edge, deeper further down.
    const flipped =
      name === "pace" ? { min: range.max, max: range.min } : name === "depth" ? { min: range.max, max: Math.min(0, ...points.map((p) => p.v)) } : range;
    const cursor = svg("line", { class: "cursor", y1: 0, y2: CH, visibility: "hidden" });
    const dot = svg("circle", { r: 4, class: "dot", visibility: "hidden" });
    const t0 = points[0]!.t;
    const t1 = points[points.length - 1]!.t;
    const title = hasOver ? `${labelOf(name)} (${unit}) and ${labelOf("temperature").toLowerCase()} (${overUnit})` : `${labelOf(name)} (${unit})`;
    const plot = svg(
      "svg",
      { viewBox: `0 0 ${CW} ${CH}`, preserveAspectRatio: "none", role: "img", "aria-label": `${title} over time`, tabindex: 0 },
      hasOver ? svg("path", { d: linePath(overPoints, CW, CH, niceRange(overPoints.map((p) => p.v)), { t0, t1 }), class: "line temperature overlay" }) : undefined,
      svg("path", { d: linePath(points, CW, CH, flipped), class: `line ${name}` }),
      cursor,
      dot,
    );
    const show = (t: number) => {
      const p = points[nearestByT(points, t)]!;
      const x = ((p.t - t0) / (t1 - t0 || 1)) * CW;
      const y = CH - ((p.v - flipped.min) / (flipped.max - flipped.min)) * CH;
      cursor.setAttribute("x1", x.toFixed(1));
      cursor.setAttribute("x2", x.toFixed(1));
      dot.setAttribute("cx", x.toFixed(1));
      dot.setAttribute("cy", y.toFixed(1));
      cursor.setAttribute("visibility", "visible");
      dot.setAttribute("visibility", "visible");
      const value = name === "pace" ? paceText(p.v) : fmt(p.v);
      const overText = hasOver ? ` · ${fmt(overPoints[nearestByT(overPoints, p.t)]!.v)} ${overUnit}` : "";
      detail.textContent = `${clock(p.t)} · ${value} ${unit}${overText}`;
      if (projected.length > 1) {
        const q = projected[nearestByT(projected, p.t)]!;
        marker.setAttribute("cx", q.x.toFixed(1));
        marker.setAttribute("cy", q.y.toFixed(1));
        marker.setAttribute("visibility", "visible");
      }
    };
    plot.addEventListener("pointermove", (e) => {
      const box = plot.getBoundingClientRect();
      if (box.width > 0) show(t0 + ((e.clientX - box.left) / box.width) * (t1 - t0));
    });
    // Keyboard: arrows step through the points.
    let index = 0;
    plot.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      index = Math.min(points.length - 1, Math.max(0, index + (e.key === "ArrowRight" ? 1 : -1)));
      show(points[index]!.t);
      e.preventDefault();
    });
    const summary = isObject(stream) ? [["min", stream.min], ["avg", stream.avg], ["max", stream.max]].filter(([, v]) => num(v) !== undefined).map(([k, v]) => `${k} ${name === "pace" ? paceText(v as number) : fmt(v as number)}`).join(" · ") : "";
    const overRange = hasOver && isObject(over) && num(over.min) !== undefined && num(over.max) !== undefined ? ` · water ${fmt(num(over.min))} to ${fmt(num(over.max))} ${overUnit}` : "";
    chart.replaceChildren(el("h3", {}, title), plot, el("p", { class: "sub" }, summary + overRange), detail);
    detail.textContent = " ";
  };
  out.push(toggles(streams.map((s) => [s, labelOf(s)] as [string, string]), streams[0]!, draw), chart);
  draw(streams[0]!);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Training statistics
// ---------------------------------------------------------------------------------------------

const STATS_METRICS: Array<[StatsMetric, string]> = [
  ["total_distance", "Distance"],
  ["total_duration_s", "Time"],
  ["total_ascent", "Ascent"],
  ["count", "Workouts"],
  ["total_energy_kcal", "Energy"],
];

export function renderTraining(root: HTMLElement, data: Obj): void {
  const dist = unitOf(data, "distance", "km");
  const elev = unitOf(data, "elevation", "m");
  const unitOfMetric = (m: StatsMetric) => (m === "total_distance" ? dist : m === "total_ascent" ? elev : m === "total_energy_kcal" ? "kcal" : "");
  const show = (m: StatsMetric, v: number) => (m === "total_duration_s" ? duration(v) : `${fmt(v, m === "total_distance" ? 1 : 0)} ${unitOfMetric(m)}`.trim());
  root.replaceChildren(
    el("h2", {}, "Training"),
    el("p", { class: "sub" }, [str(data.from), str(data.to)].filter(Boolean).join(" – ")),
    tiles([
      ["Workouts", fmt(num(data.count), 0)],
      ["Time", duration(num(data.total_duration_s))],
      ["Distance", `${fmt(num(data.total_distance))} ${dist}`],
      ["Ascent", `${fmt(num(data.total_ascent), 0)} ${elev}`],
      ["Energy", `${fmt(num(data.total_energy_kcal), 0)} kcal`],
      ...(num(data.avg_hr) !== undefined ? [["Avg HR", `${num(data.avg_hr)} bpm`] as [string, string]] : []),
    ]),
  );
  const highlights: string[] = [];
  if (isObject(data.longest)) highlights.push(`Longest: ${str(data.longest.name) ?? str(data.longest.sport) ?? ""} (${duration(num(data.longest.duration_s))}, ${localDateTime(str(data.longest.start))})`);
  if (isObject(data.farthest)) highlights.push(`Farthest: ${str(data.farthest.name) ?? str(data.farthest.sport) ?? ""} (${fmt(num(data.farthest.distance))} ${dist}, ${localDateTime(str(data.farthest.start))})`);
  for (const h of highlights) root.append(el("p", { class: "note" }, h));
  if (!Array.isArray(data.groups) || data.groups.length === 0) return;

  const chart = el("section", { class: "chart" });
  const detail = el("p", { class: "detail", "aria-live": "polite" }, " ");
  const W = 600;
  const H = 180;
  const draw = (m: StatsMetric) => {
    const series = statsSeries(data, m);
    const max = Math.max(1, ...series.map((s) => s.value));
    const slot = W / series.length;
    const describe = (i: number) => {
      const s = series[i]!;
      detail.textContent = `${s.key}: ${show(m, s.value)} · ${fmt(num(s.group.count), 0)} workouts`;
    };
    const bars = series.map((s, i) => {
      const h = (s.value / max) * (H - 4);
      const bar = svg("rect", { x: (i * slot + slot * 0.15).toFixed(1), y: (H - h).toFixed(1), width: (slot * 0.7).toFixed(1), height: h.toFixed(1), class: "bar", tabindex: 0 }, svg("title", {}, document.createTextNode(`${s.key}: ${show(m, s.value)}`)));
      bar.addEventListener("focus", () => describe(i));
      return bar;
    });
    const plot = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Bar chart" }, ...bars);
    onBarHover(plot, series.length, describe);
    chart.replaceChildren(el("h3", {}, `${STATS_METRICS.find(([k]) => k === m)![1]} per ${str(data.group_by) ?? "period"}`), plot, axis(series.map((s) => s.key)), detail);
    detail.textContent = " ";
  };
  root.append(toggles(STATS_METRICS, "total_distance", draw), chart);
  draw("total_distance");
}

// ---------------------------------------------------------------------------------------------
// Sleep
// ---------------------------------------------------------------------------------------------

/** The readout of a night without all three stages: the total and the stages that are known. */
function partialStages(n: SleepBar): string[] {
  const known = ([["deep", n.night.deep_s], ["light", n.night.light_s], ["REM", n.night.rem_s]] as const)
    .filter(([, v]) => num(v) !== undefined)
    .map(([k, v]) => `${k} ${duration(v as number)}`);
  return known.length === 0 ? [`${duration(n.total)}, no sleep stages`] : [duration(n.total), ...known, "other stages unknown"];
}

export function renderSleep(root: HTMLElement, data: Obj): void {
  const nights = sleepBars(data);
  const avg = isObject(data.averages) ? data.averages : {};
  root.replaceChildren(el("h2", {}, "Sleep"), el("p", { class: "sub" }, [str(data.from), str(data.to)].filter(Boolean).join(" – ")));
  if (nights.length === 0) {
    const naps = napCount(data);
    root.append(message(naps > 0 ? `Only naps in this range: ${naps}.` : "No sleep in this range."));
    return;
  }
  const figures: Array<[string, string]> = [["Nights", String(nights.length)], ["Avg sleep", duration(num(avg.duration_s))]];
  if (num(avg.deep_s) !== undefined) figures.push(["Avg deep", duration(num(avg.deep_s))]);
  if (num(avg.rem_s) !== undefined) figures.push(["Avg REM", duration(num(avg.rem_s))]);
  if (num(avg.hr_avg) !== undefined) figures.push(["Avg HR", `${num(avg.hr_avg)} bpm`]);
  if (num(avg.hrv_avg_ms) !== undefined) figures.push(["Avg HRV", `${num(avg.hrv_avg_ms)} ms`]);
  if (num(avg.quality_score) !== undefined) figures.push(["Quality", `${num(avg.quality_score)}`]);
  root.append(tiles(figures));

  const W = 600;
  const H = 200;
  const max = Math.max(1, ...nights.map((n) => Math.max(n.total, n.deep + n.light + n.rem + n.awake)));
  const slot = W / nights.length;
  const detail = el("p", { class: "detail", "aria-live": "polite" }, " ");
  const describe = (i: number) => {
    const n = nights[i]!;
    const s = n.night;
    detail.textContent = [
      n.date,
      ...(n.stages ? [`deep ${duration(n.deep)}`, `light ${duration(n.light)}`, `REM ${duration(n.rem)}`, `awake ${duration(n.awake)}`] : partialStages(n)),
      num(s.hr_avg) !== undefined ? `HR ${num(s.hr_avg)} bpm` : undefined,
      num(s.hrv_avg_ms) !== undefined ? `HRV ${num(s.hrv_avg_ms)} ms` : undefined,
      num(s.quality_score) !== undefined ? `quality ${num(s.quality_score)}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const groups = nights.map((n, i) => {
    let y = H;
    const bar = (seconds: number, cls: string) => {
      const h = (seconds / max) * (H - 4);
      y -= h;
      return svg("rect", { x: (i * slot + slot * 0.15).toFixed(1), y: y.toFixed(1), width: (slot * 0.7).toFixed(1), height: h.toFixed(1), class: `stage ${cls}` });
    };
    const parts = n.stages ? (["deep", "light", "rem", "awake"] as const).map((stage) => bar(n[stage], stage)) : [bar(n.total, "unknown")];
    const g = svg("g", { tabindex: 0, class: "night" }, ...parts, svg("title", {}, document.createTextNode(`${n.date}: ${duration(n.total)}`)));
    g.addEventListener("focus", () => describe(i));
    return g;
  });
  const plot = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", role: "img", "aria-label": "Sleep stages per night" }, ...groups);
  onBarHover(plot, nights.length, describe);
  root.append(
    el(
      "section",
      { class: "chart" },
      el("h3", {}, "Sleep stages per night"),
      plot,
      axis(nights.map((n) => n.date)),
      el(
        "p",
        { class: "legend" },
        ...(["deep", "light", "rem", "awake"] as const).map((s) => el("span", { class: `key ${s}` }, s === "rem" ? "REM" : s[0]!.toUpperCase() + s.slice(1))),
        nights.some((n) => !n.stages) ? el("span", { class: "key unknown" }, "No stages") : undefined,
      ),
      detail,
    ),
  );
}

/** Renders the view a resource was opened for, from a tool result. */
export function renderView(view: string, result: ToolResultLike, root: HTMLElement, callTool: CallTool): void {
  const read = readResult(result);
  if (!read.ok) {
    root.replaceChildren(message(read.message, "error"));
    return;
  }
  if (view === "training") renderTraining(root, read.data);
  else if (view === "sleep") renderSleep(root, read.data);
  else renderWorkouts(root, read.data, callTool);
}
