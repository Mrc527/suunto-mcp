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
 * The answer to a body that must not reach mcp-use, or undefined when it may; [] means "answer
 * nothing".
 *
 * A single oversized tool call gets a tool error, like the MCP SDK gives for invalid arguments.
 * A batch holding one gets an error for each of its requests. subscriptions/listen is refused.
 */
export function refusal(body: unknown): unknown {
  // A 2026-07-28 listen stream would stay open for good (each request has its own mcp-use
  // handler, so its subscription cap never applies) and this server sends no notifications.
  if (isObject(body) && body.method === "subscriptions/listen") {
    return isRequestId(body.id) ? { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } } : [];
  }
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

/**
 * A batch without its notifications/cancelled, and the request ids they name. mcp-use drops the
 * answer to a request cancelled within its own batch and then holds the batch's stream open
 * waiting for it.
 */
export function splitCancels(body: unknown): { body: unknown; cancelled: Array<string | number> } {
  if (!Array.isArray(body)) return { body, cancelled: [] };
  const cancelled: Array<string | number> = [];
  const rest = body.filter((m) => {
    // With an id it is a request (answered Method not found), not a cancel.
    if (!isObject(m) || m.method !== "notifications/cancelled" || m.id !== undefined) return true;
    const target = isObject(m.params) ? m.params.requestId : undefined;
    if (isRequestId(target)) cancelled.push(target);
    return false;
  });
  return { body: rest, cancelled };
}

// ---------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------

/**
 * Hands one POSTed, already parsed JSON-RPC body to the mcp-use server and writes its answer.
 * The request is always served as POST /mcp, whatever path it came in on.
 */
export async function handleMcpPost(server: MCPServer, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  // Without a parsed body mcp-use would read the raw stream with no size limit.
  if (body === undefined) {
    const json = /^application\/json\b/i.test(req.headers["content-type"] ?? "");
    res.writeHead(json ? 400 : 415, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: json ? { code: -32700, message: "Parse error: Invalid JSON" } : { code: -32000, message: "Unsupported Media Type: Content-Type must be application/json" },
      }),
    );
    return;
  }
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
  const forwarded = splitCancels(body).body;
  if (Array.isArray(body) && body.length > 0 && Array.isArray(forwarded) && forwarded.length === 0) {
    res.writeHead(202).end();
    return;
  }
  const handler = toNodeHandler(server);
  // The body is always the parsed one: the request stream is never handed over.
  const noStream = (async function* (): AsyncGenerator<Uint8Array> {})();
  await handler({ method: "POST", url: MCP_PATH, headers: req.headers, [Symbol.asyncIterator]: () => noStream }, res, forwarded);
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

/** Visible ASCII: what an HTTP header value built from a request field may hold. */
const HEADER_VALUE = /^[\x21-\x7e]+$/;

/** The protocol version a modern (2026-07-28) request declares in its _meta envelope. */
function envelopeVersion(message: unknown): string | undefined {
  if (!isObject(message) || !isObject(message.params) || !isObject(message.params._meta)) return undefined;
  const version = message.params._meta["io.modelcontextprotocol/protocolVersion"];
  return typeof version === "string" ? version : undefined;
}

/** The body field the Mcp-Name header mirrors, per method (SEP-2243). */
const NAME_SOURCE: Record<string, string> = {
  "tools/call": "name",
  "prompts/get": "name",
  "resources/read": "uri",
  "tasks/get": "taskId",
  "tasks/update": "taskId",
  "tasks/cancel": "taskId",
};

/** The standard headers of a modern request; Mcp-Name always in the Base64 form, which takes any text. */
function modernHeaders(message: JsonObject, version: string): Record<string, string> {
  const headers: Record<string, string> = { "mcp-protocol-version": version };
  if (typeof message.method !== "string") return headers;
  headers["mcp-method"] = message.method;
  const field = Object.hasOwn(NAME_SOURCE, message.method) ? NAME_SOURCE[message.method] : undefined;
  const value = field && isObject(message.params) ? message.params[field] : undefined;
  if (typeof value === "string") headers["mcp-name"] = `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`;
  return headers;
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
      // A 2026-07-28 request names its version in _meta (no initialize) and needs the headers
      // HTTP clients mirror from the body; older requests use the version from initialize.
      const modern = envelopeVersion(body);
      if (modern) Object.assign(headers, modernHeaders(body as JsonObject, modern));
      else if (protocolVersion) headers["mcp-protocol-version"] = protocolVersion;
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
      if (body.method === "notifications/cancelled" && body.id === undefined) {
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
    // A modern request's version and method go into headers; values that cannot be header
    // values are an unknown version or method.
    const version = envelopeVersion(body);
    if (version !== undefined) {
      const method = String((body as JsonObject).method);
      const error = !HEADER_VALUE.test(version)
        ? { code: -32022, message: "Unsupported protocol version" }
        : !HEADER_VALUE.test(method)
          ? { code: -32601, message: "Method not found" }
          : undefined;
      if (error) {
        const id = (body as JsonObject).id;
        if (isRequestId(id)) write({ jsonrpc: "2.0", id, error });
        return;
      }
    }
    const split = splitCancels(body);
    for (const target of split.cancelled) inflight.get(JSON.stringify(target))?.abort();
    if (Array.isArray(body) && body.length > 0 && Array.isArray(split.body) && split.body.length === 0) return;
    body = split.body;
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
