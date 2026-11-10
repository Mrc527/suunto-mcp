/**
 * Every text a person sees comes from the translation catalogs.
 *
 * Italian is replaced by a marked copy of English (every message wrapped in ⟦ ⟧). All pages are
 * rendered in that "language" and their visible text and text attributes are checked: anything
 * outside the marks is a text that would stay English in every language.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOGS, type MessageKey } from "../../src/web/i18n/index.js";
import { en } from "../../src/web/i18n/en/index.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { MOCK_ACCOUNT, startMockPadi, type MockPadi } from "../helpers/mock-padi.js";
import { Browser, setBase } from "../helpers/web-client.js";

let web: WebApp;
let server: Server;
let mock: MockPadi;
let base = "";
const PASSWORD = "correct horse battery";
const admin = new Browser();
const saved = CATALOGS.it;

beforeAll(async () => {
  const marked: Partial<Record<MessageKey, string>> = {};
  for (const [key, text] of Object.entries(en)) marked[key as MessageKey] = `⟦${text}⟧`;
  CATALOGS.it = marked;
  mock = await startMockPadi();
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    // The mock PADI: nothing is ever sent to PADI.
    operator: mock.env(),
    log: () => {},
  });
  server.on("request", web.app);
  admin.jar.set("pdm_lang", "it");
  expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
});

afterAll(async () => {
  CATALOGS.it = saved;
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
  await mock.close();
});

/** Texts that are the same in every language. */
const ALLOWED = [
  /^[\s\d.,:;!?()[\]{}<>/\\|+*=#%&@'"`~^_·-]*$/, // numbers and punctuation (· in page titles)
  /^\s*(PADI|MCP for PADI|MCP|OAuth|HTTP|JSON|YAML|SMTP|UTC|ms|ok)\s*$/,
  /^\s*(English|Italiano|Deutsch|Français|Español|简体中文)\s*$/, // the language menu names each language in itself
  // Names of AI apps (not translated)
  /^\s*(Claude|Claude Code|ChatGPT|Gemini|Gemini CLI|Le Chat \(Mistral\)|Perplexity|Codex|Cursor|VS Code|VS Code Insiders|Visual Studio|GitHub Copilot CLI|Windsurf \(Devin Desktop\)|Zed|Kiro|Cline|Warp|Raycast|LM Studio|Goose|Jan|Msty Studio|Open WebUI|LibreChat|n8n|JetBrains IDEs)\s*$/,
  /^\s*[\w ]+:\s*~?\/[\w./-]+\s*$/, // "Junie: ~/.junie/mcp/mcp.json"
  /^\s*chat\.mistral\.ai\s*$/,
  /^\s*[\w.+-]+@[\w.-]+\s*$/, // e-mail addresses
  /^\s*[\w-]+(\.[\w-]+)+(\s+[\w-]+(\.[\w-]+)+)*\s*$/, // domain names (example.com, "claude.ai claude.com")
  /^\s*(linux|darwin|win32|freebsd)\s*$/, // the server's platform on the admin page
  /^\s*[A-Z?]{1,2}\s*$/, // initials in the avatar
  /^\s*https?:\/\/\S+\s*$/, // addresses
  /^\s*\d{4}-\d\d-\d\d \d\d:\d\d( UTC)?\s*$/, // dates
  /^\s*[A-Z][A-Za-z_]+(\/[A-Za-z0-9_+-]+)+\s*$/, // time zones (Europe/Rome)
  /^\s*(UTC|GMT)\s*$/,
  /^\s*River Tester\s*$/, // the diver's name from (mock) PADI: data, not a text
];

/** Visible text runs and text attributes that are not inside ⟦ ⟧. */
function unmarked(html: string): string[] {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    // Commands, snippets and addresses are shown as they are.
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<pre[\s\S]*?<\/pre>/gi, " ")
    .replace(/<textarea[\s\S]*?<\/textarea>/gi, " ")
    // The brand name in the top bar.
    .replace(/<span class="brand-name">[\s\S]*?<\/span>/gi, " ")
    // A line-break hint inside a word (the e-mail address in the profile header).
    .replace(/<wbr>/gi, "");
  const problems: string[] = [];
  // Text attributes.
  for (const m of body.matchAll(/\s(title|aria-label|placeholder|alt|data-confirm)="([^"]*)"/g)) {
    const value = m[2]!.replace(/&[a-z#0-9]+;/gi, "'");
    if (value && !value.includes("⟦") && !ALLOWED.some((re) => re.test(value))) problems.push(`${m[1]}="${value}"`);
  }
  // Text between tags, with marked spans (which may contain tags, and other marked spans: a
  // button name inside a sentence) removed from the inside out.
  let unwrapped = body;
  for (let previous = ""; previous !== unwrapped; ) {
    previous = unwrapped;
    unwrapped = unwrapped.replace(/⟦[^⟦⟧]*⟧/g, " ");
  }
  const text = unwrapped
    .replace(/<[^>]*>/g, "\n")
    .replace(/&[a-z#0-9]+;/gi, " ");
  for (const run of text.split("\n")) {
    const trimmed = run.trim();
    if (trimmed && !ALLOWED.some((re) => re.test(trimmed))) problems.push(trimmed);
  }
  return [...new Set(problems)];
}

async function check(browser: Browser, path: string): Promise<string[]> {
  const res = await browser.fetch(path, { headers: { accept: "text/html" } });
  const html = await res.text();
  expect(html, path).toContain('<html lang="it">');
  return unmarked(html);
}

describe("every visible text is translated", () => {
  it("start, sign-in, sign-up and error pages", async () => {
    const visitor = new Browser();
    visitor.jar.set("pdm_lang", "it");
    for (const path of ["/", "/login", "/signup", "/does-not-exist"]) expect(await check(visitor, path), path).toEqual([]);
  });

  it("privacy policy and terms of use", async () => {
    const visitor = new Browser();
    visitor.jar.set("pdm_lang", "it");
    for (const path of ["/privacy", "/terms"]) {
      expect(await check(visitor, path), path).toEqual([]);
      // Signed in, the page also has the menu.
      expect(await check(admin, path), `${path} (signed in)`).toEqual([]);
    }
  });

  it("account pages", async () => {
    // Not connected yet: the sign-in form.
    expect(await check(admin, "/account")).toEqual([]);
    // A form error.
    const { csrf } = await admin.page("/account");
    const missing = await admin.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email, password: "" });
    expect(missing.status).toBe(400);
    expect(unmarked(await missing.text())).toEqual([]);
    // Connected with "Save and test" (more of the page is shown: the dive count, settings, reconnect).
    const saved = await admin.post("/account/padi", { _csrf: csrf, email: MOCK_ACCOUNT.email, password: MOCK_ACCOUNT.password });
    expect(saved.headers.get("location")).toBe("/account?m=connected");
    for (const path of ["/account", "/account?m=connected", "/account?m=logbookfailed", "/account?m=saved", "/account?m=removed", "/account/connections", "/account/security"]) {
      expect(await check(admin, path), path).toEqual([]);
    }
    // The sign-in expired.
    const id = web.ctx.store.getUserByEmail("admin@example.com")!.id;
    web.ctx.store.setPadiNeedsReconnect(id, true);
    expect(await check(admin, "/account")).toEqual([]);
    web.ctx.store.setPadiNeedsReconnect(id, false);
  });

  it("admin page", async () => {
    expect(await check(admin, "/admin")).toEqual([]);
  });

  it("demo account: admin page, account page and consent page", async () => {
    const { csrf } = await admin.page("/admin");
    const created = await admin.post("/admin/demo", { _csrf: csrf, email: "reviewer@example.com" });
    const html = await created.text();
    expect(unmarked(html)).toEqual([]);
    const password = html.match(/<code id="secret">([^<]+)<\/code>/)![1]!;
    // The list of demo accounts (with and without data in memory) and the users table.
    expect(await check(admin, "/admin")).toEqual([]);
    const reviewer = new Browser();
    reviewer.jar.set("pdm_lang", "it");
    expect((await reviewer.login("reviewer@example.com", password)).status).toBe(303);
    for (const path of ["/account", "/account?m=saved"]) expect(await check(reviewer, path), path).toEqual([]);
    const id = web.ctx.store.getUserByEmail("reviewer@example.com")!.id;
    web.ctx.pool.get(web.ctx.store.getUser(id)!);
    expect(await check(admin, "/admin?m=demoreset")).toEqual([]);
    const reg = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "app.example", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const query = new URLSearchParams({ client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", resource: `${base}/mcp` });
    const consent = (await reviewer.fetch(`/authorize?${query}`)).headers.get("location")!;
    expect(await check(reviewer, consent)).toEqual([]);
    // A demo account's attempt to connect a PADI account (the error page).
    const page = await reviewer.page("/account");
    const refused = await reviewer.post("/account/padi", { _csrf: page.csrf, email: "x@example.com", password: "invented-password" });
    expect(unmarked(await refused.text())).toEqual([]);
    web.ctx.demo.forget(id);
  });

  it("page where an AI app asks for access", async () => {
    const reg = await fetch(`${base}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A name the check allows (a domain), so only our own texts are checked.
      body: JSON.stringify({ client_name: "app.example", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
    });
    expect(reg.status).toBe(201);
    const { client_id } = (await reg.json()) as { client_id: string };
    const query = new URLSearchParams({ client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", state: "s", resource: `${base}/mcp` });
    const res = await admin.fetch(`/authorize?${query}`);
    const consent = res.headers.get("location")!;
    expect(consent).toMatch(/^\/oauth\/consent\?request=/);
    expect(await check(admin, consent)).toEqual([]);

    // An unknown app that uses a well-known name (warning and box), and an app on this device.
    for (const redirect of ["https://app.example.org/cb", "http://127.0.0.1:8765/callback"]) {
      const other = await fetch(`${base}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: "Claude", redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }),
      });
      const { client_id: otherId } = (await other.json()) as { client_id: string };
      const q = new URLSearchParams({ client_id: otherId, redirect_uri: redirect, response_type: "code", code_challenge: "x".repeat(43), code_challenge_method: "S256", resource: `${base}/mcp` });
      const page = (await admin.fetch(`/authorize?${q}`)).headers.get("location")!;
      expect(await check(admin, page), redirect).toEqual([]);
      if (redirect.startsWith("https:")) {
        // Allow without the box: the page again, with an error.
        const { csrf, html } = await admin.page(page);
        const request = html.match(/name="request" value="([^"]+)"/)![1]!;
        const refused = await admin.post("/oauth/consent", { _csrf: csrf, request, decision: "allow" });
        expect(refused.status).toBe(400);
        expect(unmarked(await refused.text())).toEqual([]);
      }
    }
  });

  it("form errors", async () => {
    const visitor = new Browser();
    visitor.jar.set("pdm_lang", "it");
    const { csrf } = await visitor.page("/login");
    const res = await visitor.post("/login", { _csrf: csrf, email: "nobody@example.com", password: "wrong password!!" });
    expect(unmarked(await res.text())).toEqual([]);
  });
});
