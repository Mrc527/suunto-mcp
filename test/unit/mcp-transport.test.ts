/**
 * src/mcp-transport.ts: the argument size check, the stdio bridge to the mcp-use fetch handler
 * and the hand-off of HTTP requests. Invented data only; Suunto is never contacted (demo store).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough, Writable } from "node:stream";
import type { MCPServer } from "mcp-use";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { DemoActivityStore } from "../../src/demo/activity.js";
import { countInputElements, handleMcpPost, MAX_TOOL_INPUT_ELEMENTS, messagesOf, readBody, refusal, serveStdio, splitCancels } from "../../src/mcp-transport.js";
import { createMcpServer, createServices } from "../../src/server.js";

const INIT = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } };
const tooMany = () => Array.from({ length: MAX_TOOL_INPUT_ELEMENTS + 1 }, () => "x");

// Invented test data only.
const ENV = {
  SUUNTO_CLIENT_ID: "client-invented",
  SUUNTO_CLIENT_SECRET: "secret-invented-value",
  SUUNTO_SUBSCRIPTION_KEY: "subkey-invented-value",
  SUUNTO_REFRESH_TOKEN: "rt-invented-value",
  SUUNTO_TIMEZONE: "Europe/Zurich",
};
/** A workout key that the demo store does not have (24 hex characters, as Suunto writes them). */
const MISSING_KEY = "0123456789abcdef01234567";

function demoServer(extra: Record<string, string> = {}): MCPServer {
  const config = loadConfig({ ...ENV, ...extra });
  return createMcpServer(config, createServices(config, { demo: new DemoActivityStore() }), () => {});
}

/** A stand-in for the mcp-use server that records requests and answers with the given function. */
function fakeServer(answer: (request: Request, body: unknown) => Promise<Response> | Response) {
  const requests: Array<{ headers: Headers; body: unknown; signal: AbortSignal }> = [];
  const server = {
    fetch: async (request: Request) => {
      const body: unknown = JSON.parse(await request.text());
      requests.push({ headers: request.headers, body, signal: request.signal });
      return answer(request, body);
    },
  };
  return { server: server as unknown as MCPServer, requests };
}

const sse = (...messages: unknown[]) =>
  new Response(messages.map((m) => `event: message\ndata: ${JSON.stringify(m)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });

/** A stdio session: write lines, read the JSON lines the bridge wrote. */
function stdioSession(server: MCPServer) {
  const input = new PassThrough();
  const output = new PassThrough();
  const logs: string[] = [];
  const lines: string[] = [];
  let buffered = "";
  output.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
    let nl: number;
    while ((nl = buffered.indexOf("\n")) >= 0) {
      lines.push(buffered.slice(0, nl));
      buffered = buffered.slice(nl + 1);
    }
  });
  const conn = serveStdio(server, { input, output, log: (m) => logs.push(m) });
  return {
    send: (message: unknown) => input.write(`${typeof message === "string" ? message : JSON.stringify(message)}\n`),
    end: () => input.end(),
    closed: conn.closed,
    logs,
    lines,
    messages: () => lines.map((l) => JSON.parse(l) as Record<string, unknown>),
    /** Waits until n lines were written. */
    async waitFor(n: number) {
      for (let i = 0; i < 400 && lines.length < n; i++) await new Promise((r) => setTimeout(r, 5));
      expect(lines.length).toBeGreaterThanOrEqual(n);
    },
  };
}

describe("countInputElements", () => {
  it("counts array elements and object members at every depth", () => {
    expect(countInputElements(undefined, 100)).toBe(0);
    expect(countInputElements("text", 100)).toBe(0);
    expect(countInputElements({}, 100)).toBe(0);
    expect(countInputElements({ a: 1, b: "x" }, 100)).toBe(2);
    expect(countInputElements([1, 2, 3], 100)).toBe(3);
    // 2 members, the array's 2 elements, the inner object's 1 member.
    expect(countInputElements({ a: [1, { b: null }], c: true }, 100)).toBe(5);
  });

  it("stops counting once past the maximum", () => {
    expect(countInputElements(Array.from({ length: 1_000_000 }, () => 0), 10)).toBe(11);
    expect(countInputElements({ a: { b: { c: { d: [1, 2, 3] } } } }, 4)).toBe(5);
  });
});

describe("refusal", () => {
  it("lets through everything but tool calls with too many argument elements", () => {
    expect(refusal(INIT)).toBeUndefined();
    expect(refusal({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "x", arguments: { list: ["a"] } } })).toBeUndefined();
    expect(refusal({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { list: tooMany() } })).toBeUndefined();
    expect(refusal({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "x", arguments: { list: Array(MAX_TOOL_INPUT_ELEMENTS - 1).fill(0) } } })).toBeUndefined();
    expect(refusal("not an object")).toBeUndefined();
    expect(refusal([INIT])).toBeUndefined();
  });

  it("answers an oversized tool call with a tool error, as the MCP SDK did", () => {
    expect(refusal({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "suunto_get_workout", arguments: { list: tooMany() } } })).toEqual({
      jsonrpc: "2.0",
      id: 7,
      result: {
        isError: true,
        content: [{ type: "text", text: "Invalid arguments for tool suunto_get_workout: arguments contain more than the maximum of 10000 elements" }],
      },
    });
    const noId = refusal({ jsonrpc: "2.0", method: "tools/call", params: { name: "x", arguments: { list: tooMany() } } }) as { id: unknown };
    expect(noId.id).toBeNull();
  });

  it("refuses every request of a batch that holds an oversized tool call", () => {
    const answer = refusal([
      { jsonrpc: "2.0", id: "a", method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: "b", method: "tools/call", params: { name: "x", arguments: { list: tooMany() } } },
    ]) as Array<{ id: unknown; error: { code: number; message: string } }>;
    expect(answer.map((m) => m.id)).toEqual(["a", "b"]);
    for (const m of answer) expect(m.error).toEqual({ code: -32602, message: expect.stringMatching(/more than the maximum of 10000 elements/) });
  });
});

describe("refusal of subscriptions/listen", () => {
  it("answers Method not found to a listen request and nothing to a listen notification", () => {
    expect(refusal({ jsonrpc: "2.0", id: 4, method: "subscriptions/listen", params: {} })).toEqual({ jsonrpc: "2.0", id: 4, error: { code: -32601, message: "Method not found" } });
    expect(refusal({ jsonrpc: "2.0", method: "subscriptions/listen" })).toEqual([]);
  });
});

describe("splitCancels", () => {
  it("takes notifications/cancelled out of a batch and leaves single messages alone", () => {
    const cancel = (requestId: unknown) => ({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId } });
    const ping = { jsonrpc: "2.0", id: 3, method: "ping" };
    expect(splitCancels([ping, cancel(2), cancel("x"), cancel({ bad: true })])).toEqual({ body: [ping], cancelled: [2, "x"] });
    expect(splitCancels(cancel(2))).toEqual({ body: cancel(2), cancelled: [] });
    expect(splitCancels(ping)).toEqual({ body: ping, cancelled: [] });
  });
});

describe("messagesOf", () => {
  it("reads a JSON answer, an empty answer and an SSE stream", async () => {
    expect(await messagesOf(Response.json({ jsonrpc: "2.0", id: 1, result: {} }))).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
    expect(await messagesOf(Response.json([{ id: 1 }, { id: 2 }]))).toEqual([[{ id: 1 }, { id: 2 }]]);
    expect(await messagesOf(new Response(null, { status: 202 }))).toEqual([]);
    expect(await messagesOf(sse({ id: 1 }, { id: 2 }))).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("reads SSE with CRLF line ends, data split over lines, comments and events without data", async () => {
    const body = ': keep-alive\r\n\r\nevent: message\r\ndata: {"id":\r\ndata: 3}\r\n\r\nevent: ping\r\n\r\n';
    expect(await messagesOf(new Response(body, { headers: { "content-type": "text/event-stream; charset=utf-8" } }))).toEqual([{ id: 3 }]);
  });
});

describe("serveStdio", () => {
  it("serves initialize, tools and prompts of the real server, one JSON message per line", async () => {
    const s = stdioSession(demoServer());
    s.send(INIT);
    await s.waitFor(1);
    s.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    s.send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    s.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "suunto_list_workouts", arguments: { limit: 2 } } });
    s.send({ jsonrpc: "2.0", id: 4, method: "prompts/get", params: { name: "training_review", arguments: { period: "2025" } } });
    await s.waitFor(4);
    s.end();
    await s.closed;
    const byId = new Map(s.messages().map((m) => [m.id, m]));
    expect(s.lines).toHaveLength(4);
    const init = byId.get(1)!.result as { protocolVersion: string; serverInfo: { name: string }; instructions: string };
    expect(init.protocolVersion).toBe("2025-06-18");
    expect(init.serverInfo.name).toBe("suunto-mcp");
    expect(init.instructions).toMatch(/Tools for the user's Suunto data/);
    expect((byId.get(2)!.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)).toContain("suunto_import_route");
    const call = byId.get(3)!.result as { isError?: boolean; content: Array<{ text: string }> };
    expect(call.isError).toBeFalsy();
    expect(JSON.parse(call.content[0]!.text).workouts).toHaveLength(2);
    expect(JSON.stringify(byId.get(4)!.result)).toMatch(/2025-01-01/);
    expect(s.logs).toEqual([]);
  });

  it("turns tool failures and invalid arguments into tool errors, and an unknown tool into -32602", async () => {
    const s = stdioSession(demoServer());
    s.send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "suunto_get_workout", arguments: { workout_key: MISSING_KEY, typo: true } } });
    s.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "suunto_get_workout", arguments: { workout_key: MISSING_KEY } } });
    s.send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "nope", arguments: {} } });
    await s.waitFor(3);
    const byId = new Map(s.messages().map((m) => [m.id, m]));
    expect(byId.get(1)!.result).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/Unrecognized key: "typo"/) }] });
    expect(byId.get(2)!.result).toMatchObject({ isError: true, content: [{ text: `Suunto has no workout with the key ${MISSING_KEY}.` }] });
    expect(byId.get(3)!.error).toMatchObject({ code: -32602, message: "Tool nope not found" });
  });

  it("hides the write tools of a read-only account", async () => {
    const s = stdioSession(demoServer({ SUUNTO_READ_ONLY: "true" }));
    s.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    await s.waitFor(1);
    const names = (s.messages()[0]!.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    expect(names).toContain("suunto_list_workouts");
    expect(names).not.toContain("suunto_import_route");
    expect(names).not.toContain("suunto_create_poi");
  });

  it("refuses an oversized tool call without passing it on", async () => {
    const fake = fakeServer(() => sse({}));
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "suunto_get_workout", arguments: { list: tooMany() } } });
    await s.waitFor(1);
    expect(s.messages()[0]).toMatchObject({ id: 9, result: { isError: true, content: [{ text: expect.stringMatching(/maximum of 10000 elements/) }] } });
    expect(fake.requests).toHaveLength(0);
  });

  it("answers a line that is not JSON with a parse error and goes on", async () => {
    const s = stdioSession(demoServer());
    s.send("{not json");
    s.send("");
    s.send({ jsonrpc: "2.0", id: 5, method: "ping" });
    await s.waitFor(2);
    expect(s.messages()).toEqual(expect.arrayContaining([{ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, expect.objectContaining({ id: 5, result: {} })]));
  });

  it("ignores answers from the client and notifications", async () => {
    const fake = fakeServer(() => new Response(null, { status: 202 }));
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: 1, result: {} });
    s.send({ jsonrpc: "2.0", id: 2, error: { code: 1, message: "x" } });
    s.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    s.end();
    await s.closed;
    expect(s.lines).toEqual([]);
    // Only the notification reached the server.
    expect(fake.requests.map((r) => (r.body as { method?: string }).method)).toEqual(["notifications/initialized"]);
  });

  it("sends the protocol version negotiated by initialize with every later request", async () => {
    const fake = fakeServer((_req, body) => {
      const m = body as { id: number; method: string };
      return sse({ jsonrpc: "2.0", id: m.id, result: m.method === "initialize" ? { protocolVersion: "2025-03-26" } : {} });
    });
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: 1, method: "ping" });
    await s.waitFor(1);
    s.send(INIT);
    await s.waitFor(2);
    s.send({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    await s.waitFor(3);
    expect(fake.requests.map((r) => r.headers.get("mcp-protocol-version"))).toEqual([null, null, "2025-03-26"]);
    for (const r of fake.requests) {
      expect(r.headers.get("accept")).toBe("application/json, text/event-stream");
      expect(r.headers.get("content-type")).toBe("application/json");
    }
  });

  it("sends the protocol version a 2026-07-28 request names in _meta, without initialize", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
    const fake = fakeServer((_req, body) => sse({ jsonrpc: "2.0", id: (body as { id: number }).id, result: {} }));
    const f = stdioSession(fake.server);
    f.send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } });
    f.send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "suunto_get_workout", arguments: {}, _meta: meta } });
    await f.waitFor(2);
    const headers = (id: number) => fake.requests.find((r) => (r.body as { id: number }).id === id)!.headers;
    expect(headers(1).get("mcp-protocol-version")).toBe("2026-07-28");
    expect(headers(1).get("mcp-method")).toBe("tools/list");
    expect(headers(1).get("mcp-name")).toBeNull();
    expect(headers(2).get("mcp-method")).toBe("tools/call");
    expect(headers(2).get("mcp-name")).toBe(`=?base64?${Buffer.from("suunto_get_workout").toString("base64")}?=`);

    // The real server answers them: list, a call, a prompt with a non-ASCII name argument.
    const s = stdioSession(demoServer());
    s.send({ jsonrpc: "2.0", id: 3, method: "tools/list", params: { _meta: meta } });
    s.send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "suunto_list_workouts", arguments: { limit: 1 }, _meta: meta } });
    s.send({ jsonrpc: "2.0", id: 5, method: "prompts/get", params: { name: "training_review", arguments: { period: "année 2025" }, _meta: meta } });
    await s.waitFor(3);
    const byId = new Map(s.messages().map((m) => [m.id, m]));
    for (const id of [3, 4, 5]) expect(byId.get(id)!.error, String(id)).toBeUndefined();
    expect((byId.get(3)!.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)).toContain("suunto_list_workouts");
    expect((byId.get(4)!.result as { isError?: boolean }).isError).toBeFalsy();
    expect(JSON.stringify(byId.get(5)!.result)).toMatch(/année 2025/);
  });

  it("answers a modern listen request at once and still exits when the input ends", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
    const s = stdioSession(demoServer());
    s.send({ jsonrpc: "2.0", id: "l", method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: meta } });
    s.end();
    await s.closed;
    expect(s.messages()).toEqual([{ jsonrpc: "2.0", id: "l", error: { code: -32601, message: "Method not found" } }]);
  });

  it("answers Method not found to a modern request whose method cannot be a header value", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
    const fake = fakeServer(() => sse({}));
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: 1, method: "tools/列表", params: { _meta: meta } });
    s.send({ jsonrpc: "2.0", id: 2, method: "tools/list\r\nx: y", params: { _meta: meta } });
    s.send({ jsonrpc: "2.0", method: "notifications/x y", params: { _meta: meta } });
    s.end();
    await s.closed;
    expect(s.messages()).toEqual([
      { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } },
      { jsonrpc: "2.0", id: 2, error: { code: -32601, message: "Method not found" } },
    ]);
    expect(fake.requests).toHaveLength(0);
    expect(s.logs).toEqual([]);
  });

  it("answers a batch that cancels one of its own requests, and closes", async () => {
    const s = stdioSession(demoServer());
    s.send(INIT);
    await s.waitFor(1);
    s.send([
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 2 } },
    ]);
    s.end();
    await s.closed;
    expect(s.messages().map((m) => m.id).sort()).toEqual([1, 2, 3]);
  });

  it("aborts an earlier request named by a cancel inside a batch", async () => {
    let aborted = false;
    const fake = fakeServer((request, body) => {
      if ((body as { id?: unknown }).id !== "slow") return new Response(null, { status: 202 });
      return new Promise<Response>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => {
          aborted = true;
          reject(request.signal.reason as Error);
        });
      });
    });
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: "slow", method: "tools/call", params: { name: "x", arguments: {} } });
    for (let i = 0; i < 100 && fake.requests.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    s.send([{ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "slow" } }]);
    s.end();
    await s.closed;
    expect(aborted).toBe(true);
    expect(s.lines).toEqual([]);
    // The batch held only the cancel: nothing of it reached the server.
    expect(fake.requests).toHaveLength(1);
  });

  it("answers Unsupported protocol version to a modern request whose version cannot be a header value", async () => {
    const fake = fakeServer(() => sse({}));
    const s = stdioSession(fake.server);
    const meta = { "io.modelcontextprotocol/protocolVersion": "版本", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
    s.send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: meta } });
    s.end();
    await s.closed;
    expect(s.messages()).toEqual([{ jsonrpc: "2.0", id: 1, error: { code: -32022, message: "Unsupported protocol version" } }]);
    expect(fake.requests).toHaveLength(0);
    expect(s.logs).toEqual([]);
  });

  it("passes batches on and writes the answer", async () => {
    const s = stdioSession(demoServer());
    s.send([
      { jsonrpc: "2.0", id: "a", method: "ping" },
      { jsonrpc: "2.0", id: "b", method: "ping" },
    ]);
    await s.waitFor(2);
    expect(s.messages().map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("aborts a request named by notifications/cancelled and writes no answer for it", async () => {
    let aborted = false;
    const fake = fakeServer(
      (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            reject(request.signal.reason as Error);
          });
        }),
    );
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: "slow", method: "tools/call", params: { name: "x", arguments: {} } });
    for (let i = 0; i < 100 && fake.requests.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
    s.send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "slow", reason: "user" } });
    s.end();
    await s.closed;
    expect(aborted).toBe(true);
    expect(s.lines).toEqual([]);
    expect(s.logs).toEqual([]);
  });

  it("answers with an internal error when the server fails, and logs it", async () => {
    const fake = fakeServer(() => {
      throw new Error("handler exploded");
    });
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    s.send({ jsonrpc: "2.0", method: "notifications/initialized" });
    s.end();
    await s.closed;
    expect(s.messages()).toEqual([{ jsonrpc: "2.0", id: 4, error: { code: -32603, message: "Internal error" } }]);
    expect(s.logs).toEqual(["stdio request failed: handler exploded", "stdio request failed: handler exploded"]);
  });

  it("finishes the answers in flight before closing", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fake = fakeServer(async (_req, body) => {
      await gate;
      return sse({ jsonrpc: "2.0", id: (body as { id: number }).id, result: {} });
    });
    const s = stdioSession(fake.server);
    s.send({ jsonrpc: "2.0", id: 1, method: "ping" });
    s.end();
    let closed = false;
    void s.closed.then(() => (closed = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(closed).toBe(false);
    release();
    await s.closed;
    expect(s.messages()).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
  });

  it("keeps running when the output cannot be written to", async () => {
    const input = new PassThrough();
    const output = new Writable({
      write(_chunk, _enc, cb) {
        cb(Object.assign(new Error("EPIPE"), { code: "EPIPE" }));
      },
    });
    const conn = serveStdio(demoServer(), { input, output, log: () => {} });
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" })}\n`);
    input.end();
    await expect(conn.closed).resolves.toBeUndefined();
  });
});

describe("handleMcpPost and readBody", () => {
  let http: Server | undefined;
  afterEach(async () => {
    await new Promise<void>((r) => (http ? http.close(() => r()) : r()));
    http = undefined;
  });

  async function serve(server: MCPServer, maxBytes = 1024 * 1024): Promise<string> {
    http = createServer(async (req, res) => {
      const raw = await readBody(req, maxBytes);
      if (raw === undefined) {
        res.writeHead(413).end();
        return;
      }
      await handleMcpPost(server, req, res, JSON.parse(raw));
    });
    await new Promise<void>((r) => http!.listen(0, "127.0.0.1", () => r()));
    return `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  }

  const post = (url: string, body: unknown) =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });

  it("serves the request as POST /mcp, whatever the path", async () => {
    const base = await serve(demoServer());
    for (const path of ["/", "/mcp", "/other"]) {
      const res = await post(`${base}${path}`, INIT);
      expect(res.status, path).toBe(200);
      expect(await messagesOf(res)).toEqual([expect.objectContaining({ id: 1, result: expect.objectContaining({ protocolVersion: "2025-06-18" }) })]);
    }
  });

  it("answers an oversized tool call itself with JSON", async () => {
    const fake = fakeServer(() => sse({}));
    const base = await serve(fake.server, 10 * 1024 * 1024);
    const res = await post(base, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "t", arguments: { list: tooMany() } } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toMatchObject({ id: 3, result: { isError: true } });
    // A batch of notifications that is refused has nothing to answer.
    const empty = await post(base, [{ jsonrpc: "2.0", method: "tools/call", params: { name: "t", arguments: { list: tooMany() } } }]);
    expect(empty.status).toBe(202);
    expect(await empty.text()).toBe("");
    expect(fake.requests).toHaveLength(0);
  });

  it("forwards the client's headers and the parsed body to mcp-use", async () => {
    const fake = fakeServer(() => sse({ jsonrpc: "2.0", id: 1, result: {} }));
    const base = await serve(fake.server);
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(await messagesOf(res)).toEqual([{ jsonrpc: "2.0", id: 1, result: {} }]);
    expect(fake.requests[0]!.headers.get("mcp-protocol-version")).toBe("2025-06-18");
    expect(fake.requests[0]!.body).toEqual({ jsonrpc: "2.0", id: 1, method: "ping" });
  });

  it("never hands an unparsed body to mcp-use: 415 for other content types, 400 for empty JSON", async () => {
    const fake = fakeServer(() => sse({}));
    http = createServer((req, res) => void handleMcpPost(fake.server, req, res, undefined));
    await new Promise<void>((r) => http!.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
    const plain = await fetch(base, { method: "POST", headers: { "content-type": "text/plain", accept: "application/json, text/event-stream" }, body: "x".repeat(2 * 1024 * 1024) });
    expect(plain.status).toBe(415);
    expect(await plain.json()).toMatchObject({ jsonrpc: "2.0", id: null, error: { code: -32000, message: expect.stringMatching(/Content-Type must be application\/json/) } });
    const empty = await fetch(base, { method: "POST", headers: { "content-type": "application/json; charset=utf-8", accept: "application/json, text/event-stream" } });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toMatchObject({ error: { code: -32700 } });
    expect(fake.requests).toHaveLength(0);
  });

  it("answers a modern listen request at once instead of holding the connection open", async () => {
    const base = await serve(demoServer());
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "t", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2026-07-28", "mcp-method": "subscriptions/listen" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "subscriptions/listen", params: { notifications: { toolsListChanged: true }, _meta: meta } }),
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 7, error: { code: -32601, message: "Method not found" } });
  });

  it("ends the answer to a batch that cancels one of its own requests", async () => {
    const base = await serve(demoServer());
    const res = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" },
      body: JSON.stringify([
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 2 } },
    ]),
      signal: AbortSignal.timeout(5000),
    });
    const messages = (await messagesOf(res)) as Array<{ id: number }>;
    expect(messages.map((m) => m.id).sort()).toEqual([2, 3]);
    // A batch of cancels only has nothing to answer.
    const only = await post(base, [{ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 9 } }]);
    expect(only.status).toBe(202);
  });

  it("reads bodies up to the limit and refuses larger ones", async () => {
    const base = await serve(demoServer(), 64);
    expect((await post(base, { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(200);
    expect((await post(base, { jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(100) } })).status).toBe(413);
  });
});

describe("the stdio process", () => {
  it("writes nothing but JSON-RPC answers to stdout (no request log from mcp-use)", async () => {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: new URL("../..", import.meta.url).pathname,
      // Invented credentials; Suunto points at a closed local port, so every call fails fast.
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", ...ENV, SUUNTO_OAUTH_URL: "http://127.0.0.1:1/", SUUNTO_API_URL: "http://127.0.0.1:1/" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    const requests = [
      INIT,
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "suunto_account_info", arguments: {} } },
      { jsonrpc: "2.0", id: 4, method: "prompts/list" },
      { jsonrpc: "2.0", id: 5, method: "ping" },
    ];
    child.stdin.end(requests.map((r) => JSON.stringify(r)).join("\n") + "\n");
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    expect(code).toBe(0);
    const lines = stdout.split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0", id: expect.any(Number) });
  });

  it("does not serve a skills/ directory found in the working directory", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { connectClient } = await import("../helpers/mcp-client.js");
    const dir = mkdtempSync(join(tmpdir(), "suunto-mcp-skills-"));
    mkdirSync(join(dir, "skills", "demo"), { recursive: true });
    writeFileSync(join(dir, "skills", "demo", "SKILL.md"), "---\nname: demo\ndescription: invented\n---\nInvented skill.\n");
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const client = await connectClient(demoServer());
      expect((await client.listResources()).resources).toEqual([]);
      await client.close();
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
