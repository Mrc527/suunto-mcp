/**
 * The demo account for app reviewers: a sample PADI logbook built into the server, kept in memory
 * and reset every day. Exercised end to end over HTTP with the real OAuth flow, like Claude.
 *
 * The operator's PADI addresses point at a local "trap" server that counts every connection, and
 * fetch is spied on: the demo account must never reach a network. A normal user on the same server
 * is the control: their tools do reach the trap.
 */
import { createServer, type Server } from "node:http";
import net, { type AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { DEMO_ADDRESS, DEMO_NAME, DemoRegistry, demoRegistry, lastDemoReset, nextDemoReset, resetDemo } from "../../src/demo/index.js";
import { addDays, todayInZone } from "../../src/util/dates.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, connectMcp, setBase, TestOAuthClient } from "../helpers/web-client.js";

const PASSWORD = "correct horse battery";
const TZ = "Europe/Zurich";

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
    operator: {
      PADI_COGNITO_URL: `${t}/cognito/`,
      PADI_AUTH_URL: `${t}/auth/api`,
      PADI_LOGBOOK_URL: `${t}/api/Logbook`,
      PADI_DIRECT_URL: `${t}/v1/graphql`,
      PADI_INSTRUCTOR_URL: `${t}/api/Logbook/instructor`,
      PADI_DIRECT_INSTRUCTOR_URL: `${t}/instructor`,
      PADI_ECARD_URL: `${t}/api/eCard`,
      PADI_IMAGES_URL: `${t}/api/Image`,
    },
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
    expect(user).toMatchObject({ demo: true, isAdmin: false, disabled: false, pending: false, hasPadi: false });
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

  it("shows the demo notice instead of the PADI form", async () => {
    const { res, html } = await reviewer.page("/account");
    expect(res.status).toBe(200);
    expect(html).toContain("This is a demo account.");
    expect(html).toContain("every day at 04:00 (Swiss time)");
    expect(html).toContain("Nothing is ever sent to PADI or to a PADI Pro");
    expect(html).toContain(`${DEMO_NAME} &lt;${DEMO_ADDRESS}&gt;`);
    expect(html).toContain("Demo account with a sample logbook.");
    expect(html).toContain('action="/account/demo"');
    expect(html).toContain('name="readOnly"');
    // The connection card, as for any account that is set up.
    expect(html).toContain(`${base}/mcp`);
    // No PADI form.
    for (const absent of ['name="password"', 'action="/account/padi"', "Save and test", "Remove PADI connection"]) expect(html).not.toContain(absent);
  });

  it("never stores a PADI connection for a demo account", async () => {
    const { csrf } = await reviewer.page("/account");
    const res = await reviewer.post("/account/padi", { _csrf: csrf, email: "someone@example.com", password: "invented-password" });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("it cannot be connected to a PADI account");
    const row = web.ctx.store.db.prepare("SELECT service_enc FROM users WHERE id = ?").get(reviewerId) as { service_enc: string | null };
    expect(row.service_enc).toBeNull();
    // Also refused below the web pages.
    web.ctx.store.savePadiSettings(reviewerId, {
      email: "x@example.com",
      refreshToken: "rt-invented",
      loginMethod: "cognito",
      clientId: "c",
      affiliateId: "1",
      units: "auto",
      readOnly: false,
      connectedAt: 1,
    });
    expect(web.ctx.store.getUser(reviewerId)!.hasPadi).toBe(false);
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
    expect(html).toContain("This is a demo account: the app sees a sample logbook built into this server.");
    expect(html).not.toContain("You have not connected your PADI account yet");
    expect(html).toContain("log new dives, change and delete dives");
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
    expect(names).toEqual(expect.arrayContaining(["padi_account_info", "logbook_list_dives", "logbook_create_dive", "logbook_update_dive", "logbook_delete_dive"]));
    const info = await t.json("padi_account_info", { check: true });
    expect(info.demo_account).toContain("This is a demo account");
    expect(info.name).toBe(DEMO_NAME);
    expect(web.ctx.demo.peek(reviewerId)).toBeDefined();
  });

  it("lists the sample dives and logs a new one", async () => {
    const before = await t.json("logbook_list_dives", { limit: 5 });
    expect(before.total).toBeGreaterThan(10);
    const date = addDays(todayInZone(TZ), -1);
    const created = await t.json("logbook_create_dive", { title: "Review dive", date, location: "House reef", dive_type: "shore", max_depth: 18, bottom_time_min: 45 });
    expect(JSON.stringify(created)).toContain("Review dive");
    const after = await t.json("logbook_list_dives", { limit: 5 });
    expect(after.total).toBe(before.total + 1);
    // The activity log works as for any account.
    expect(web.ctx.store.recentActivity(reviewerId)).toContainEqual(expect.objectContaining({ tool: "logbook_create_dive", ok: true }));
  });

  it("resetDemo() throws every change away", async () => {
    const before = web.ctx.demo.peek(reviewerId)!.generation;
    const total = (await t.json("logbook_list_dives", { limit: 1 })).total;
    expect(resetDemo(reviewerId)).toBe(1);
    expect(web.ctx.demo.peek(reviewerId)!.generation).toBe(before + 1);
    expect((await t.json("logbook_list_dives", { limit: 1 })).total).toBe(total - 1);
    expect(JSON.stringify(await t.json("logbook_list_dives", { limit: 100 }))).not.toContain("Review dive");
  });

  it("the admin's button resets the demo data too", async () => {
    const date = addDays(todayInZone(TZ), -2);
    await t.json("logbook_create_dive", { title: "Temporary dive", date, location: "House reef", dive_type: "boat", max_depth: 12, bottom_time_min: 40 });
    const { csrf } = await admin.page("/admin");
    const res = await admin.post("/admin/demo/reset", { _csrf: csrf, id: reviewerId });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin?m=demoreset#demo");
    expect((await admin.page("/admin?m=demoreset")).html).toContain("Demo data reset: the account has fresh sample data.");
    expect(JSON.stringify(await t.json("logbook_list_dives", { limit: 100 }))).not.toContain("Temporary dive");
    // The page now shows when the current data was made.
    expect((await admin.page("/admin")).html).not.toContain("created on first use");
  });

  it("follows the user's read-only switch", async () => {
    let { csrf } = await reviewer.page("/account");
    expect((await reviewer.post("/account/demo", { _csrf: csrf, readOnly: "on" })).status).toBe(303);
    expect(web.ctx.store.getUser(reviewerId)!.demoReadOnly).toBe(true);
    let names = (await client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("logbook_list_dives");
    expect(names).not.toContain("logbook_create_dive");
    expect((await reviewer.page("/account")).html).toContain("Demo account with a sample logbook, read-only.");
    ({ csrf } = await reviewer.page("/account"));
    await reviewer.post("/account/demo", { _csrf: csrf });
    names = (await client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("logbook_create_dive");
  });

  it("made no network connection at all", () => {
    expect(trapHits).toBe(0);
    expect(foreignFetches()).toEqual([]);
  });
});

describe("other accounts", () => {
  const normal = new Browser();
  let normalId = "";

  it("a normal user keeps the PADI form and reaches the operator's servers (control)", async () => {
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "open" });
    expect((await normal.signup("user@example.com", PASSWORD)).status).toBe(303);
    normalId = web.ctx.store.getUserByEmail("user@example.com")!.id;
    const page = await normal.page("/account");
    expect(page.html).toContain('name="password"');
    expect(page.html).not.toContain("This is a demo account.");
    // Save and test goes to the operator's PADI servers (the trap, which drops the connection).
    const res = await normal.post("/account/padi", { _csrf: page.csrf, email: "bob.diver@example.com", password: "invented-password" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Could not sign in to PADI");
    expect(web.ctx.store.getUser(normalId)!.hasPadi).toBe(false);
    // The guards notice real connection attempts.
    expect(trapHits).toBeGreaterThan(0);
    expect(foreignFetches().length).toBeGreaterThan(0);
  });

  it("an administrator turns a user into a demo account and back", async () => {
    web.ctx.store.savePadiSettings(normalId, {
      email: "bob.diver@example.com",
      refreshToken: "rt-invented-bob",
      loginMethod: "cognito",
      clientId: "test-client",
      affiliateId: "10000007",
      units: "auto",
      readOnly: false,
      connectedAt: Date.now(),
    });
    let { csrf } = await admin.page("/admin");
    expect((await admin.page("/admin")).html).toMatch(/user@example\.com[\s\S]*?<span class="badge ok">connected<\/span>/);
    await admin.post("/admin/users/action", { _csrf: csrf, id: normalId, action: "demo-on" });
    let user = web.ctx.store.getUser(normalId)!;
    expect(user).toMatchObject({ demo: true, hasPadi: false });
    expect(web.ctx.store.getPadiSettings(normalId)).toBeUndefined();
    expect((await normal.page("/account")).html).toContain("This is a demo account.");
    const entry = web.ctx.pool.get(user)!;
    expect(entry.services.backend?.kind).toBe("demo");
    expect(entry.config.padi.email).toBe(DEMO_ADDRESS);

    // A demo account never becomes an administrator.
    ({ csrf } = await admin.page("/admin"));
    await admin.post("/admin/users/action", { _csrf: csrf, id: normalId, action: "promote" });
    expect(web.ctx.store.getUser(normalId)!.isAdmin).toBe(false);

    await admin.post("/admin/users/action", { _csrf: csrf, id: normalId, action: "demo-off" });
    user = web.ctx.store.getUser(normalId)!;
    expect(user.demo).toBe(false);
    expect(web.ctx.demo.peek(normalId)).toBeUndefined();
    expect(web.ctx.pool.get(user)).toBeUndefined();
    expect((await normal.page("/account")).html).toContain('name="password"');
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
      account.logbook.units = "Imperial";

      // After midnight but before 04:00: nothing changes.
      now = new Date("2026-11-08T23:30:00Z");
      expect(registry.account("u1").generation).toBe(1);
      now = new Date("2026-11-09T02:59:00Z");
      expect(registry.account("u1").generation).toBe(1);
      expect(account.logbook.units).toBe("Imperial");

      // From 04:00 the first use resets the store.
      now = new Date("2026-11-09T03:01:00Z");
      expect(registry.account("u1").generation).toBe(2);
      expect(account.logbook.units).toBe("Metric");
      expect(registry.account("u1").resetAt).toEqual(now);
      expect(account.logbook.resetAt).toEqual(now);
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
      a.logbook.units = "Imperial";
      const timer = (registry as unknown as { timer: NodeJS.Timeout }).timer;
      expect(vi.getTimerCount()).toBe(1);
      expect(timer.hasRef()).toBe(false);

      vi.advanceTimersByTime(14 * 3600_000 - 1000); // 03:59:59 in Zurich
      expect(a.generation).toBe(1);
      vi.advanceTimersByTime(2000); // 04:00:01
      expect(a.generation).toBe(2);
      expect(b.generation).toBe(2);
      expect(a.logbook.units).toBe("Metric");
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
