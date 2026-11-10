/**
 * Review tests for rules of the web service that no other test guarded:
 * - the operator log never holds tokens, codes, states, the app keys or e-mail addresses (DESIGN
 *   section 9), through "Connect Suunto" (refused, failed, done), tool calls that fail, a rotated
 *   refresh token, a refresh token that stops working, and the token sink when the store fails;
 * - the administrator's forced read-only hides the write tools of every account (also demo
 *   accounts), where it is enforced: the MCP tool list;
 * - the outcome of "Connect Suunto" is explained with catalog texts, never with Suunto's own text
 *   (a text put into a {placeholder} is invisible to i18n-coverage.test.ts), and nothing Suunto
 *   sends ends up in a URL.
 *
 * Suunto is the in-process mock: nothing is ever sent to Suunto. Invented data only.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { en } from "../../src/web/i18n/en/index.js";
import { CATALOGS, type MessageKey } from "../../src/web/i18n/index.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY, startMockSuunto, type MockSuunto } from "../helpers/mock-suunto.js";
import { Browser, connectMcp, connectSuunto, setBase, TestOAuthClient } from "../helpers/web-client.js";

const PASSWORD = "correct horse battery";
/** These tests make many Suunto calls in a minute: no call limits. */
const NO_LIMITS = { perMinute: 0, perUserPerDay: 0 };

let web: WebApp;
let server: Server;
let mock: MockSuunto;
let base = "";
const logs: string[] = [];
const admin = new Browser();
const savedItalian = CATALOGS.it;

beforeAll(async () => {
  // Italian is a marked copy of English, with every {placeholder} outside the marks: a value
  // put into a message must then be marked itself (a catalog text) to count as translated.
  const marked: Partial<Record<MessageKey, string>> = {};
  for (const [key, text] of Object.entries(en)) {
    marked[key as MessageKey] = text.includes("<") ? `⟦${text}⟧` : text.split(/(\{\w+\})/).map((part) => (!part || /^\{\w+\}$/.test(part) ? part : `⟦${part}⟧`)).join("");
  }
  CATALOGS.it = marked;

  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  mock = await startMockSuunto({ redirectUris: [`${base}/suunto/callback`] });
  web = await createWebApp({ publicUrl: new URL(base), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: mock.env(), callLimits: NO_LIMITS, log: (m) => void logs.push(m) });
  server.on("request", web.app);
  expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
  web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "open" });
});

afterAll(async () => {
  CATALOGS.it = savedItalian;
  vi.restoreAllMocks();
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
  await mock.close();
});

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }> };

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as ToolResult;
}

/** A new web user, connected to Suunto and to MCP like Claude. */
async function connectedUser(email: string): Promise<{ browser: Browser; client: Client; id: string }> {
  const browser = new Browser();
  expect((await browser.signup(email, PASSWORD)).status).toBe(303);
  expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
  const client = await connectMcp(new TestOAuthClient(browser));
  return { browser, client, id: web.ctx.store.getUserByEmail(email)!.id };
}

/**
 * A workout list query no earlier call used: one day further back each time. The services read
 * pages of 100 workouts and cache them for 2 minutes, so only another time window needs Suunto.
 */
let daysBack = 0;
const freshList = () => {
  const day = new Date(Date.now() - ++daysBack * 86_400_000).toISOString().slice(0, 10);
  return { from: day, to: day, limit: 1 };
};

describe("the forced read-only of the administrator", () => {
  it("hides the write tools of every account, demo accounts too, and shows read_only", async () => {
    const user = await connectedUser("reader@example.com");
    // A demo account.
    const { csrf } = await admin.page("/admin");
    const created = await admin.post("/admin/demo", { _csrf: csrf, email: "reviewer@example.com" });
    const demoPassword = (await created.text()).match(/<code id="secret">([^<]+)<\/code>/)![1]!;
    const reviewer = new Browser();
    expect((await reviewer.login("reviewer@example.com", demoPassword)).status).toBe(303);
    const demo = await connectMcp(new TestOAuthClient(reviewer));

    const clients: Array<[string, Client]> = [
      ["user", user.client],
      ["demo", demo],
    ];
    // The write tools, from the annotations of a writable account.
    const writeTools = (await user.client.listTools()).tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name);
    expect(writeTools.sort()).toEqual(["suunto_create_poi", "suunto_import_route"]);
    for (const [who, client] of clients) expect((await client.listTools()).tools.map((t) => t.name), who).toEqual(expect.arrayContaining(writeTools));

    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), forceReadOnly: true });
    try {
      for (const [who, client] of clients) {
        const tools = (await client.listTools()).tools;
        const names = tools.map((t) => t.name);
        expect(names, who).toContain("suunto_list_workouts");
        for (const w of writeTools) expect(names, `${who}: ${w}`).not.toContain(w);
        expect(tools.every((t) => t.annotations?.readOnlyHint === true), who).toBe(true);
        const info = await callTool(client, "suunto_account_info");
        expect(info.isError, who).toBeFalsy();
        expect(JSON.parse(info.content[0]!.text!).read_only, who).toBe(true);
        // A write tool cannot be called either (an AI app may have cached the tool list).
        const write = await callTool(client, "suunto_create_poi", { name: "Hut", latitude: 46.5, longitude: 8.1 });
        expect(write.isError, who).toBe(true);
      }
      // Nothing was added at Suunto.
      expect(mock.state.pois.some((p) => p.point.name === "Hut")).toBe(false);
    } finally {
      web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), forceReadOnly: false });
    }
    for (const [who, client] of clients) expect((await client.listTools()).tools.map((t) => t.name), who).toEqual(expect.arrayContaining(writeTools));
    await user.client.close();
    await demo.close();
  });
});

describe("the operator log", () => {
  it("never holds tokens, codes, states, app keys or e-mail addresses", async () => {
    const before = logs.length;
    const browser = new Browser();
    expect((await browser.signup("athlete@example.com", PASSWORD)).status).toBe(303);
    const id = web.ctx.store.getUserByEmail("athlete@example.com")!.id;
    const client = await connectMcp(new TestOAuthClient(browser));
    // Not connected yet: the setup answer names the user's address.
    expect((await callTool(client, "suunto_account_info")).isError).toBe(true);
    const secrets = new Set<string>([MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY]);
    const remember = (run: Awaited<ReturnType<typeof connectSuunto>>) => {
      for (const key of ["code", "state"]) {
        const value = run.callback.searchParams.get(key);
        if (value) secrets.add(value);
      }
    };
    const rememberTokens = () => {
      const s = web.ctx.store.getSuuntoSettings(id)!;
      secrets.add(s.refreshToken);
      if (s.accessToken) secrets.add(s.accessToken);
    };

    // "Connect Suunto": refused at Suunto, a code exchange that fails, a bad code, then right.
    mock.deny = true;
    try {
      remember(await connectSuunto(browser));
    } finally {
      mock.deny = false;
    }
    mock.failNext("/oauth/token", 500);
    remember(await connectSuunto(browser));
    const badState = web.ctx.store.createOAuthState(id);
    secrets.add(badState);
    expect((await browser.fetch(`/suunto/callback?${new URLSearchParams({ code: "invented-bad-code", state: badState })}`)).headers.get("location")).toBe("/account?m=connectfailed");
    secrets.add("invented-bad-code");
    const done = await connectSuunto(browser);
    remember(done);
    expect(done.res.headers.get("location")).toBe("/account?m=connected");
    rememberTokens();

    // Tool calls that fail.
    expect((await callTool(client, "suunto_get_workout", { workout_key: "0123456789abcdef01234567" })).isError).toBe(true);
    expect((await callTool(client, "suunto_import_route", { gpx: "<gpx><!DOCTYPE x></gpx>" })).isError).toBe(true);

    // A refresh that rotates the refresh token, saved by the token sink; then the same with a
    // store that cannot save.
    mock.expireAccessTokens();
    expect((await callTool(client, "suunto_list_workouts", freshList())).isError).toBeFalsy();
    rememberTokens();
    mock.expireAccessTokens();
    const failing = vi.spyOn(web.ctx.store, "saveSuuntoTokens").mockImplementation(() => {
      throw new Error("database is locked");
    });
    try {
      expect((await callTool(client, "suunto_list_workouts", freshList())).isError).toBeFalsy();
      expect(failing).toHaveBeenCalled();
    } finally {
      failing.mockRestore();
    }
    expect(logs.join("\n")).toContain("Could not save refreshed Suunto tokens");

    // Suunto ends the connection: the call that finds it, and a call after it.
    expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
    rememberTokens();
    mock.revokeAll();
    expect((await callTool(client, "suunto_list_workouts", freshList())).isError).toBe(true);
    expect(web.ctx.store.getUser(id)!.suuntoNeedsReconnect).toBe(true);
    expect((await callTool(client, "suunto_list_workouts", freshList())).isError).toBe(true);

    // The same, with a store that cannot mark the connection.
    expect((await connectSuunto(browser)).res.headers.get("location")).toBe("/account?m=connected");
    rememberTokens();
    mock.revokeAll();
    const unmarkable = vi.spyOn(web.ctx.store, "setSuuntoNeedsReconnect").mockImplementation(() => {
      throw new Error("database is locked");
    });
    try {
      expect((await callTool(client, "suunto_list_workouts", freshList())).isError).toBe(true);
      expect(unmarkable).toHaveBeenCalled();
    } finally {
      unmarkable.mockRestore();
    }
    expect(logs.join("\n")).toContain("Could not mark a Suunto connection for reconnect");

    // Remove (tells Suunto with the stored tokens).
    const { csrf } = await browser.page("/account");
    expect((await browser.post("/account/suunto/remove", { _csrf: csrf })).headers.get("location")).toBe("/account?m=removed");
    await client.close();

    const all = logs.slice(before).join("\n");
    // The flows above did log (else this test would check nothing).
    expect(all).toContain("Suunto sign-in ended without a code (denied)");
    expect(all).toContain("Suunto code exchange failed");
    expect(all).toContain("Suunto connection saved for a user");
    expect(all).toContain("A user removed their Suunto connection");
    expect(all).toMatch(/Tool suunto_account_info failed/);
    expect(all).toMatch(/Tool suunto_get_workout failed/);
    expect(all).toMatch(/Tool suunto_list_workouts failed/);
    for (const secret of [...secrets, MOCK_CLIENT_ID, "athlete@example.com", "admin@example.com"]) {
      expect(all.includes(secret), `the log holds ${secret.slice(0, 6)}...`).toBe(false);
    }
    // Access and refresh tokens are JWT-shaped.
    expect(logs.join("\n")).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});

describe("the outcome of Connect Suunto on a translated page", () => {
  /** The flash box of a page, with every marked (translated) text removed. */
  function untranslated(html: string): string {
    const box = html.match(/<div class="flash (?:ok|error|info)" role="status">([\s\S]*?)<\/div>/);
    expect(box, "the page shows a message").not.toBeNull();
    let text = box![1]!;
    for (let previous = ""; previous !== text; ) {
      previous = text;
      text = text.replace(/⟦[^⟦⟧]*⟧/g, " ");
    }
    return text.replace(/&[a-z#0-9]+;/gi, " ").replace(/[\s.,:;!?()]+/g, " ").trim();
  }

  it("is explained with catalog texts, and nothing Suunto sends is put in a URL", async () => {
    const italian = new Browser();
    italian.jar.set("sum_lang", "it");
    expect((await italian.signup("italiano@example.com", PASSWORD)).status).toBe(303);
    const outcomes: string[] = [];
    const check = async (location: string | null, key: MessageKey) => {
      // Only a short code: no Suunto text, no error description, no code or state.
      expect(location).toMatch(/^\/account\?m=[a-z]+$/);
      outcomes.push(location!);
      const html = (await italian.page(location!)).html;
      expect(html).toContain('<html lang="it">');
      expect(untranslated(html), key).toBe("");
      expect(html).toContain(`⟦${en[key]}⟧`);
    };

    mock.deny = true;
    try {
      await check((await connectSuunto(italian)).res.headers.get("location"), "account.flash.denied");
    } finally {
      mock.deny = false;
    }
    mock.failNext("/oauth/token", 400, { error: "invalid_grant", error_description: "Invalid authorization code: echoed-code" });
    await check((await connectSuunto(italian)).res.headers.get("location"), "account.flash.connectFailed");
    await check((await italian.fetch("/suunto/callback?code=x&state=unknown")).headers.get("location"), "account.flash.stateExpired");
    mock.failNext("/v3/workouts", 403, { statusCode: 403, message: "Out of call volume quota. Quota will be replenished in 2.00:00:00." });
    await check((await connectSuunto(italian)).res.headers.get("location"), "account.flash.checkFailed");
    await check((await connectSuunto(italian)).res.headers.get("location"), "account.flash.connected");
    expect(outcomes).toEqual(["/account?m=denied", "/account?m=connectfailed", "/account?m=stateexpired", "/account?m=checkfailed", "/account?m=connected"]);
  });
});
