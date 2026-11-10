/**
 * Web mode end to end: a user signs up, connects their PADI account with "Save and test" (against
 * the in-process mock PADI API through operator overrides), connects like Claude over OAuth and
 * uses the logbook tools with their own account. A second user gets their own logbook. Nothing is
 * ever sent to PADI.
 *
 *   PADI_MCP_IT=1 npm run test:integration
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayInZone } from "../../src/util/dates.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { MOCK_ACCOUNT, startMockPadi, type MockPadi } from "../helpers/mock-padi.js";
import { Browser, connectMcp, setBase, TestOAuthClient } from "../helpers/web-client.js";

const enabled = process.env.PADI_MCP_IT === "1";

/** A second diver of the mock (invented). */
const SECOND = { email: "lee.sample@example.com", password: "invented-password-3", affiliateId: "20000003", givenName: "Lee", familyName: "Sample" };

let server: Server;
let web: WebApp;
let mock: MockPadi;
/** Every line the web service logged. */
const logs: string[] = [];

async function call<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  if (res.isError) throw new Error(`${name}: ${text}`);
  return JSON.parse(text) as T;
}

/** Sign up, connect PADI with "Save and test", connect like Claude. */
async function diver(email: string, padi: { email: string; password: string }): Promise<{ browser: Browser; client: Client }> {
  const browser = new Browser();
  expect((await browser.signup(email, "correct horse battery")).status).toBe(303);
  const { csrf } = await browser.page("/account");
  const saved = await browser.post("/account/padi", { _csrf: csrf, email: padi.email, password: padi.password, units: "metric" });
  expect(saved.headers.get("location")).toBe("/account?m=connected");
  const page = await browser.page("/account?m=connected");
  expect(page.html).toContain("Connected to PADI.");
  expect(page.html).not.toContain(padi.password);
  return { browser, client: await connectMcp(new TestOAuthClient(browser)) };
}

describe.skipIf(!enabled)("web mode against a mock PADI API", () => {
  beforeAll(async () => {
    mock = await startMockPadi({ accounts: [MOCK_ACCOUNT, SECOND] });
    server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    setBase(base);
    web = await createWebApp({ publicUrl: new URL(base), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: mock.env(), log: (m) => void logs.push(m) });
    server.on("request", web.app);
    // The first account is the administrator; the others sign up freely.
    expect((await new Browser().signup("admin@example.com", "correct horse battery")).status).toBe(303);
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "open" });
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await web.close();
    await mock.close();
  });

  it("lets a signed-up user manage their own PADI logbook through Claude", async () => {
    const { client } = await diver("river@example.com", MOCK_ACCOUNT);
    const info = await call(client, "padi_account_info", { check: true });
    expect(info).toMatchObject({ affiliate_id: MOCK_ACCOUNT.affiliateId, read_only: false });

    const before = await call<{ total: number }>(client, "logbook_list_dives", { limit: 5 });
    expect(before.total).toBe(mock.account.store.sorted().length);
    const date = addDays(todayInZone("Europe/Zurich"), -1);
    const created = await call<{ id: number; title: string }>(client, "logbook_create_dive", {
      title: "Web reef",
      date,
      location: "House reef",
      dive_type: "shore",
      max_depth: 18,
      bottom_time_min: 45,
    });
    expect(created.title).toBe("Web reef");
    expect((await call<{ total: number }>(client, "logbook_list_dives", { limit: 5 })).total).toBe(before.total + 1);
    const updated = await call<Record<string, unknown>>(client, "logbook_update_dive", { dive_id: created.id, max_depth: 20, notes: "Changed through the web service" });
    expect(updated).toMatchObject({ max_depth: 20 });
    await call(client, "logbook_delete_dive", { dive_id: created.id, confirm_title: "Web reef" });
    expect((await call<{ total: number }>(client, "logbook_list_dives", { limit: 5 })).total).toBe(before.total);

    // Every query was scoped to this diver.
    expect(mock.violations).toEqual([]);
    const id = web.ctx.store.getUserByEmail("river@example.com")!.id;
    expect(web.ctx.store.recentActivity(id).map((a) => a.tool)).toEqual(expect.arrayContaining(["logbook_create_dive", "logbook_delete_dive"]));
    await client.close();
  });

  it("keeps each user's logbook apart", async () => {
    const first = await diver("lee@example.com", SECOND);
    const dives = await call<{ total: number }>(first.client, "logbook_list_dives", { limit: 5 });
    expect(dives.total).toBe(mock.accounts[1]!.store.sorted().length);
    const info = await call(first.client, "padi_account_info");
    expect(info.affiliate_id).toBe(SECOND.affiliateId);
    expect(mock.violations).toEqual([]);
    await first.client.close();
  });

  it("asks the user to sign in again once PADI ends the sign-in", async () => {
    const { browser, client } = await diver("again@example.com", MOCK_ACCOUNT);
    mock.revokeRefreshTokens();
    mock.expireIdTokens();
    // The call that finds the dead sign-in, and the calls after it, say where to sign in again.
    const expired = /Your PADI sign-in expired\. Sign in again at http:\/\/127\.0\.0\.1:\d+\/account/;
    await expect(call(client, "logbook_list_dives")).rejects.toThrow(expired);
    await expect(call(client, "logbook_list_dives")).rejects.toThrow(expired);
    const id = web.ctx.store.getUserByEmail("again@example.com")!.id;
    expect(web.ctx.store.getUser(id)!.padiNeedsReconnect).toBe(true);
    // The administrator sees it too.
    const { csrf, html } = await browser.page("/account");
    expect(html).toContain("Your PADI sign-in expired or was ended");
    const again = await browser.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email, password: MOCK_ACCOUNT.password, keep: "settings" });
    expect(again.headers.get("location")).toBe("/account?m=connected");
    expect((await call<{ total: number }>(client, "logbook_list_dives", { limit: 1 })).total).toBeGreaterThan(0);
    await client.close();
  });

  it("never writes PADI passwords, tokens or e-mail addresses to the log", async () => {
    // A wrong password on the account page, and a tool call that fails.
    const browser = new Browser();
    expect((await browser.signup("wrong@example.com", "correct horse battery")).status).toBe(303);
    const { csrf } = await browser.page("/account");
    const wrong = await browser.post("/account/padi", { _csrf: csrf, email: SECOND.email, password: "wrong-password-value" });
    expect(wrong.status).toBe(400);
    const { client } = await diver("tool@example.com", SECOND);
    await expect(call(client, "logbook_get_dive", { dive_id: 999_999_999 })).rejects.toThrow(/not found/);
    await client.close();

    const all = logs.join("\n");
    // The flows above did log (else this test would check nothing).
    expect(all).toContain("PADI sign-in on the account page failed");
    expect(all).toContain("PADI connection saved for a user");
    expect(all).toMatch(/Tool logbook_list_dives failed/);
    expect(all).toMatch(/Tool logbook_get_dive failed/);
    const users = ["river@example.com", "lee@example.com", "again@example.com", "wrong@example.com", "tool@example.com"];
    const refreshTokens = users.map((u) => web.ctx.store.getPadiSettings(web.ctx.store.getUserByEmail(u)!.id)?.refreshToken).filter((t): t is string => !!t);
    expect(refreshTokens.length).toBeGreaterThan(0);
    for (const secret of [MOCK_ACCOUNT.password, SECOND.password, "wrong-password-value", MOCK_ACCOUNT.email, SECOND.email, "admin@example.com", ...users, ...refreshTokens]) {
      expect(all.includes(secret), `the log holds ${secret.slice(0, 6)}...`).toBe(false);
    }
    // ID tokens, and refresh tokens shaped like a JWT.
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});
