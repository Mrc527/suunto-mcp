/**
 * The privacy policy (/privacy) and the terms of use (/terms): the pages, the links to them on
 * every page, and the facts the privacy policy states, checked against what the code does. When
 * one of the "matches the code" tests fails, change the policy (i18n/en/legal.ts) with the code.
 */
import { readFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CACHE_MAX_BYTES, LONG_TTL_MS, SHORT_TTL_MS } from "../../src/activity/cache.js";
import { hashPassword } from "../../src/web/crypto.js";
import authEn from "../../src/web/i18n/en/auth.js";
import commonEn from "../../src/web/i18n/en/common.js";
import homeEn from "../../src/web/i18n/en/home.js";
import legalEn from "../../src/web/i18n/en/legal.js";
import { CATALOGS, HTML_LANG, LOCALES } from "../../src/web/i18n/index.js";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR_NAME } from "../../src/web/operator.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, setBase } from "../helpers/web-client.js";

let web: WebApp;
let server: Server;
let base = "";
const PASSWORD = "correct horse battery";
const admin = new Browser();
const DAY = 86_400_000;
/** Never reach real Suunto from tests: closed local ports. */
const CLOSED = { SUUNTO_OAUTH_URL: "http://127.0.0.1:1", SUUNTO_API_URL: "http://127.0.0.1:1" };
/** GET a page with the given Host header. */
function pageAs(host: string, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { host, accept: "text/html" } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.end();
  });
}
/** An invented Suunto connection (the fields of SuuntoAccountSettings in store.ts). */
const suuntoSettings = (username: string, refreshToken: string) => ({
  username,
  refreshToken,
  accessToken: "at-invented-access",
  accessTokenExpiresAt: Date.now() + 3_600_000,
  clientId: "test-client",
  units: "metric" as const,
  readOnly: false,
  timeZone: "Europe/Zurich",
  connectedAt: Date.now(),
});

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({ publicUrl: new URL(base), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: CLOSED, log: () => {} });
  server.on("request", web.app);
  expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
});

/** A page as a browser gets it (a fresh visitor unless a signed-in browser is given). */
async function get(path: string, lang = "en", browser = new Browser()): Promise<{ res: Response; html: string }> {
  const res = await browser.fetch(path, { headers: { accept: "text/html", "accept-language": lang } });
  return { res, html: await res.text() };
}

const MAILTO = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;
const FOOTER_LINKS = `<nav class="links" aria-label="Legal and contact"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:${CONTACT_EMAIL}">Contact</a></nav>`;
const count = (html: string, needle: string) => html.split(needle).length - 1;
/** The date of the last change as the English pages write it ("November 8, 2026"). */
const UPDATED_EN = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${LEGAL_UPDATED}T00:00:00Z`));

describe("privacy policy and terms of use", () => {
  it("are open to everyone, with a title, the date of the last change and a table of contents", async () => {
    for (const [path, title] of [
      ["/privacy", "Privacy policy"],
      ["/terms", "Terms of use"],
    ] as const) {
      const { res, html } = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type"), path).toContain("text/html");
      expect(html, path).toContain(`<title>${title} · MCP for Suunto</title>`);
      expect(html, path).toContain(`<h1>${title}</h1>`);
      expect(html, path).toContain(`<p>Last updated: ${UPDATED_EN}</p>`);
      // Every entry of the table of contents leads to a section of the page, in the same order.
      const toc = [...(html.match(/<nav class="card legal-toc"[\s\S]*?<\/nav>/)?.[0] ?? "").matchAll(/href="#([\w-]+)"/g)].map((m) => m[1]);
      const sections = [...html.matchAll(/<section class="card" id="([\w-]+)"/g)].map((m) => m[1]);
      expect(toc.length, path).toBeGreaterThan(8);
      expect(toc, path).toEqual(sections);
      expect(html, path).toContain("If a translation differs from the English version, the English version applies.");
    }
  });

  it("are shown to signed-in people with their menu", async () => {
    for (const path of ["/privacy", "/terms"]) {
      const { res, html } = await get(path, "en", admin);
      expect(res.status, path).toBe(200);
      expect(html, path).toContain('<nav class="tabs"');
      expect(html, path).toContain("<article class=\"legal\">");
    }
  });

  it("say who is responsible and how to reach them", async () => {
    const privacy = (await get("/privacy")).html;
    expect(privacy).toContain(`MCP for Suunto at 127.0.0.1:${new URL(base).port} is run by ${OPERATOR_NAME}, Lugano, Switzerland.`);
    // Controller, security reports and rights.
    expect(count(privacy, MAILTO)).toBe(3);
    expect(privacy).toContain(`If you find a security problem, please report it to ${MAILTO}.`);
    const terms = (await get("/terms")).html;
    expect(terms).toContain(`Write to ${OPERATOR_NAME} at ${MAILTO}.`);
    expect(terms).toContain(`independent open-source project run by ${OPERATOR_NAME}, Lugano, Switzerland.`);
    expect(terms).toContain(`please report it to ${MAILTO} instead of using it.`);
    expect(terms).toContain("governed by Swiss law");
    expect(terms).toContain("It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto, Anthropic, OpenAI, Google or any other AI provider");
    expect(terms).toContain("Suunto is a registered trademark of Suunto Oy.");
    expect(terms).toContain("uses no Suunto artwork or logos");
    // Both pages also carry the trademark line in the footer.
    for (const html of [privacy, terms]) {
      expect(html).toContain("It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto. Suunto is a registered trademark of Suunto Oy.");
    }
  });

  it("say that the values are not medical advice and not for navigation or safety decisions", async () => {
    const terms = (await get("/terms")).html;
    expect(terms).toContain('<h2 id="health-title">Not medical advice</h2>');
    expect(terms).toContain("They are not medical advice and do not replace a doctor.");
    expect(terms).toContain('<h2 id="safety-title">Not for navigation or safety decisions</h2>');
    expect(terms).toContain("Do not rely on MCP for Suunto or your AI apps for navigation or safety decisions.");
    // Routes and points of interest that AI apps add are the user's responsibility.
    expect(terms).toContain("Routes and points of interest that your AI apps add to the Suunto App are your responsibility");
    expect(terms).toContain("is an independent open-source project");
  });

  it("work in every language and never use an em dash", async () => {
    for (const lang of LOCALES) {
      for (const path of ["/privacy", "/terms"]) {
        const { res, html } = await get(`${path}?lang=${lang}`);
        expect(res.status, `${lang} ${path}`).toBe(200);
        expect(html, `${lang} ${path}`).toContain(`<html lang="${HTML_LANG[lang]}">`);
        expect(html, `${lang} ${path}`).toContain(MAILTO);
        expect(html.includes("\u2014"), `${lang} ${path}: em dash`).toBe(false);
      }
    }
  });

  it("load nothing from other websites and need no inline styles or scripts", async () => {
    for (const path of ["/privacy", "/terms"]) {
      const { html } = await get(path);
      expect(html, path).not.toMatch(/\sstyle=/);
      expect(html, path).not.toMatch(/<script(?![^>]*\ssrc=)/);
      expect(html, path).not.toMatch(/(src|poster)="https?:/);
      const body = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
      // The only outside link in the text is Suunto's website, in the terms.
      expect([...new Set([...body.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]))], path).toEqual(path === "/terms" ? ["https://www.suunto.com"] : []);
    }
  });
});

describe("links to the privacy policy, the terms and the contact address", () => {
  it("are in the footer of every page", async () => {
    const pages: [string, Browser | undefined][] = [
      ["/", undefined],
      ["/login", undefined],
      ["/signup", undefined],
      ["/privacy", undefined],
      ["/terms", undefined],
      ["/does-not-exist", undefined],
      ["/account", admin],
      ["/account/connections", admin],
      ["/account/security", admin],
      ["/admin", admin],
    ];
    for (const [path, browser] of pages) {
      const { html } = await get(path, "en", browser);
      const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
      expect(footer, path).toContain(FOOTER_LINKS);
    }
  });

  it("are in the footer in every language", async () => {
    for (const lang of LOCALES) {
      const { html } = await get(`/login?lang=${lang}`);
      const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
      expect(footer, lang).toMatch(/<nav class="links" aria-label="[^"]+"><a href="\/privacy">[^<]+<\/a><a href="\/terms">[^<]+<\/a><a href="mailto:marco@visin\.ch">[^<]+<\/a><\/nav>/);
    }
  });

  it("are next to the consent checkbox of the sign-up form, opening in a new tab", async () => {
    for (const mode of ["approval", "open", "invite"] as const) {
      web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: mode });
      const { html } = await get("/signup");
      const consent = html.match(/<label class="check"><input type="checkbox" name="consent" required[\s\S]*?<\/label>/)?.[0] ?? "";
      expect(consent, mode).toContain('I agree to the <a href="/terms" target="_blank" rel="noopener">terms of use</a>');
      expect(consent, mode).toContain('have read the <a href="/privacy" target="_blank" rel="noopener">privacy policy</a>.');
    }
    web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration: "approval" });
  });

  it("are in the privacy section of the start page", async () => {
    const { html } = await get("/");
    const section = html.slice(html.indexOf('id="privacy"'), html.indexOf('id="faq"'));
    expect(section).toContain('<p class="home-privacy-more">The details are in the <a href="/privacy">privacy policy</a> and the <a href="/terms">terms of use</a>.</p>');
  });
});

describe("what the privacy policy states matches the code", () => {
  it("names every cookie the server sets, with its real lifetime", async () => {
    const visitor = new Browser();
    const login = await visitor.fetch("/login?lang=de", { headers: { accept: "text/html" } });
    const signIn = await new Browser().login("admin@example.com", PASSWORD);
    const cookies = new Map<string, number>();
    for (const c of [...login.headers.getSetCookie(), ...signIn.headers.getSetCookie()]) {
      const name = c.slice(0, c.indexOf("="));
      const maxAge = Number(c.match(/Max-Age=(\d+)/)?.[1]);
      if (maxAge > 0) cookies.set(name, maxAge);
      expect(c, name).toContain("HttpOnly");
      expect(c, name).toContain("SameSite=Lax");
    }
    expect([...cookies.keys()].sort()).toEqual(["sum_lang", "sum_pre", "sum_session"]);
    const { html } = await get("/privacy");
    const section = html.slice(html.indexOf('id="cookies"'), html.indexOf('id="children"'));
    expect(count(section, "<code>")).toBe(3);
    expect(section).toContain(`<code>sum_session</code> keeps you signed in. It is deleted when you sign out and lasts at most ${cookies.get("sum_session")! / 86_400} days.`);
    expect(section).toContain(`<code>sum_pre</code> protects the sign-in and sign-up forms against forged requests. It lasts ${cookies.get("sum_pre")! / 3600} hours.`);
    expect(section).toContain(`<code>sum_lang</code> remembers the language you chose in the language menu. It lasts ${cookies.get("sum_lang")! / 86_400} days.`);
  });

  it("uses the __Host- cookie names on an HTTPS server", async () => {
    const secure = await createWebApp({ publicUrl: new URL("https://suunto.example.com"), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: CLOSED, log: () => {} });
    try {
      const s = createServer(secure.app);
      await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
      // The server answers only for its public host name (fetch cannot send another Host header).
      const html = await pageAs("suunto.example.com", `http://127.0.0.1:${(s.address() as AddressInfo).port}/privacy`);
      await new Promise<void>((r) => s.close(() => r()));
      for (const name of ["__Host-sum_session", "__Host-sum_pre", "__Host-sum_lang"]) expect(html).toContain(`<code>${name}</code>`);
      expect(html).toContain("MCP for Suunto at suunto.example.com is run by");
    } finally {
      await secure.close();
    }
  });

  it("shows the session and token lifetimes the administrator set", async () => {
    const saved = web.ctx.store.getSettings();
    try {
      web.ctx.store.saveSettings({ ...saved, sessionTtlDays: 1, accessTokenTtlMinutes: 30, refreshTokenTtlDays: 90 });
      const { html } = await get("/privacy");
      expect(html).toContain("<strong>Browser sessions:</strong> until you sign out, at most 1 day.");
      expect(html).toContain("an access token is valid for 30 minutes. A connection ends when you revoke it, or after 90 days without use.");
      expect(html).toContain("<code>sum_session</code> keeps you signed in. It is deleted when you sign out and lasts at most 1 day.");
    } finally {
      web.ctx.store.saveSettings(saved);
    }
    const { html } = await get("/privacy");
    expect(html).toContain("at most 14 days.");
    expect(html).toContain("an access token is valid for 60 minutes");
    expect(html).toContain("after 60 days without use");
  });

  it("deletes the activity log after 90 days and unanswered access requests after 30 days", async () => {
    const { store } = web.ctx;
    const user = store.createUser("retention@example.com", await hashPassword(PASSWORD), false);
    const insert = store.db.prepare("INSERT INTO activity (user_id, at, tool, ok, duration_ms) VALUES (?, ?, ?, 1, 5)");
    insert.run(user.id, Date.now() - 91 * DAY, "suunto_list_workouts");
    insert.run(user.id, Date.now() - 89 * DAY, "suunto_get_workout");
    const old = store.createUser("old-request@example.com", "x", false, { note: "please" });
    const recent = store.createUser("new-request@example.com", "x", false, { note: "please" });
    store.db.prepare("UPDATE users SET created_at = ? WHERE id = ?").run(Date.now() - 31 * DAY, old.id);
    store.db.prepare("UPDATE users SET created_at = ? WHERE id = ?").run(Date.now() - 29 * DAY, recent.id);
    // The counts of Suunto requests (the call limits look back 7 days at most).
    store.recordSuuntoCall(user.id, Date.now() - 9 * DAY);
    store.recordSuuntoCall(user.id, Date.now() - 7 * DAY);
    store.cleanup();
    expect(store.recentActivity(user.id).map((a) => a.tool)).toEqual(["suunto_get_workout"]);
    expect(store.suuntoCallTimes(user.id, 0)).toHaveLength(1);
    expect(store.getUser(old.id)).toBeUndefined();
    expect(store.getUser(recent.id)?.requestNote).toBe("please");
    // Approving the request deletes the message to the administrator.
    expect(store.approveAccessRequest(recent.id)).toBe(true);
    expect(store.getUser(recent.id)?.requestNote).toBeUndefined();
    const { html } = await get("/privacy");
    expect(html).toContain("<strong>Activity log:</strong> 90 days. <strong>Counts of Suunto requests:</strong> 8 days.");
    expect(html).toContain("We also count the requests sent to Suunto for your account, with only the time of each one, to keep the call limits per user. These counts are deleted after 8 days.");
    expect(html).toContain("after 30 days if nobody answers. The message to the administrator is deleted when the request is approved.");
  });

  it("says that the language of an access request stays with the account", async () => {
    // A request from the Italian sign-up page saves its language for the welcome e-mail.
    const visitor = new Browser();
    await visitor.page("/signup?lang=it");
    expect((await visitor.signup("lang-request@example.com", PASSWORD)).status).toBe(200);
    const { store } = web.ctx;
    const person = store.getUserByEmail("lang-request@example.com")!;
    expect(person.pending).toBe(true);
    expect(person.lang).toBe("it");
    // Approving deletes the message to the administrator, not the language.
    expect(store.approveAccessRequest(person.id)).toBe(true);
    expect(store.getUser(person.id)?.lang).toBe("it");
    const { html } = await get("/privacy");
    expect(html).toContain("in the language you used for the request (we save this language with your account).");
    expect(html).not.toContain("we save it with the request");
  });

  it("deletes everything linked to an account when the account is deleted, except a used invite", async () => {
    const { store } = web.ctx;
    const user = store.createUser("leaving@example.com", await hashPassword(PASSWORD), false);
    store.saveSuuntoSettings(user.id, suuntoSettings("leavingrunner", "rt-invented-leaving"));
    store.createSession(user.id, 14);
    store.issueTokens({ clientId: "client", userId: user.id, scopes: ["suunto"], accessTtlMs: 60_000, refreshTtlMs: DAY });
    store.logActivity(user.id, "suunto_list_workouts", true, 12, "client");
    store.createOAuthState(user.id);
    store.recordSuuntoCall(user.id, Date.now());
    const code = store.createInvite(user.id, "", 7);
    expect(store.consumeInvite(code, "leaving@example.com")).toBe(true);
    const rows = (table: string) => Number((store.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(user.id) as { n: number }).n);
    const linked = ["sessions", "oauth_tokens", "activity", "suunto_oauth_states", "suunto_calls"];
    for (const table of linked) expect(rows(table), table).toBeGreaterThan(0);

    store.deleteUser(user.id);
    expect(store.getUser(user.id)).toBeUndefined();
    for (const table of linked) expect(rows(table), table).toBe(0);
    // The invite keeps the address until the administrator deletes it, as the policy says.
    expect(store.listInvites().some((i) => i.usedBy === "leaving@example.com")).toBe(true);
    expect((await get("/privacy")).html).toContain("Deleting your account does not remove your email address from an invite you used");
  });

  it("removes the Suunto connection completely", () => {
    const { store } = web.ctx;
    const user = store.createUser("removing@example.com", "x", false);
    store.saveSuuntoSettings(user.id, suuntoSettings("removingrunner", "rt-invented-removing"));
    expect(store.getUser(user.id)?.hasSuunto).toBe(true);
    store.saveSuuntoSettings(user.id, undefined);
    expect(store.getUser(user.id)?.hasSuunto).toBe(false);
    expect(store.db.prepare("SELECT service_enc FROM users WHERE id = ?").get(user.id)).toEqual({ service_enc: null });
  });

  it("keeps only a hash of the one-time code of a Suunto connection, and uses it once", () => {
    const { store } = web.ctx;
    const user = store.createUser("connecting@example.com", "x", false);
    const state = store.createOAuthState(user.id);
    const rows = JSON.stringify(store.db.prepare("SELECT * FROM suunto_oauth_states").all());
    expect(rows).not.toContain(state);
    expect(store.consumeOAuthState(state, user.id)).toBeDefined();
    expect(store.consumeOAuthState(state, user.id)).toBeUndefined();
    store.deleteUser(user.id);
  });

  it("stores the Suunto connection encrypted and passwords, sessions and tokens only as hashes", async () => {
    const { store } = web.ctx;
    const user = store.createUser("secret@example.com", await hashPassword(PASSWORD), false);
    store.saveSuuntoSettings(user.id, suuntoSettings("secretrunner", "rt-invented-secret"));
    const row = store.db.prepare("SELECT password_hash, service_enc FROM users WHERE id = ?").get(user.id) as { password_hash: string; service_enc: string };
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.service_enc).toMatch(/^v1:/);
    expect(row.service_enc).not.toContain("rt-invented-secret");
    expect(row.service_enc).not.toContain("at-invented-access");
    expect(row.service_enc).not.toContain("secretrunner");
    const session = store.createSession(user.id, 1);
    const tokens = store.issueTokens({ clientId: "client", userId: user.id, scopes: ["suunto"], accessTtlMs: 60_000, refreshTtlMs: DAY });
    const dump = JSON.stringify([...store.db.prepare("SELECT * FROM sessions").all(), ...store.db.prepare("SELECT * FROM oauth_tokens").all()]);
    for (const secret of [session.cookie, tokens.access, tokens.refresh]) expect(dump).not.toContain(secret);
    store.deleteUser(user.id);
  });

  it("says the Suunto password never reaches the server, and names what is kept of the Suunto connection", async () => {
    const { html } = await get("/privacy");
    expect(html).toContain("You sign in on Suunto's own page, so your Suunto password never reaches this server.");
    // The fields of SuuntoAccountSettings (store.ts) and the reconnect flag, in words.
    for (const words of [
      "Your Suunto username",
      "the access token and the refresh token",
      "when the access token expires",
      "whether the connection must be renewed",
      "units, read-only mode and time zone",
      "the time you connected",
      "a hash of a one-time code that expires after 10 minutes",
    ]) {
      expect(html).toContain(words);
    }
    expect(html).toContain("<strong>Suunto.</strong> To reach your data");
    expect(html).toContain("Suunto Oy is an independent controller of the data in your Suunto account");
    expect(html).toContain("Your workouts and health data are not stored");
    expect(html).toContain("<strong>Your explicit consent</strong> (Art. 9(2)(a) GDPR) for health data");
  });

  it("states how long recent Suunto answers stay in memory, as the response cache keeps them", async () => {
    const { html } = await get("/privacy");
    expect(html).toContain(`recent answers are kept in the server's memory for ${SHORT_TTL_MS / 60_000} to ${LONG_TTL_MS / 60_000} minutes (at most ${CACHE_MAX_BYTES / (1024 * 1024)} MB per user)`);
    expect(html).toContain("the result of the test request made then (how many workouts you had in the last 30 days, or why the request failed)");
  });

  it("says the same about the response cache and the connect-time check in every language", () => {
    const numbers = (s: string) => new Set(s.match(/\d+/g));
    for (const lang of LOCALES) {
      // Answers stay 2 to 30 minutes in memory, at most 20 MB per user.
      const content = numbers(CATALOGS[lang]["legal.privacy.content.text"]!);
      for (const n of [SHORT_TTL_MS / 60_000, LONG_TTL_MS / 60_000, CACHE_MAX_BYTES / (1024 * 1024)]) expect(content.has(String(n)), `${lang}: ${n}`).toBe(true);
      // The stored connection includes the result of the test request (workouts of the last 30 days).
      expect(numbers(CATALOGS[lang]["legal.privacy.data.suunto"]!).has("30"), lang).toBe(true);
    }
  });

  it("has no place in the database for IP addresses, workouts or health data", () => {
    const tables = (web.ctx.store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]).map((t) => t.name);
    expect(tables.sort()).toEqual(["activity", "invites", "oauth_clients", "oauth_codes", "oauth_pending", "oauth_tokens", "sessions", "settings", "suunto_calls", "suunto_oauth_states", "users"]);
    for (const table of tables) {
      const columns = (web.ctx.store.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
      for (const column of columns) {
        expect(`${table}.${column}`).not.toMatch(
          /(^|_)(ip|addr|address|subject|body|message|content|attachment|event|workout|workouts|heart|hr|sleep|recovery|steps|route|routes|poi|pois|gpx|fit|location|lat|lon|latitude|longitude)(_|$)/i,
        );
      }
    }
    // The activity log keeps when, which tool, which app, how long and whether it worked.
    const activity = (web.ctx.store.db.prepare("PRAGMA table_info(activity)").all() as { name: string }[]).map((c) => c.name);
    expect(activity.sort()).toEqual(["at", "client_id", "duration_ms", "id", "ok", "tool", "user_id"]);
    // The call limits keep only who sent a request to Suunto and when.
    const calls = (web.ctx.store.db.prepare("PRAGMA table_info(suunto_calls)").all() as { name: string }[]).map((c) => c.name);
    expect(calls.sort()).toEqual(["at", "user_id"]);
  });

  it("states the backup and log limits of the deploy files", async () => {
    const deploy = readFileSync(new URL("../../deploy/server/deploy.sh", import.meta.url), "utf8");
    const compose = readFileSync(new URL("../../deploy/server/compose.yml", import.meta.url), "utf8");
    const keep = Number(deploy.match(/^KEEP_BACKUPS=\$\{KEEP_BACKUPS:-(\d+)\}$/m)?.[1]);
    const size = Number(compose.match(/max-size: (\d+)m/)?.[1]);
    const files = Number(compose.match(/max-file: "(\d+)"/)?.[1]);
    const { html } = await get("/privacy");
    expect(html).toContain(`only the ${keep} newest copies are kept`);
    expect(html).toContain(`(${size * files} MB in total)`);
    expect(compose).toMatch(/read_only: true/);
    expect(compose).toMatch(/cap_drop: \[ALL\]/);
  });
});

describe("English legal texts", () => {
  it("use the {app} placeholder instead of the product name, so a rename changes one message", () => {
    for (const [key, text] of Object.entries(legalEn)) {
      expect(text, key).not.toMatch(/iCloud MCP|MCP for PADI|MCP for Suunto/);
      expect(text.trim(), key).toBe(text);
    }
    expect(legalEn["legal.privacy.intro"]).toContain("{app}");
  });

  it("have no em dash, here and in the new links", () => {
    const texts = {
      ...legalEn,
      "common.footer.legal": commonEn["common.footer.legal"],
      "common.footer.privacy": commonEn["common.footer.privacy"],
      "common.footer.terms": commonEn["common.footer.terms"],
      "common.footer.contact": commonEn["common.footer.contact"],
      "auth.signUp.consentTerms": authEn["auth.signUp.consentTerms"],
      "home.privacy.more": homeEn["home.privacy.more"],
    };
    for (const [key, text] of Object.entries(texts)) {
      expect(key).toMatch(/^[a-z]+(\.[a-z][A-Za-z0-9]*)+$/);
      expect(text, key).not.toContain("\u2014");
    }
  });
});
