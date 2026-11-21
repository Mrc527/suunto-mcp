/**
 * Serving MCP over Node HTTP with the SDK's handler, behind the checks the SDK does not make.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, type McpServerFactory } from "@modelcontextprotocol/server";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

export interface NodeMcpHandler {
  /** Serves one POST whose JSON body was already parsed. */
  post(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void>;
  /** Aborts the exchanges in flight. */
  close(): Promise<void>;
}

/** The SDK handler for a server factory (a fresh server per request), mounted on Node. */
export function createNodeMcpHandler(factory: McpServerFactory): NodeMcpHandler {
  // JSON where the SDK allows it (2026-07-28 requests); 2025-era requests are answered as SSE.
  const handler = createMcpHandler(factory, { responseMode: "json" });
  const node = toNodeHandler(handler);
  return {
    post: (req, res, body) => handleMcpPost(node, req, res, body),
    close: () => handler.close(),
  };
}

/**
 * The answer to a body that must not reach the SDK, or undefined when it may; [] means "answer
 * nothing". subscriptions/listen is refused: its stream would stay open for good and this server
 * sends no notifications.
 */
export function refusal(body: unknown): unknown {
  if (isObject(body) && body.method === "subscriptions/listen") {
    return isRequestId(body.id) ? { jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Method not found" } } : [];
  }
  return undefined;
}

/**
 * A batch without its notifications/cancelled. The SDK drops the answer to a request cancelled
 * within its own batch and then holds the batch's stream open waiting for it.
 */
export function splitCancels(body: unknown): unknown {
  if (!Array.isArray(body)) return body;
  // With an id it is a request (answered Method not found), not a cancel.
  return body.filter((m) => !isObject(m) || m.method !== "notifications/cancelled" || m.id !== undefined);
}

type NodeHandler = ReturnType<typeof toNodeHandler>;

/** Hands one parsed JSON-RPC body to the SDK handler, after the checks above. */
export async function handleMcpPost(node: NodeHandler, req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
  // An unparsed body (another Content-Type, or empty) would let the SDK read the stream past every
  // check here.
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
  const forwarded = refused === undefined ? splitCancels(body) : undefined;
  const nothingLeft = Array.isArray(body) && body.length > 0 && Array.isArray(forwarded) && forwarded.length === 0;
  if ((Array.isArray(refused) && refused.length === 0) || nothingLeft) {
    res.writeHead(202).end();
    return;
  }
  if (refused !== undefined) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(refused));
    return;
  }
  await node(req, res, forwarded);
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
