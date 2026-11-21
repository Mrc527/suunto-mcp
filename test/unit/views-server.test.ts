/**
 * The views on the MCP side (src/views.ts): which tools open which view, the ui:// resources, and
 * the self-contained page they serve, on 2025-era connections and on the 2026-07-28 protocol.
 */
import type { Client } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { DemoActivityStore } from "../../src/demo/activity.js";
import { createMcpServer, createServices } from "../../src/server.js";
import { viewHtml, VIEWS } from "../../src/views.js";
import { connectClient, connectModernClient } from "../helpers/mcp-client.js";

// Invented test data only.
const ENV = { SUUNTO_CLIENT_ID: "client-invented", SUUNTO_CLIENT_SECRET: "secret-invented", SUUNTO_SUBSCRIPTION_KEY: "key-invented", SUUNTO_REFRESH_TOKEN: "rt-invented", SUUNTO_TIMEZONE: "Europe/Zurich" };
const MIME = "text/html;profile=mcp-app";
const VIEW_OF: Record<string, string> = {
  suunto_list_workouts: VIEWS.workouts.uri,
  suunto_get_workout: VIEWS.workouts.uri,
  suunto_workout_stats: VIEWS.training.uri,
  suunto_sleep: VIEWS.sleep.uri,
};

function factory(extra: Record<string, string> = {}, connected = true) {
  const config = loadConfig({ ...ENV, ...extra });
  const services = connected ? createServices(config, { demo: new DemoActivityStore() }) : {};
  return () => createMcpServer(config, services, () => {});
}

async function checkSurface(client: Client) {
  const { tools } = await client.listTools();
  for (const tool of tools) {
    const uri = VIEW_OF[tool.name];
    const meta = tool._meta as { ui?: { resourceUri?: string }; "ui/resourceUri"?: string } | undefined;
    if (uri) {
      expect(meta?.ui?.resourceUri, tool.name).toBe(uri);
      // The older flat key, for hosts that read only that.
      expect(meta?.["ui/resourceUri"], tool.name).toBe(uri);
    } else {
      expect(meta?.ui, tool.name).toBeUndefined();
    }
  }
  const { resources } = await client.listResources();
  expect(resources.map((r) => [r.uri, r.mimeType]).sort()).toEqual(Object.values(VIEWS).map((v) => [v.uri, MIME]).sort());
  for (const [name, view] of Object.entries(VIEWS)) {
    const read = await client.readResource({ uri: view.uri });
    const content = read.contents[0] as { uri: string; mimeType: string; text: string };
    expect(content.uri).toBe(view.uri);
    expect(content.mimeType).toBe(MIME);
    expect(content.text).toContain(`<html lang="en" data-view="${name}">`);
    // Self-contained: the script and the styles are inline, nothing is loaded from elsewhere.
    expect(content.text).toMatch(/<script type="module"[^>]*>[\s\S]{1000,}<\/script>/);
    expect(content.text).not.toMatch(/<script[^>]+src=|<link[^>]+href=|<img[^>]+src=/i);
  }
}

describe("views", () => {
  it("are named by the four tools and served as ui:// resources on a 2025-era connection", async () => {
    const client = await connectClient(factory()());
    await checkSurface(client);
    await client.close();
  });

  it("are the same on the 2026-07-28 protocol", async () => {
    const { client, close } = await connectModernClient(factory());
    await checkSurface(client);
    await close();
  });

  it("stay for a read-only account (their tools only read)", async () => {
    const client = await connectClient(factory({ SUUNTO_READ_ONLY: "true" })());
    await checkSurface(client);
    await client.close();
  });

  it("are not offered without a Suunto sign-in (no tool could open them)", async () => {
    const client = await connectClient(factory({}, false)());
    expect((await client.listResources()).resources).toEqual([]);
    await client.close();
  });

  it("leave the tool answers as they were: JSON text, no structured copy", async () => {
    const client = await connectClient(factory()());
    const result = (await client.callTool({ name: "suunto_list_workouts", arguments: { limit: 2 } })) as { content: Array<{ type: string; text: string }>; structuredContent?: unknown };
    expect(result.structuredContent).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text).workouts).toHaveLength(2);
    await client.close();
  });

  it("are one page, told which view to show", () => {
    const names = Object.keys(VIEWS) as Array<keyof typeof VIEWS>;
    const pages = names.map((n) => viewHtml(n));
    for (const [i, n] of names.entries()) expect(pages[i]).toContain(`data-view="${n}"`);
    expect(new Set(pages.map((p) => p.replace(/data-view="[a-z]+"/, ""))).size).toBe(1);
  });
});
