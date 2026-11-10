/**
 * The logo (favicon, app icons and the icons in the MCP serverInfo) and the product name.
 */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createMcpServer, createServices } from "../../src/server.js";
import authEn from "../../src/web/i18n/en/auth.js";
import commonEn from "../../src/web/i18n/en/common.js";
import connectEn from "../../src/web/i18n/en/connect.js";
import homeEn from "../../src/web/i18n/en/home.js";
import { en } from "../../src/web/i18n/en/index.js";
import legalEn from "../../src/web/i18n/en/legal.js";
import { LOGO_SMALL_SVG, LOGO_SVG } from "../../src/web/brand-assets.js";
import { createWebApp, type WebApp } from "../../src/web/server.js";
import { Browser, connectMcp, setBase, TestOAuthClient } from "../helpers/web-client.js";

let web: WebApp;
let server: Server;
let base = "";

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

/** Invented Suunto app keys for single-user mode (no refresh token: no connection to Suunto). */
const SINGLE_USER_ENV = { SUUNTO_CLIENT_ID: "test-client-id", SUUNTO_CLIENT_SECRET: "test-client-secret", SUUNTO_SUBSCRIPTION_KEY: "test-subscription-key", SUUNTO_REFRESH_TOKEN: "test-refresh-token" };

/** Width and height from a PNG's IHDR chunk. */
const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe("icons", () => {
  it("serves favicon.ico with 16, 32 and 48 px images", async () => {
    const res = await fetch(`${base}/favicon.ico`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/x-icon");
    expect(res.headers.get("cache-control")).toContain("public");
    const ico = Buffer.from(await res.arrayBuffer());
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    expect([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i))).toEqual([16, 32, 48]);
  });

  it("serves PNG and SVG icons and a web manifest", async () => {
    for (const [path, size] of [["/icon-48.png", 48], ["/icon-192.png", 192], ["/apple-touch-icon.png", 180]] as const) {
      const res = await fetch(`${base}${path}`);
      expect(res.headers.get("content-type")).toBe("image/png");
      expect(pngSize(Buffer.from(await res.arrayBuffer()))).toEqual([size, size]);
    }
    for (const path of ["/icon.svg", "/favicon.svg"]) {
      const res = await fetch(`${base}${path}`);
      expect(res.headers.get("content-type")).toContain("image/svg+xml");
      expect(res.headers.get("content-security-policy")).toContain("sandbox");
      const svg = await res.text();
      expect(svg).toMatch(/^<svg /);
      expect(svg).not.toMatch(/<script|on\w+=/i);
    }
    const manifest = (await (await fetch(`${base}/site.webmanifest`)).json()) as { name: string; short_name: string; icons: { src: string }[] };
    expect(manifest.name).toBe("MCP for Suunto");
    expect(manifest.short_name).toBe("MCP for Suunto");
    expect(manifest.icons.map((i) => i.src)).toContain("/icon-192.png");
  });

  it("links the icons from every page", async () => {
    const { html } = await new Browser().page("/login");
    expect(html).toContain('<link rel="icon" href="/favicon.ico"');
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
  });

  it("sends the icons in the MCP serverInfo, from the same host as the MCP address", async () => {
    const user = new Browser();
    expect((await user.signup("brand@example.com", "correct horse battery")).status).toBe(303);
    const client = await connectMcp(new TestOAuthClient(user));
    const info = client.getServerVersion()!;
    await client.close();
    expect(info.websiteUrl).toBe(`${base}/`);
    expect(info.icons).toEqual([
      { src: `${base}/icon-48.png`, mimeType: "image/png", sizes: ["48x48"] },
      { src: `${base}/icon-192.png`, mimeType: "image/png", sizes: ["192x192"] },
      { src: `${base}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    ]);
    for (const icon of info.icons!) expect((await fetch(icon.src)).status).toBe(200);
  });

  it("puts the icon inline in single-user mode", () => {
    const config = loadConfig(SINGLE_USER_ENV);
    const mcp = createMcpServer(config, createServices(config), () => {});
    const info = (mcp.server as unknown as { _serverInfo: { icons: { src: string; mimeType: string }[] } })._serverInfo;
    expect(info.icons[0]!.mimeType).toBe("image/png");
    expect(info.icons[0]!.src).toMatch(/^data:image\/png;base64,iVBOR/);
  });
});

describe("logo", () => {
  const file = (name: string) => readFileSync(new URL(`../../assets/brand/${name}`, import.meta.url), "utf8").trim();

  it("is served as generated from assets/brand (run scripts/make-icons.mjs after a change)", () => {
    expect(LOGO_SVG).toBe(file("logo.svg"));
    expect(LOGO_SMALL_SVG).toBe(file("logo-small.svg"));
  });

  it("is our own drawing on a 512 px canvas, with no text, images or links", () => {
    for (const svg of [LOGO_SVG, LOGO_SMALL_SVG]) {
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">/);
      expect(svg).not.toMatch(/<(text|image|use|a|script|foreignObject)\b|href=|url\((?!#)/i);
    }
    // Each file has its own gradient ids, so both can be inlined in one page.
    const ids = (svg: string) => [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(LOGO_SVG).filter((id) => ids(LOGO_SMALL_SVG).includes(id))).toEqual([]);
  });
});

describe("product name", () => {
  const NAME = "MCP for Suunto";

  it("is MCP for Suunto in the English texts, and the old names are gone", () => {
    expect(en["common.appName"]).toBe(NAME);
    for (const [key, text] of Object.entries(en)) expect(text, key).not.toMatch(/iCloud MCP|MCP for PADI/i);
  });

  it("is in the top bar, with \"for Suunto\" lighter than the name", async () => {
    const { html } = await new Browser().page("/login");
    expect(html).toContain(`<span class="brand-name"><b>MCP</b> for Suunto</span>`);
    expect(html).toMatch(/<title>[^<]+ · MCP for Suunto<\/title>/);
    // Apple Passwords names saved logins after og:site_name (else it falls back to the domain).
    expect(html).toContain('<meta property="og:site_name" content="MCP for Suunto">');
  });

  it("is in the footer disclaimer, which says that the project is independent of Suunto", async () => {
    const { html } = await new Browser().page("/login");
    const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
    expect(footer).toContain(
      "<p>MCP for Suunto is an independent open-source project. It uses the official Suunto Cloud API, but it is not made by, affiliated with, or endorsed by Suunto. Suunto is a registered trademark of Suunto Oy.</p>",
    );
  });

  it("leaves nothing of the templates in the English texts this module owns", () => {
    const owned = { ...commonEn, ...homeEn, ...authEn, ...connectEn, ...legalEn };
    for (const [key, text] of Object.entries(owned)) {
      expect(text, key).not.toMatch(/iCloud|Apple Account|app-specific password|\bPADI\b|eCards?\b/i);
      expect(text, key).not.toContain("\u2014");
      expect(text, key).not.toMatch(/thrilled/i);
    }
  });

  it("is the title of the logo files and of the MCP server, whose internal name is suunto-mcp", () => {
    for (const svg of [LOGO_SVG, LOGO_SMALL_SVG, readFileSync(new URL("../../assets/brand/logo.svg", import.meta.url), "utf8")]) {
      expect(svg).toContain(`<title>${NAME}</title>`);
    }
    const config = loadConfig(SINGLE_USER_ENV);
    const mcp = createMcpServer(config, createServices(config), () => {});
    const info = (mcp.server as unknown as { _serverInfo: { name: string; title: string } })._serverInfo;
    expect(info.name).toBe("suunto-mcp");
    // The title AI apps show starts with the product name (it may say what it is for after it).
    expect(info.title.startsWith(NAME)).toBe(true);
  });
});
