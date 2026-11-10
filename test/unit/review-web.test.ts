/**
 * Review tests for rules of the web service that no other test guarded:
 * - the operator log never holds PADI passwords, tokens or e-mail addresses (DESIGN section 9),
 *   through "Save and test", tool calls that fail, a rotated refresh token, a refresh token that
 *   stops working, and the token sink when the store fails;
 * - the administrator's forced read-only hides the write tools of every account (also demo
 *   accounts), where it is enforced: the MCP tool list;
 * - a refused PADI sign-in is explained with a catalog text, not with the PADI client's English
 *   text (a text put into a {placeholder} is invisible to i18n-coverage.test.ts).
 *
 * PADI is the in-process mock: nothing is ever sent to PADI. Invented data only.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { signIn } from "../../src/padi/auth.js";
import { endpointsFromEnv } from "../../src/padi/endpoints.js";
import { escapeHtml } from "../../src/web/html.js";
import { en } from "../../src/web/i18n/en/index.js";
import { CATALOGS, type MessageKey } from "../../src/web/i18n/index.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { MOCK_ACCOUNT, startMockPadi, type MockPadi } from "../helpers/mock-padi.js";
import { Browser, connectMcp, setBase, TestOAuthClient } from "../helpers/web-client.js";

const PASSWORD = "correct horse battery";
/** A second diver of the mock PADI (invented). */
const OTHER_DIVER = { email: "kai.review@example.com", password: "invented-password-4", affiliateId: "20000004", givenName: "Kai", familyName: "Review" };
const WRONG_PASSWORD = "wrong-password-value";

let web: WebApp;
let server: Server;
let mock: MockPadi;
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

  mock = await startMockPadi({ accounts: [MOCK_ACCOUNT, OTHER_DIVER] });
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({ publicUrl: new URL(base), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: mock.env(), log: (m) => void logs.push(m) });
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

/** "Save and test" on the account page; returns the answer. */
async function saveAndTest(browser: Browser, email: string, password: string): Promise<Response> {
  const { csrf } = await browser.page("/account");
  return browser.post("/account/padi", { _csrf: csrf, email, password, keep: "settings" });
}

/** A new web user, connected to PADI with "Save and test" and to MCP like Claude. */
async function connectedUser(email: string, padi: { email: string; password: string }): Promise<{ browser: Browser; client: Client; id: string }> {
  const browser = new Browser();
  expect((await browser.signup(email, PASSWORD)).status).toBe(303);
  expect((await saveAndTest(browser, padi.email, padi.password)).headers.get("location")).toBe("/account?m=connected");
  const client = await connectMcp(new TestOAuthClient(browser));
  return { browser, client, id: web.ctx.store.getUserByEmail(email)!.id };
}

describe("the forced read-only of the administrator", () => {
  it("hides the write tools of every account, demo accounts too, and shows read_only", async () => {
    const user = await connectedUser("reader@example.com", OTHER_DIVER);
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
    expect(writeTools).toEqual(expect.arrayContaining(["logbook_create_dive", "logbook_update_dive", "logbook_delete_dive", "logbook_set_units", "logbook_submit_for_verification"]));
    for (const [who, client] of clients) expect((await client.listTools()).tools.map((t) => t.name), who).toEqual(expect.arrayContaining(writeTools));

    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), forceReadOnly: true });
    try {
      for (const [who, client] of clients) {
        const tools = (await client.listTools()).tools;
        const names = tools.map((t) => t.name);
        expect(names, who).toContain("logbook_list_dives");
        for (const w of writeTools) expect(names, `${who}: ${w}`).not.toContain(w);
        expect(tools.every((t) => t.annotations?.readOnlyHint === true), who).toBe(true);
        const info = await callTool(client, "padi_account_info");
        expect(info.isError, who).toBeFalsy();
        expect(JSON.parse(info.content[0]!.text!).read_only, who).toBe(true);
        // A write tool cannot be called either (an AI app may have cached the tool list).
        const write = await callTool(client, "logbook_delete_dive", { dive_id: 1, confirm_title: "x" });
        expect(write.isError, who).toBe(true);
      }
    } finally {
      web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), forceReadOnly: false });
    }
    for (const [who, client] of clients) expect((await client.listTools()).tools.map((t) => t.name), who).toEqual(expect.arrayContaining(writeTools));
    await user.client.close();
    await demo.close();
  });
});

describe("the operator log", () => {
  it("never holds PADI passwords, tokens or e-mail addresses", async () => {
    const before = logs.length;
    const browser = new Browser();
    expect((await browser.signup("diver@example.com", PASSWORD)).status).toBe(303);
    const id = web.ctx.store.getUserByEmail("diver@example.com")!.id;
    const client = await connectMcp(new TestOAuthClient(browser));
    // Not connected yet: the setup answer names the user's address.
    expect((await callTool(client, "padi_account_info")).isError).toBe(true);

    // "Save and test": wrong password, a sign-in challenge, PADI unreachable, then right.
    expect((await saveAndTest(browser, MOCK_ACCOUNT.email, WRONG_PASSWORD)).status).toBe(400);
    mock.challenge = "SOFTWARE_TOKEN_MFA";
    try {
      expect((await saveAndTest(browser, MOCK_ACCOUNT.email, MOCK_ACCOUNT.password)).status).toBe(400);
    } finally {
      mock.challenge = undefined;
    }
    mock.failNext("cognito", 500);
    mock.failNext("auth", 500);
    expect((await saveAndTest(browser, MOCK_ACCOUNT.email, MOCK_ACCOUNT.password)).status).toBe(400);
    expect((await saveAndTest(browser, MOCK_ACCOUNT.email, MOCK_ACCOUNT.password)).headers.get("location")).toBe("/account?m=connected");
    const secrets = new Set<string>([web.ctx.store.getPadiSettings(id)!.refreshToken]);

    // Tool calls that fail.
    expect((await callTool(client, "logbook_get_dive", { dive_id: 999_999_999 })).isError).toBe(true);
    expect((await callTool(client, "logbook_lookup_instructor", { member_number: "not a number" })).isError).toBe(true);

    // A sign-in through the PADI auth API, whose refresh hands out a new refresh token, saved by
    // the token sink; then the same with a store that cannot save.
    const signed = await signIn(MOCK_ACCOUNT.email, MOCK_ACCOUNT.password, { method: "padi", endpoints: endpointsFromEnv(mock.env()), backoffMs: 0 });
    secrets.add(signed.tokens.refreshToken);
    web.ctx.store.savePadiSettings(id, { ...web.ctx.store.getPadiSettings(id)!, refreshToken: signed.tokens.refreshToken, loginMethod: "padi", clientId: signed.tokens.clientId });
    mock.rotateRefreshTokens = true;
    try {
      expect((await callTool(client, "padi_account_info")).isError).toBeFalsy();
      const rotated = web.ctx.store.getPadiSettings(id)!.refreshToken;
      expect(rotated).not.toBe(signed.tokens.refreshToken);
      secrets.add(rotated);
      mock.expireIdTokens();
      const failing = vi.spyOn(web.ctx.store, "savePadiTokens").mockImplementation(() => {
        throw new Error("database is locked");
      });
      try {
        expect((await callTool(client, "padi_account_info")).isError).toBeFalsy();
        expect(failing).toHaveBeenCalled();
      } finally {
        failing.mockRestore();
      }
    } finally {
      mock.rotateRefreshTokens = false;
    }
    expect(logs.join("\n")).toContain("Could not save refreshed PADI tokens");

    // PADI ends the sign-in: the call that finds it, and a call after it.
    expect((await saveAndTest(browser, MOCK_ACCOUNT.email, MOCK_ACCOUNT.password)).headers.get("location")).toBe("/account?m=connected");
    secrets.add(web.ctx.store.getPadiSettings(id)!.refreshToken);
    expect((await callTool(client, "logbook_list_dives")).isError).toBeFalsy();
    mock.revokeRefreshTokens();
    mock.expireIdTokens();
    expect((await callTool(client, "logbook_list_dives")).isError).toBe(true);
    expect(web.ctx.store.getUser(id)!.padiNeedsReconnect).toBe(true);
    expect((await callTool(client, "logbook_list_dives")).isError).toBe(true);

    // The same, with a store that cannot mark the connection.
    expect((await saveAndTest(browser, MOCK_ACCOUNT.email, MOCK_ACCOUNT.password)).headers.get("location")).toBe("/account?m=connected");
    secrets.add(web.ctx.store.getPadiSettings(id)!.refreshToken);
    expect((await callTool(client, "logbook_list_dives")).isError).toBeFalsy();
    mock.revokeRefreshTokens();
    mock.expireIdTokens();
    const unmarkable = vi.spyOn(web.ctx.store, "setPadiNeedsReconnect").mockImplementation(() => {
      throw new Error("database is locked");
    });
    try {
      expect((await callTool(client, "logbook_list_dives")).isError).toBe(true);
      expect(unmarkable).toHaveBeenCalled();
    } finally {
      unmarkable.mockRestore();
    }
    expect(logs.join("\n")).toContain("Could not mark a PADI connection for reconnect");
    await client.close();

    const all = logs.slice(before).join("\n");
    // The flows above did log (else this test would check nothing).
    expect(all).toContain("PADI sign-in on the account page failed");
    expect(all).toContain("PADI connection saved for a user");
    expect(all).toMatch(/Tool padi_account_info failed/);
    expect(all).toMatch(/Tool logbook_get_dive failed/);
    expect(all).toMatch(/Tool logbook_list_dives failed/);
    for (const secret of [MOCK_ACCOUNT.password, OTHER_DIVER.password, WRONG_PASSWORD, MOCK_ACCOUNT.email, OTHER_DIVER.email, "diver@example.com", "admin@example.com", ...secrets]) {
      expect(all.includes(secret), `the log holds ${secret.slice(0, 6)}...`).toBe(false);
    }
    // ID tokens, and refresh tokens shaped like a JWT.
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    // The whole log, also of the tests above.
    expect(logs.join("\n")).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(logs.join("\n")).not.toContain(OTHER_DIVER.email);
  });
});

describe("a refused PADI sign-in on a translated page", () => {
  /** The error box of a page, with every marked (translated) text removed. */
  function untranslated(html: string): string {
    const box = html.match(/<div class="flash error" role="status">([\s\S]*?)<\/div>/);
    expect(box, "the page shows an error").not.toBeNull();
    let text = box![1]!;
    for (let previous = ""; previous !== text; ) {
      previous = text;
      text = text.replace(/⟦[^⟦⟧]*⟧/g, " ");
    }
    return text.replace(/&[a-z#0-9]+;/gi, " ").replace(/[\s.,:;!?()]+/g, " ").trim();
  }

  /** The account.error.padi.* catalog texts the page shows (marked, so translated). */
  function reasons(html: string): string[] {
    return Object.keys(en).filter((key) => key.startsWith("account.error.padi.") && html.includes(`⟦${escapeHtml(en[key as MessageKey])}⟧`));
  }

  it("is explained with catalog texts, never with the PADI client's English text", async () => {
    const italian = new Browser();
    italian.jar.set("pdm_lang", "it");
    expect((await italian.signup("italiano@example.com", PASSWORD)).status).toBe(303);

    const wrong = await saveAndTest(italian, MOCK_ACCOUNT.email, WRONG_PASSWORD);
    expect(wrong.status).toBe(400);
    const html = await wrong.text();
    expect(html).toContain('<html lang="it">');
    expect(untranslated(html)).toBe("");
    expect(reasons(html)).toEqual(["account.error.padi.badCredentials"]);
    // The PADI client's own text and code never reach the page.
    expect(html).not.toContain("Check them and try again (use");
    expect(html).not.toContain("[bad_credentials]");

    // A sign-in challenge, and PADI out of reach.
    mock.challenge = "SOFTWARE_TOKEN_MFA";
    let challenge: Response;
    try {
      challenge = await saveAndTest(italian, MOCK_ACCOUNT.email, MOCK_ACCOUNT.password);
    } finally {
      mock.challenge = undefined;
    }
    expect(challenge.status).toBe(400);
    const challengeHtml = await challenge.text();
    expect(untranslated(challengeHtml)).toBe("");
    expect(reasons(challengeHtml)).toHaveLength(1);
    mock.failNext("cognito", 500);
    mock.failNext("auth", 500);
    const down = await saveAndTest(italian, MOCK_ACCOUNT.email, MOCK_ACCOUNT.password);
    expect(down.status).toBe(400);
    const downHtml = await down.text();
    expect(untranslated(downHtml)).toBe("");
    expect(reasons(downHtml)).toEqual(["account.error.padi.network"]);
  });
});
