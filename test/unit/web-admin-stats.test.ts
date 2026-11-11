/**
 * The usage statistics page for administrators (/admin/stats), from the activity log.
 * Own server instance with its own database.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStatsCache } from "../../src/web/admin-stats.js";
import { openDatabase } from "../../src/web/db.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, setBase } from "../helpers/web-client.js";

let web: WebApp;
let server: Server;
const PASSWORD = "correct horse battery";
const admin = new Browser();
const DAY = 86_400_000;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    // Closed local ports: nothing is ever sent to Suunto.
    operator: { SUUNTO_OAUTH_URL: "http://127.0.0.1:1", SUUNTO_API_URL: "http://127.0.0.1:1" },
    log: () => {},
  });
  server.on("request", web.app);
  expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
});

const store = () => web.ctx.store;
// The page reads the log at most once a minute: each test looks at what it just wrote.
beforeEach(() => web && clearStatsCache(web.ctx.store));

/** A tool call `daysAgo` days ago (the log takes the time from Date.now). */
function call(userId: string, tool: string, ok: boolean, ms: number, clientId: string | undefined, daysAgo = 0) {
  const spy = vi.spyOn(Date, "now").mockReturnValue(Date.now() - daysAgo * DAY);
  try {
    store().logActivity(userId, tool, ok, ms, clientId);
  } finally {
    spy.mockRestore();
  }
}

function client(id: string, name: string, redirect: string) {
  store().saveClient({ client_id: id, client_name: name, redirect_uris: [redirect], client_id_issued_at: Math.floor(Date.now() / 1000) } as never, "dcr");
}

describe("usage statistics", () => {
  it("is for administrators only", async () => {
    const res = await new Browser().fetch("/admin/stats");
    expect([302, 303]).toContain(res.status);
    expect(res.headers.get("location")).toMatch(/^\/login/);
  });

  it("says so when there were no calls, and links back to the admin page", async () => {
    const { html } = await admin.page("/admin");
    expect(html).toContain('<a href="/admin/stats">Usage statistics</a>');
    const page = await admin.page("/admin/stats");
    expect(page.html).toContain("No calls in this period.");
    expect(page.html).toContain('<a href="/admin">Back to administration</a>');
    expect(page.html).toContain('<span class="segment" aria-current="true">30 days</span>');
  });

  it("counts calls, users, tools, failures and apps for the chosen period", async () => {
    const alice = store().createUser("alice@example.com", "x", false);
    const bob = store().createUser("bob@example.com", "x", false);
    store().createUser("idle@example.com", "x", false);
    // Claude makes a new client for every connection: both are "Claude".
    client("claude-1", "Claude", "https://claude.ai/api/mcp/auth_callback");
    client("claude-2", "Claude", "https://claude.ai/api/mcp/auth_callback");
    client("odd", "Claude <script>alert(1)</script>", "https://evil.example/cb");
    call(alice.id, "suunto_list_workouts", true, 100, "claude-1");
    call(alice.id, "suunto_list_workouts", true, 300, "claude-2");
    call(alice.id, "suunto_get_workout", false, 50, "claude-1");
    call(bob.id, "suunto_list_workouts", true, 200, "odd", 2);
    call(bob.id, "suunto_sleep", true, 1500, undefined, 10);
    call(bob.id, "suunto_import_route", true, 900, "claude-1", 40);

    const week = await admin.page("/admin/stats?days=7");
    // Totals: 4 calls in the last 7 days, 2 active users, 1 failed, median 100 ms (50, 100, 200, 300).
    expect(week.html).toMatch(/<span class="stat-label">Calls<\/span><span class="stat-value">4<\/span>/);
    expect(week.html).toMatch(/<span class="stat-label">Active users<\/span><span class="stat-value">2<\/span>/);
    expect(week.html).toMatch(/<span class="stat-label">Failed calls<\/span><span class="stat-value">1<\/span><span class="hint">25% of all calls<\/span>/);
    expect(week.html).toMatch(/<span class="stat-label">Typical time<\/span><span class="stat-value">100 ms<\/span>/);
    // Tools, most used first.
    expect(week.html.indexOf("<code>suunto_list_workouts</code>")).toBeLessThan(week.html.indexOf("<code>suunto_get_workout</code>"));
    expect(week.html).not.toContain("<code>suunto_sleep</code>");
    // Users, the busiest first, linked to their own statistics; the idle account is counted.
    expect(week.html).toMatch(/<a href="\/admin\/stats\?days=7&amp;user=[^"]+">alice@example.com<\/a>/);
    expect(week.html.indexOf("alice@example.com")).toBeLessThan(week.html.indexOf("bob@example.com"));
    expect(week.html).toMatch(/\d+ other accounts? made no calls in this period\./);
    // Apps: Claude's connections in one row (2 calls by Alice... and 1 more), the other by the name it gave, escaped.
    expect(week.html).toMatch(/<td>Claude<\/td><td class="num">3<\/td><td class="num">1<\/td>/);
    expect(week.html).toContain("Claude &lt;script&gt;alert(1)&lt;/script&gt; <span class=\"muted\">(name given by the app)</span>");
    expect(week.html).not.toContain("<script>alert(1)");
    // The chart: a column per day, each with its tooltip, and the same numbers as a table.
    expect(week.html).toContain('<svg class="stats-chart"');
    expect(week.html).toMatch(/<title>[^<]+: 3 calls, 1 failed<\/title>/);
    expect(week.html).toContain("Show as a table");

    const quarter = await admin.page("/admin/stats?days=90");
    expect(quarter.html).toMatch(/<span class="stat-label">Calls<\/span><span class="stat-value">6<\/span>/);
    expect(quarter.html).toContain("<code>suunto_sleep</code>");
    // A call without an app connection.
    expect(quarter.html).toContain("<td>Unknown app</td>");

    const day = await admin.page("/admin/stats?days=1");
    expect(day.html).toContain("Calls per hour");
    expect(day.html).toMatch(/<span class="stat-label">Calls<\/span><span class="stat-value">3<\/span>/);
  });

  it("shows one user on their own, and ignores what it does not know", async () => {
    const alice = store().getUserByEmail("alice@example.com")!;
    const one = await admin.page(`/admin/stats?days=7&user=${alice.id}`);
    expect(one.html).toContain("Only alice@example.com.");
    expect(one.html).toMatch(/<span class="stat-label">Calls<\/span><span class="stat-value">3<\/span>/);
    // No list of users, no "active users" tile.
    expect(one.html).not.toContain("Active users");
    expect(one.html).not.toContain("<h2>Users</h2>");
    // The period links keep the user.
    expect(one.html).toContain(`href="/admin/stats?days=90&amp;user=${alice.id}"`);

    const odd = await admin.page("/admin/stats?days=13&user=nobody");
    expect(odd.html).toContain('<span class="segment" aria-current="true">30 days</span>');
    expect(odd.html).not.toContain("Only ");
  });

  it("counts only apps whose every return address is theirs, and names nameless ones by address", async () => {
    const carl = store().createUser("carl@example.com", "x", false);
    client("mixed", "Totally not Claude", "https://claude.ai/api/mcp/auth_callback");
    // A second address elsewhere: not Claude, whatever it says.
    const mixed = store().clientInfo(["mixed"]).get("mixed")!;
    store().saveClient({ client_id: "mixed", client_name: "Totally not Claude", redirect_uris: [...mixed.redirectUris, "https://evil.example/cb"] } as never, "dcr");
    store().saveClient({ client_id: "blank", client_name: "\u200b\u200e", redirect_uris: ["https://tools.example.org/oauth"] } as never, "dcr");
    call(carl.id, "suunto_list_workouts", true, 10, "mixed");
    call(carl.id, "suunto_list_workouts", true, 10, "blank");
    const page = await admin.page(`/admin/stats?days=1&user=${carl.id}`);
    expect(page.html).toContain("<td>Totally not Claude <span class=\"muted\">(name given by the app)</span></td>");
    expect(page.html).toContain("<td>tools.example.org <span class=\"muted\">(name given by the app)</span></td>");
    expect(page.html).not.toMatch(/<td>Claude<\/td>/);
  });

  it("counts accounts without calls correctly when an account that made calls was disabled", async () => {
    const gone = store().createUser("gone@example.com", "x", false);
    call(gone.id, "suunto_list_workouts", true, 10, undefined);
    store().setDisabled(gone.id, true);
    const accounts = store().listUsers().filter((u) => !u.pending && !u.disabled);
    const callers = new Set(store().usageStats(Date.now() - 7 * DAY).byUser.map((u) => u.userId));
    const idle = accounts.filter((u) => !callers.has(u.id)).length;
    const page = await admin.page("/admin/stats?days=7");
    expect(page.html).toContain(`${idle} other account${idle === 1 ? "" : "s"} made no calls in this period.`);
  });

  it("starts the days at midnight, so the first column is a whole day, and keeps axis numbers whole", async () => {
    const page = await admin.page("/admin/stats?days=7");
    // 7 columns: today and the 6 days before.
    expect(page.html.match(/<g class="stats-col">/g)).toHaveLength(7);
    // The y-axis numbers (right-aligned left of the chart, at x=36).
    const ticks = [...page.html.matchAll(/x="36" y="[\d.]+" text-anchor="end">([^<]+)<\/text>/g)].map((m) => m[1]!);
    expect(ticks).toHaveLength(3);
    expect(ticks.every((v) => /^[\d,]+$/.test(v))).toBe(true);
  });

  it("marks demo accounts in the users table", async () => {
    const demo = store().createDemoUser("reviewer@example.com", "x");
    call(demo.id, "suunto_list_workouts", true, 20, undefined);
    const page = await admin.page("/admin/stats?days=1");
    expect(page.html).toMatch(/>reviewer@example\.com<\/a> <span class="badge">demo<\/span>/);
  });

  it("reads the log through its own time index (migration 3)", () => {
    const indexes = (store().db.prepare("PRAGMA index_list(activity)").all() as { name: string }[]).map((r) => r.name);
    expect(indexes).toContain("activity_at");
    const plan = store().db.prepare("EXPLAIN QUERY PLAN SELECT COUNT(*) FROM activity INDEXED BY activity_at WHERE at > ?").all(0) as { detail: string }[];
    expect(plan.map((r) => r.detail).join(" ")).toContain("activity_at");
  });

  it("adds the time index to a database of the previous version", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "suunto-stats-"));
    try {
      const old = openDatabase(dir);
      old.exec("DROP INDEX activity_at; PRAGMA user_version = 2;");
      old.close();
      const db = openDatabase(dir);
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(3);
      expect((db.prepare("PRAGMA index_list(activity)").all() as { name: string }[]).map((r) => r.name)).toContain("activity_at");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds the middle duration per tool", () => {
    // Alice: suunto_list_workouts took 100 and 300 ms (the lower middle value is 100), suunto_get_workout 50 ms.
    const alice = store().getUserByEmail("alice@example.com")!;
    const s = store().usageStats(Date.now() - 7 * DAY, alice.id);
    expect(s.tools.find((t) => t.tool === "suunto_list_workouts")).toMatchObject({ calls: 2, failed: 0, medianMs: 100 });
    expect(s.tools.find((t) => t.tool === "suunto_get_workout")).toMatchObject({ calls: 1, failed: 1, medianMs: 50 });
    expect(s.medianMs).toBe(100);
    expect(s.byUser).toEqual([expect.objectContaining({ userId: alice.id, calls: 3, failed: 1, topTool: "suunto_list_workouts" })]);
  });
});
