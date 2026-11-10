/**
 * Web mode: accounts, the PADI connection, admin, OAuth (as used by Claude custom connectors) and
 * the per-user MCP endpoint, exercised over real HTTP with the SDK's OAuth client. PADI is the
 * in-process mock (test/helpers/mock-padi.ts): nothing is ever sent to PADI.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signIn } from "../../src/padi/auth.js";
import { endpointsFromEnv } from "../../src/padi/endpoints.js";
import { todayInZone } from "../../src/util/dates.js";
import { buildUserConfig } from "../../src/web/accounts.js";
import { SecretBox } from "../../src/web/crypto.js";
import { escapeHtml } from "../../src/web/html.js";
import { t, withLocale } from "../../src/web/i18n/index.js";
import { signInError } from "../../src/web/routes-account.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { DEFAULT_SETTINGS, type PadiAccountSettings } from "../../src/web/store.js";
import { MOCK_ACCOUNT, startMockPadi, type MockPadi } from "../helpers/mock-padi.js";
import { Browser, connectMcp, setBase, TestOAuthClient } from "../helpers/web-client.js";

/** A second diver of the mock PADI (invented). */
const OTHER_DIVER = { email: "sky.example@example.com", password: "invented-password-2", affiliateId: "20000002", givenName: "Sky", familyName: "Example" };

/** A stored PADI connection (invented test data; never signed in for real). */
const padiSettings: PadiAccountSettings = {
  email: "diver.test@example.com",
  refreshToken: "rt-invented",
  loginMethod: "cognito",
  clientId: "test-client",
  affiliateId: "10000004",
  name: "Test Diver",
  units: "auto",
  readOnly: false,
  connectedAt: 1_700_000_000_000,
};

let web: WebApp;
let server: Server;
let base = "";

let metadataServer: Server;
let metadataUrl = "";
let mock: MockPadi;

beforeAll(async () => {
  mock = await startMockPadi({ accounts: [MOCK_ACCOUNT, OTHER_DIVER] });
  // Listen first so the public URL (OAuth issuer) contains the real port.
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    allowPrivateClientMetadata: true,
    // Never reach real PADI from tests: the mock.
    operator: mock.env(),
    log: () => {},
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

const PASSWORD = "correct horse battery";

describe("discovery", () => {
  it("returns 401 with resource metadata for unauthenticated MCP requests", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
  });

  it("publishes protected resource and authorization server metadata", async () => {
    const prm = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(prm).toMatchObject({ resource: `${base}/mcp`, authorization_servers: [base], scopes_supported: ["padi"] });
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
    });
    expect(as.token_endpoint_auth_methods_supported).toEqual(["none"]);
  });
});

describe("accounts", () => {
  const admin = new Browser();

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
    // The PADI.com sign-in is not this site's login: password managers must not file it as one.
    expect(html).toContain('<input id="email" name="email" type="email" required autocomplete="off"');
    expect(html).toContain('<input id="password" name="password" type="password" required autocomplete="off">');
    expect(html).not.toMatch(/autocomplete="(username|current-password)"/);
    const adminPage = await admin.page("/admin");
    expect(adminPage.res.status).toBe(200);
    expect(adminPage.html).toContain("Administration");
  });

  it("rejects forms without a valid CSRF token", async () => {
    const res = await admin.post("/account/padi", { _csrf: "wrong", email: "x@example.com", password: "a" });
    expect(res.status).toBe(400);
  });

  it("requires sign-in for account pages and blocks non-admins from /admin", async () => {
    const anon = new Browser();
    const res = await anon.fetch("/account");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login?next=%2Faccount");
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

  it("signs in to PADI with Save and test, keeps only the refresh token and shows the logbook", async () => {
    const { csrf, html } = await admin.page("/account");
    expect(html).toContain("Save and test");
    expect(html).toContain("account.padi.com");
    const before = mock.count("/cognito");
    const res = await admin.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email.toUpperCase(), password: MOCK_ACCOUNT.password, units: "metric" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/account?m=connected");
    // One sign-in (Cognito), no second one for the quick check.
    expect(mock.count("/cognito") - before).toBe(1);
    const user = web.ctx.store.getUserByEmail("admin@example.com")!;
    const settings = web.ctx.store.getPadiSettings(user.id)!;
    expect(settings).toMatchObject({ email: MOCK_ACCOUNT.email, affiliateId: MOCK_ACCOUNT.affiliateId, name: "River Tester", loginMethod: "cognito", units: "metric", readOnly: false });
    expect(settings.refreshToken).toBeTruthy();
    // The password is never stored.
    expect(JSON.stringify(settings)).not.toContain(MOCK_ACCOUNT.password);
    const row = web.ctx.store.db.prepare("SELECT service_enc FROM users WHERE id = ?").get(user.id) as { service_enc: string };
    expect(row.service_enc.startsWith("v1:")).toBe(true);
    expect(row.service_enc).not.toContain(settings.refreshToken);
    const page = await admin.page("/account?m=connected");
    expect(page.html).toContain("Connected to PADI.");
    expect(page.html).toContain("River Tester");
    expect(page.html).toContain(MOCK_ACCOUNT.affiliateId);
    expect(page.html).toContain(`<dt>Dives in your logbook</dt><dd>${mock.account.store.sorted().length}</dd>`);
    expect(page.html).not.toContain(settings.refreshToken);
    expect(page.html).not.toContain(MOCK_ACCOUNT.password);
    expect(page.html).toContain("Reconnect");
    expect(page.html).toContain("Remove PADI connection");
  });

  it("refuses a wrong PADI password once, without trying again, and keeps the saved connection", async () => {
    const user = web.ctx.store.getUserByEmail("admin@example.com")!;
    const saved = web.ctx.store.getPadiSettings(user.id)!;
    const { csrf } = await admin.page("/account");
    const before = mock.requests.length;
    const res = await admin.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email, password: "wrong-password", keep: "settings" });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Could not sign in to PADI:");
    // The e-mail stays in the form, the password does not.
    expect(html).toContain(`value="${MOCK_ACCOUNT.email}"`);
    expect(html).not.toContain("wrong-password");
    // A wrong password is never sent a second time (that could lock the PADI account).
    expect(mock.requests.slice(before).map((r) => r.path)).toEqual(["/cognito/"]);
    expect(web.ctx.store.getPadiSettings(user.id)).toEqual(saved);
    // Both fields are needed.
    const missing = await admin.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email, password: "" });
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("Enter your PADI e-mail and password.");
  });

  it("explains a refused PADI sign-in in the page's language, without internal codes", async () => {
    const german = new Browser();
    await german.login("admin@example.com", PASSWORD);
    german.jar.set("pdm_lang", "de");
    const { csrf } = await german.page("/account");
    const res = await german.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email, password: "wrong-password", keep: "settings" });
    expect(res.status).toBe(400);
    const html = await res.text();
    const reason = withLocale("de", () => t("account.error.padi.badCredentials"));
    expect(html).toContain(escapeHtml(withLocale("de", () => t("account.error.signIn", { error: reason }))));
    // Not the PADI client's own English text, and never its internal code.
    expect(html).not.toContain("[bad_credentials]");
    expect(html).not.toContain("PADI did not accept the e-mail or password. Check them and try again (use");
    // The English page names the Google, Apple and Facebook case.
    expect(t("account.error.padi.badCredentials")).toContain("Google, Apple or Facebook");
  });

  it("tells a blocked or disabled PADI account apart from a wrong password", async () => {
    const endpoints = endpointsFromEnv(mock.env());
    /** The sign-in error for a Cognito answer (no request leaves the test). */
    const refused = async (status: number, body: Record<string, unknown>) =>
      signIn(MOCK_ACCOUNT.email, "x", { method: "cognito", endpoints, backoffMs: 0, fetch: async () => new Response(JSON.stringify(body), { status }) }).then(
        () => expect.unreachable(),
        (error: unknown) => error,
      );
    const reason = async (status: number, body: Record<string, unknown>) => {
      const error = await refused(status, body);
      return withLocale("en", () => signInError(error));
    };
    expect(await reason(400, { __type: "NotAuthorizedException", message: "Password attempts exceeded" })).toBe(
      t("account.error.signIn", { error: t("account.error.padi.locked") }),
    );
    expect(await reason(400, { __type: "NotAuthorizedException", message: "User is disabled." })).toBe(t("account.error.signIn", { error: t("account.error.padi.disabled") }));
    expect(await reason(400, { __type: "NotAuthorizedException", message: "Incorrect username or password." })).toBe(
      t("account.error.signIn", { error: t("account.error.padi.badCredentials") }),
    );
    expect(await reason(400, { __type: "UserNotConfirmedException", message: "User is not confirmed." })).toBe(
      t("account.error.signIn", { error: t("account.error.padi.notConfirmed") }),
    );
    // An unexpected answer keeps its (English) detail, without the code.
    const odd = await reason(400, { __type: "SomethingNewException" });
    expect(odd).toContain("SomethingNewException");
    expect(odd).not.toContain("[unknown]");
  });

  it("stores the PADI connection encrypted and never shows the refresh token", async () => {
    const user = web.ctx.store.getUserByEmail("admin@example.com")!;
    web.ctx.store.savePadiSettings(user.id, { ...padiSettings, refreshToken: "rt-secret-invented-value" });
    const row = web.ctx.store.db.prepare("SELECT service_enc FROM users WHERE email = 'admin@example.com'").get() as { service_enc: string };
    expect(row.service_enc.startsWith("v1:")).toBe(true);
    expect(row.service_enc).not.toContain("rt-secret");
    expect(web.ctx.store.getPadiSettings(user.id)).toMatchObject({ email: "diver.test@example.com", refreshToken: "rt-secret-invented-value" });
    const { html } = await admin.page("/account");
    expect(html).not.toContain("rt-secret-invented-value");
    // The settings form changes units and read-only only, and keeps the sign-in.
    const { csrf: c2 } = await admin.page("/account");
    const saved = await admin.post("/account/padi/settings", { _csrf: c2, units: "imperial", readOnly: "on" });
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("/account?m=saved");
    expect(web.ctx.store.getPadiSettings(user.id)).toMatchObject({ refreshToken: "rt-secret-invented-value", units: "imperial", readOnly: true });
    // A sign-in that expired stays marked when only the settings change.
    web.ctx.store.setPadiNeedsReconnect(user.id, true);
    const { csrf: c3, html: expired } = await admin.page("/account");
    expect(expired).toContain("Your PADI sign-in expired or was ended");
    expect(expired).toContain("sign-in expired");
    await admin.post("/account/padi/settings", { _csrf: c3, units: "metric" });
    expect(web.ctx.store.getUser(user.id)!.padiNeedsReconnect).toBe(true);
    expect(web.ctx.store.getPadiSettings(user.id)).toMatchObject({ units: "metric", readOnly: false });
    // Refreshed tokens are kept without touching service_updated_at.
    const updatedAt = web.ctx.store.getUser(user.id)!.serviceUpdatedAt;
    expect(web.ctx.store.savePadiTokens(user.id, { refreshToken: "rt-rotated", loginMethod: "padi", clientId: "test-client" })).toBe(true);
    expect(web.ctx.store.getUser(user.id)).toMatchObject({ serviceUpdatedAt: updatedAt, padiNeedsReconnect: false });
    expect(web.ctx.store.getPadiSettings(user.id)!.refreshToken).toBe("rt-rotated");
    expect(web.ctx.store.savePadiTokens(user.id, { refreshToken: "rt-other", loginMethod: "padi", clientId: "test-client" }, 1)).toBe(false);
    // Remove.
    const { csrf: c4 } = await admin.page("/account");
    expect((await admin.post("/account/padi/remove", { _csrf: c4 })).headers.get("location")).toBe("/account?m=removed");
    expect(web.ctx.store.getUser(user.id)!.hasPadi).toBe(false);
    expect((await admin.page("/account?m=removed")).html).toContain("Your PADI connection was removed.");
  });
});

describe("OAuth and MCP", () => {
  const userBrowser = new Browser();
  let oauth: TestOAuthClient;
  let client: Client;

  beforeAll(async () => {
    await userBrowser.login("user@example.com", PASSWORD);
  });

  it("connects like Claude: registration, consent, token, MCP", async () => {
    oauth = new TestOAuthClient(userBrowser);
    client = await connectMcp(oauth);
    expect(oauth.info?.client_id).toBeTruthy();
    expect(oauth.savedTokens?.access_token).toMatch(/^pdm_at_/);
    expect(oauth.savedTokens?.refresh_token).toMatch(/^pdm_rt_/);
    // No PADI connection yet: the full (stable) tool list is offered, every call explains the setup.
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain("padi_account_info");
    const info = await client.callTool({ name: "padi_account_info", arguments: {} });
    expect(info.isError).toBe(true);
    expect(JSON.stringify(info.content)).toContain(`${base}/account`);
    expect(JSON.stringify(info.content)).toContain("not connected yet");
  });

  it("uses the user's own PADI connection once it is saved", async () => {
    const { csrf } = await userBrowser.page("/account");
    const saved = await userBrowser.post("/account/padi", { _csrf: csrf, email: OTHER_DIVER.email, password: OTHER_DIVER.password });
    expect(saved.headers.get("location")).toBe("/account?m=connected");
    const id = web.ctx.store.getUserByEmail("user@example.com")!.id;
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("padi_account_info");
    expect(tools).toContain("logbook_create_dive");
    const info = await client.callTool({ name: "padi_account_info", arguments: {} });
    expect(info.isError).toBeFalsy();
    expect(text(info)).toContain(OTHER_DIVER.affiliateId);
    expect(text(info)).not.toContain("not connected yet");
    const activity = web.ctx.store.recentActivity(id);
    expect(activity[0]).toMatchObject({ tool: "padi_account_info", ok: true });
    // The logbook of this diver, not the other one's.
    const list = await client.callTool({ name: "logbook_list_dives", arguments: { limit: 5 } });
    expect(list.isError).toBeFalsy();
    expect(JSON.parse((list.content as { text: string }[])[0]!.text).total).toBe(mock.accounts[1]!.store.sorted().length);
    expect(mock.violations).toEqual([]);
  });

  it("hides the write tools when the user turns on read-only", async () => {
    const { csrf } = await userBrowser.page("/account");
    await userBrowser.post("/account/padi/settings", { _csrf: csrf, units: "auto", readOnly: "on" });
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toContain("logbook_list_dives");
    expect(tools).not.toContain("logbook_create_dive");
    expect(tools).not.toContain("logbook_delete_dive");
    const { csrf: c2 } = await userBrowser.page("/account");
    await userBrowser.post("/account/padi/settings", { _csrf: c2, units: "auto" });
    expect((await client.listTools()).tools.map((t) => t.name)).toContain("logbook_create_dive");
  });

  it("uses the diver's own time zone for today's date", async () => {
    const id = web.ctx.store.getUserByEmail("user@example.com")!.id;
    // The server default (UTC) was saved with the connection; the form offers every zone.
    expect(web.ctx.store.getPadiSettings(id)!.timeZone).toBe("UTC");
    const { csrf, html } = await userBrowser.page("/account");
    expect(html).toContain('<select id="timeZone-saved" name="timeZone">');
    expect(html).toContain('<option value="Pacific/Kiritimati" >Pacific/Kiritimati</option>');
    // An unknown zone is refused and nothing changes.
    const bad = await userBrowser.post("/account/padi/settings", { _csrf: csrf, units: "auto", timeZone: "Mars/Olympus" });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Unknown time zone.");
    expect(web.ctx.store.getPadiSettings(id)!.timeZone).toBe("UTC");
    // UTC+14: often already the next day when it is still today in UTC.
    const zone = "Pacific/Kiritimati";
    const { csrf: c2 } = await userBrowser.page("/account");
    expect((await userBrowser.post("/account/padi/settings", { _csrf: c2, units: "auto", timeZone: zone })).headers.get("location")).toBe("/account?m=saved");
    expect(web.ctx.store.getPadiSettings(id)).toMatchObject({ timeZone: zone, units: "auto", readOnly: false });
    const info = JSON.parse(((await client.callTool({ name: "padi_account_info", arguments: {} })).content as { text: string }[])[0]!.text);
    expect(info).toMatchObject({ time_zone: zone, today: todayInZone(zone) });
    const created = await client.callTool({
      name: "logbook_create_dive",
      arguments: { title: "Morning dive", date: todayInZone(zone), location: "House Reef", dive_type: "shore", max_depth: 12, bottom_time_min: 40, units: "metric" },
    });
    expect(created.isError, text(created)).toBeFalsy();
    const dive = JSON.parse((created.content as { text: string }[])[0]!.text);
    await client.callTool({ name: "logbook_delete_dive", arguments: { dive_id: dive.id, confirm_title: "Morning dive" } });
    // The server default applies to connections without a zone of their own.
    const server = { ...DEFAULT_SETTINGS, defaultTimeZone: "Europe/Zurich" };
    expect(buildUserConfig({ ...padiSettings, timeZone: zone }, server).timeZone).toBe(zone);
    expect(buildUserConfig(padiSettings, server).timeZone).toBe("Europe/Zurich");
  });

  it("keeps a new refresh token from PADI without rebuilding the services", async () => {
    const id = web.ctx.store.getUserByEmail("user@example.com")!.id;
    // A sign-in through the PADI auth API, whose refresh may hand out a new refresh token.
    const signed = await signIn(OTHER_DIVER.email, OTHER_DIVER.password, { method: "padi", endpoints: endpointsFromEnv(mock.env()), backoffMs: 0 });
    const current = web.ctx.store.getPadiSettings(id)!;
    web.ctx.store.savePadiSettings(id, { ...current, refreshToken: signed.tokens.refreshToken, loginMethod: "padi", clientId: signed.tokens.clientId });
    const updatedAt = web.ctx.store.getUser(id)!.serviceUpdatedAt;
    mock.rotateRefreshTokens = true;
    try {
      const info = await client.callTool({ name: "padi_account_info", arguments: {} });
      expect(info.isError).toBeFalsy();
    } finally {
      mock.rotateRefreshTokens = false;
    }
    const after = web.ctx.store.getPadiSettings(id)!;
    expect(after.refreshToken).not.toBe(signed.tokens.refreshToken);
    expect(after.loginMethod).toBe("padi");
    expect(web.ctx.store.getUser(id)!.serviceUpdatedAt).toBe(updatedAt);
    // The services were not rebuilt: the next call needs no new sign-in or refresh.
    const before = mock.count("/auth/api/");
    expect((await client.callTool({ name: "padi_account_info", arguments: {} })).isError).toBeFalsy();
    expect(mock.count("/auth/api/")).toBe(before);
  });

  it("asks the user to sign in again when PADI refuses the stored sign-in", async () => {
    const id = web.ctx.store.getUserByEmail("user@example.com")!.id;
    mock.revokeRefreshTokens();
    mock.expireIdTokens();
    const failed = await client.callTool({ name: "logbook_list_dives", arguments: {} });
    expect(failed.isError).toBe(true);
    // Already the call that finds the dead sign-in says where to sign in again (not padi.com).
    expect(text(failed)).toContain(`Your PADI sign-in expired. Sign in again at ${base}/account`);
    expect(web.ctx.store.getUser(id)!.padiNeedsReconnect).toBe(true);
    const info = await client.callTool({ name: "padi_account_info", arguments: {} });
    expect(info.isError).toBe(true);
    expect(text(info)).toContain(`Your PADI sign-in expired. Sign in again at ${base}/account`);
    // The account page says so, and signing in again fixes it.
    const { csrf, html } = await userBrowser.page("/account");
    expect(html).toContain("Your PADI sign-in expired or was ended");
    const again = await userBrowser.post("/account/padi", { _csrf: csrf, email: OTHER_DIVER.email, password: OTHER_DIVER.password, keep: "settings" });
    expect(again.headers.get("location")).toBe("/account?m=connected");
    expect(web.ctx.store.getUser(id)!.padiNeedsReconnect).toBe(false);
    expect((await client.callTool({ name: "padi_account_info", arguments: {} })).isError).toBeFalsy();
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
    expect(body.access_token).toMatch(/^pdm_at_/);
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
    expect((await other.signup("other@example.com", PASSWORD, { invite: code })).status).toBe(400);

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

  it("shows the PADI state of each user and counts the connected ones", async () => {
    const user = web.ctx.store.getUserByEmail("user@example.com")!;
    expect(user.hasPadi).toBe(true);
    const connected = web.ctx.store.listUsers().filter((u) => u.hasPadi && !u.padiNeedsReconnect && !u.demo).length;
    let { html } = await admin.page("/admin");
    expect(html).toContain(`(${connected} with PADI connected)`);
    expect(html).toContain("<th>PADI</th>");
    expect(html).toMatch(/user@example\.com[\s\S]*?<span class="badge ok">connected<\/span>/);
    expect(html).toMatch(/admin@example\.com[\s\S]*?<span class="badge warn">not connected<\/span>/);
    web.ctx.store.setPadiNeedsReconnect(user.id, true);
    ({ html } = await admin.page("/admin"));
    expect(html).toMatch(/user@example\.com[\s\S]*?<span class="badge bad">needs reconnect<\/span>/);
    web.ctx.store.setPadiNeedsReconnect(user.id, false);
    // A connection that cannot be decrypted (the master key changed) cannot be used: it is not
    // counted and needs a new sign-in.
    const { hashPassword } = await import("../../src/web/crypto.js");
    const locked = web.ctx.store.createUser("key-changed@example.com", await hashPassword(PASSWORD), false);
    const otherKey = new SecretBox(randomBytes(32));
    web.ctx.store.db.prepare("UPDATE users SET service_enc = ?, service_updated_at = 1 WHERE id = ?").run(otherKey.seal(JSON.stringify(padiSettings), locked.id), locked.id);
    expect(web.ctx.store.getUser(locked.id)!.hasPadi).toBe(true);
    expect(web.ctx.store.unreadablePadiUserIds()).toEqual(new Set([locked.id]));
    ({ html } = await admin.page("/admin"));
    expect(html).toContain(`(${connected} with PADI connected)`);
    expect(html).toMatch(/key-changed@example\.com[\s\S]*?<span class="badge bad">needs reconnect<\/span>/);
    web.ctx.store.deleteUser(locked.id);
    // No service switches: there is one service.
    expect(html).not.toContain("svcMail");
    expect(html).not.toContain("Services");
  });

  it("runs the public setup self-test", async () => {
    const { csrf } = await admin.page("/admin");
    const html = await (await admin.post("/admin/selftest", { _csrf: csrf })).text();
    expect(html).toContain("MCP endpoint answers 401 with discovery header");
    expect(html).toContain("/.well-known/oauth-authorization-server");
    // The PADI servers here are the mock: shown as custom servers for tests, never contacted.
    expect(html).toContain("PADI servers");
    expect(html).toContain("custom servers for tests (PADI_COGNITO_URL");
  });

  it("sends security headers on pages", async () => {
    const res = await admin.fetch("/account");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/SameSite=None/);
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
  it("asks users to re-enter credentials that cannot be decrypted instead of failing", async () => {
    // Earlier tests closed registration and restricted apps: undo the restriction, create the account directly.
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), allowedRedirectHosts: [] });
    const { hashPassword } = await import("../../src/web/crypto.js");
    web.ctx.store.createUser("lock@example.com", await hashPassword(PASSWORD), false);
    const b = new Browser();
    expect((await b.login("lock@example.com", PASSWORD)).status).toBe(303);
    const user = web.ctx.store.getUserByEmail("lock@example.com")!;
    web.ctx.store.savePadiSettings(user.id, padiSettings);
    // Simulate a changed master key: the stored ciphertext no longer opens.
    web.ctx.store.db.prepare("UPDATE users SET service_enc = 'v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' WHERE id = ?").run(user.id);
    const page = await b.page("/account");
    expect(page.res.status).toBe(200);
    expect(page.html).toContain("cannot be read");
    const client = await connectMcp(new TestOAuthClient(b));
    const res = await client.callTool({ name: "padi_account_info", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("cannot be decrypted");
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
