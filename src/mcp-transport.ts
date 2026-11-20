/**
 * Serving the mcp-use server over stdio and over Node HTTP.
 *
 * mcp-use serves MCP statelessly through a fetch handler and has no stdio transport, so stdio
 * messages are posted to that handler one by one. Every path checks the size of tool arguments
 * first: mcp-use validates them against the schema before any middleware runs.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { MCPServer } from "mcp-use";
import { toNodeHandler } from "mcp-use/node";

/** Largest number of array elements plus object members in one tool call's arguments. */
export const MAX_TOOL_INPUT_ELEMENTS = 10_000;

/** The path mcp-use serves MCP on. */
const MCP_PATH = "/mcp";

type JsonRpcId = string | number | null;
type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/** Array elements plus object members in a value; stops counting once past max. */
export function countInputElements(value: unknown, max: number): number {
  let count = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== "object") continue;
    const children = Array.isArray(node) ? node : Object.values(node);
    for (const child of children) {
      if (++count > max) return count;
      if (child !== null && typeof child === "object") stack.push(child);
    }
  }
  return count;
}

/** The refusal text of a tool call whose arguments are too large, or undefined. */
function oversizedToolCall(message: unknown): string | undefined {
  if (!isObject(message) || message.method !== "tools/call" || !isObject(message.params)) return undefined;
  const { name, arguments: args } = message.params;
  if (countInputElements(args, MAX_TOOL_INPUT_ELEMENTS) <= MAX_TOOL_INPUT_ELEMENTS) return undefined;
  return `Invalid arguments for tool ${String(name)}: arguments contain more than the maximum of ${MAX_TOOL_INPUT_ELEMENTS} elements`;
}

/**
 * The answer to a body that must not reach mcp-use, or undefined when it may.
 *
 * A single oversized tool call gets a tool error, like the MCP SDK gives for invalid arguments.
 * A batch holding one gets an error for each of its requests.
 */
export function refusal(body: unknown): unknown {
  if (!Array.isArray(body)) {
    const text = oversizedToolCall(body);
    if (text === undefined) return undefined;
    const id = isObject(body) && isRequestId(body.id) ? body.id : null;
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
  }
  const texts = body.map(oversizedToolCall);
  if (texts.every((t) => t === undefined)) return undefined;
  const text = texts.find((t) => t !== undefined)!;
  return body
    .filter((m): m is JsonObject & { id: string | number } => isObject(m) && typeof m.method === "string" && isRequestId(m.id))
    .map((m) => ({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: text } }));
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

/**
 * Hands one POSTed, already parsed JSON-RPC body to the mcp-use server and writes its answer.
 * The request is always served as POST /mcp, whatever path it came in on.
 */
export async function handleMcpPost(server: MCPServer, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  const refused = refusal(body);
  if (refused !== undefined) {
    // A batch of notifications only has nothing to answer.
    if (Array.isArray(refused) && refused.length === 0) {
      res.writeHead(202).end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(refused));
    return;
  }
  const handler = toNodeHandler(server);
  await handler({ method: "POST", url: MCP_PATH, headers: req.headers, [Symbol.asyncIterator]: () => req[Symbol.asyncIterator]() }, res, body);
}

/** Reads a request body of at most maxBytes; undefined when it is larger. */
export async function readBody(req: IncomingMessage, maxBytes: number): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += buf.length;
    if (size > maxBytes) return undefined;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ---------------------------------------------------------------------------------------------
// stdio
// ---------------------------------------------------------------------------------------------

export interface StdioOptions {
  input?: Readable;
  output?: Writable;
  log: (message: string) => void;
}

export interface StdioConnection {
  /** Resolves when the input ended and every answer was written. */
  closed: Promise<void>;
}

/** The JSON-RPC messages of a response from the mcp-use handler (JSON or an SSE stream). */
export async function messagesOf(response: Response): Promise<unknown[]> {
  const text = await response.text();
  if (!text.trim()) return [];
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream")) {
    const parsed: unknown = JSON.parse(text);
    return [parsed];
  }
  const messages: unknown[] = [];
  for (const event of text.replace(/\r\n?/g, "\n").split("\n\n")) {
    const data = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    if (data.length > 0) messages.push(JSON.parse(data.join("\n")));
  }
  return messages;
}

/**
 * Serves the mcp-use server over stdio: one JSON-RPC message (or batch) per line. Each request is
 * posted to the server's fetch handler; requests run concurrently and answers are written as
 * they complete. notifications/cancelled aborts the request it names.
 */
export function serveStdio(server: MCPServer, options: StdioOptions): StdioConnection {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const inflight = new Map<string, AbortController>();
  const pending = new Set<Promise<void>>();
  // After initialize, every request names the negotiated protocol version, as over HTTP.
  let protocolVersion: string | undefined;
  let outputOpen = true;
  output.on("error", () => {
    outputOpen = false;
  });

  const write = (message: unknown) => {
    if (outputOpen) output.write(`${JSON.stringify(message)}\n`);
  };

  const post = async (body: unknown, requestId: string | undefined) => {
    const controller = new AbortController();
    if (requestId !== undefined) inflight.set(requestId, controller);
    try {
      const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
      if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
      const response = await server.fetch(
        new Request(`http://localhost${MCP_PATH}`, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal }),
      );
      for (const message of await messagesOf(response)) {
        const result = isObject(message) && isObject(message.result) ? message.result : undefined;
        if (isObject(body) && body.method === "initialize" && typeof result?.protocolVersion === "string") protocolVersion = result.protocolVersion;
        write(message);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      options.log(`stdio request failed: ${(error as Error).message}`);
      if (isObject(body) && isRequestId(body.id)) write({ jsonrpc: "2.0", id: body.id, error: { code: -32603, message: "Internal error" } });
    } finally {
      if (requestId !== undefined && inflight.get(requestId) === controller) inflight.delete(requestId);
    }
  };

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let body: unknown;
    try {
      body = JSON.parse(line);
    } catch {
      write({ jsonrpc: "2.0", id: null as JsonRpcId, error: { code: -32700, message: "Parse error" } });
      return;
    }
    if (isObject(body)) {
      // Answers to server requests: this server sends none.
      if (body.method === undefined && ("result" in body || "error" in body)) return;
      if (body.method === "notifications/cancelled") {
        const target = isObject(body.params) ? body.params.requestId : undefined;
        if (isRequestId(target)) inflight.get(JSON.stringify(target))?.abort();
        return;
      }
    }
    const refused = refusal(body);
    if (refused !== undefined) {
      if (!Array.isArray(refused) || refused.length > 0) write(refused);
      return;
    }
    const requestId = isObject(body) && isRequestId(body.id) ? JSON.stringify(body.id) : undefined;
    const task = post(body, requestId);
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };

  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on("line", handleLine);
  const closed = new Promise<void>((resolve) => {
    lines.once("close", () => {
      void Promise.allSettled([...pending]).then(() => resolve());
    });
  });
  return { closed };
}
