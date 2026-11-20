/**
 * The MCP surface (server info, instructions, tools with their schemas and annotations, prompts)
 * stays what AI apps saw before the move to mcp-use. test/fixtures/mcp-surface.json was recorded
 * from the MCP SDK server; after an intended change, rerun with UPDATE_MCP_SURFACE=1.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { DemoActivityStore } from "../../src/demo/activity.js";
import { createMcpServer, createServices, type Services } from "../../src/server.js";
import { VERSION } from "../../src/version.js";
import { connectClient } from "../helpers/mcp-client.js";

const FIXTURE = new URL("../fixtures/mcp-surface.json", import.meta.url);

// Invented test data only.
const ENV = {
  SUUNTO_CLIENT_ID: "client-invented",
  SUUNTO_CLIENT_SECRET: "secret-invented-value",
  SUUNTO_SUBSCRIPTION_KEY: "subkey-invented-value",
  SUUNTO_REFRESH_TOKEN: "rt-invented-value",
  SUUNTO_TIMEZONE: "Europe/Zurich",
};

/** Drops the JSON Schema dialect ($schema) and the MCP SDK's task metadata (execution): not part of the contract. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "$schema" && k !== "execution").map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

/** A demo account, or (connected false) one without a Suunto sign-in: only suunto_account_info. */
async function surface(extra: Record<string, string>, connected = true) {
  const config = loadConfig({ ...ENV, ...extra });
  const services: Services = connected ? createServices(config, { demo: new DemoActivityStore() }) : { reused: false };
  const client = await connectClient(createMcpServer(config, services, () => {}));
  try {
    const { icons: _icons, version, ...serverInfo } = client.getServerVersion()!;
    expect(version).toBe(VERSION);
    return {
      serverInfo,
      instructions: client.getInstructions(),
      tools: normalize((await client.listTools()).tools),
      // Without a sign-in the MCP SDK server had no prompts/list; mcp-server.test.ts checks that it is empty now.
      ...(connected ? { prompts: normalize((await client.listPrompts()).prompts) } : {}),
    };
  } finally {
    await client.close();
  }
}

describe("MCP surface", () => {
  it("is unchanged for a writable, a read-only and a not connected account", async () => {
    const current = { writable: await surface({}), read_only: await surface({ SUUNTO_READ_ONLY: "true" }), not_connected: await surface({}, false) };
    if (process.env.UPDATE_MCP_SURFACE === "1") writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
    expect(current).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });

  it("declares every tool input schema strict and as an object", async () => {
    const { tools } = await surface({});
    for (const tool of tools as Array<{ name: string; inputSchema: { type: string; additionalProperties?: unknown } }>) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });
});

describe("mcp-use usage events", () => {
  it("are off: nothing is sent and no .mcp-use directory is written", async () => {
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-usage-"));
    const cwd = process.cwd();
    const nodeEnv = process.env.NODE_ENV;
    const realFetch = globalThis.fetch;
    const sent: string[] = [];
    // Records every outside request and never lets one leave the machine.
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("http://localhost/")) return realFetch(input, init);
      sent.push(url);
      return new Response(null, { status: 204 });
    }) as typeof fetch;
    // mcp-use never records usage under NODE_ENV=test, which would hide the switch.
    process.env.NODE_ENV = "production";
    process.chdir(dir);
    try {
      expect(globalThis.__MCP_USE_ANONYMIZED_TELEMETRY__).toBe(false);
      const config = loadConfig(ENV);
      const client = await connectClient(createMcpServer(config, createServices(config, { demo: new DemoActivityStore() }), () => {}));
      await client.listTools();
      await client.callTool({ name: "suunto_list_workouts", arguments: { limit: 1 } });
      await client.close();
      await new Promise((r) => setTimeout(r, 200));
      expect(sent).toEqual([]);
      expect(existsSync(join(dir, ".mcp-use"))).toBe(false);
    } finally {
      process.chdir(cwd);
      process.env.NODE_ENV = nodeEnv;
      globalThis.fetch = realFetch;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
