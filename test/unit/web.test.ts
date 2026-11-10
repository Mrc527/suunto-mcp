/**
 * Web mode: accounts, the Suunto connection, admin, OAuth (as used by Claude custom connectors)
 * and the per-user MCP endpoint, exercised over real HTTP with the SDK's OAuth client. Suunto is
 * the in-process mock (test/helpers/mock-suunto.ts): nothing is ever sent to Suunto.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayInZone } from "../../src/util/dates.js";
import { buildUserConfig } from "../../src/web/accounts.js";
import { SecretBox } from "../../src/web/crypto.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { DEFAULT_SETTINGS, type SuuntoAccountSettings } from "../../src/web/store.js";
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY, MOCK_USERNAME, startMockSuunto, type MockSuunto } from "../helpers/mock-suunto.js";
import { Browser, connectMcp, connectSuunto, setBase, TestOAuthClient } from "../helpers/web-client.js";

/** A stored Suunto connection (invented test data; never connected for real). */
const suuntoSettings: SuuntoAccountSettings = {
  username: "invented-runner",
  refreshToken: "rt-invented",
  accessToken: "at-invented",
  accessTokenExpiresAt: 1_700_000_000_000,
  clientId: "test-client",
  units: "metric",
  readOnly: false,
  connectedAt: 1_700_000_000_000,
};

const DAY = 86_400_000;

let web: WebApp;
let server: Server;
let base = "";

let metadataServer: Server;
let metadataUrl = "";
let mock: MockSuunto;
const logs: string[] = [];

beforeAll(async () => {
  // Listen first so the public URL (OAuth issuer) and the redirect URI contain the real port.
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  // The mock accepts only the redirect URI registered for this server, as Suunto does.
  mock = await startMockSuunto({ redirectUris: [`${base}/suunto/callback`] });
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    allowPrivateClientMetadata: true,
    // Never reach real Suunto from tests: the mock (its hosts and app keys).
    operator: mock.env(),
    // Many Suunto calls in a minute: no call limits (web-limits tests check them).
    callLimits: { perMinute: 0, perUserPerDay: 0 },
    log: (m) => void logs.push(m),
  });
  server.on("request", web.app);

  metadataServer = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    const id = `${metadataUrl.replace(/\/oauth\/client\.json$/, "")}${req.url}`;
    const redirect_uris = ["https://claude.ai/api/mcp/auth_callback"];
    // Like ChatGPT's document: prefers private_key_jwt, also supports none.
    if (req.url === "/oauth/jwt-or-none.json") {
      res.end(JSON.stringify({ client_id: id, client_name: "Jwt Or None", redirect_uris, token_endpoint_auth_method: "private_key_jwt", token_endpoint_auth_methods_supported: ["none", "private_key_jwt"] }));
    } else if (req.url === "/oauth/jwt-only.json") {
      res.end(JSON.stringify({ client_id: id, client_name: "Jwt Only", redirect_uris, token_endpoint_auth_method: "private_key_jwt" }));
    } else {
      res.end(JSON.stringify({ client_id: metadataUrl, client_name: "Metadata Client", redirect_uris, token_endpoint_auth_method: "none" }));
    }
  });
  await new Promise<void>((r) => metadataServer.listen(0, "127.0.0.1", r));
  metadataUrl = `http://127.0.0.1:${(metadataServer.address() as AddressInfo).port}/oauth/client.json`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await new Promise<void>((r) => metadataServer.close(() => r()));
  await web.close();
  await mock.close();
});

/** The JSON text of a tool answer. */
const text = (res: unknown) => JSON.stringify((res as { content?: unknown }).content);
const json = (res: unknown) => JSON.parse((res as { content: { text: string }[] }).content[0]!.text) as Record<string, unknown>;

/**
 * Arguments of a workout list for a day no earlier call read: the services cache pages of
 * workouts for 2 minutes, so only another time window needs Suunto.
 */
let daysBack = 60;
const freshWindow = (limit: number) => {
  const day = new Date(Date.now() - ++daysBack * DAY).toISOString().slice(0, 10);
  return { from: day, to: day, limit };
};

/** Workouts of the mock that started in the last 30 days (what the connect check counts). */
const recentWorkouts = () => mock.state.workouts.filter((w) => Number(w.startTime) >= Date.now() - 30 * DAY && Number(w.startTime) < Date.now()).length;

const PASSWORD = "correct horse battery";

describe("discovery", () => {
  it("returns 401 with resource metadata for unauthenticated MCP requests", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
  });

  it("publishes protected resource and authorization server metadata", async () => {
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(prm).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ["suunto"], resource_name: "Suunto workouts and health data" });
    const root = (await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json()) as { resource: string };
    expect(root.resource).toBe(`${base}/mcp`);
    const as = (await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json()) as { token_endpoint_auth_methods_supported: string[] };
    expect(as).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      code_challenge_methods_supported: ["S256"],
      client_id_metadata_document_supported: true,
      scopes_supported: ["suunto"],
    });
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
});

describe("accounts and the Suunto connection", () => {
  const admin = new Browser();
  const adminId = () => web.ctx.store.getUserByEmail("admin@example.com")!.id;

  it("makes the first account the administrator", async () => {
    const res = await admin.signup("Admin@Example.com", PASSWORD);
    expect(res.status).toBe(303);
    // New servers ask for approval; these tests use open sign-up (see web-access-requests.test.ts).
    expect(web.ctx.store.getSettings().registration).toBe("approval");
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "open" });
    expect(res.headers.get("location")).toBe("/account?m=welcome");
    const { html } = await admin.page("/account");
    expect(html).toContain("admin@example.com");
    expect(html).toContain(`${base}/mcp`);
    expect(html).toContain("Connect your Suunto account below to get started.");
    expect(html).toContain('<form method="post" action="/account/suunto/connect" class="actions">');
    // The browser's time zone goes into a hidden field (filled by the page script).
    expect(html).toContain('<input type="hidden" name="timeZone" value="" data-browser-tz>');
    // Suunto's own sign-in page asks for the password: this site never does.
    expect(html).not.toContain('type="password"');
    const adminPage = await admin.page("/admin");
    expect(adminPage.res.status).toBe(200);
    expect(adminPage.html).toContain("Administration");
  });

  it("allows Suunto's sign-in page as a form target on the account page only", async () => {
    const origin = new URL(mock.oauthUrl).origin;
    const account = await admin.fetch("/account");
    expect(account.headers.get("content-security-policy")).toContain(`form-action 'self' ${origin}`);
    // Chrome checks the redirect after the form POST against the page that sent the form.
    const security = await admin.fetch("/account/security");
    expect(security.headers.get("content-security-policy")).toMatch(/form-action 'self'$/);
    expect(security.headers.get("content-security-policy")).not.toContain(origin);
  });

  it("rejects forms without a valid CSRF token", async () => {
    const before = web.ctx.store.db.prepare("SELECT COUNT(*) AS n FROM suunto_oauth_states").get() as { n: number };
    const res = await admin.post("/account/suunto/connect", { _csrf: "wrong" });
    expect(res.status).toBe(400);
    expect(web.ctx.store.db.prepare("SELECT COUNT(*) AS n FROM suunto_oauth_states").get()).toEqual(before);
  });

  it("requires sign-in for account pages and blocks non-admins from /admin", async () => {
    const anon = new Browser();
    const res = await anon.fetch("/account");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?next=%2Faccount");
    // The callback needs the user who started it: without a session, start again after signing in.
    const callback = await anon.fetch("/suunto/callback?code=abc&state=def");
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("/login?next=%2Faccount");
    const user = new Browser();
    expect((await user.signup("user@example.com", PASSWORD)).status).toBe(303);
    expect((await user.fetch("/admin")).status).toBe(403);
  });

  it("rejects wrong passwords and duplicate accounts", async () => {
    const b = new Browser();
    expect((await b.login("user@example.com", "wrong password!!")).status).toBe(401);
    expect((await b.signup("user@example.com", PASSWORD)).status).toBe(400);
    expect((await b.login("user@example.com", PASSWORD)).status).toBe(303);
  });

  it("connects Suunto: state, Suunto's sign-in page, callback, one code exchange, one test call", async () => {
    const tokenCalls = mock.count("/oauth/token");
    const listCalls = mock.count("/v3/workouts");
    const run = await connectSuunto(admin, { timeZone: "Europe/Zurich" });
    // The authorize URL of the operator's app, with this server's redirect URI and a random state.
    expect(run.authorize.origin + run.authorize.pathname).toBe(`${mock.oauthUrl}/oauth/authorize`);
    expect(Object.fromEntries(run.authorize.searchParams)).toMatchObject({ response_type: "code", client_id: MOCK_CLIENT_ID, redirect_uri: `${base}/suunto/callback` });
    const state = run.authorize.searchParams.get("state")!;
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(run.callback.searchParams.get("state")).toBe(state);
    expect(run.callback.searchParams.get("code")).toBeTruthy();
    expect(run.res.status).toBe(303);
    expect(run.res.headers.get("location")).toBe("/account?m=connected");
    expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
    expect(mock.count("/v3/workouts") - listCalls).toBe(1);
    // Saved: the Suunto username, the tokens, the browser's time zone and the test call.
    const settings = web.ctx.store.getSuuntoSettings(adminId())!;
    expect(settings).toMatchObject({ username: MOCK_USERNAME, clientId: MOCK_CLIENT_ID, units: "metric", readOnly: false, timeZone: "Europe/Zurich" });
    expect(settings.refreshToken).toBeTruthy();
    expect(settings.accessToken).toBeTruthy();
    expect(settings.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(settings.lastCheck).toMatchObject({ workouts: recentWorkouts() });
    expect(settings.lastCheck!.error).toBeUndefined();
    // Encrypted at rest; the state is gone (single use).
    const row = web.ctx.store.db.prepare("SELECT service_enc FROM users WHERE id = ?").get(adminId()) as { service_enc: string };
    expect(row.service_enc.startsWith("v1:")).toBe(true);
    expect(row.service_enc).not.toContain(settings.refreshToken);
    expect(web.ctx.store.db.prepare("SELECT COUNT(*) AS n FROM suunto_oauth_states WHERE user_id = ?").get(adminId())).toEqual({ n: 0 });
    // The page shows what was saved, without calling Suunto.
    const before = mock.requests.length;
    const page = await admin.page("/account?m=connected");
    expect(mock.requests.length).toBe(before);
    expect(page.html).toContain("Suunto is connected. Your AI apps can use your Suunto data now.");
    expect(page.html).toContain(`<dt>Suunto username</dt><dd>${MOCK_USERNAME}</dd>`);
    expect(page.html).toMatch(new RegExp(`<dt>Workouts in the last 30 days</dt><dd>${recentWorkouts()} <span class="muted">\\(counted when you connected`));
    expect(page.html).not.toContain(settings.refreshToken);
    expect(page.html).not.toContain(settings.accessToken!);
    expect(page.html).toContain("Reconnect");
    expect(page.html).toContain("Remove Suunto connection");
    // No secret in the operator log.
    for (const secret of [MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY, settings.refreshToken, settings.accessToken!, run.callback.searchParams.get("code")!, state]) {
      expect(logs.join("\n")).not.toContain(secret);
    }
  });

  it("uses a state once", async () => {
    const tokenCalls = mock.count("/oauth/token");
    const saved = web.ctx.store.getSuuntoSettings(adminId());
    const run = await connectSuunto(admin);
    expect(run.res.headers.get("location")).toBe("/account?m=connected");
    const again = await admin.fetch(run.callback.pathname + run.callback.search);
    expect(again.status).toBe(303);
    expect(again.headers.get("location")).toBe("/account?m=stateexpired");
    expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
    expect((await admin.page("/account?m=stateexpired")).html).toContain("This Suunto sign-in expired or was already used.");
    // Reconnecting kept the settings (and the time zone of the first connection).
    expect(web.ctx.store.getSuuntoSettings(adminId())).toMatchObject({ units: saved!.units, readOnly: saved!.readOnly, timeZone: "Europe/Zurich" });
  });

  it("refuses the state of another user, which its owner can still use", async () => {
    const other = new Browser();
    expect((await other.signup("other@example.com", PASSWORD)).status).toBe(303);
    const { csrf } = await other.page("/account");
    const started = await other.post("/account/suunto/connect", { _csrf: csrf, timeZone: "Asia/Tokyo" });
    const signIn = await fetch(started.headers.get("location")!, { redirect: "manual" });
    const callback = new URL(signIn.headers.get("location")!);
    const tokenCalls = mock.count("/oauth/token");
    // Someone else opens the callback (a link sent to them): refused, no code exchange.
    const stolen = await admin.fetch(callback.pathname + callback.search);
    expect(stolen.headers.get("location")).toBe("/account?m=stateexpired");
    expect(mock.count("/oauth/token")).toBe(tokenCalls);
    const otherId = web.ctx.store.getUserByEmail("other@example.com")!.id;
    expect(web.ctx.store.getUser(otherId)!.hasSuunto).toBe(false);
    // The user who started it finishes it.
    const done = await other.fetch(callback.pathname + callback.search);
    expect(done.headers.get("location")).toBe("/account?m=connected");
    expect(web.ctx.store.getSuuntoSettings(otherId)).toMatchObject({ username: MOCK_USERNAME, timeZone: "Asia/Tokyo" });
  });

  it("refuses an expired state, and keeps at most 5 open states per user", async () => {
    const { store } = web.ctx;
    const state = store.createOAuthState(adminId());
    store.db.prepare("UPDATE suunto_oauth_states SET created_at = ? WHERE user_id = ?").run(Date.now() - 11 * 60_000, adminId());
    const tokenCalls = mock.count("/oauth/token");
    const code = mock.issueCode(`${base}/suunto/callback`);
    const res = await admin.fetch(`/suunto/callback?${new URLSearchParams({ code, state })}`);
    expect(res.headers.get("location")).toBe("/account?m=stateexpired");
    expect(mock.count("/oauth/token")).toBe(tokenCalls);
    // Only a hash is stored; the oldest open states are dropped.
    const states = Array.from({ length: 7 }, () => store.createOAuthState(adminId()));
    const rows = store.db.prepare("SELECT state_hash FROM suunto_oauth_states WHERE user_id = ?").all(adminId());
    expect(rows).toHaveLength(5);
    expect(JSON.stringify(rows)).not.toContain(states[6]!);
    expect(store.consumeOAuthState(states[0]!, adminId())).toBeUndefined();
    expect(store.consumeOAuthState(states[6]!, adminId())).toBeDefined();
    store.db.prepare("DELETE FROM suunto_oauth_states").run();
  });

  it("says so when the user does not allow access at Suunto", async () => {
    const saved = web.ctx.store.getSuuntoSettings(adminId());
    mock.deny = true;
    try {
      const run = await connectSuunto(admin);
      expect(run.callback.searchParams.get("error")).toBe("access_denied");
      expect(run.res.headers.get("location")).toBe("/account?m=denied");
    } finally {
      mock.deny = false;
    }
    // Nothing changed, and no Suunto text was put in the URL.
    expect(web.ctx.store.getSuuntoSettings(adminId())).toEqual(saved);
    expect((await admin.page("/account?m=denied")).html).toContain("You did not allow access on the Suunto page, so Suunto is not connected.");
  });

  it("says so when the code exchange fails, without Suunto's text in the URL", async () => {
    const saved = web.ctx.store.getSuuntoSettings(adminId());
    const state = web.ctx.store.createOAuthState(adminId());
    const res = await admin.fetch(`/suunto/callback?${new URLSearchParams({ code: "not-a-real-code", state })}`);
    expect(res.headers.get("location")).toBe("/account?m=connectfailed");
    mock.failNext("/oauth/token", 503, { error: "temporarily_unavailable" });
    const run = await connectSuunto(admin);
    expect(run.res.headers.get("location")).toBe("/account?m=connectfailed");
    expect(web.ctx.store.getSuuntoSettings(adminId())).toEqual(saved);
    expect((await admin.page("/account?m=connectfailed")).html).toContain("Suunto did not finish the connection.");
    // The mock echoes the code in its error text: it must never reach the log.
    expect(logs.join("\n")).not.toContain("not-a-real-code");
  });

  it("saves the connection when Suunto refuses the test request, and says why", async () => {
    mock.failNext("/v3/workouts", 403, { statusCode: 403, message: "Access denied" });
    const run = await connectSuunto(admin);
    expect(run.res.headers.get("location")).toBe("/account?m=checkfailed");
    const settings = web.ctx.store.getSuuntoSettings(adminId())!;
    expect(settings.lastCheck?.error).toBeTruthy();
    expect(settings.lastCheck?.workouts).toBeUndefined();
    const { html } = await admin.page("/account?m=checkfailed");
    expect(html).toContain("Suunto is connected and saved, but the test request failed.");
    expect(html).toContain("The test request when you connected failed:");
    // Connect again: the check works this time.
    expect((await connectSuunto(admin)).res.headers.get("location")).toBe("/account?m=connected");
  });

  it("saves units, read-only and time zone without calling Suunto", async () => {
    const { store } = web.ctx;
    const before = store.getSuuntoSettings(adminId())!;
    const requests = mock.requests.length;
    const { csrf, html } = await admin.page("/account");
    expect(html).toContain('<select id="timeZone-saved" name="timeZone">');
    expect(html).toContain('<option value="Pacific/Kiritimati" >Pacific/Kiritimati</option>');
    const saved = await admin.post("/account/suunto/settings", { _csrf: csrf, units: "imperial", readOnly: "on", timeZone: "Pacific/Kiritimati" });
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/account?m=saved");
    expect(store.getSuuntoSettings(adminId())).toEqual({ ...before, units: "imperial", readOnly: true, timeZone: "Pacific/Kiritimati" });
    // An unknown zone is refused and nothing changes; units other than metric/imperial are ignored.
    const bad = await admin.post("/account/suunto/settings", { _csrf: csrf, units: "auto", timeZone: "Mars/Olympus" });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Unknown time zone.");
    await admin.post("/account/suunto/settings", { _csrf: csrf, units: "auto", timeZone: "Europe/Zurich" });
    expect(store.getSuuntoSettings(adminId())).toMatchObject({ units: "imperial", readOnly: false, timeZone: "Europe/Zurich" });
    await admin.post("/account/suunto/settings", { _csrf: csrf, units: "metric" });
    expect(mock.requests.length).toBe(requests);
  });

  it("keeps refreshed tokens without rebuilding the services, and marks a refused sign-in", async () => {
    const { store } = web.ctx;
    const id = adminId();
    const current = store.getSuuntoSettings(id)!;
    store.setSuuntoNeedsReconnect(id, true);
    // The page says so, and offers to connect again; a settings change keeps the mark.
    const { csrf, html } = await admin.page("/account");
    expect(html).toContain("Suunto refused your saved connection");
    expect(html).toContain("Connect Suunto again");
    await admin.post("/account/suunto/settings", { _csrf: csrf, units: "metric" });
    expect(store.getUser(id)!.suuntoNeedsReconnect).toBe(true);
    // Saved tokens of a refresh that worked clear the mark, without touching service_updated_at.
    const updatedAt = store.getUser(id)!.serviceUpdatedAt;
    expect(store.saveSuuntoTokens(id, { refreshToken: "rt-rotated", accessToken: "at-new", accessTokenExpiresAt: 5, clientId: MOCK_CLIENT_ID }, current.connectedAt)).toBe(true);
    expect(store.getUser(id)).toMatchObject({ serviceUpdatedAt: updatedAt, suuntoNeedsReconnect: false });
    expect(store.getSuuntoSettings(id)).toMatchObject({ refreshToken: "rt-rotated", accessToken: "at-new", accessTokenExpiresAt: 5, username: MOCK_USERNAME });
    // Tokens of an older connection are not saved over a newer one.
    expect(store.saveSuuntoTokens(id, { refreshToken: "rt-other", clientId: MOCK_CLIENT_ID }, 1)).toBe(false);
    expect(store.getSuuntoSettings(id)!.refreshToken).toBe("rt-rotated");
    // A token set without an access token drops the old one.
    expect(store.saveSuuntoTokens(id, { refreshToken: "rt-only", clientId: MOCK_CLIENT_ID })).toBe(true);
    expect(store.getSuuntoSettings(id)!.accessToken).toBeUndefined();
  });

  it("removes the connection and tells Suunto (deauthorize with the stored tokens)", async () => {
    // A fresh connection (the last test replaced the tokens with invented ones).
    expect((await connectSuunto(admin)).res.headers.get("location")).toBe("/account?m=connected");
    const calls = mock.state.deauthorizeCalls;
    const { csrf } = await admin.page("/account");
    const res = await admin.post("/account/suunto/remove", { _csrf: csrf });
    expect(res.headers.get("location")).toBe("/account?m=removed");
    expect(mock.state.deauthorizeCalls).toBe(calls + 1);
    expect(mock.requests.filter((r) => r.path === "/oauth/deauthorize").at(-1)!.query).toMatchObject({ client_id: MOCK_CLIENT_ID });
    expect(web.ctx.store.getUser(adminId())!.hasSuunto).toBe(false);
    expect((await admin.page("/account?m=removed")).html).toContain("Your Suunto connection was removed.");
    // Removing works even when Suunto does not answer.
    expect((await connectSuunto(admin)).res.headers.get("location")).toBe("/account?m=connected");
    mock.failNext("/oauth/deauthorize", 500);
    const { csrf: c2 } = await admin.page("/account");
    expect((await admin.post("/account/suunto/remove", { _csrf: c2 })).headers.get("location")).toBe("/account?m=removed");
    expect(web.ctx.store.getUser(adminId())!.hasSuunto).toBe(false);
  });

  it("stores the connection encrypted and never shows the tokens", async () => {
    const id = adminId();
    web.ctx.store.saveSuuntoSettings(id, { ...suuntoSettings, refreshToken: "rt-secret-invented-value", accessToken: "at-secret-invented-value" });
    const row = web.ctx.store.db.prepare("SELECT service_enc FROM users WHERE email = 'admin@example.com'").get() as { service_enc: string };
    expect(row.service_enc.startsWith("v1:")).toBe(true);
    expect(row.service_enc).not.toContain("rt-secret");
    expect(row.service_enc).not.toContain("invented-runner");
    expect(web.ctx.store.getSuuntoSettings(id)).toMatchObject({ username: "invented-runner", refreshToken: "rt-secret-invented-value" });
    const { html } = await admin.page("/account");
    expect(html).not.toContain("rt-secret-invented-value");
    expect(html).not.toContain("at-secret-invented-value");
    expect(html).toContain("invented-runner");
    // Without a test call on record, the count is unknown (the page never asks Suunto).
    expect(html).toContain('<dt>Workouts in the last 30 days</dt><dd><span class="muted">unknown</span></dd>');
    web.ctx.store.saveSuuntoSettings(id, undefined);
  });
});

describe("OAuth and MCP", () => {
  const userBrowser = new Browser();
  let oauth: TestOAuthClient;
  let client: Client;
  const userId = () => web.ctx.store.getUserByEmail("user@example.com")!.id;

  beforeAll(async () => {
    await userBrowser.login("user@example.com", PASSWORD);
  });

  it("connects like Claude: registration, consent, token, MCP", async () => {
    oauth = new TestOAuthClient(userBrowser);
    client = await connectMcp(oauth);
    expect(oauth.info?.client_id).toBeTruthy();
    expect(oauth.savedTokens?.access_token).toMatch(/^sum_at_/);
    expect(oauth.savedTokens?.refresh_token).toMatch(/^sum_rt_/);
    // No Suunto connection yet: the full (stable) tool list is offered, every call explains the setup.
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("suunto_account_info");
    expect(tools).toContain("suunto_import_route");
    const info = await client.callTool({ name: "suunto_account_info", arguments: {} });
    expect(info.isError).toBe(true);
    expect(text(info)).toContain(`Connect your Suunto account first at ${base}/account`);
    expect(text(info)).toContain("not connected yet");
  });

  it("connects Suunto from the consent page and comes back to it", async () => {
    const o = new TestOAuthClient(userBrowser);
    // Start an authorization by hand to stop on the consent page.
    const authorize = `${base}/authorize?${new URLSearchParams({
      client_id: (await (await fetch(`${base}/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o.clientMetadata) })).json() as { client_id: string }).client_id,
      redirect_uri: o.redirectUrl,
      response_type: "code",
      code_challenge: "x".repeat(43),
      code_challenge_method: "S256",
      resource: `${base}/mcp`,
    })}`;
    const consentUrl = (await userBrowser.fetch(authorize)).headers.get("location")!;
    const consent = await userBrowser.page(consentUrl);
    const link = `/account?next=${encodeURIComponent(consentUrl)}`;
    expect(consent.html).toContain(`<a href="${link}">Connect it now</a>`);
    const run = await connectSuunto(userBrowser, { from: link, timeZone: "UTC" });
    expect(run.res.headers.get("location")).toBe(consentUrl);
    expect(web.ctx.store.getUser(userId())!.hasSuunto).toBe(true);
    expect((await userBrowser.page(consentUrl)).html).not.toContain("Connect it now");
  });

  it("uses the user's own Suunto connection once it is saved", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["suunto_account_info", "suunto_list_workouts", "suunto_import_route", "suunto_create_poi"]));
    const info = await client.callTool({ name: "suunto_account_info", arguments: {} });
    expect(info.isError, text(info)).toBeFalsy();
    expect(json(info)).toMatchObject({ username: MOCK_USERNAME, connected: true, demo: false, units: "metric" });
    expect(web.ctx.store.recentActivity(userId())[0]).toMatchObject({ tool: "suunto_account_info", ok: true });
    const list = await client.callTool({ name: "suunto_list_workouts", arguments: { limit: 5 } });
    expect(list.isError, text(list)).toBeFalsy();
    expect(json(list).count).toBe(5);
    expect(mock.state.violations).toEqual([]);
  });

  it("accepts tool calls big enough for a 5 MB GPX file, and refuses larger ones", async () => {
    const post = (bytes: number) =>
      fetch(`${base}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${oauth.savedTokens!.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: { padding: "x".repeat(bytes) } } }),
      });
    expect((await post(6 * 1024 * 1024)).status).toBe(200);
    expect((await post(9 * 1024 * 1024)).status).toBe(413);
  });

  it("hides the write tools when the user turns on read-only", async () => {
    const { csrf } = await userBrowser.page("/account");
    await userBrowser.post("/account/suunto/settings", { _csrf: csrf, units: "metric", readOnly: "on" });
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("suunto_list_workouts");
    expect(tools).not.toContain("suunto_import_route");
    expect(tools).not.toContain("suunto_create_poi");
    const { csrf: c2 } = await userBrowser.page("/account");
    await userBrowser.post("/account/suunto/settings", { _csrf: c2, units: "metric" });
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("suunto_import_route");
  });

  it("uses the user's own time zone for today's date", async () => {
    const zone = "Pacific/Kiritimati";
    const { csrf } = await userBrowser.page("/account");
    expect((await userBrowser.post("/account/suunto/settings", { _csrf: csrf, units: "metric", timeZone: zone })).headers.get("location")).toBe("/account?m=saved");
    const info = json(await client.callTool({ name: "suunto_account_info", arguments: {} }));
    expect(info).toMatchObject({ time_zone: zone, today: todayInZone(zone) });
    // The server default applies to connections without a zone of their own.
    const server = { ...DEFAULT_SETTINGS, defaultTimeZone: "Europe/Zurich" };
    expect(buildUserConfig({ ...suuntoSettings, timeZone: zone }, server, {}, mock.keys).timeZone).toBe(zone);
    expect(buildUserConfig(suuntoSettings, server, {}, mock.keys).timeZone).toBe("Europe/Zurich");
    // The operator's app keys, the user's tokens; the Suunto hosts only from the operator.
    const config = buildUserConfig(suuntoSettings, server, { SUUNTO_API_URL: mock.apiUrl }, mock.keys);
    expect(config.suunto.keys).toEqual(mock.keys);
    expect(config.suunto.endpoints.apiUrl).toBe(mock.apiUrl);
    expect(config.secrets).toEqual(expect.arrayContaining([MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY, "rt-invented"]));
  });

  it("keeps a new refresh token from Suunto without rebuilding the services", async () => {
    const id = userId();
    const before = web.ctx.store.getSuuntoSettings(id)!;
    const updatedAt = web.ctx.store.getUser(id)!.serviceUpdatedAt;
    // Suunto ends the access token early: the next request gets 401, the session refreshes once.
    mock.expireAccessTokens();
    const tokenCalls = mock.count("/oauth/token");
    const list = await client.callTool({ name: "suunto_list_workouts", arguments: { limit: 3 } });
    expect(list.isError, text(list)).toBeFalsy();
    expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
    const after = web.ctx.store.getSuuntoSettings(id)!;
    // The mock rotates refresh tokens: the newest one is kept, with the new access token.
    expect(after.refreshToken).not.toBe(before.refreshToken);
    expect(after.accessToken).not.toBe(before.accessToken);
    expect(after.connectedAt).toBe(before.connectedAt);
    expect(web.ctx.store.getUser(id)!.serviceUpdatedAt).toBe(updatedAt);
    // The services were not rebuilt: the next call needs no new refresh.
    expect((await client.callTool({ name: "suunto_list_workouts", arguments: { limit: 4 } })).isError).toBeFalsy();
    expect(mock.count("/oauth/token") - tokenCalls).toBe(1);
  });

  it("asks the user to connect again when Suunto refuses the stored sign-in", async () => {
    const id = userId();
    mock.revokeAll();
    const failed = await client.callTool({ name: "suunto_list_workouts", arguments: freshWindow(6) });
    expect(failed.isError).toBe(true);
    // The call that finds the dead sign-in already says where to connect again.
    expect(text(failed)).toContain(`Your Suunto connection expired. Connect Suunto again at ${base}/account.`);
    expect(web.ctx.store.getUser(id)!.suuntoNeedsReconnect).toBe(true);
    // Tool calls are not blocked by the mark: the session answers (during its cool-down without a request).
    const tokenCalls = mock.count("/oauth/token");
    const info = await client.callTool({ name: "suunto_list_workouts", arguments: freshWindow(7) });
    expect(info.isError).toBe(true);
    expect(text(info)).toContain(`Connect Suunto again at ${base}/account.`);
    expect(mock.count("/oauth/token")).toBe(tokenCalls);
    // The account page says so, and connecting again fixes it.
    const { html } = await userBrowser.page("/account");
    expect(html).toContain("Suunto refused your saved connection");
    expect((await connectSuunto(userBrowser)).res.headers.get("location")).toBe("/account?m=connected");
    expect(web.ctx.store.getUser(id)!.suuntoNeedsReconnect).toBe(false);
    expect((await client.callTool({ name: "suunto_list_workouts", arguments: freshWindow(8) })).isError).toBeFalsy();
  });

  it("refreshes expired access tokens and rotates the refresh token", async () => {
    const before = oauth.savedTokens!;
    web.ctx.store.db.prepare("UPDATE oauth_tokens SET expires_at = 0 WHERE kind = 'access'").run();
    const tools = await client.listTools();
    expect(tools.tools.length).toBeGreaterThan(0);
    expect(oauth.savedTokens!.access_token).not.toBe(before.access_token);
    expect(oauth.savedTokens!.refresh_token).not.toBe(before.refresh_token);

    // A retry with the previous refresh token right after rotation is tolerated (timeouts)...
    const retry = await fetch(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: before.refresh_token!, client_id: oauth.info!.client_id }),
    });
    expect(retry.status).toBe(200);
    // ...but only once: any further reuse revokes the whole grant.
    const replay = await fetch(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: before.refresh_token!, client_id: oauth.info!.client_id }),
    });
    expect(replay.status).toBe(400);
    expect(((await replay.json()) as { error: string }).error).toBe("invalid_grant");
    const after = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${oauth.savedTokens!.access_token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(after.status).toBe(401);
  });

  it("lets users see and revoke connected apps", async () => {
    const o = new TestOAuthClient(userBrowser);
    const c = await connectMcp(o);
    const { html, csrf } = await userBrowser.page("/account/connections");
    expect(html).toContain("Claude");
    const family = html.match(/name="family" value="([^"]+)"/)![1]!;
    await userBrowser.post("/account/connections/revoke", { _csrf: csrf, family });
    await expect(c.listTools()).rejects.toThrow();
  });

  it("returns access_denied when the user denies", async () => {
    const o = new TestOAuthClient(userBrowser, "deny");
    await expect(connectMcp(o)).rejects.toThrow();
    expect(o.authCode).toBeUndefined();
  });

  it("supports client ID metadata documents", async () => {
    const verifier = "a".repeat(64);
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    const authorize = new URL(`${base}/authorize`);
    authorize.search = new URLSearchParams({
      client_id: metadataUrl,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      resource: `${base}/mcp`,
    }).toString();
    const res = await userBrowser.fetch(authorize.href);
    expect(res.status).toBe(302);
    const consent = await userBrowser.page(res.headers.get("location")!);
    expect(consent.html).toContain("Metadata Client");
    const request = consent.html.match(/name="request" value="([^"]+)"/)![1]!;
    const done = await userBrowser.post("/oauth/consent", { _csrf: consent.csrf, request, decision: "allow" });
    const code = new URL(done.headers.get("location")!).searchParams.get("code")!;
    const token = await fetch(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: metadataUrl, redirect_uri: "https://claude.ai/api/mcp/auth_callback", resource: `${base}/mcp` }),
    });
    expect(token.status).toBe(200);
    const body = (await token.json()) as { access_token: string };
    expect(body.access_token).toMatch(/^sum_at_/);
    // Codes are single use.
    const again = await fetch(`${base}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: metadataUrl }),
    });
    expect(again.status).toBe(400);
  });

  it("accepts metadata documents that also support public sign-in, and only those", async () => {
    const authorizeAs = (clientId: string) =>
      userBrowser.fetch(
        `${base}/authorize?${new URLSearchParams({
          client_id: clientId,
          redirect_uri: "https://claude.ai/api/mcp/auth_callback",
          response_type: "code",
          code_challenge: "x".repeat(43),
          code_challenge_method: "S256",
          resource: `${base}/mcp`,
        })}`,
      );
    const ok = await authorizeAs(metadataUrl.replace("client.json", "jwt-or-none.json"));
    expect(ok.status).toBe(302);
    expect((await userBrowser.page(ok.headers.get("location")!)).html).toContain("Jwt Or None");
    const refused = await authorizeAs(metadataUrl.replace("client.json", "jwt-only.json"));
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("Only public clients");
  });

  it("rejects tokens for other resources and wrong PKCE verifiers", async () => {
    const bad = await fetch(`${base}/authorize?${new URLSearchParams({
      client_id: oauth.info!.client_id,
      redirect_uri: "https://claude.ai/api/mcp/auth_callback",
      response_type: "code",
      code_challenge: "x".repeat(43),
      code_challenge_method: "S256",
      resource: "https://evil.example.com/mcp",
    })}`, { redirect: "manual" });
    expect(bad.status).toBe(302);
    expect(bad.headers.get("location")).toContain("error=invalid_target");
  });
});

describe("administration", () => {
  const admin = new Browser();
  beforeAll(async () => {
    await admin.login("admin@example.com", PASSWORD);
  });

  it("closes registration and issues single-use invite codes", async () => {
    let { csrf } = await admin.page("/admin");
    await admin.post("/admin/settings", { _csrf: csrf, registration: "invite", allowDynamicRegistration: "on", allowClientMetadataDocuments: "on", defaultTimeZone: "UTC", accessTokenTtlMinutes: "60", refreshTokenTtlDays: "60", sessionTtlDays: "14" });
    expect(web.ctx.store.getSettings().registration).toBe("invite");
    const visitor = new Browser();
    expect((await visitor.signup("new@example.com", PASSWORD)).status).toBe(400);
    ({ csrf } = await admin.page("/admin"));
    const created = await (await admin.post("/admin/invites", { _csrf: csrf, note: "for new", days: "7" })).text();
    const code = created.match(/<code id="secret">([^<]+)<\/code>/)![1]!;
    expect((await visitor.signup("new@example.com", PASSWORD, { invite: code })).status).toBe(303);
    const other = new Browser();
    expect((await other.signup("third@example.com", PASSWORD, { invite: code })).status).toBe(400);

    ({ csrf } = await admin.page("/admin"));
    await admin.post("/admin/settings", { _csrf: csrf, registration: "closed", allowDynamicRegistration: "on", defaultTimeZone: "UTC", accessTokenTtlMinutes: "60", refreshTokenTtlDays: "60", sessionTtlDays: "14" });
    expect((await new Browser().fetch("/signup")).status).toBe(403);
  });

  it("restricts which apps may connect", async () => {
    const { csrf } = await admin.page("/admin");
    await admin.post("/admin/settings", { _csrf: csrf, registration: "closed", allowDynamicRegistration: "on", allowedRedirectHosts: "example.org", defaultTimeZone: "UTC", accessTokenTtlMinutes: "60", refreshTokenTtlDays: "60", sessionTtlDays: "14" });
    const reg = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "x", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" }),
    });
    expect(reg.status).toBe(400);
    const ok = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "y", redirect_uris: ["https://app.example.org/cb"], token_endpoint_auth_method: "none" }),
    });
    expect(ok.status).toBe(201);
  });

  it("shows the Suunto API card: keys set, the redirect URI to register, never the keys", async () => {
    const { html } = await admin.page("/admin");
    expect(html).toContain("<h2>Suunto API <span class=\"badge ok\">set</span></h2>");
    expect(html).toContain(`<code>${base}/suunto/callback</code>`);
    expect(html).toContain("Register exactly this address as the redirect URI of your app in the Suunto API Zone.");
    expect(html).toContain("10 calls per minute and 200 calls per week");
    expect(html).toContain("custom servers for tests (SUUNTO_OAUTH_URL, SUUNTO_API_URL)");
    for (const secret of [MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_SUBSCRIPTION_KEY]) expect(html).not.toContain(secret);
  });

  it("shows the Suunto state of each user and counts the connected ones", async () => {
    const user = web.ctx.store.getUserByEmail("user@example.com")!;
    expect(user.hasSuunto).toBe(true);
    const connected = web.ctx.store.listUsers().filter((u) => u.hasSuunto && !u.suuntoNeedsReconnect && !u.demo).length;
    expect(connected).toBe(2);
    let { html } = await admin.page("/admin");
    expect(html).toContain(`(${connected} with Suunto connected)`);
    expect(html).toContain("<th>Suunto</th>");
    expect(html).toMatch(/user@example\.com[\s\S]*?<span class="badge ok">connected<\/span>/);
    expect(html).toMatch(/admin@example\.com[\s\S]*?<span class="badge warn">not connected<\/span>/);
    web.ctx.store.setSuuntoNeedsReconnect(user.id, true);
    ({ html } = await admin.page("/admin"));
    expect(html).toContain(`(${connected - 1} with Suunto connected)`);
    expect(html).toMatch(/user@example\.com[\s\S]*?<span class="badge bad">needs reconnect<\/span>/);
    web.ctx.store.setSuuntoNeedsReconnect(user.id, false);
    // A connection that cannot be decrypted (the master key changed) cannot be used: it is not
    // counted and needs a new connection.
    const { hashPassword } = await import("../../src/web/crypto.js");
    const locked = web.ctx.store.createUser("key-changed@example.com", await hashPassword(PASSWORD), false);
    const otherKey = new SecretBox(randomBytes(32));
    web.ctx.store.db.prepare("UPDATE users SET service_enc = ?, service_updated_at = 1 WHERE id = ?").run(otherKey.seal(JSON.stringify(suuntoSettings), locked.id), locked.id);
    expect(web.ctx.store.getUser(locked.id)!.hasSuunto).toBe(true);
    expect(web.ctx.store.unreadableSuuntoUserIds()).toEqual(new Set([locked.id]));
    ({ html } = await admin.page("/admin"));
    expect(html).toContain(`(${connected} with Suunto connected)`);
    expect(html).toMatch(/key-changed@example\.com[\s\S]*?<span class="badge bad">needs reconnect<\/span>/);
    web.ctx.store.deleteUser(locked.id);
    // No service switches: there is one service.
    expect(html).not.toContain("svcMail");
  });

  it("runs the public setup self-test", async () => {
    const { csrf } = await admin.page("/admin");
    const html = await (await admin.post("/admin/selftest", { _csrf: csrf })).text();
    expect(html).toContain("MCP endpoint answers 401 with discovery header");
    expect(html).toContain("/.well-known/oauth-authorization-server");
    // The Suunto servers here are the mock: shown as custom servers for tests, never contacted.
    expect(html).toContain("Suunto servers");
    expect(html).toContain("custom servers for tests (SUUNTO_OAUTH_URL, SUUNTO_API_URL)");
    expect(html).toMatch(/<span class="badge ok">OK<\/span> Suunto app keys <span class="muted">set<\/span>/);
  });

  it("deletes a user and tells Suunto (best effort)", async () => {
    const other = web.ctx.store.getUserByEmail("other@example.com")!;
    expect(other.hasSuunto).toBe(true);
    // An earlier test ended every token at the mock: give this connection live ones.
    web.ctx.store.saveSuuntoSettings(other.id, { ...web.ctx.store.getSuuntoSettings(other.id)!, ...mock.issueTokens() });
    const calls = mock.state.deauthorizeCalls;
    const { csrf } = await admin.page("/admin");
    expect((await admin.post("/admin/users/action", { _csrf: csrf, id: other.id, action: "delete" })).headers.get("location")).toBe("/admin?m=user");
    expect(web.ctx.store.getUser(other.id)).toBeUndefined();
    expect(mock.state.deauthorizeCalls).toBe(calls + 1);
  });

  it("disables users, which revokes their sessions and tokens", async () => {
    const victim = new Browser();
    await victim.login("user@example.com", PASSWORD);
    const user = web.ctx.store.getUserByEmail("user@example.com")!;
    const { csrf } = await admin.page("/admin");
    await admin.post("/admin/users/action", { _csrf: csrf, id: user.id, action: "disable" });
    expect(web.ctx.store.getUser(user.id)!.disabled).toBe(true);
    expect((await victim.fetch("/account")).status).toBe(303);
    const login = await new Browser().login("user@example.com", PASSWORD);
    expect(login.status).toBe(403);
    expect(await login.text()).toContain("This account is disabled.");
  });

  it("never lets the last administrator be removed", async () => {
    const adminUser = web.ctx.store.getUserByEmail("admin@example.com")!;
    const { csrf, html } = await admin.page("/account/security");
    expect(html).toContain("Delete account");
    const res = await admin.post("/account/delete", { _csrf: csrf, confirm: "admin@example.com" });
    expect(res.status).toBe(400);
    expect(web.ctx.store.getUser(adminUser.id)).toBeTruthy();
  });

  it("sends security headers on pages", async () => {
    const res = await admin.fetch("/account");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/SameSite=None/);
  });
});

describe("account deletion by the user", () => {
  it("tells Suunto, then deletes the account and its connection", async () => {
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "open", allowedRedirectHosts: [] });
    const b = new Browser();
    expect((await b.signup("leaving@example.com", PASSWORD)).status).toBe(303);
    expect((await connectSuunto(b)).res.headers.get("location")).toBe("/account?m=connected");
    const calls = mock.state.deauthorizeCalls;
    const { csrf } = await b.page("/account/security");
    const res = await b.post("/account/delete", { _csrf: csrf, confirm: "leaving@example.com" });
    expect(res.headers.get("location")).toBe("/");
    expect(mock.state.deauthorizeCalls).toBe(calls + 1);
    expect(web.ctx.store.getUserByEmail("leaving@example.com")).toBeUndefined();
  });
});

describe("client metadata SSRF protection", () => {
  it("classifies private addresses in every notation", async () => {
    const { isPrivateAddress } = await import("../../src/web/oauth.js");
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "::1", "::", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "0:0:0:0:0:ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe", "2002:a9fe:a9fe::1", "fe80::1", "fd12::1", "::127.0.0.1", "not-an-ip"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ["160.79.104.10", "8.8.8.8", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe("storage robustness", () => {
  it("asks users to connect again when the stored connection cannot be decrypted, instead of failing", async () => {
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), allowedRedirectHosts: [] });
    const { hashPassword } = await import("../../src/web/crypto.js");
    web.ctx.store.createUser("lock@example.com", await hashPassword(PASSWORD), false);
    const b = new Browser();
    expect((await b.login("lock@example.com", PASSWORD)).status).toBe(303);
    const user = web.ctx.store.getUserByEmail("lock@example.com")!;
    web.ctx.store.saveSuuntoSettings(user.id, suuntoSettings);
    // Simulate a changed master key: the stored ciphertext no longer opens.
    web.ctx.store.db.prepare("UPDATE users SET service_enc = 'v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' WHERE id = ?").run(user.id);
    const page = await b.page("/account");
    expect(page.res.status).toBe(200);
    expect(page.html).toContain("cannot be read");
    expect(page.html).toContain('action="/account/suunto/connect"');
    const client = await connectMcp(new TestOAuthClient(b));
    const res = await client.callTool({ name: "suunto_account_info", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("cannot be decrypted");
    expect(text(res)).toContain(`Connect Suunto again at ${base}/account`);
    await client.close();
  });

  it("stores only small, bounded data for dynamic registrations", async () => {
    const reg = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "x".repeat(5_000), redirect_uris: ["https://app.example.org/cb"], token_endpoint_auth_method: "client_secret_post", extra_field: "y".repeat(2_000) }),
    });
    expect(reg.status).toBe(201);
    const huge = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "x".repeat(50_000), redirect_uris: ["https://app.example.org/cb"] }),
    });
    expect(huge.status).toBe(413);
    const body = (await reg.json()) as { client_id: string; client_secret?: string };
    expect(body.client_secret).toBeUndefined();
    const row = web.ctx.store.db.prepare("SELECT length(data) AS n FROM oauth_clients WHERE client_id = ?").get(body.client_id) as { n: number };
    expect(row.n).toBeLessThan(2_000);
  });

  it("recognizes Anthropic's outbound ranges", async () => {
    const { isAnthropicAddress } = await import("../../src/web/routes-oauth.js");
    expect(isAnthropicAddress("160.79.104.10")).toBe(true);
    expect(isAnthropicAddress("::ffff:153.61.210.1")).toBe(true);
    expect(isAnthropicAddress("8.8.8.8")).toBe(false);
  });
});

describe("a server without Suunto app keys", () => {
  let bare: WebApp;
  let bareServer: Server;
  let bareBase = "";
  const bareLogs: string[] = [];

  beforeAll(async () => {
    bareServer = createServer();
    await new Promise<void>((r) => bareServer.listen(0, "127.0.0.1", r));
    bareBase = `http://127.0.0.1:${(bareServer.address() as AddressInfo).port}`;
    // Only the hosts (closed ports): no keys at all.
    bare = await createWebApp({
      publicUrl: new URL(bareBase),
      host: "127.0.0.1",
      port: 0,
      dataDir: ":memory:",
      operator: { SUUNTO_OAUTH_URL: "http://127.0.0.1:1", SUUNTO_API_URL: "http://127.0.0.1:1" },
      log: (m) => void bareLogs.push(m),
    });
    bareServer.on("request", bare.app);
  });

  afterAll(async () => {
    await new Promise<void>((r) => bareServer.close(() => r()));
    await bare.close();
    setBase(base);
  });

  it("starts, warns, and explains on every page that Suunto cannot be connected yet", async () => {
    expect(bareLogs.join("\n")).toContain("warning: SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set");
    expect(bareLogs.join("\n")).toContain(`${bareBase}/suunto/callback`);
    setBase(bareBase);
    const admin = new Browser();
    expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
    const { html, csrf, res } = await admin.page("/account");
    expect(html).toContain("The administrator of this server has not set up the Suunto connection yet");
    expect(html).not.toContain('action="/account/suunto/connect"');
    expect(res.headers.get("content-security-policy")).toMatch(/form-action 'self'$/);
    const connect = await admin.post("/account/suunto/connect", { _csrf: csrf });
    expect(connect.headers.get("location")).toBe("/account?m=notconfigured");
    expect(bare.ctx.store.db.prepare("SELECT COUNT(*) AS n FROM suunto_oauth_states").get()).toEqual({ n: 0 });
    // The admin page: keys missing, and what to do.
    const adminPage = (await admin.page("/admin")).html;
    bare.ctx.store.saveSettings({ ...bare.ctx.store.getSettings(), registration: "open" });
    expect(adminPage).toContain("<h2>Suunto API <span class=\"badge bad\">missing</span></h2>");
    expect(adminPage).toContain("The Suunto app keys are not set, so nobody can connect Suunto");
    expect(adminPage).toContain(`<code>${bareBase}/suunto/callback</code>`);
  });

  it("answers tool calls of a connected user with the reason", async () => {
    setBase(bareBase);
    const b = new Browser();
    expect((await b.signup("user@example.com", PASSWORD)).status).toBe(303);
    const user = bare.ctx.store.getUserByEmail("user@example.com")!;
    // A connection saved while the server had keys.
    bare.ctx.store.saveSuuntoSettings(user.id, suuntoSettings);
    expect(bare.ctx.pool.get(bare.ctx.store.getUser(user.id)!)).toBeUndefined();
    const { html } = await b.page("/account");
    expect(html).toContain("invented-runner");
    // Not "connected" and "On": the saved connection cannot be used right now.
    expect(html).toContain("Your Suunto connection is saved, but it is not available right now.");
    expect(html).toContain('<span class="badge warn">Not available right now</span>');
    expect(html).toContain('<span class="badge warn">not available right now</span>');
    expect(html).toContain("The Suunto connection of this server is not set up right now");
    expect(html).not.toContain("Suunto connected.");
    expect(html).not.toContain('<span class="badge ok">');
    expect(html).not.toContain('<details id="reconnect">');
    // Remove cannot tell Suunto without the app keys, and says so.
    expect(html).toContain("This server cannot tell Suunto right now");
    expect(html).not.toContain("This server tells Suunto to end its access");
    expect((await b.page("/account/security")).html).toContain("This server cannot tell Suunto right now");
    const client = await connectMcp(new TestOAuthClient(b));
    const res = await client.callTool({ name: "suunto_account_info", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toContain("has not set up the Suunto connection yet");
    await client.close();
  });
});
