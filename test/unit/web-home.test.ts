/**
 * The start page ("/"): what people see before they sign in.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { HOME_CSS } from "../../src/web/assets-home.js";
import homeEn from "../../src/web/i18n/en/home.js";
import { LOCALES, type Locale } from "../../src/web/i18n/index.js";
import { introVideo } from "../../src/web/media.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, setBase } from "../helpers/web-client.js";

/** "real": the files in assets/video decide; "none": no video; "fake": a video in English. */
const video = vi.hoisted(() => ({ mode: "real" as "real" | "none" | "fake" }));
vi.mock("../../src/web/media.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/web/media.js")>();
  return {
    ...real,
    introVideo: (lang: Locale) =>
      video.mode === "none"
        ? undefined
        : video.mode === "fake"
          ? { mp4: "/media/intro-en.mp4", poster: "/media/intro-en.jpg", lang: "en" as Locale }
          : real.introVideo(lang),
  };
});

let web: WebApp;
let server: Server;
let base = "";
const PASSWORD = "correct horse battery";

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
    // Never reach real Suunto from tests: closed local ports.
    operator: { SUUNTO_OAUTH_URL: "http://127.0.0.1:1", SUUNTO_API_URL: "http://127.0.0.1:1" },
    log: () => {},
  });
  server.on("request", web.app);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
});

async function home(query = "", headers: Record<string, string> = { "accept-language": "en" }): Promise<{ res: Response; html: string }> {
  const res = await fetch(`${base}/${query}`, { headers, redirect: "manual" });
  return { res, html: await res.text() };
}

const count = (html: string, re: RegExp) => [...html.matchAll(re)].length;
const setRegistration = (registration: "open" | "approval" | "invite" | "closed") =>
  web.ctx.store.saveSettings({ ...web.ctx.store.getSettings(), registration });

describe("start page", () => {
  it("lets the first visitor create the administrator account", async () => {
    expect(web.ctx.store.countUsers()).toBe(0);
    const { html } = await home();
    expect(count(html, /<a class="button secondary" href="\/signup">Create an account<\/a>/g)).toBe(2);
  });

  it("explains the product before sign-in", async () => {
    const { res, html } = await home();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>Your Suunto data in your AI assistant · MCP for Suunto</title>");
    expect(html).toMatch(/<meta name="description" content="Connect Claude, ChatGPT and other AI apps to your Suunto account[^"]+">/);
    expect(html).toContain('<main class="wide">');
    // Hero
    expect(count(html, /<h1[ >]/g)).toBe(1);
    expect(html).toContain('<h1 id="home-title">Your Suunto training, inside your AI assistant.</h1>');
    for (const words of ["workouts", "training load", "sleep", "recovery", "steps", "send it to your watch"]) expect(html).toContain(words);
    expect(html).toContain('class="mark mark-xl"');
    expect(html).toContain("Works with Claude, ChatGPT, Gemini, Codex, Cursor, VS Code and other AI apps");
    expect(count(html, /<a class="button" href="\/login">Sign in<\/a>/g)).toBe(2);
    // Sections in order, each labelled by its heading.
    const ids = ["home-title", "home-features-title", "home-examples-title", "home-how-title", "home-privacy-title", "home-faq-title", "home-cta-title"];
    const positions = ids.map((id) => html.indexOf(`aria-labelledby="${id}"`));
    for (const [i, id] of ids.entries()) {
      expect(positions[i], id).toBeGreaterThan(-1);
      expect(html).toContain(`id="${id}"`);
    }
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // What you can do: workouts; sleep, recovery and steps; routes and places.
    expect(count(html, /<div class="tiles home-services">/g)).toBe(1);
    expect(count(html, /<div class="tile">/g)).toBe(3);
    for (const service of ["workouts", "health", "routes"]) expect(html).toContain(`svc-icon svc-${service} svc-lg`);
    expect(html).not.toMatch(/svc-(mail|logbook|cards)/);
    expect(html).toContain("<h3>Workouts</h3>");
    expect(html).toContain("<h3>Sleep, recovery and steps</h3>");
    expect(html).toContain("<h3>Routes and places</h3>");
    expect(html).toContain("add it to the Suunto App, ready to sync to your watch");
    expect(html).toContain("Training load at a glance");
    expect(html).toContain("Works with any AI app");
    expect(html).toContain("You stay in control");
    expect(html).toContain('<p class="home-note">Heart rate, sleep and recovery values come from your watch. They are not medical advice.</p>');
    // Try asking
    expect(count(html, /<q>[^<]+<\/q>/g)).toBe(6);
    expect(html).toContain("<q>How did I sleep this week, and how is my recovery?</q>");
    expect(html).toContain("<q>Plan a 12 km running loop around the lake and send it to my watch.</q>");
    // How it works, with the address for AI apps.
    expect(count(html, /<ol class="home-steps" role="list">/g)).toBe(1);
    expect(html).toContain(`<code id="home-mcp-url">${base}/mcp</code>`);
    expect(html).toContain('data-copy="home-mcp-url"');
    expect(html).toContain("<h3>Connect your Suunto account</h3>");
    expect(html).toContain("Suunto&#39;s own sign-in page opens: sign in there and allow access. This site never sees your Suunto password.");
    // Privacy and security
    expect(html).toContain("AES\u2011256\u2011GCM");
    expect(html).toContain("Your Suunto password stays with Suunto");
    expect(html).toContain("are not stored on this server");
    expect(html).toContain("The activity log keeps only which app used which tool, when, how long it took and whether it worked.");
    // Questions and answers
    expect(count(html, /<details><summary>/g)).toBe(9);
    expect(html).toContain("<summary>Is this an official Suunto service?</summary>");
    expect(html).toContain("It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto.");
    expect(html).toContain("<summary>Why is my latest workout missing?</summary>");
    expect(html).toContain("Sync your watch with the Suunto App first");
    expect(html).toContain("<summary>Which watches work?</summary>");
    expect(html).toContain("Watches that sync with the Suunto App.");
    expect(html).toContain("<summary>Does this site see my Suunto password?</summary>");
    expect(html).toContain("You can remove the connection at any time on your account page, and in the Suunto App.");
    expect(html).toContain("<summary>What can the AI app change?</summary>");
    expect(html).toContain("it cannot delete routes or points of interest: do that in the Suunto App");
    expect(html).toContain("<summary>Is this medical advice?</summary>");
    expect(html).toContain("<summary>What does this site store about me?</summary>");
    expect(html).toContain('The details are in the <a href="/privacy">privacy policy</a>.</p></details>');
    expect(html).toContain("<summary>Which AI apps work?</summary>");
    expect(html).toContain("<summary>Who runs this server?</summary>");
    // No video in this version, and nothing of the templates.
    expect(html).not.toContain("<video");
    expect(html).not.toMatch(/iCloud|Apple Account|app-specific|PADI|logbook/);
  });

  it("follows the registration mode", async () => {
    const admin = new Browser();
    expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
    // New servers ask for approval.
    expect(web.ctx.store.getSettings().registration).toBe("approval");
    let html = (await home()).html;
    expect(count(html, /<a class="button secondary" href="\/signup">Request access<\/a>/g)).toBe(2);
    expect(html).toContain("<h3>Request access</h3>");
    expect(html).toContain("Once the administrator approves it, you can sign in.");

    setRegistration("open");
    html = (await home()).html;
    expect(count(html, /<a class="button secondary" href="\/signup">Create an account<\/a>/g)).toBe(2);
    expect(html).not.toContain("Request access");

    setRegistration("invite");
    html = (await home()).html;
    expect(count(html, /href="\/signup">Create an account<\/a>/g)).toBe(2);
    expect(html).toContain("the invite code you got from the administrator");
    expect(html).toContain("Have an invite code? Create your account");

    setRegistration("closed");
    html = (await home()).html;
    expect(html).not.toContain('href="/signup"');
    expect(html).toContain("Sign-up is closed on this server.");
    expect(html).toContain("Sign in with your account to connect your AI app.");
    expect(count(html, /<a class="button" href="\/login">Sign in<\/a>/g)).toBe(2);
    setRegistration("approval");
  });

  it("sends signed-in people to their account", async () => {
    const b = new Browser();
    expect((await b.login("admin@example.com", PASSWORD)).status).toBe(303);
    const res = await b.fetch("/");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/account");
  });

  it("works in every language", async () => {
    const de = await home("?lang=de");
    expect(de.res.status).toBe(200);
    expect(de.res.headers.get("content-language")).toBe("de");
    expect(de.html).toContain('<html lang="de">');
    expect(de.html).toContain('<span lang="de" aria-current="true">Deutsch</span>');
    for (const lang of LOCALES) {
      const { res, html } = await home(`?lang=${lang}`);
      expect(res.status, lang).toBe(200);
      expect(html, lang).toContain('<section class="hero home-hero"');
      expect(html, lang).toContain(`${base}/mcp`);
      // No em dashes anywhere on the page.
      expect(html.includes("\u2014"), `${lang}: em dash`).toBe(false);
    }
  });

  it("needs no inline styles or scripts (strict CSP)", async () => {
    const { html } = await home();
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
    // The start page itself loads nothing from other servers and links to none: people connect
    // Suunto from their account page.
    const body = html.slice(html.indexOf('<div class="home">'), html.indexOf("</main>"));
    expect(body.length).toBeGreaterThan(1000);
    expect(body).not.toMatch(/(src|poster)="https?:/);
    expect([...body.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1])).toEqual([]);
  });

  it("keeps list semantics on lists without bullets", async () => {
    const { html } = await home();
    for (const list of ["ul class=\"home-features\"", "ul class=\"home-bubbles\"", "ol class=\"home-steps\"", "ul class=\"home-checks\""]) {
      expect(html).toContain(`<${list} role="list">`);
    }
  });

  it("has a clean English catalog", () => {
    for (const [key, text] of Object.entries(homeEn)) {
      expect(key).toMatch(/^home\.[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/);
      expect(text, key).not.toContain("\u2014");
      expect(text, key).not.toMatch(/thrilled/i);
      expect(text.trim(), key).toBe(text);
    }
  });

  it("keeps its styles to the start page", () => {
    const css = HOME_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/([^{}]+)\{/g)]
      .map((m) => m[1]!.trim())
      .filter((s) => !s.startsWith("@"))
      .flatMap((s) => s.split(","))
      .map((s) => s.trim());
    expect(selectors.length).toBeGreaterThan(20);
    for (const selector of selectors) expect(selector).toMatch(/^\.home[\s.:[]|^\.home$/);
  });

  it("shows the three services side by side on wide screens, as wide as the features below", () => {
    // One column on phones (in rows, not the shared .tiles grid's columns), two from 640 px with
    // the third one under them at full width, three from 900 px.
    expect(HOME_CSS).toContain(".home .home-services { grid-template-columns: 1fr; grid-auto-flow: row;");
    const block = (query: string) => {
      const from = HOME_CSS.slice(HOME_CSS.indexOf(`@media (min-width: ${query}) {`));
      return from.slice(0, from.indexOf("\n}"));
    };
    expect(block("640px")).toContain(".home .home-services { grid-template-columns: repeat(2, 1fr);");
    expect(block("640px")).toContain(".home .home-services .tile:last-child { grid-column: 1 / -1; }");
    expect(block("900px")).toMatch(/\.home \.home-services \{ grid-template-columns: repeat\(3, 1fr\); \}|, \.home \.home-services \{ grid-template-columns: repeat\(3, 1fr\); \}/);
    expect(block("900px")).toContain(".home .home-services .tile:last-child { grid-column: auto; }");
  });
});

describe("start page video", () => {
  afterAll(() => {
    video.mode = "real";
  });

  it("is left out when no video has been made", async () => {
    video.mode = "real";
    if (!introVideo("en")) {
      // assets/video has no mp4 yet.
      expect((await home()).html).not.toContain("<video");
    }
    video.mode = "none";
    const { html } = await home();
    expect(html).not.toContain("<video");
    expect(html).not.toContain('id="video"');
    expect(html).not.toContain("home-video");
  });

  it("is shown with its poster, size and language when there is one", async () => {
    video.mode = "fake";
    const { html } = await home();
    expect(html).toContain('<section class="home-section home-video" id="video" aria-labelledby="home-video-title">');
    expect(html).toMatch(
      /<video controls muted playsinline preload="metadata" data-autoplay poster="\/media\/intro-en\.jpg" width="1280" height="720" lang="en"[^>]*>\s*<source src="\/media\/intro-en\.mp4" type="video\/mp4">/,
    );
    expect(html).toContain('<h2 id="home-video-title">See it in action</h2>');
    expect(html).toContain('<a href="/media/intro-en.mp4">Download it</a>');
    // Right after the hero.
    expect(html.indexOf("home-video-title")).toBeLessThan(html.indexOf("home-features-title"));
    expect(html).not.toContain("home-video-note");
    // Another language that has no video of its own gets the English one, and says so.
    const de = (await home("?lang=de")).html;
    expect(de).toContain('lang="en" aria-labelledby="home-video-title"');
    expect(de).toContain('<p class="home-video-note">');
  });
});
