/**
 * Translations: language choice, message functions, and the catalogs themselves.
 */
import { createServer, get, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATALOGS, LOCALES, negotiate, t, th, withLocale, type MessageKey } from "../../src/web/i18n/index.js";
import { en } from "../../src/web/i18n/en/index.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, setBase } from "../helpers/web-client.js";

describe("language choice", () => {
  it("picks the best supported language from Accept-Language", () => {
    expect(negotiate(undefined)).toBe("en");
    expect(negotiate("it-IT,it;q=0.9,en;q=0.8")).toBe("it");
    expect(negotiate("ja,de;q=0.5")).toBe("de");
    expect(negotiate("en;q=0.2, fr-CH;q=0.9")).toBe("fr");
    expect(negotiate("zh-Hant-TW")).toBe("zh");
    expect(negotiate("es-419")).toBe("es");
    expect(negotiate("ja, ko")).toBe("en");
    expect(negotiate("de;q=0, it")).toBe("it");
    expect(negotiate("*")).toBe("en");
  });
});

describe("messages", () => {
  it("fills placeholders and falls back to English", () => {
    expect(t("common.nav.signedInAs", { email: "a@b.c" })).toBe("Signed in as a@b.c");
    // A language without the key yet uses English.
    expect(withLocale("zh", () => t("common.nav.signOut"))).toBe(CATALOGS.zh["common.nav.signOut"] ?? "Sign out");
  });

  it("escapes values in markup messages but keeps the message's own markup", () => {
    const out = th("common.footer.author").value;
    expect(out).toContain('<a href="https://marco.visin.ch"');
  });

  it("refuses markup in plain-text messages outside production", () => {
    expect(() => t("common.footer.author")).toThrow(/use th\(\)/);
  });
});

/** Tags in a message, e.g. ["<strong>", "</strong>"], ignoring attribute order. */
const tags = (s: string) => [...s.matchAll(/<\/?[a-z][^>]*>/gi)].map((m) => m[0].replace(/\s+/g, " ")).sort();
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("catalogs", () => {
  const keys = Object.keys(en) as MessageKey[];

  it("use keys that start with their area", () => {
    for (const key of keys) expect(key).toMatch(/^(common|home|auth|account|connect|admin|oauth|video|legal)\.[\w.]+$/);
  });

  for (const lang of LOCALES.filter((l) => l !== "en")) {
    it(`${lang}: has every message`, () => {
      const missing = keys.filter((key) => !CATALOGS[lang][key]);
      expect(missing, `${lang}: missing translations`).toEqual([]);
    });

    it(`${lang}: same placeholders and markup as English, no unknown keys`, () => {
      const catalog = CATALOGS[lang];
      for (const [key, text] of Object.entries(catalog)) {
        expect(keys, `${lang}: unknown key ${key}`).toContain(key);
        const source = en[key as MessageKey];
        expect(placeholders(text!), `${lang} ${key}: placeholders`).toEqual(placeholders(source));
        expect(tags(text!), `${lang} ${key}: markup`).toEqual(tags(source));
        expect(text!.trim(), `${lang} ${key}: empty`).not.toBe("");
      }
    });
  }
});

describe("pages", () => {
  let web: WebApp;
  let server: Server;
  let base = "";
  const logs: string[] = [];
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
      // Never reach real PADI from tests: closed local ports.
      operator: { PADI_COGNITO_URL: "http://127.0.0.1:1/", PADI_AUTH_URL: "http://127.0.0.1:1/auth/api", PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook" },
      log: (m) => logs.push(m),
    });
    server.on("request", web.app);
  });
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await web.close();
  });

  it("follow the browser's language and say so", async () => {
    const res = await fetch(`${base}/login`, { headers: { "accept-language": "de-CH,de;q=0.9" } });
    expect(res.headers.get("content-language")).toBe("de");
    expect(res.headers.get("vary")).toContain("Accept-Language");
    expect(await res.text()).toContain('<html lang="de">');
  });

  it("switch with ?lang= and remember the choice in a cookie", async () => {
    const res = await fetch(`${base}/login?lang=zh`, { headers: { "accept-language": "en" } });
    expect(await res.text()).toContain('<html lang="zh-Hans">');
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("pdm_lang="))!;
    expect(cookie).toContain("pdm_lang=zh");
    expect(cookie).toContain("SameSite=Lax");
    const again = await fetch(`${base}/login`, { headers: { cookie: cookie.split(";")[0]!, "accept-language": "fr" } });
    expect(await again.text()).toContain('<html lang="zh-Hans">');
  });

  it("ignore unknown languages", async () => {
    const res = await fetch(`${base}/login?lang=xx`, { headers: { "accept-language": "es" } });
    expect(await res.text()).toContain('<html lang="es">');
    expect(res.headers.getSetCookie().some((c) => c.startsWith("pdm_lang="))).toBe(false);
  });

  it("offer every language in the footer, linking to the same page", async () => {
    const html = await (await fetch(`${base}/login?next=%2Faccount&m=saved`, { headers: { "accept-language": "it" } })).text();
    expect(html).toContain('<nav class="langs"');
    expect(html).toContain('<span lang="it" aria-current="true">Italiano</span>');
    expect(html).toContain('href="/login?next=%2Faccount&amp;lang=de"');
    expect(html).toContain('hreflang="zh-Hans">简体中文</a>');
    // The script gets its texts.
    expect(html).toMatch(/<body data-i18n="\{[^"]*copied/);
  });

  /** A GET with the request target exactly as given (fetch would tidy it up first). */
  const rawGet = (path: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      const url = new URL(base);
      get({ host: url.hostname, port: url.port, path, headers: { accept: "text/html" } }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }).on("error", reject);
    });
  const languageHrefs = (html: string) => [...(html.match(/<nav class="langs"[\s\S]*?<\/nav>/)?.[0] ?? "").matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);

  it("keep the language links on this site, whatever the address looks like", async () => {
    logs.length = 0;
    // "//" is the start page; the others match no page.
    for (const path of ["//x//evil.example/", "//x//evil.example/login?m=saved", "/.//evil.example/x", "/\\evil.example/", "//", "//[x/", "//a:99999/", "//a%/"]) {
      const { status, body } = await rawGet(path);
      expect(status, path).toBe(path === "//" ? 200 : 404);
      const hrefs = languageHrefs(body);
      expect(hrefs, path).toHaveLength(LOCALES.length - 1);
      for (const href of hrefs) expect(href, path).toMatch(/^\/(?![/\\])[^?]*\?lang=[a-z]{2}$/);
    }
    expect((await rawGet("//x//evil.example/")).body).toContain('href="/x//evil.example/?lang=de"');
    expect(logs.filter((m) => m.startsWith("Unhandled error"))).toEqual([]);
  });

  it("keep where the visitor goes next on pages shown after a form", async () => {
    const consent = "/oauth/consent?request=abc123";
    const visitor = new Browser();
    const { csrf } = await visitor.page(`/login?next=${encodeURIComponent(consent)}`);
    const failed = await visitor.post("/login", { _csrf: csrf, email: "nobody@example.com", password: "wrong password", next: consent });
    expect(failed.status).toBe(401);
    expect(languageHrefs(await failed.text())).toContain(`/login?next=${encodeURIComponent(consent)}&amp;lang=de`);

    const user = new Browser();
    expect((await user.signup("links@example.com", "correct horse battery")).status).toBe(303);
    const account = await user.page(`/account?next=${encodeURIComponent(consent)}`);
    const padi = await user.post("/account/padi", { _csrf: account.csrf, email: "diver.test@example.com", next: consent });
    expect(padi.status).toBe(400);
    expect(languageHrefs(await padi.text())).toContain(`/account?next=${encodeURIComponent(consent)}&amp;lang=de`);

    const security = await user.page("/account/security");
    const password = await user.post("/account/password", { _csrf: security.csrf, current: "wrong", password: "x", password2: "x" });
    expect(password.status).toBe(400);
    expect(languageHrefs(await password.text())).toContain("/account/security?lang=de");
  });
});
