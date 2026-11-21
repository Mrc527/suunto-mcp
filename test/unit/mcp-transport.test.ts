/**
 * src/mcp-transport.ts in front of the SDK's HTTP handler, and the stdio process. Invented data
 * only; Suunto is never contacted (demo store, or a closed local port).
 */
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { DemoActivityStore } from "../../src/demo/activity.js";
import { MAX_REQUEST_BODY_BYTES } from "../../src/http.js";
import { createNodeMcpHandler, handleMcpPost, readBody, refusal, splitCancels } from "../../src/mcp-transport.js";
import { createMcpServer, createServices, MAX_TOOL_INPUT_ELEMENTS } from "../../src/server.js";
import { messagesOf } from "../helpers/mcp-client.js";

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };
const META = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
// Invented test data only.
const ENV = {
  SUUNTO_CLIENT_ID: "client-invented",
  SUUNTO_CLIENT_SECRET: "secret-invented-value",
  SUUNTO_SUBSCRIPTION_KEY: "subkey-invented-value",
  SUUNTO_REFRESH_TOKEN: "rt-invented-value",
  SUUNTO_TIMEZONE: "Europe/Zurich",
};
const cancel = (requestId: unknown) => ({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } });

function demoFactory(extra: Record<string, string> = {}) {
  const config = loadConfig({ ...ENV, ...extra });
  const services = createServices(config, { demo: new DemoActivityStore() });
  return () => createMcpServer(config, services, () => {});
}

describe("refusal", () => {
  it("answers Method not found to a listen request, nothing to a listen notification, and lets the rest through", () => {
    expect(refusal({ jsonrpc: "2.0", id: 4, method: "subscriptions/listen", params: {} })).toEqual({ jsonrpc: "2.0", id: 4, error: { code: -32601, message: "Method not found" } });
    expect(refusal({ jsonrpc: "2.0", method: "subscriptions/listen" })).toEqual([]);
    expect(refusal(INIT)).toBeUndefined();
    expect(refusal([{ jsonrpc: "2.0", id: 1, method: "ping" }])).toBeUndefined();
    expect(refusal("text")).toBeUndefined();
  });
});

describe("splitCancels", () => {
  it("takes notifications/cancelled out of a batch and leaves single messages alone", () => {
    const ping = { jsonrpc: "2.0", id: 3, method: "ping" };
    expect(splitCancels([ping, cancel(2), cancel("x")])).toEqual([ping]);
    expect(splitCancels(cancel(2))).toEqual(cancel(2));
    expect(splitCancels(ping)).toEqual(ping);
    // A request (with an id) that names the cancel method is not a cancel.
    const asRequest = { jsonrpc: "2.0", id: 5, method: "notifications/cancelled", params: { requestId: 2 } };
    expect(splitCancels([ping, asRequest])).toEqual([ping, asRequest]);
  });
});

describe("the SDK handler behind the checks", () => {
  let http: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((r) => (http ? http.close(() => r()) : r()));
    http = undefined;
  });

  /** A local server that parses the body like src/http.ts and hands it to createNodeMcpHandler. */
  async function serve(factory = demoFactory()): Promise<string> {
    const mcp = createNodeMcpHandler(factory);
    http = createServer(async (req, res) => {
      const raw = await readBody(req, MAX_REQUEST_BODY_BYTES);
      if (raw === undefined) {
        res.writeHead(413).end();
        return;
      }
      await mcp.post(req, res, JSON.parse(raw));
    });
    http.on("close", () => void mcp.close());
    await new Promise<void>((r) => http!.listen(0, "127.0.0.1", () => r()));
    return `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
  }

  const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  const modern = (method: string, name?: string) => ({
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": method,
    ...(name ? { "mcp-name": name } : {}),
  });

  it("serves 2025-era clients (SSE answers) and 2026-07-28 requests (JSON answers)", async () => {
    const url = await serve();
    const init = await post(url, INIT);
    expect(init.headers.get("content-type")).toBe("text/event-stream");
    expect(await messagesOf(init)).toEqual([expect.objectContaining({ id: 1, result: expect.objectContaining({ protocolVersion: "2025-06-18" }) })]);
    const call = await post(
      url,
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "suunto_list_workouts", arguments: { limit: 2 }, _meta: META } },
      modern("tools/call", "suunto_list_workouts"),
    );
    expect(call.headers.get("content-type")).toMatch(/^application\/json/);
    const [answer] = (await messagesOf(call)) as Array<{ id: number; result: { isError?: boolean; content: Array<{ text: string }> } }>;
    expect(answer!.id).toBe(2);
    expect(answer!.result.isError).toBeFalsy();
    expect(JSON.parse(answer!.result.content[0]!.text).workouts).toHaveLength(2);
  });

  it("refuses a tool call with more than 10000 argument elements before the arguments are validated", async () => {
    const url = await serve();
    const res = await post(
      url,
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "suunto_get_workout", arguments: { list: Array(MAX_TOOL_INPUT_ELEMENTS + 1).fill("x") } } },
      { "mcp-protocol-version": "2025-06-18" },
    );
    expect(await messagesOf(res)).toEqual([
      expect.objectContaining({ id: 3, result: { isError: true, content: [{ type: "text", text: "Invalid arguments for tool suunto_get_workout: arguments contain more than the maximum of 10000 elements" }] } }),
    ]);
  });

  it("answers a 2026-07-28 listen request at once instead of holding the connection open", async () => {
    const url = await serve();
    const res = await post(url, { jsonrpc: "2.0", id: 7, method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: META } }, modern("subscriptions/listen"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32601, message: "Method not found" } });
  });

  it("ends the answer to a batch that cancels one of its own requests", async () => {
    const url = await serve();
    const res = await post(url, [{ jsonrpc: "2.0", id: 2, method: "tools/list" }, { jsonrpc: "2.0", id: 3, method: "ping" }, cancel(2)], { "mcp-protocol-version": "2025-03-26" });
    expect(((await messagesOf(res)) as Array<{ id: number }>).map((m) => m.id).sort()).toEqual([2, 3]);
    // A batch of cancels only has nothing to answer.
    const only = await post(url, [cancel(9)]);
    expect(only.status).toBe(202);
    expect(await only.text()).toBe("");
  });

  it("answers an unknown tool with -32602", async () => {
    const url = await serve();
    const res = await post(url, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } }, { "mcp-protocol-version": "2025-06-18" });
    expect(await messagesOf(res)).toEqual([expect.objectContaining({ id: 4, error: expect.objectContaining({ code: -32602, message: "Tool nope not found" }) })]);
  });

  it("never hands an unparsed body to the SDK: 415 for other content types, 400 for empty JSON", async () => {
    const node = vi.fn(async () => {});
    http = createServer((req, res) => void handleMcpPost(node, req, res, undefined));
    await new Promise<void>((r) => http!.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const plain = await fetch(base, { method: "POST", headers: { "content-type": "text/plain", accept: "application/json, text/event-stream" }, body: "x".repeat(2 * 1024 * 1024) });
    expect(plain.status).toBe(415);
    expect(await plain.json()).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32000, message: expect.stringMatching(/Content-Type must be application\/json/) } });
    const empty = await fetch(base, { method: "POST", headers: { "content-type": "application/json; charset=utf-8", accept: "application/json, text/event-stream" } });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: { code: -32700 } });
    expect(node).not.toHaveBeenCalled();
  });

  it("reads bodies up to the limit and refuses larger ones", async () => {
    const url = await serve();
    expect((await post(url, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    const big = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ pad: "x".repeat(MAX_REQUEST_BODY_BYTES) }) });
    expect(big.status).toBe(413);
  });
});

describe("the stdio process", () => {
  /** Runs the server from source over stdio, sends the lines, closes stdin, returns stdout and the exit code. */
  async function runStdio(lines: unknown[]): Promise<{ code: number | null; out: Array<Record<string, unknown>>; raw: string }> {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: new URL("../..", import.meta.url).pathname,
      // Invented credentials; Suunto points at a closed local port, so every call fails fast.
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...ENV, SUUNTO_OAUTH_URL: "http://127.0.0.1:1/", SUUNTO_API_URL: "http://127.0.0.1:1/" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Listen from the start: a process that exits early must fail the test, not hang it.
    const closed = new Promise<number | null>((resolve) => child.on("close", resolve));
    let raw = "";
    child.stdout.on("data", (c: Buffer) => (raw += c.toString("utf8")));
    const out: Array<Record<string, unknown>> = [];
    // Keep stdin open until every request with an id has its answer: in-flight requests are
    // dropped when stdin closes.
    const expected = lines.filter((l) => typeof (l as { id?: unknown }).id !== "undefined").length;
    for (const line of lines) child.stdin.write(`${JSON.stringify(line)}\n`);
    for (let i = 0; i < 400; i++) {
      const parsed = raw.split("\n").filter((l) => l !== "");
      if (parsed.length >= expected) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    child.stdin.end();
    const code = await closed;
    for (const line of raw.split("\n").filter((l) => l !== "")) out.push(JSON.parse(line) as Record<string, unknown>);
    return { code, out, raw };
  }

  it("writes nothing but JSON-RPC answers to stdout and exits when stdin closes", async () => {
    const { code, out } = await runStdio([
      INIT,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "suunto_account_info", arguments: {} } },
      { jsonrpc: "2.0", id: 4, method: "prompts/list" },
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nope", arguments: {} } },
    ]);
    expect(code).toBe(0);
    expect(out.map((m) => m.id).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const m of out) expect(m.jsonrpc).toBe("2.0");
    const byId = new Map(out.map((m) => [m.id, m]));
    expect((byId.get(1)!.result as { serverInfo: { name: string } }).serverInfo.name).toBe("suunto-mcp");
    expect((byId.get(3)!.result as { isError?: boolean }).isError).toBe(true);
    expect(byId.get(5)!.error).toMatchObject({ code: -32602 });
  });

  it("serves a 2026-07-28 client that sends no initialize", async () => {
    const { code, out } = await runStdio([{ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: META } }]);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect((out[0]!.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)).toContain("suunto_account_info");
  });

  it("keeps serving a client that probes with server/discover and then falls back to initialize", async () => {
    // serveStdio closes the probe server it discards; that must not end the process.
    const { code, out } = await runStdio([
      { jsonrpc: "2.0", id: 1, method: "server/discover", params: { _meta: META } },
      { ...INIT, id: 2 },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 3, method: "tools/list" },
    ]);
    expect(code).toBe(0);
    expect(out.map((m) => m.id).sort()).toEqual([1, 2, 3]);
    const byId = new Map(out.map((m) => [m.id, m]));
    expect((byId.get(2)!.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
    expect((byId.get(3)!.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)).toContain("suunto_account_info");
  });
});
