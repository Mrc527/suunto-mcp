/**
 * The consent page against consent phishing: it recognizes well-known AI apps by where the answer
 * goes, treats answers to localhost or an app's own scheme as staying on this device, and warns
 * about any other address, where Allow only works after a box is ticked.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../src/web/crypto.js";
import { classifyReturn, displayName } from "../../src/web/known-apps.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, setBase } from "../helpers/web-client.js";

describe("where the answer goes", () => {
  it("recognizes well-known apps by their exact https redirect address only", () => {
    expect(classifyReturn("https://claude.ai/api/mcp/auth_callback")).toEqual({ kind: "known", app: "Claude", host: "claude.ai" });
    expect(classifyReturn("https://CLAUDE.AI/api/mcp/auth_callback")).toMatchObject({ kind: "known", app: "Claude" });
    expect(classifyReturn("https://claude.com/api/mcp/auth_callback")).toMatchObject({ kind: "known", app: "Claude" });
    expect(classifyReturn("https://chatgpt.com/connector_platform_oauth_redirect")).toMatchObject({ kind: "known", app: "ChatGPT" });
    expect(classifyReturn("https://chatgpt.com/connector/oauth/abc_123")).toMatchObject({ kind: "known", app: "ChatGPT" });
    expect(classifyReturn("https://callback.mistral.ai/v1/integrations_auth/oauth2_callback")).toMatchObject({ kind: "known", app: "Le Chat (Mistral)" });
    expect(classifyReturn("https://enterprise.perplexity.ai/rest/connections/oauth_callback")).toMatchObject({ kind: "known", app: "Perplexity" });
    for (const other of [
      "https://claude.ai/cb",
      "https://claude.ai/api/mcp/auth_callback/x",
      "https://claude.ai:8443/api/mcp/auth_callback",
      "https://user@claude.ai/api/mcp/auth_callback",
      "https://claude.ai@evil.example/api/mcp/auth_callback",
      "https://claude.ai.evil.example/api/mcp/auth_callback",
      "https://sub.claude.ai/api/mcp/auth_callback",
      "https://evil.example/claude.ai",
      "https://xn--clude-6qa.ai/api/mcp/auth_callback",
      "https://chatgpt.com/connector/oauth/a/b",
      "https://chat.mistral.ai/cb",
      "https://vscode.dev/other",
    ]) {
      expect(classifyReturn(other).kind, other).toBe("unknown");
    }
  });

  it("treats localhost and an app's own scheme as this device", () => {
    expect(classifyReturn("http://localhost:33418/callback")).toEqual({ kind: "device", host: "localhost:33418" });
    expect(classifyReturn("http://127.0.0.1:8765/")).toEqual({ kind: "device", host: "127.0.0.1:8765" });
    expect(classifyReturn("http://[::1]:5000/cb")).toEqual({ kind: "device", host: "[::1]:5000" });
    expect(classifyReturn("com.example.app:/oauth")).toEqual({ kind: "device", host: "com.example.app" });
    // VS Code's redirect page passes the answer to VS Code on this computer.
    expect(classifyReturn("https://vscode.dev/redirect")).toEqual({ kind: "device", host: "vscode.dev" });
    // An app's own name does not matter here.
    expect(classifyReturn("http://localhost:1/cb", "Claude Code")).toEqual({ kind: "device", host: "localhost:1" });
  });

  it("notices an unknown app that uses a well-known name", () => {
    expect(classifyReturn("https://evil.example/cb", "Claude")).toEqual({ kind: "unknown", host: "evil.example", claims: "Claude" });
    expect(classifyReturn("https://evil.example/cb", "ChatGPT helper")).toMatchObject({ claims: "ChatGPT" });
    expect(classifyReturn("https://evil.example/cb", "Visual Studio Code")).toMatchObject({ claims: "VS Code" });
    expect(classifyReturn("https://evil.example/cb", "le-chat")).toMatchObject({ claims: "Le Chat (Mistral)" });
    // Lookalike letters, hidden characters, digits for letters and joined words.
    for (const lookalike of ["\u0421laude", "Clau\u200Bde", "Clau\u00ADde", "\u{1D402}laude", "C1aude", "ClaudeAI", "Chat\u200BGPT", "\u{1D400}nthropic", "Cla\u0301ude"]) {
      expect(classifyReturn("https://evil.example/cb", lookalike).kind, JSON.stringify(lookalike)).toBe("unknown");
      expect(classifyReturn("https://evil.example/cb", lookalike), JSON.stringify(lookalike)).toHaveProperty("claims");
    }
    expect(classifyReturn("https://n8n.example.org/rest/oauth2-credential/callback", "n8n")).toEqual({ kind: "unknown", host: "n8n.example.org" });
    expect(classifyReturn("https://app.example.org/cb", "Helper")).toEqual({ kind: "unknown", host: "app.example.org" });
    // Plain http to a known host is not the app.
    expect(classifyReturn("http://claude.ai/api/mcp/auth_callback", "Claude").kind).toBe("unknown");
  });

  it("shows an app's name without hidden or direction-changing characters", () => {
    expect(displayName("Helper\u202E moc.live\u200B ")).toBe("Helper moc.live");
  });
});

describe("consent page", () => {
  let web: WebApp;
  let server: Server;
  let base = "";
  const user = new Browser();

  beforeAll(async () => {
    server = createServer();
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    setBase(base);
    web = await createWebApp({
      publicUrl: new URL(base),
      host: "127.0.0.1",
      port: 0,
      dataDir: ":memory:",
      operator: { PADI_COGNITO_URL: "http://127.0.0.1:1/", PADI_AUTH_URL: "http://127.0.0.1:1/auth/api", PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook" },
      log: () => {},
    });
    server.on("request", web.app);
    expect((await user.signup("owner@example.com", "correct horse battery")).status).toBe(303);
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await web.close();
  });

  /** Register an app and open its consent page: the page and its request id. */
  const consentFor = async (redirect: string, name: string) => {
    const reg = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: name, redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    });
    expect(reg.status).toBe(201);
    const { client_id } = (await reg.json()) as { client_id: string };
    const query = new URLSearchParams({ client_id, redirect_uri: redirect, response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", state: "s", resource: `${base}/mcp` });
    const res = await user.fetch(`/authorize?${query}`);
    expect(res.status).toBe(302);
    const page = await user.page(res.headers.get("location")!);
    expect(page.res.status).toBe(200);
    return { ...page, request: page.html.match(/name="request" value="([^"]+)"/)![1]! };
  };

  it("shows a recognized app with no extra step", async () => {
    const { html } = await consentFor("https://claude.ai/api/mcp/auth_callback", "Claude");
    expect(html).toContain("An app that calls itself <strong><bdi>Claude</bdi></strong>");
    expect(html).toContain("Recognized app: your answer goes to <strong>Claude</strong> at <code>claude.ai</code>.");
    expect(html).not.toContain('name="trust"');
    expect(html).not.toContain("We don&#39;t recognize this app");
  });

  it("says what the app may do with the logbook: everything, or only read", async () => {
    const owner = web.ctx.store.getUserByEmail("owner@example.com")!;
    // No PADI connection yet: a link to connect it that comes back here.
    let page = await consentFor("https://claude.ai/api/mcp/auth_callback", "Claude");
    expect(page.html).toContain("Allow access to your PADI logbook?");
    expect(page.html).toContain("svc-icon svc-logbook svc-sm");
    expect(page.html).toContain("svc-icon svc-cards svc-sm");
    expect(page.html).toContain("log new dives, change and delete dives, and send a dive to a PADI Pro for verification");
    expect(page.html).toContain("See your PADI certification cards");
    expect(page.html).toContain(`You have not connected your PADI account yet. <a href="/account?next=${encodeURIComponent(`/oauth/consent?request=${page.request}`)}">Connect it now</a>`);
    // Connected and read-only: only the reading line, and no notice.
    web.ctx.store.savePadiSettings(owner.id, {
      email: "owner.diver@example.com",
      refreshToken: "rt-invented-owner",
      loginMethod: "cognito",
      clientId: "test-client",
      affiliateId: "10000006",
      units: "auto",
      readOnly: true,
      connectedAt: Date.now(),
    });
    page = await consentFor("https://claude.ai/api/mcp/auth_callback", "Claude");
    expect(page.html).toContain("See your dives and statistics, without changing anything");
    expect(page.html).not.toContain("change and delete dives");
    expect(page.html).not.toContain("You have not connected your PADI account yet.");
    // The administrator's read-only switch wins.
    web.ctx.store.savePadiPreferences(owner.id, { units: "auto", readOnly: false });
    expect((await consentFor("https://claude.ai/api/mcp/auth_callback", "Claude")).html).toContain("change and delete dives");
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), forceReadOnly: true });
    expect((await consentFor("https://claude.ai/api/mcp/auth_callback", "Claude")).html).toContain("without changing anything");
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), forceReadOnly: false });
    web.ctx.store.savePadiSettings(owner.id, undefined);
  });

  it("says an answer to localhost stays on this device, and allows it without the box", async () => {
    const page = await consentFor("http://127.0.0.1:8765/callback", "Claude Code");
    expect(page.html).toContain("Your answer stays on this device (<code>127.0.0.1:8765</code>)");
    expect(page.html).not.toContain('name="trust"');
    const done = await user.post("/oauth/consent", { _csrf: page.csrf, request: page.request, decision: "allow" });
    expect(done.status).toBe(303);
    expect(done.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:8765\/callback\?code=/);
  });

  it("warns about an unknown app, and only allows it once the box is ticked", async () => {
    const page = await consentFor("https://app.example.org/cb", "Helper");
    expect(page.html).toContain("We don&#39;t recognize this app");
    expect(page.html).toContain("If you allow it, <code>app.example.org</code> gets access to your PADI logbook.");
    expect(page.html).toContain('<input type="checkbox" name="trust" value="1" required>');
    expect(page.html).toMatch(/<button type="submit" name="decision" value="deny" class="secondary block" formnovalidate>/);
    expect(page.html).not.toContain("never sends you to");
    expect(page.res.headers.get("content-security-policy")).toContain("form-action 'self' https://app.example.org");

    // Without the box: the page again, with an error, and nothing sent to the app.
    const refused = await user.post("/oauth/consent", { _csrf: page.csrf, request: page.request, decision: "allow" });
    expect(refused.status).toBe(400);
    const again = await refused.text();
    expect(again).toContain("To allow this app, first tick the box to confirm that you trust it.");
    expect(again).toContain('name="trust"');
    expect(refused.headers.get("content-security-policy")).toContain("form-action 'self' https://app.example.org");
    // Any other value is not a tick either.
    expect((await user.post("/oauth/consent", { _csrf: page.csrf, request: page.request, decision: "allow", trust: "on" })).status).toBe(400);

    const allowed = await user.post("/oauth/consent", { _csrf: page.csrf, request: page.request, decision: "allow", trust: "1" });
    expect(allowed.status).toBe(303);
    expect(allowed.headers.get("location")).toMatch(/^https:\/\/app\.example\.org\/cb\?code=/);
  });

  it("keeps the language menu on the same request when the page is shown again", async () => {
    const page = await consentFor("https://app.example.org/cb", "Helper");
    const refused = await user.post("/oauth/consent", { _csrf: page.csrf, request: page.request, decision: "allow" });
    expect(await refused.text()).toContain(`href="/oauth/consent?request=${page.request}&amp;lang=it"`);
  });

  it("gives an approved answer only to the person who approved it", async () => {
    // Someone else with an account starts a connection and sends the consent link to the owner.
    web.ctx.store.createUser("sender@example.com", await hashPassword("correct horse battery"), false);
    const sender = new Browser();
    expect((await sender.login("sender@example.com", "correct horse battery")).status).toBe(303);
    const reg = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Tool", redirect_uris: ["http://127.0.0.1:9/callback"], token_endpoint_auth_method: "none" }),
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const query = new URLSearchParams({ client_id, redirect_uri: "http://127.0.0.1:9/callback", response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", resource: `${base}/mcp` });
    const link = (await sender.fetch(`/authorize?${query}`)).headers.get("location")!;
    expect(link).toMatch(/^\/oauth\/consent\?request=/);

    // The owner allows it.
    const page = await user.page(link);
    const request = page.html.match(/name="request" value="([^"]+)"/)![1]!;
    const allowed = await user.post("/oauth/consent", { _csrf: page.csrf, request, decision: "allow" });
    const answer = allowed.headers.get("location")!;
    expect(answer).toMatch(/\?code=/);

    // The sender cannot get the owner's answer from the link, by opening it or by allowing again.
    const reopened = await sender.fetch(link);
    expect(reopened.status).toBe(400);
    expect(reopened.headers.get("location")).toBeNull();
    expect(await reopened.text()).not.toContain("code=");
    const { csrf } = await sender.page("/account");
    const again = await sender.post("/oauth/consent", { _csrf: csrf, request, decision: "allow" });
    expect(again.headers.get("location")).toBeNull();
    expect(await again.text()).not.toContain("code=");
    // Nor turn it into a refusal.
    expect((await sender.post("/oauth/consent", { _csrf: csrf, request, decision: "deny" })).headers.get("location")).toBe("/account?m=denied");

    // The owner reopening it gets the same answer (a double submit).
    const mine = await user.fetch(link);
    expect(mine.status).toBe(303);
    expect(mine.headers.get("location")).toBe(answer);
  });

  it("lets people say no without ticking anything", async () => {
    const page = await consentFor("https://app.example.org/cb", "Helper");
    const denied = await user.post("/oauth/consent", { _csrf: page.csrf, request: page.request, decision: "deny" });
    expect(denied.status).toBe(303);
    const target = new URL(denied.headers.get("location")!);
    expect(target.origin).toBe("https://app.example.org");
    expect(target.searchParams.get("error")).toBe("access_denied");
  });

  it("points out an unknown app that uses a well-known name, and escapes what it sent", async () => {
    const page = await consentFor("https://evil.example/cb", 'Claude <img src=x onerror="alert(1)">');
    expect(page.html).toContain("It uses the name of Claude, but Claude never sends you to <code>evil.example</code>.");
    expect(page.html).toContain("<bdi>Claude &lt;img");
    expect(page.html).not.toContain("<img src=x");
    expect(page.html).toContain("&lt;img src=x");
  });
});
