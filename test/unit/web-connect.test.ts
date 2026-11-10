/**
 * "Connect your AI app": the install links and commands for common AI apps.
 */
import { describe, expect, it } from "vitest";
import { connectCard } from "../../src/web/connect.js";

const URL_ = "https://padi.example.com/mcp";
const page = connectCard({ mcpUrl: URL_, email: "jane@example.com" }).value;
const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => unescape(m[1]!));
const codes = [...page.matchAll(/<code id="[^"]+"[^>]*>([^<]+)<\/code>/g)].map((m) => unescape(m[1]!));

describe("connect your AI app", () => {
  it("shows the address with a copy button", () => {
    expect(page).toContain('id="connect"');
    expect(page).toContain(`<code id="mcp-url">${URL_}</code>`);
    expect(page).toContain('data-copy="mcp-url"');
  });

  it("links to Claude's add-connector dialog with the address filled in", () => {
    const claude = new URL(hrefs.find((h) => h.startsWith("https://claude.ai/customize/connectors"))!);
    expect(claude.searchParams.get("modal")).toBe("add-custom-connector");
    expect(claude.searchParams.get("connectorName")).toBe("MCP for PADI");
    expect(claude.searchParams.get("connectorUrl")).toBe(URL_);
    const team = new URL(hrefs.find((h) => h.startsWith("https://claude.ai/admin-settings/connectors?"))!);
    expect(team.searchParams.get("connectorName")).toBe("MCP for PADI");
    expect(team.searchParams.get("connectorUrl")).toBe(URL_);
  });

  it("builds VS Code and Visual Studio install links from the JSON configuration", () => {
    const vscode = new URL(hrefs.find((h) => h.startsWith("https://vscode.dev/redirect?url=vscode%3A"))!);
    const inner = vscode.searchParams.get("url")!;
    expect(inner.startsWith("vscode:mcp/install?")).toBe(true);
    expect(JSON.parse(decodeURIComponent(inner.slice("vscode:mcp/install?".length)))).toEqual({ name: "padi", type: "http", url: URL_ });
    expect(hrefs.some((h) => h.startsWith("https://vscode.dev/redirect?url=vscode-insiders%3Amcp%2Finstall%3F"))).toBe(true);
    const vs = hrefs.find((h) => h.startsWith("https://vs-open.link/mcp-install?"))!;
    expect(JSON.parse(decodeURIComponent(vs.split("?")[1]!))).toEqual({ name: "padi", type: "http", url: URL_ });
  });

  it("builds Cursor and Kiro install links", () => {
    const cursor = new URL(hrefs.find((h) => h.startsWith("https://cursor.com/install-mcp?"))!);
    expect(cursor.searchParams.get("name")).toBe("padi");
    expect(JSON.parse(Buffer.from(cursor.searchParams.get("config")!, "base64").toString())).toEqual({ url: URL_ });
    const kiro = new URL(hrefs.find((h) => h.startsWith("https://kiro.dev/launch/mcp/add?"))!);
    expect(kiro.searchParams.get("name")).toBe("padi");
    expect(JSON.parse(kiro.searchParams.get("config")!)).toEqual({ url: URL_ });
  });

  it("builds LM Studio and Goose app links (no new tab for app links)", () => {
    const lm = new URL(hrefs.find((h) => h.startsWith("lmstudio://add_mcp?"))!);
    expect(lm.searchParams.get("name")).toBe("padi");
    expect(JSON.parse(Buffer.from(lm.searchParams.get("config")!, "base64").toString())).toEqual({ url: URL_ });
    const goose = new URL(hrefs.find((h) => h.startsWith("goose://extension?"))!);
    expect(goose.searchParams.get("url")).toBe(URL_);
    expect(goose.searchParams.get("id")).toBe("padi");
    expect(goose.searchParams.get("name")).toBe("MCP for PADI");
    for (const m of page.matchAll(/<a [^>]*href="(lmstudio|goose):[^"]+"[^>]*>/g)) expect(m[0]).not.toContain("target=");
  });

  it("groups the apps", () => {
    const groups = [...page.matchAll(/<h3 class="apps-group">([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(groups).toEqual(["Chat assistants", "Coding tools", "Desktop and self-hosted apps", "Anything else"]);
    const names = [...page.matchAll(/<span class="app-name">([^<]+)<\/span>/g)].map((m) => unescape(m[1]!));
    for (const n of ["Claude", "ChatGPT", "Gemini", "Le Chat (Mistral)", "Perplexity", "Claude Code", "Codex", "Cursor", "VS Code", "Gemini CLI", "LM Studio", "Goose", "Open WebUI", "Other AI apps"]) {
      expect(names).toContain(n);
    }
  });

  it("gives copyable commands for command-line apps", () => {
    expect(codes).toContain(`claude mcp add --transport http padi --scope user ${URL_}`);
    expect(codes).toContain("claude mcp login padi");
    expect(codes).toContain(`codex mcp add padi --url ${URL_}`);
    expect(codes).toContain(`copilot mcp add --transport http padi ${URL_}`);
    expect(codes).toContain(`devin mcp add -s user padi ${URL_}`);
    expect(codes).toContain(`cline mcp add padi ${URL_} --transport http --yes`);
    expect(codes).toContain(`gemini mcp add --transport http --scope user padi ${URL_}`);
    expect(codes).toContain(`jan cli mcp add padi --type http --url ${URL_} --active`);
    expect(JSON.parse(codes.find((c) => c.includes("context_servers"))!)).toEqual({ context_servers: { padi: { url: URL_ } } });
    expect(codes).toContain(`code --add-mcp '{"name":"padi","type":"http","url":"${URL_}"}'`);
    // JSON snippets are valid JSON.
    const json = codes.filter((c) => c.startsWith("{"));
    expect(json.length).toBeGreaterThanOrEqual(2);
    for (const c of json) expect(() => JSON.parse(c)).not.toThrow();
  });

  it("gives every copy field its own id", () => {
    const ids = [...page.matchAll(/<code id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(page).toContain(`data-copy="${id}"`);
  });

  it("opens outside links in a new tab without a referrer", () => {
    for (const m of page.matchAll(/<a [^>]*href="https?:[^"]+"[^>]*>/g)) expect(m[0]).toContain('rel="noopener noreferrer"');
  });
});
