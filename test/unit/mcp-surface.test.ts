/**
 * The MCP surface (server info, instructions, tools with their schemas and annotations, prompts)
 * stays what AI apps saw from the MCP SDK v1 server, on 2025-era connections and on the
 * 2026-07-28 protocol. test/fixtures/mcp-surface.json was recorded from the v1 server; after an
 * intended change, rerun with UPDATE_MCP_SURFACE=1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Client } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { DemoActivityStore } from "../../src/demo/activity.js";
import { createMcpServer, createServices, type Services } from "../../src/server.js";
import { VERSION } from "../../src/version.js";
import { connectClient, connectModernClient } from "../helpers/mcp-client.js";

const FIXTURE = new URL("../fixtures/mcp-surface.json", import.meta.url);

// Invented test data only.
const ENV = {
  SUUNTO_CLIENT_ID: "client-invented",
  SUUNTO_CLIENT_SECRET: "secret-invented-value",
  SUUNTO_SUBSCRIPTION_KEY: "subkey-invented-value",
  SUUNTO_REFRESH_TOKEN: "rt-invented-value",
  SUUNTO_TIMEZONE: "Europe/Zurich",
};

/** Drops the JSON Schema dialect ($schema) and the SDK's task metadata (execution): not part of the contract. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== "$schema" && k !== "execution").map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

/** A demo account, or (connected false) one without a Suunto sign-in: only suunto_account_info. */
function serverFor(extra: Record<string, string>, connected: boolean) {
  const config = loadConfig({ ...ENV, ...extra });
  const services: Services = connected ? createServices(config, { demo: new DemoActivityStore() }) : { reused: false };
  return () => createMcpServer(config, services, () => {});
}

async function surfaceOf(client: Client, connected: boolean) {
  const { icons: _icons, version, ...serverInfo } = client.getServerVersion()!;
  expect(version).toBe(VERSION);
  return {
    serverInfo,
    instructions: client.getInstructions(),
    tools: normalize((await client.listTools()).tools),
    // Without a sign-in there are no prompts, and no prompts capability (mcp-server.test.ts).
    ...(connected ? { prompts: normalize((await client.listPrompts()).prompts) } : {}),
  };
}

async function legacySurface(extra: Record<string, string>, connected = true) {
  const client = await connectClient(serverFor(extra, connected)());
  try {
    return await surfaceOf(client, connected);
  } finally {
    await client.close();
  }
}

async function modernSurface(extra: Record<string, string>, connected = true) {
  const { client, close } = await connectModernClient(serverFor(extra, connected));
  try {
    return await surfaceOf(client, connected);
  } finally {
    await close();
  }
}

describe("MCP surface", () => {
  it("is unchanged for a writable, a read-only and a not connected account on a 2025-era connection", async () => {
    const current = { writable: await legacySurface({}), read_only: await legacySurface({ SUUNTO_READ_ONLY: "true" }), not_connected: await legacySurface({}, false) };
    if (process.env.UPDATE_MCP_SURFACE === "1") writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
    expect(current).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });

  it("is the same on the 2026-07-28 protocol", async () => {
    const current = { writable: await modernSurface({}), read_only: await modernSurface({ SUUNTO_READ_ONLY: "true" }), not_connected: await modernSurface({}, false) };
    expect(current).toEqual(JSON.parse(readFileSync(FIXTURE, "utf8")));
  });

  it("declares every tool input schema strict and as an object", async () => {
    const { tools } = await legacySurface({});
    for (const tool of tools as Array<{ name: string; inputSchema: { type: string; additionalProperties?: unknown } }>) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });
});
