/**
 * The usage statistics page for administrators (/admin/stats), from the activity log: how many
 * tool calls in a period (24 hours, 7, 30 or 90 days, which the log holds), by whom, which tools,
 * which AI apps, and how many failed. One user can be looked at on their own.
 *
 * The log holds only which tool was called, when, by which app, how long it took and whether it
 * worked (never what was read or written), so the page cannot show more.
 *
 * The chart is plain SVG drawn on the server: the pages allow no inline scripts or styles (see the
 * Content-Security-Policy in session.ts), so sizes are SVG attributes and each column's tooltip is
 * its <title>. A table with the same numbers is one click away.
 */

import type { Request, Response } from "express";
import { page, type WebContext } from "./context.js";
import { formatDate, html, type SafeHtml } from "./html.js";
import { HTML_LANG, locale, t, tn } from "./i18n/index.js";
import { classifyReturn, displayName } from "./known-apps.js";
import type { UsageStats } from "./store.js";

/** The periods offered, in days. The activity log keeps 90 days. */
export const STATS_PERIODS = [1, 7, 30, 90] as const;
const DEFAULT_PERIOD = 30;
const HOUR = 3_600_000;

const QUARTER = 900_000;
/** How long a computed page stays valid: reloading it costs nothing (the log is read once). */
const CACHE_MS = 60_000;
type CacheEntry = { at: number; since: number; until: number; stats: UsageStats };
/** Per database (each server, or test, has its own). */
const caches = new WeakMap<object, Map<string, CacheEntry>>();

/** Forget computed statistics (tests that change the log between two looks). */
export function clearStatsCache(store: object): void {
  caches.delete(store);
}

function zoneOrUtc(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** Bucket keys and labels in the server's time zone: days, or hours (24 hours). */
function bucketer(zone: string, byHour: boolean) {
  const lang = HTML_LANG[locale()];
  // The offset is part of an hour's key: when the clocks go back, the hour that comes twice is
  // two columns, not one.
  const key = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(byHour ? { hour: "2-digit", hourCycle: "h23", timeZoneName: "shortOffset" } : {}),
  } as Intl.DateTimeFormatOptions);
  const label = new Intl.DateTimeFormat(lang, byHour ? { timeZone: zone, hour: "numeric" } : { timeZone: zone, day: "numeric", month: "short" });
  const long = new Intl.DateTimeFormat(lang, byHour ? { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit" } : { timeZone: zone, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return { key: (ms: number) => key.format(ms), label: (ms: number) => label.format(ms), long: (ms: number) => long.format(ms) };
}

/**
 * Where a period starts: 24 hours ago for the hourly view; for days, local midnight at the start
 * of the first day ("7 days" is today and the 6 days before), so the first column is a whole day.
 */
function periodStart(until: number, days: number, zone: string): number {
  const from = until - days * 24 * HOUR;
  if (days === 1) return from;
  const day = bucketer(zone, false).key;
  const first = day(from);
  // The first quarter hour of the next day, as seen in the time zone (half-hour zones included).
  for (let q = Math.ceil(from / QUARTER) * QUARTER; q <= until; q += QUARTER) if (day(q) !== first) return q;
  return from;
}

interface Bucket {
  start: number;
  calls: number;
  failed: number;
}

/** Calls per day (or per hour for 24 hours) from `since` to `until`, empty ones included. */
function buckets(stats: UsageStats, since: number, until: number, zone: string, byHour: boolean) {
  const b = bucketer(zone, byHour);
  const out: Bucket[] = [];
  const index = new Map<string, Bucket>();
  for (let q = Math.floor(since / QUARTER) * QUARTER; q <= until; q += QUARTER) {
    const k = b.key(Math.max(q, since));
    if (!index.has(k)) {
      const bucket = { start: Math.max(q, since), calls: 0, failed: 0 };
      index.set(k, bucket);
      out.push(bucket);
    }
  }
  for (const quarter of stats.quarters) {
    const bucket = index.get(b.key(Math.max(quarter.start, since)));
    if (bucket) {
      bucket.calls += quarter.calls;
      bucket.failed += quarter.failed;
    }
  }
  return { list: out, label: b.label, long: b.long };
}

/** A clean upper end for the axis, at least the largest value, whose half is a whole number too. */
function niceMax(n: number): number {
  if (n <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * p >= n && (m * p) % 2 === 0) return m * p;
  return 10 * p;
}

function chart(list: Bucket[], label: (ms: number) => string, long: (ms: number) => string, fmt: (n: number) => string, title: string): SafeHtml {
  // Axis numbers stay short ("100K"), so they fit left of the chart.
  const compact = new Intl.NumberFormat(HTML_LANG[locale()], { notation: "compact", maximumFractionDigits: 1 });
  const tickText = (v: number) => (v >= 10_000 ? compact.format(v) : fmt(v));
  const W = 720;
  const H = 220;
  const left = 44;
  const right = 8;
  const top = 10;
  const bottom = 26;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const max = niceMax(Math.max(0, ...list.map((b) => b.calls)));
  const slot = plotW / Math.max(1, list.length);
  // Thin columns (at most 24 px), with air between them.
  const barW = Math.max(2, Math.min(24, slot - Math.max(2, slot * 0.3)));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  // A few dates under the columns: the first, the last and some between, never crowded.
  const every = Math.max(1, Math.ceil(list.length / 6));
  const columns = list.map((b, i) => {
    const x = left + i * slot + (slot - barW) / 2;
    const top0 = y(b.calls);
    const h = top + plotH - top0;
    const r = Math.min(4, barW / 2, h);
    // Rounded at the top, square on the baseline.
    const bar = b.calls
      ? html`<path class="stats-bar" d="M${x.toFixed(1)} ${(top + plotH).toFixed(1)} V${(top0 + r).toFixed(1)} Q${x.toFixed(1)} ${top0.toFixed(1)} ${(x + r).toFixed(1)} ${top0.toFixed(1)} H${(x + barW - r).toFixed(1)} Q${(x + barW).toFixed(1)} ${top0.toFixed(1)} ${(x + barW).toFixed(1)} ${(top0 + r).toFixed(1)} V${(top + plotH).toFixed(1)} Z"/>`
      : "";
    const tip = t("admin.stats.chart.tooltip", { when: long(b.start), calls: fmt(b.calls), failed: fmt(b.failed) });
    const last = i === list.length - 1;
    // Every few columns, and the last one; a label too close to the last one is left out.
    const showLabel = last || (i % every === 0 && list.length - 1 - i >= every / 2);
    // The first and last labels stay inside the chart: aligned to their column's outer edge.
    const anchor = list.length > 1 && i === 0 ? "start" : list.length > 1 && last ? "end" : "middle";
    const lx = anchor === "start" ? x : anchor === "end" ? x + barW : left + i * slot + slot / 2;
    return html`<g class="stats-col"><title>${tip}</title><rect class="stats-hit" x="${(left + i * slot).toFixed(1)}" y="${top}" width="${slot.toFixed(1)}" height="${plotH}"/>${bar}${showLabel
      ? html`<text class="stats-tick" x="${lx.toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${label(b.start)}</text>`
      : ""}</g>`;
  });
  return html`<svg class="stats-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}">
    ${ticks.map((v) => html`<line class="stats-grid" x1="${left}" x2="${W - right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="stats-tick" x="${left - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${tickText(v)}</text>`)}
    ${columns}
  </svg>`;
}

/** A short bar for ranked lists (share of the largest value), drawn as SVG. */
function rankBar(value: number, max: number): SafeHtml {
  const pct = max ? Math.max(value ? 2 : 0, (value / max) * 100) : 0;
  return html`<svg class="stats-rank" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect class="stats-rank-track" x="0" y="0" width="100" height="8" rx="4"/><rect class="stats-bar" x="0" y="0" width="${pct.toFixed(1)}" height="8" rx="4"/></svg>`;
}

/**
 * Which app an OAuth client is: a recognized app when every address it returns to belongs to that
 * app (one more address elsewhere could send the sign-in anywhere), else the name it gave itself,
 * else where it returns to.
 */
function appLabel(info: { name?: string; redirectUris: string[] } | undefined, missing: boolean): { key: string; name: string; verified: boolean } {
  if (missing) return { key: "\u0000none", name: t("admin.stats.apps.unknown"), verified: true };
  if (!info) return { key: "\u0000removed", name: t("admin.stats.apps.removed"), verified: true };
  const targets = info.redirectUris.map((uri) => classifyReturn(uri, info.name));
  const known = targets[0]?.kind === "known" ? targets[0].app : undefined;
  if (known && targets.every((target) => target.kind === "known" && target.app === known)) return { key: `known:${known}`, name: known, verified: true };
  const name = info.name ? displayName(info.name) : "";
  if (name) return { key: `named:${name}`, name, verified: false };
  const host = targets[0]?.host;
  return host ? { key: `host:${host}`, name: host, verified: false } : { key: "\u0000none", name: t("admin.stats.apps.unknown"), verified: true };
}

export function renderStats(ctx: WebContext, req: Request, res: Response): void {
  const asked = Number(req.query.days);
  const days = (STATS_PERIODS as readonly number[]).includes(asked) ? asked : DEFAULT_PERIOD;
  const userParam = typeof req.query.user === "string" ? req.query.user.slice(0, 100) : "";
  const only = userParam ? ctx.store.getUser(userParam) : undefined;
  const zone = zoneOrUtc(ctx.store.getSettings().defaultTimeZone || "UTC");
  // The log is read at most once a minute for the same view.
  const key = `${days}:${only?.id ?? ""}:${zone}`;
  const cache = caches.get(ctx.store) ?? new Map<string, CacheEntry>();
  caches.set(ctx.store, cache);
  let entry = cache.get(key);
  if (!entry || Date.now() - entry.at > CACHE_MS) {
    const until = Date.now();
    const since = periodStart(until, days, zone);
    entry = { at: until, since, until, stats: ctx.store.usageStats(since, only?.id) };
    for (const [k, v] of cache) if (Date.now() - v.at > CACHE_MS) cache.delete(k);
    cache.set(key, entry);
  }
  const { since, until, stats } = entry;
  const nf = new Intl.NumberFormat(HTML_LANG[locale()]);
  const fmt = (n: number) => nf.format(n);
  const pct = new Intl.NumberFormat(HTML_LANG[locale()], { style: "percent", maximumFractionDigits: 1 });
  const duration = (ms: number | undefined) =>
    ms === undefined ? "–" : ms < 1000 ? t("admin.stats.time.ms", { n: fmt(ms) }) : t("admin.stats.time.s", { n: new Intl.NumberFormat(HTML_LANG[locale()], { maximumFractionDigits: 1 }).format(ms / 1000) });
  const link = (params: { days?: number; user?: string }) => {
    const q = new URLSearchParams();
    q.set("days", String(params.days ?? days));
    if (params.user) q.set("user", params.user);
    return `/admin/stats?${q.toString()}`;
  };

  const byHour = days === 1;
  const series = buckets(stats, since, until, zone, byHour);
  const chartTitle = t(byHour ? "admin.stats.chart.titleHours" : "admin.stats.chart.titleDays");

  const users = new Map(ctx.store.listUsers().map((u) => [u.id, u]));
  const active = new Set(stats.byUser.map((row) => row.userId));
  const inactive = only ? 0 : [...users.values()].filter((u) => !u.pending && !u.disabled && !active.has(u.id)).length;

  // AI apps: Claude and others register a new connection each time, so connections are grouped by
  // the app they belong to; users are counted once per app.
  const info = ctx.store.clientInfo(stats.byClient.flatMap((c) => (c.clientId ? [c.clientId] : [])));
  const apps = new Map<string, { name: string; verified: boolean; calls: number; users: Set<string> }>();
  for (const c of stats.byClient) {
    const l = appLabel(c.clientId ? info.get(c.clientId) : undefined, !c.clientId);
    const app = apps.get(l.key) ?? { name: l.name, verified: l.verified, calls: 0, users: new Set<string>() };
    app.calls += c.calls;
    app.users.add(c.userId);
    apps.set(l.key, app);
  }
  const appList = [...apps.values()].sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name));
  const maxTool = stats.tools[0]?.calls ?? 0;

  const period = html`<nav class="segmented" aria-label="${t("admin.stats.period.label")}">${STATS_PERIODS.map((d) =>
    d === days
      ? html`<span class="segment" aria-current="true">${t(`admin.stats.period.${d}` as "admin.stats.period.1")}</span>`
      : html`<a class="segment" href="${link({ days: d, ...(only ? { user: only.id } : {}) })}">${t(`admin.stats.period.${d}` as "admin.stats.period.1")}</a>`,
  )}</nav>`;

  const tile = (label: string, value: string, hint?: string) => html`<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${hint ? html`<span class="hint">${hint}</span>` : ""}</div>`;

  page(
    req,
    res,
    { title: t("admin.stats.title"), active: "admin", wide: true },
    html`<div class="page-title"><h1>${t("admin.stats.heading")}</h1><p>${t("admin.stats.intro")}</p>
        <p><a href="/admin">${t("admin.stats.back")}</a></p></div>
      <div class="stats-controls">${period}
        ${only ? html`<p class="notice">${t("admin.stats.filter.user", { email: only.email })} <a href="${link({})}">${t("admin.stats.filter.all")}</a></p>` : ""}</div>
      <div class="card">
        <div class="stat-row">
          ${tile(t("admin.stats.kpi.calls"), fmt(stats.calls))}
          ${only ? "" : tile(t("admin.stats.kpi.users"), fmt(stats.users))}
          ${tile(t("admin.stats.kpi.failed"), fmt(stats.failed), stats.calls ? t("admin.stats.kpi.failedShare", { share: pct.format(stats.failed / stats.calls) }) : undefined)}
          ${tile(t("admin.stats.kpi.median"), duration(stats.medianMs), stats.calls ? t("admin.stats.kpi.medianHint") : undefined)}
        </div>
      </div>
      ${stats.calls
        ? html`<div class="card">
            <h2>${chartTitle}</h2>
            <div class="stats-chart-wrap">${chart(series.list, series.label, series.long, fmt, chartTitle)}</div>
            <details class="stats-table"><summary>${t("admin.stats.chart.table")}</summary>
              <div class="table-wrap"><table>
                <thead><tr><th>${t(byHour ? "admin.stats.col.hour" : "admin.stats.col.day")}</th><th class="num">${t("admin.stats.col.calls")}</th><th class="num">${t("admin.stats.col.failed")}</th></tr></thead>
                <tbody>${series.list.map((b) => html`<tr><td>${series.long(b.start)}</td><td class="num">${fmt(b.calls)}</td><td class="num">${fmt(b.failed)}</td></tr>`)}</tbody>
              </table></div>
            </details>
          </div>
          <div class="card">
            <h2>${t("admin.stats.tools.title")}</h2>
            <div class="table-wrap wide"><table>
              <thead><tr><th>${t("admin.stats.col.tool")}</th><th class="num">${t("admin.stats.col.calls")}</th><th class="num">${t("admin.stats.col.share")}</th><th class="num">${t("admin.stats.col.failed")}</th><th class="num">${t("admin.stats.col.median")}</th></tr></thead>
              <tbody>${stats.tools.map(
                (tool) => html`<tr><td><code>${tool.tool}</code></td><td class="num stats-ranked">${rankBar(tool.calls, maxTool)}<span>${fmt(tool.calls)}</span></td>
                  <td class="num">${pct.format(tool.calls / stats.calls)}</td><td class="num">${fmt(tool.failed)}</td><td class="num">${duration(tool.medianMs)}</td></tr>`,
              )}</tbody>
            </table></div>
          </div>
          ${only
            ? ""
            : html`<div class="card">
                <h2>${t("admin.stats.users.title")}</h2>
                <div class="table-wrap wide"><table>
                  <thead><tr><th>${t("admin.stats.col.user")}</th><th class="num">${t("admin.stats.col.calls")}</th><th class="num">${t("admin.stats.col.failed")}</th><th>${t("admin.stats.col.topTool")}</th><th>${t("admin.stats.col.lastCall")}</th></tr></thead>
                  <tbody>${stats.byUser.map((row) => {
                    const u = users.get(row.userId);
                    return html`<tr><td><a href="${link({ user: row.userId })}">${u?.email ?? row.userId}</a>${u?.demo ? html` <span class="badge">${t("admin.users.demo")}</span>` : ""}</td>
                      <td class="num">${fmt(row.calls)}</td><td class="num">${fmt(row.failed)}</td><td><code>${row.topTool}</code></td><td>${formatDate(row.lastAt)}</td></tr>`;
                  })}</tbody>
                </table></div>
                ${inactive > 0 ? html`<p class="hint">${tn("admin.stats.users.inactive", inactive)}</p>` : ""}
              </div>`}
          <div class="card">
            <h2>${t("admin.stats.apps.title")}</h2>
            <div class="table-wrap"><table>
              <thead><tr><th>${t("admin.stats.col.app")}</th><th class="num">${t("admin.stats.col.calls")}</th>${only ? "" : html`<th class="num">${t("admin.stats.col.users")}</th>`}</tr></thead>
              <tbody>${appList.map(
                (a) => html`<tr><td>${a.name}${a.verified ? "" : html` <span class="muted">(${t("admin.stats.apps.unverified")})</span>`}</td><td class="num">${fmt(a.calls)}</td>${only ? "" : html`<td class="num">${fmt(a.users.size)}</td>`}</tr>`,
              )}</tbody>
            </table></div>
            <p class="hint">${t("admin.stats.apps.hint")}</p>
          </div>`
        : html`<div class="card"><p>${t("admin.stats.empty")}</p></div>`}`,
  );
}
