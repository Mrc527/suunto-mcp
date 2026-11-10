/**
 * The logo (favicon, app icons and the icons in the MCP serverInfo) and the product name.
 */
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createMcpServer, createServices } from "../../src/server.js";
import { en } from "../../src/web/i18n/en/index.js";
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
    operator: { PADI_COGNITO_URL: "http://127.0.0.1:1/", PADI_AUTH_URL: "http://127.0.0.1:1/auth/api", PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook" },
    log: () => {},
  });
  server.on("request", web.app);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
});

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
    expect(manifest.name).toBe("MCP for PADI");
    expect(manifest.short_name).toBe("MCP for PADI");
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
    const config = loadConfig({ PADI_EMAIL: "diver.test@example.com", PADI_PASSWORD: "not-a-real-password" });
    const mcp = createMcpServer(config, createServices(config), () => {});
    const info = (mcp.server as unknown as { _serverInfo: { icons: { src: string; mimeType: string }[] } })._serverInfo;
    expect(info.icons[0]!.mimeType).toBe("image/png");
    expect(info.icons[0]!.src).toMatch(/^data:image\/png;base64,iVBOR/);
  });
});

describe("product name", () => {
  const NAME = "MCP for PADI";

  it("is MCP for PADI in the English texts, and the old name is gone", () => {
    expect(en["common.appName"]).toBe(NAME);
    for (const [key, text] of Object.entries(en)) expect(text, key).not.toMatch(/iCloud MCP/i);
  });

  it("is in the top bar, with \"for PADI\" lighter than the name", async () => {
    const { html } = await new Browser().page("/login");
    expect(html).toContain(`<span class="brand-name"><b>MCP</b> for PADI</span>`);
    expect(html).toMatch(/<title>[^<]+ · MCP for PADI<\/title>/);
    // Apple Passwords names saved logins after og:site_name (else it falls back to the domain).
    expect(html).toContain('<meta property="og:site_name" content="MCP for PADI">');
  });

  it("is in the footer disclaimer, which says that PADI has nothing to do with it", async () => {
    const { html } = await new Browser().page("/login");
    const footer = html.slice(html.indexOf("<footer>"), html.indexOf("</footer>"));
    expect(footer).toContain(
      "<p>MCP for PADI is an independent open-source project. It is not made by, affiliated with, or endorsed by PADI (Professional Association of Diving Instructors). PADI is a registered trademark of PADI Worldwide Corp.</p>",
    );
    // Nothing of the template is left in the English texts.
    for (const [key, text] of Object.entries(en)) expect(text, key).not.toMatch(/iCloud|Apple Account|app-specific password/);
  });

  it("is the title of the logo files and of the MCP server, whose internal name stays padi-mcp", () => {
    for (const svg of [LOGO_SVG, LOGO_SMALL_SVG, readFileSync(new URL("../../assets/brand/logo.svg", import.meta.url), "utf8")]) {
      expect(svg).toContain(`<title>${NAME}</title>`);
    }
    const config = loadConfig({ PADI_EMAIL: "diver.test@example.com", PADI_PASSWORD: "not-a-real-password" });
    const mcp = createMcpServer(config, createServices(config), () => {});
    const info = (mcp.server as unknown as { _serverInfo: { name: string; title: string } })._serverInfo;
    expect(info.name).toBe("padi-mcp");
    // The title AI apps show starts with the product name (it may say what it is for after it).
    expect(info.title.startsWith(NAME)).toBe(true);
  });
});
