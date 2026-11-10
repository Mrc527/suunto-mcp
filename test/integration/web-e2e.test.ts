/**
 * Web mode end to end: a user signs up, connects their Suunto account through Suunto's OAuth
 * pages (the in-process mock Suunto API, through the operator overrides), connects like Claude
 * over this server's OAuth and uses the tools with their own connection. A demo account gets the
 * built-in sample data and never reaches Suunto. Nothing is ever sent to Suunto.
 *
 *   SUUNTO_MCP_IT=1 npm run test:integration
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_USERNAME, DemoRegistry } from "../../src/demo/index.js";
import { addDays, todayInZone } from "../../src/util/dates.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY, MOCK_USERNAME, startMockSuunto, type MockSuunto } from "../helpers/mock-suunto.js";
import { Browser, connectMcp, connectSuunto, setBase, TestOAuthClient } from "../helpers/web-client.js";

const enabled = process.env.SUUNTO_MCP_IT === "1";

const PASSWORD = "correct horse battery";
const ZONE = "Europe/Zurich";
const DAY_MS = 86_400_000;

let server: Server;
let base = "";
let web: WebApp;
let mock: MockSuunto;
const demo = new DemoRegistry();
/** Every line the web service logged. */
const logs: string[] = [];
/** E-mail addresses used below (they must never reach the log). */
const emails: string[] = ["admin@example.com"];
const admin = new Browser();

async function call<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  if (res.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text) as T;
}

/** Workouts of the mock that started in the last 30 days (what the connection check counts). */
function recentWorkouts(): number {
  const now = Date.now();
  return mock.state.workouts.filter((w) => Number(w.startTime) >= now - 30 * DAY_MS && Number(w.startTime) < now).length;
}

const userId = (email: string) => web.ctx.store.getUserByEmail(email)!.id;

/** Sign up, connect Suunto through its OAuth pages, then connect like Claude. */
async function athlete(email: string): Promise<{ browser: Browser; client: Client }> {
  emails.push(email);
  const browser = new Browser();
  expect((await browser.signup(email, PASSWORD)).status).toBe(303);
  const before = await browser.page("/account");
  expect(before.html).toContain("Connect Suunto");
  const tokenCalls = mock.count("/oauth/token");
  const run = await connectSuunto(browser, { timeZone: ZONE });
  // Suunto's sign-in page of the operator's app, with this server's redirect URI and a state.
  expect(run.authorize.origin + run.authorize.pathname).toBe(`${mock.oauthUrl}/oauth/authorize`);
  expect(Object.fromEntries(run.authorize.searchParams)).toMatchObject({ response_type: "code", client_id: MOCK_CLIENT_ID, redirect_uri: `${base}/suunto/callback` });
  expect(run.callback.searchParams.get("state")).toBe(run.authorize.searchParams.get("state"));
  expect(run.res.headers.get("location")).toBe("/account?m=connected");
  expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
  const page = await browser.page("/account?m=connected");
  expect(page.html).toContain("Suunto is connected. Your AI apps can use your Suunto data now.");
  expect(page.html).toContain(`<dt>Suunto username</dt><dd>${MOCK_USERNAME}</dd>`);
  const settings = web.ctx.store.getSuuntoSettings(userId(email))!;
  expect(settings).toMatchObject({ username: MOCK_USERNAME, clientId: MOCK_CLIENT_ID, timeZone: ZONE, lastCheck: { workouts: recentWorkouts() } });
  expect(page.html).not.toContain(settings.refreshToken);
  return { browser, client: await connectMcp(new TestOAuthClient(browser)) };
}

describe.skipIf(!enabled)("web mode against a mock Suunto API", () => {
  beforeAll(async () => {
    // Listen first, so the public URL and the redirect URI hold the real port.
    server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    setBase(base);
    // The mock accepts only the redirect URI registered for this server, as Suunto does.
    mock = await startMockSuunto({ redirectUris: [`${base}/suunto/callback`] });
    web = await createWebApp({ publicUrl: new URL(base), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: mock.env(), demo, log: (m) => void logs.push(m) });
    server.on("request", web.app);
    // The first account is the administrator; the others sign up freely.
    expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "open" });
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await web.close();
    await mock.close();
    demo.clear();
  });

  it("lets a signed-up user connect Suunto and use their data through Claude", async () => {
    const { client } = await athlete("river@example.com");
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["suunto_account_info", "suunto_list_workouts", "suunto_sleep", "suunto_import_route", "suunto_create_poi"]));
    expect(names).toHaveLength(14);

    const today = todayInZone(ZONE);
    const info = await call(client, "suunto_account_info", { check: true });
    expect(info).toMatchObject({ username: MOCK_USERNAME, connected: true, demo: false, read_only: false, time_zone: ZONE, today, check: { ok: true, workouts_last_30_days: recentWorkouts() } });
    const list = await call<{ count: number; workouts: Array<{ workout_key: string }> }>(client, "suunto_list_workouts", { limit: 5 });
    expect(list.count).toBe(Math.min(5, recentWorkouts()));
    const workout = await call<{ workout_key: string; sport: string }>(client, "suunto_get_workout", { workout_key: list.workouts[0]!.workout_key });
    expect(workout).toMatchObject({ workout_key: list.workouts[0]!.workout_key, sport: "Running" });
    const sleep = await call<{ count: number }>(client, "suunto_sleep", { from: addDays(today, -3), to: today });
    expect(sleep.count).toBeGreaterThan(0);
    const daily = await call<{ days: unknown[] }>(client, "suunto_daily_activity", { from: addDays(today, -3), to: today });
    expect(daily.days).toHaveLength(4);

    const pois = mock.state.pois.length;
    const poi = await call<{ added: boolean; poi: { name: string; type: string } }>(client, "suunto_create_poi", { name: "Web test spring", latitude: 47.3741, longitude: 8.5689, type: "WaterPoint" });
    expect(poi).toMatchObject({ added: true, poi: { name: "Web test spring", type: "WaterPoint" } });
    expect(mock.state.pois).toHaveLength(pois + 1);
    const routes = mock.state.routes.length;
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Web test loop</name><trkseg><trkpt lat="47.37" lon="8.54"/><trkpt lat="47.38" lon="8.55"/></trkseg></trk></gpx>`;
    const imported = await call<{ added: boolean; route: { name: string } }>(client, "suunto_import_route", { gpx });
    expect(imported).toMatchObject({ added: true, route: { name: "Web test loop" } });
    expect(mock.state.routes).toHaveLength(routes + 1);
    expect((await call<{ count: number }>(client, "suunto_list_routes")).count).toBe(routes + 1);

    expect(mock.state.violations).toEqual([]);
    expect(web.ctx.store.recentActivity(userId("river@example.com")).map((a) => a.tool)).toEqual(expect.arrayContaining(["suunto_create_poi", "suunto_import_route", "suunto_account_info"]));
    await client.close();
  });

  it("keeps each user's connection and settings apart", async () => {
    const lee = await athlete("lee@example.com");
    const river = web.ctx.store.getSuuntoSettings(userId("river@example.com"))!;
    const own = web.ctx.store.getSuuntoSettings(userId("lee@example.com"))!;
    expect(own.refreshToken).not.toBe(river.refreshToken);
    expect(own.connectedAt).toBeGreaterThanOrEqual(river.connectedAt);
    // Read-only for this user only: the write tools are gone for them.
    const { csrf } = await lee.browser.page("/account");
    expect((await lee.browser.post("/account/suunto/settings", { _csrf: csrf, units: "imperial", readOnly: "on", timeZone: "Asia/Tokyo" })).headers.get("location")).toBe("/account?m=saved");
    const names = (await lee.client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("suunto_import_route");
    expect(names).not.toContain("suunto_create_poi");
    expect(await call(lee.client, "suunto_account_info")).toMatchObject({ username: MOCK_USERNAME, read_only: true, units: "imperial", time_zone: "Asia/Tokyo" });
    expect((await call<{ units: { distance: string } }>(lee.client, "suunto_list_workouts", { limit: 1 })).units.distance).toBe("mi");
    expect(web.ctx.store.getSuuntoSettings(userId("river@example.com"))).toMatchObject({ readOnly: false, units: "metric", timeZone: ZONE });
    await lee.client.close();
  });

  it("asks the user to connect again once Suunto refuses the sign-in", async () => {
    const { browser, client } = await athlete("again@example.com");
    mock.revokeAll();
    mock.expireAccessTokens();
    // The call that finds the refused sign-in, and the calls after it, say where to connect again.
    const expired = `Your Suunto connection expired. Connect Suunto again at ${base}/account.`;
    await expect(call(client, "suunto_list_workouts")).rejects.toThrow(expired);
    await expect(call(client, "suunto_list_routes")).rejects.toThrow(expired);
    const id = userId("again@example.com");
    expect(web.ctx.store.getUser(id)!.suuntoNeedsReconnect).toBe(true);
    // The stored tokens are kept (Suunto has refused good ones during outages).
    expect(web.ctx.store.getSuuntoSettings(id)!.refreshToken).toBeTruthy();
    const { html } = await browser.page("/account");
    expect(html).toContain("Suunto refused your saved connection");
    // Connecting again through Suunto's pages fixes it.
    expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
    expect(web.ctx.store.getUser(id)!.suuntoNeedsReconnect).toBe(false);
    expect((await call<{ count: number }>(client, "suunto_list_workouts", { limit: 1 })).count).toBe(1);
    await client.close();
  });

  it("removes the connection, tells Suunto, and then explains the setup", async () => {
    const { browser, client } = await athlete("leaving@example.com");
    const calls = mock.state.deauthorizeCalls;
    const { csrf } = await browser.page("/account");
    expect((await browser.post("/account/suunto/remove", { _csrf: csrf })).headers.get("location")).toBe("/account?m=removed");
    expect(mock.state.deauthorizeCalls).toBe(calls + 1);
    expect(web.ctx.store.getUser(userId("leaving@example.com"))!.hasSuunto).toBe(false);
    const res = await client.callTool({ name: "suunto_list_workouts", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain(`Connect your Suunto account first at ${base}/account`);
    await client.close();
  });

  it("gives a demo account sample data, and it never reaches Suunto", async () => {
    const page = await admin.page("/admin");
    const created = await admin.post("/admin/demo", { _csrf: page.csrf, email: "reviewer@example.com" });
    expect(created.status).toBe(200);
    emails.push("reviewer@example.com");
    const password = (await created.text()).match(/<code id="secret">([^<]+)<\/code>/)![1]!;
    const reviewer = new Browser();
    expect((await reviewer.login("reviewer@example.com", password)).status).toBe(303);
    expect((await reviewer.page("/account")).html).toContain("This is a demo account.");

    const requests = mock.requests.length;
    const client = await connectMcp(new TestOAuthClient(reviewer));
    const info = await call(client, "suunto_account_info", { check: true });
    expect(info).toMatchObject({ username: DEMO_USERNAME, connected: true, demo: true, time_zone: "Europe/Zurich", check: { ok: true } });
    const list = await call<{ count: number; workouts: Array<{ workout_key: string }> }>(client, "suunto_list_workouts", { limit: 10 });
    expect(list.count).toBeGreaterThan(5);
    const fit = await client.callTool({ name: "suunto_export_workout_fit", arguments: { workout_key: list.workouts[0]!.workout_key } });
    expect(fit.isError).toBeFalsy();
    const poi = await call<{ added: boolean }>(client, "suunto_create_poi", { name: "Demo viewpoint", latitude: 46.5, longitude: 8.1 });
    expect(poi.added).toBe(true);
    expect((await call<{ pois: Array<{ name: string }> }>(client, "suunto_list_pois")).pois.map((p) => p.name)).toContain("Demo viewpoint");
    // Nothing went to Suunto (the mock), and nothing changed there.
    expect(mock.requests.length).toBe(requests);
    expect(mock.state.pois.some((p) => p.point?.name === "Demo viewpoint")).toBe(false);
    await client.close();
  });

  it("never writes Suunto tokens, codes, app keys or e-mail addresses to the log", async () => {
    // A code exchange that fails (the mock echoes the code in its error) and a tool call that fails.
    const browser = new Browser();
    emails.push("tool@example.com");
    expect((await browser.signup("tool@example.com", PASSWORD)).status).toBe(303);
    const state = web.ctx.store.createOAuthState(userId("tool@example.com"));
    const failed = await browser.fetch(`/suunto/callback?${new URLSearchParams({ code: "invented-code-value", state })}`);
    expect(failed.headers.get("location")).toBe("/account?m=connectfailed");
    const { client } = await athlete("tool2@example.com");
    await expect(call(client, "suunto_get_workout", { workout_key: "0123456789abcdef01234567" })).rejects.toThrow("Suunto has no workout with the key 0123456789abcdef01234567.");
    await client.close();

    const all = logs.join("\n");
    // The flows above did log (else this test would check nothing).
    expect(all).toContain("Suunto code exchange failed");
    expect(all).toContain("Suunto connection saved for a user");
    expect(all).toContain("Tool suunto_list_workouts failed");
    expect(all).toContain("Tool suunto_get_workout failed");
    const stored = emails.map((e) => web.ctx.store.getUserByEmail(e)).flatMap((u) => (u ? [web.ctx.store.getSuuntoSettings(u.id)] : []));
    const storedTokens = stored.flatMap((s) => (s ? [s.refreshToken, s.accessToken ?? ""] : [])).filter((t) => t);
    expect(storedTokens.length).toBeGreaterThan(0);
    const secrets = [
      MOCK_CLIENT_SECRET,
      MOCK_SUBSCRIPTION_KEY,
      "invented-code-value",
      ...mock.state.accessTokens.map((t) => t.token),
      ...mock.state.refreshTokens.map((t) => t.token),
      ...mock.state.codes.map((c) => c.code),
      ...storedTokens,
      ...emails,
    ];
    for (const secret of secrets) expect(all.includes(secret), `the log holds ${secret.slice(0, 4)}...`).toBe(false);
    // Nothing shaped like a JWT (header.payload).
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}/);
  });
});
