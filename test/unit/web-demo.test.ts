/**
 * The demo account for app reviewers: sample Suunto data built into the server, kept in memory
 * and reset every day. Exercised end to end over HTTP with the real OAuth flow, like Claude.
 *
 * The operator's Suunto addresses point at a local "trap" server that counts every connection,
 * and fetch is spied on: the demo account must never reach a network. A normal user on the same
 * server is the control: connecting Suunto does reach the trap.
 */
import { createServer, type Server } from "node:http";
import net, { type AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { DEMO_NAME, DEMO_TIME_ZONE, DEMO_USERNAME, DemoRegistry, demoRegistry, lastDemoReset, nextDemoReset, resetDemo } from "../../src/demo/index.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, connectMcp, setBase, TestOAuthClient } from "../helpers/web-client.js";

const PASSWORD = "correct horse battery";
/** Invented app keys: the trap never checks them. */
const KEYS = { clientId: "invented-client", clientSecret: "invented-secret-value", subscriptionKey: "0123456789abcdef0123456789abcdef" };

let web: WebApp;
let server: Server;
let base = "";
const logs: string[] = [];

/** Accepts and drops every connection, counting them. */
let trap: net.Server;
let trapHits = 0;
let fetchSpy: MockInstance;

beforeAll(async () => {
  trap = net.createServer((socket) => {
    trapHits++;
    socket.destroy();
  });
  await new Promise<void>((r) => trap.listen(0, "127.0.0.1", r));
  const t = `http://127.0.0.1:${(trap.address() as AddressInfo).port}`;

  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    operator: { SUUNTO_OAUTH_URL: `${t}/oauth-host`, SUUNTO_API_URL: `${t}/api-host` },
    suuntoKeys: KEYS,
    log: (m) => logs.push(m),
  });
  server.on("request", web.app);
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => trap.close(() => r()));
  await web.close();
  demoRegistry.clear();
});

/** Requests that did not go to this test's own web server. */
function foreignFetches(): string[] {
  return fetchSpy.mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input))).filter((url) => !url.startsWith(`${base}/`));
}

type ToolResult = { isError?: boolean; content: { type: string; text?: string }[] };

function tools(client: Client) {
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as ToolResult;
    if (res.isError) throw new Error(`${name}: ${res.content[0]?.text}`);
    return res;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = async (name: string, args: Record<string, unknown> = {}): Promise<any> => JSON.parse((await call(name, args)).content[0]!.text!);
  return { call, json };
}

const admin = new Browser();
const reviewer = new Browser();
const reviewerEmail = "reviewer@example.com";
let reviewerPassword = "";
let reviewerId = "";

describe("creating a demo account", () => {
  it("admin creates a demo account and sees its password once", async () => {
    expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
    let page = await admin.page("/admin");
    expect(page.html).toContain("Demo account for app reviewers");
    expect(page.html).toContain("No demo account yet.");

    const created = await admin.post("/admin/demo", { _csrf: page.csrf, email: "Reviewer@Example.com" });
    expect(created.status).toBe(200);
    const html = await created.text();
    expect(html).toContain("Password of the demo account reviewer@example.com");
    reviewerPassword = html.match(/<code id="secret">([^<]+)<\/code>/)![1]!;
    reviewerId = web.ctx.store.getUserByEmail(reviewerEmail)!.id;
    expect(reviewerPassword).toMatch(/^[A-Za-z0-9]{6}(-[A-Za-z0-9]{6}){3}$/);

    const user = web.ctx.store.getUserByEmail(reviewerEmail)!;
    expect(user).toMatchObject({ demo: true, isAdmin: false, disabled: false, pending: false, hasSuunto: false });
    // Only the scrypt hash is stored, never the password itself.
    const row = web.ctx.store.db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as { password_hash: string };
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.password_hash).not.toContain(reviewerPassword);
    // Stores are made on first use, not before.
    expect(web.ctx.demo.peek(user.id)).toBeUndefined();
    // The log never names the account.
    expect(logs.some((m) => m.includes("Demo account created"))).toBe(true);
    expect(logs.join("\n")).not.toContain("reviewer@example.com");

    page = await admin.page("/admin");
    expect(page.html).not.toContain(reviewerPassword);
    const demoCard = page.html.slice(page.html.indexOf('id="demo"'), page.html.indexOf("</table>", page.html.indexOf('id="demo"')));
    expect(demoCard).toContain("reviewer@example.com");
    expect(demoCard).toContain("Reset demo data now");
    expect(demoCard).toContain("created on first use");
    expect(page.html).toContain("Next automatic reset of all demo data:");
    // The users table marks it.
    expect(page.html).toMatch(/reviewer@example\.com[\s\S]*?<span class="badge warn">demo<\/span>/);
  });

  it("refuses expired forms, invalid and existing addresses", async () => {
    const { csrf } = await admin.page("/admin");
    expect((await admin.post("/admin/demo", { _csrf: "wrong", email: "other@example.com" })).status).toBe(400);
    expect(web.ctx.store.getUserByEmail("other@example.com")).toBeUndefined();
    const invalid = await admin.post("/admin/demo", { _csrf: csrf, email: "not an address" });
    expect(invalid.status).toBe(400);
    const taken = await admin.post("/admin/demo", { _csrf: csrf, email: "admin@example.com" });
    expect(taken.status).toBe(400);
    expect(await taken.text()).toContain("already exists");
    expect(web.ctx.store.getUserByEmail("admin@example.com")!.demo).toBe(false);
    // Only administrators.
    expect((await reviewer.post("/admin/demo", { _csrf: csrf, email: "x@example.com" })).status).toBe(303);
  });
});

describe("the demo user's pages", () => {
  it("signs in with the generated password", async () => {
    expect((await reviewer.login(reviewerEmail, reviewerPassword)).status).toBe(303);
  });

  it("shows the demo notice instead of the Suunto connection", async () => {
    const { res, html } = await reviewer.page("/account");
    expect(res.status).toBe(200);
    expect(html).toContain("This is a demo account.");
    expect(html).toContain("every day at 04:00 (Swiss time)");
    expect(html).toContain("Nothing is ever sent to Suunto.");
    expect(html).toContain(`Athlete: ${DEMO_NAME}. Suunto username: ${DEMO_USERNAME}. Time zone: ${DEMO_TIME_ZONE}.`);
    expect(html).toContain("Demo account with sample Suunto data.");
    expect(html).toContain('action="/account/demo"');
    expect(html).toContain('name="readOnly"');
    // The connection card, as for any account that is set up.
    expect(html).toContain(`${base}/mcp`);
    // No Suunto connection: no connect button, no Suunto page in the form targets.
    for (const absent of ['action="/account/suunto/connect"', "Connect Suunto", "Remove Suunto connection"]) expect(html).not.toContain(absent);
    expect(res.headers.get("content-security-policy")).toMatch(/form-action 'self'$/);
  });

  it("never connects Suunto for a demo account", async () => {
    const { csrf } = await reviewer.page("/account");
    const res = await reviewer.post("/account/suunto/connect", { _csrf: csrf });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("it cannot be connected to a Suunto account");
    expect(web.ctx.store.db.prepare("SELECT COUNT(*) AS n FROM suunto_oauth_states").get()).toEqual({ n: 0 });
    // A callback is ignored too.
    expect((await reviewer.fetch("/suunto/callback?code=c&state=s")).headers.get("location")).toBe("/account");
    const row = web.ctx.store.db.prepare("SELECT service_enc FROM users WHERE id = ?").get(reviewerId) as { service_enc: string | null };
    expect(row.service_enc).toBeNull();
    // Also refused below the web pages.
    web.ctx.store.saveSuuntoSettings(reviewerId, { username: "x", refreshToken: "rt-invented", clientId: "c", units: "metric", readOnly: false, connectedAt: 1 });
    expect(web.ctx.store.getUser(reviewerId)!.hasSuunto).toBe(false);
  });

  it("keeps the connected apps and security pages", async () => {
    expect((await reviewer.page("/account/connections")).res.status).toBe(200);
    expect((await reviewer.page("/account/security")).html).toContain("Change password");
  });

  it("asks for consent with a demo notice instead of the setup hint", async () => {
    const reg = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const query = new URLSearchParams({ client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", resource: `${base}/mcp` });
    const res = await reviewer.fetch(`/authorize?${query}`);
    const { html } = await reviewer.page(res.headers.get("location")!);
    expect(html).toContain("This is a demo account: the app sees invented sample data built into this server. Nothing is sent to Suunto.");
    expect(html).not.toContain("You have not connected your Suunto account yet");
    expect(html).toContain("and add new ones to your Suunto App");
  });
});

describe("an AI app on the demo account", () => {
  let client: Client;
  let t: ReturnType<typeof tools>;

  beforeAll(async () => {
    client = await connectMcp(new TestOAuthClient(reviewer));
    t = tools(client);
  });
  afterAll(async () => {
    await client.close();
  });

  it("offers every tool and says it is a demo account", async () => {
    const names = (await client.listTools()).tools.map((x) => x.name);
    expect(names).toEqual(expect.arrayContaining(["suunto_account_info", "suunto_list_workouts", "suunto_sleep", "suunto_import_route", "suunto_create_poi"]));
    const info = await t.json("suunto_account_info", { check: true });
    expect(info.demo_account).toContain("This is a demo account");
    expect(info).toMatchObject({ demo: true, username: DEMO_USERNAME, time_zone: DEMO_TIME_ZONE, units: "metric" });
    expect(info.check).toMatchObject({ ok: true });
    expect(web.ctx.demo.peek(reviewerId)).toBeDefined();
  });

  it("lists the sample workouts and adds a point of interest", async () => {
    const workouts = await t.json("suunto_list_workouts", { limit: 5 });
    expect(workouts.count).toBe(5);
    const before = await t.json("suunto_list_pois", {});
    const created = await t.json("suunto_create_poi", { name: "Review hut", latitude: 46.5, longitude: 8.1 });
    expect(JSON.stringify(created)).toContain("Review hut");
    const after = await t.json("suunto_list_pois", { limit: 100 });
    expect(JSON.stringify(after)).toContain("Review hut");
    expect(JSON.stringify(before)).not.toContain("Review hut");
    // The activity log works as for any account.
    expect(web.ctx.store.recentActivity(reviewerId)).toContainEqual(expect.objectContaining({ tool: "suunto_create_poi", ok: true }));
  });

  it("resetDemo() throws every change away", async () => {
    const before = web.ctx.demo.peek(reviewerId)!.generation;
    expect(resetDemo(reviewerId)).toBe(1);
    expect(web.ctx.demo.peek(reviewerId)!.generation).toBe(before + 1);
    expect(JSON.stringify(await t.json("suunto_list_pois", { limit: 100 }))).not.toContain("Review hut");
  });

  it("the admin's button resets the demo data too", async () => {
    await t.json("suunto_create_poi", { name: "Temporary spring", latitude: 46.6, longitude: 8.2 });
    const { csrf } = await admin.page("/admin");
    const res = await admin.post("/admin/demo/reset", { _csrf: csrf, id: reviewerId });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin?m=demoreset#demo");
    expect((await admin.page("/admin?m=demoreset")).html).toContain("Demo data reset: the account has fresh sample data.");
    expect(JSON.stringify(await t.json("suunto_list_pois", { limit: 100 }))).not.toContain("Temporary spring");
    // The page now shows when the current data was made.
    expect((await admin.page("/admin")).html).not.toContain("created on first use");
  });

  it("follows the user's read-only switch", async () => {
    let { csrf } = await reviewer.page("/account");
    expect((await reviewer.post("/account/demo", { _csrf: csrf, readOnly: "on" })).status).toBe(303);
    expect(web.ctx.store.getUser(reviewerId)!.demoReadOnly).toBe(true);
    let names = (await client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("suunto_list_workouts");
    expect(names).not.toContain("suunto_create_poi");
    expect(names).not.toContain("suunto_import_route");
    expect((await reviewer.page("/account")).html).toContain("Demo account with sample Suunto data, read-only.");
    ({ csrf } = await reviewer.page("/account"));
    await reviewer.post("/account/demo", { _csrf: csrf });
    names = (await client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("suunto_create_poi");
  });

  it("made no network connection at all", () => {
    expect(trapHits).toBe(0);
    expect(foreignFetches()).toEqual([]);
  });
});

describe("other accounts", () => {
  const normal = new Browser();
  let normalId = "";

  it("a normal user keeps the Connect Suunto button and reaches the operator's servers (control)", async () => {
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "open" });
    expect((await normal.signup("user@example.com", PASSWORD)).status).toBe(303);
    normalId = web.ctx.store.getUserByEmail("user@example.com")!.id;
    const page = await normal.page("/account");
    expect(page.html).toContain('action="/account/suunto/connect"');
    expect(page.html).not.toContain("This is a demo account.");
    // Connect Suunto sends the browser to the operator's Suunto host (the trap)...
    const started = await normal.post("/account/suunto/connect", { _csrf: page.csrf });
    expect(started.headers.get("location")).toMatch(/\/oauth-host\/oauth\/authorize\?/);
    // ...and the code exchange of the callback goes there too (the trap drops the connection).
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const res = await normal.fetch(`/suunto/callback?${new URLSearchParams({ code: "invented-code", state })}`);
    expect(res.headers.get("location")).toBe("/account?m=connectfailed");
    expect(web.ctx.store.getUser(normalId)!.hasSuunto).toBe(false);
    // The guards notice real connection attempts.
    expect(trapHits).toBeGreaterThan(0);
    expect(foreignFetches().length).toBeGreaterThan(0);
  });

  it("an administrator turns a user into a demo account and back", async () => {
    web.ctx.store.saveSuuntoSettings(normalId, {
      username: "bob-runner",
      refreshToken: "rt-invented-bob",
      accessToken: "at-invented-bob",
      accessTokenExpiresAt: Date.now() + 3_600_000,
      clientId: KEYS.clientId,
      units: "metric",
      readOnly: false,
      connectedAt: Date.now(),
    });
    let { csrf } = await admin.page("/admin");
    expect((await admin.page("/admin")).html).toMatch(/user@example\.com[\s\S]*?<span class="badge ok">connected<\/span>/);
    const hits = trapHits;
    await admin.post("/admin/users/action", { _csrf: csrf, id: normalId, action: "demo-on" });
    let user = web.ctx.store.getUser(normalId)!;
    expect(user).toMatchObject({ demo: true, hasSuunto: false });
    expect(web.ctx.store.getSuuntoSettings(normalId)).toBeUndefined();
    // The Suunto connection ended: the server tried to tell Suunto (the trap), best effort.
    expect(trapHits).toBeGreaterThan(hits);
    expect((await normal.page("/account")).html).toContain("This is a demo account.");
    const entry = web.ctx.pool.get(user)!;
    expect(entry.services.backend?.kind).toBe("demo");
    expect(entry.config.timeZone).toBe(DEMO_TIME_ZONE);

    // A demo account never becomes an administrator.
    ({ csrf } = await admin.page("/admin"));
    await admin.post("/admin/users/action", { _csrf: csrf, id: normalId, action: "promote" });
    expect(web.ctx.store.getUser(normalId)!.isAdmin).toBe(false);

    await admin.post("/admin/users/action", { _csrf: csrf, id: normalId, action: "demo-off" });
    user = web.ctx.store.getUser(normalId)!;
    expect(user.demo).toBe(false);
    expect(web.ctx.demo.peek(normalId)).toBeUndefined();
    expect(web.ctx.pool.get(user)).toBeUndefined();
    expect((await normal.page("/account")).html).toContain('action="/account/suunto/connect"');
    // Administrators are never demo accounts.
    expect(web.ctx.store.setDemo(web.ctx.store.getUserByEmail("admin@example.com")!.id, true)).toBe(false);
  });

  it("deleting a demo account drops its stores", async () => {
    const { csrf } = await admin.page("/admin");
    await admin.post("/admin/users/action", { _csrf: csrf, id: reviewerId, action: "delete" });
    expect(web.ctx.store.getUser(reviewerId)).toBeUndefined();
    expect(web.ctx.demo.peek(reviewerId)).toBeUndefined();
  });
});

describe("daily reset", () => {
  it("happens at 04:00 in Zurich, also across daylight saving changes", () => {
    const iso = (d: Date) => d.toISOString();
    // Winter (UTC+1): 04:00 is 03:00 UTC.
    expect(iso(lastDemoReset(new Date("2026-11-08T13:00:00Z")))).toBe("2026-11-08T03:00:00.000Z");
    expect(iso(nextDemoReset(new Date("2026-11-08T13:00:00Z")))).toBe("2026-11-09T03:00:00.000Z");
    expect(iso(lastDemoReset(new Date("2026-11-09T02:59:59Z")))).toBe("2026-11-08T03:00:00.000Z");
    expect(iso(lastDemoReset(new Date("2026-11-09T03:00:00Z")))).toBe("2026-11-09T03:00:00.000Z");
    // Summer (UTC+2): 04:00 is 02:00 UTC.
    expect(iso(nextDemoReset(new Date("2026-07-01T12:00:00Z")))).toBe("2026-07-02T02:00:00.000Z");
    // The night the clocks go back (25 October 2026) and forward (29 March 2026).
    expect(iso(nextDemoReset(new Date("2026-10-25T00:30:00Z")))).toBe("2026-10-25T03:00:00.000Z");
    expect(iso(nextDemoReset(new Date("2026-03-29T00:30:00Z")))).toBe("2026-03-29T02:00:00.000Z");
  });

  it("resets an account on its next use once 04:00 has passed", () => {
    let now = new Date("2026-11-08T13:00:00Z");
    const registry = new DemoRegistry({ clock: () => now });
    try {
      const account = registry.account("u1");
      const pois = account.activity.pois.length;
      account.activity.pois.push(account.activity.pois[0]!);

      // After midnight but before 04:00: nothing changes.
      now = new Date("2026-11-08T23:30:00Z");
      expect(registry.account("u1").generation).toBe(1);
      now = new Date("2026-11-09T02:59:00Z");
      expect(registry.account("u1").generation).toBe(1);
      expect(account.activity.pois.length).toBe(pois + 1);

      // From 04:00 the first use resets the store.
      now = new Date("2026-11-09T03:01:00Z");
      expect(registry.account("u1").generation).toBe(2);
      expect(account.activity.pois.length).toBe(pois);
      expect(registry.account("u1").resetAt).toEqual(now);
    } finally {
      registry.clear();
    }
  });

  it("resets every account with one timer that does not keep the process alive", () => {
    vi.useFakeTimers({ now: new Date("2026-11-08T13:00:00Z"), toFake: ["setTimeout", "clearTimeout", "Date"] });
    const registry = new DemoRegistry();
    try {
      const a = registry.account("a");
      const b = registry.account("b");
      const pois = a.activity.pois.length;
      a.activity.pois.push(a.activity.pois[0]!);
      const timer = (registry as unknown as { timer: NodeJS.Timeout }).timer;
      expect(vi.getTimerCount()).toBe(1);
      expect(timer.hasRef()).toBe(false);

      vi.advanceTimersByTime(14 * 3600_000 - 1000); // 03:59:59 in Zurich
      expect(a.generation).toBe(1);
      vi.advanceTimersByTime(2000); // 04:00:01
      expect(a.generation).toBe(2);
      expect(b.generation).toBe(2);
      expect(a.activity.pois.length).toBe(pois);
      // And again the next day.
      vi.advanceTimersByTime(24 * 3600_000);
      expect(a.generation).toBe(3);

      // No accounts, no timer.
      registry.forget("a");
      registry.forget("b");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      registry.clear();
      vi.useRealTimers();
    }
  });

  it("reset() resets one account or all of them", () => {
    const registry = new DemoRegistry();
    try {
      registry.account("a");
      registry.account("b");
      expect(registry.reset("a")).toBe(1);
      expect(registry.peek("a")!.generation).toBe(2);
      expect(registry.peek("b")!.generation).toBe(1);
      expect(registry.reset("unknown")).toBe(0);
      expect(registry.reset()).toBe(2);
      expect(registry.peek("b")!.generation).toBe(2);
    } finally {
      registry.clear();
    }
  });
});
