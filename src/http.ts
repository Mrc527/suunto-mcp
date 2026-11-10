/**
 * Streamable HTTP transport (stateless). Lets remote MCP clients connect over HTTP.
 *
 * Security:
 * - Optional (required for non-loopback binds) bearer token, compared in constant time.
 * - Host header validation against DNS rebinding when bound to loopback.
 * - Origin validation: browser requests are rejected unless the origin is explicitly allowed.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isLoopback, type HttpSettings } from "./config.js";

export interface HttpServerOptions {
  settings: HttpSettings;
  /** Creates a fresh MCP server for each request (stateless mode). */
  createMcpServer: () => McpServer;
  log: (message: string) => void;
}

function tokenMatches(expected: string, provided: string): boolean {
  // Hash both values so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(provided).digest();
  return timingSafeEqual(a, b);
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(payload);
}

function jsonRpcError(res: ServerResponse, status: number, message: string, headers: Record<string, string> = {}): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code: -32000, message }, id: null }, headers);
}

function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1);
  return h.split(":")[0] ?? h;
}

export function isAllowedHost(hostHeader: string | undefined, settings: HttpSettings): boolean {
  if (!hostHeader) return false;
  const host = hostnameOf(hostHeader);
  const allowed = settings.allowedHosts.map((h) => h.toLowerCase());
  if (allowed.includes(host) || allowed.includes(hostHeader.toLowerCase())) return true;
  if (isLoopback(settings.host)) {
    return host === "localhost" || host === "[::1]" || /^127(\.\d{1,3}){3}$/.test(host);
  }
  // Bound to a public interface: accept the bind address itself, any host when bound to all
  // interfaces (a token is mandatory in that case), or the explicit allow list.
  if (settings.host === "0.0.0.0" || settings.host === "::") return true;
  const bind = settings.host.toLowerCase();
  return host === bind || host === `[${bind.replace(/^\[|\]$/g, "")}]`;
}

export function startHttpServer(options: HttpServerOptions): Promise<Server> {
  const { settings, log } = options;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const origin = req.headers.origin;
    const corsHeaders: Record<string, string> = {};
    if (origin && settings.allowedOrigins.includes(origin)) {
      corsHeaders["access-control-allow-origin"] = origin;
      corsHeaders["access-control-allow-headers"] =
        "authorization, content-type, mcp-session-id, mcp-protocol-version, last-event-id";
      corsHeaders["access-control-allow-methods"] = "POST, GET, DELETE, OPTIONS";
      corsHeaders["access-control-expose-headers"] = "mcp-session-id";
      corsHeaders["vary"] = "Origin";
    }

    try {
      if (url.pathname === "/healthz" && req.method === "GET") {
        sendJson(res, 200, { status: "ok" });
        return;
      }
      if (url.pathname !== "/mcp" && url.pathname !== "/") {
        sendJson(res, 404, { error: "Not found. The MCP endpoint is /mcp" });
        return;
      }
      if (!isAllowedHost(req.headers.host, settings)) {
        jsonRpcError(res, 403, "Forbidden: invalid Host header");
        return;
      }
      if (origin && !settings.allowedOrigins.includes(origin)) {
        jsonRpcError(res, 403, "Forbidden: origin not allowed (set MCP_HTTP_ALLOWED_ORIGINS)");
        return;
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
      }
      if (settings.token) {
        const auth = req.headers.authorization ?? "";
        const match = auth.match(/^Bearer\s+(.+)$/i);
        if (!match || !tokenMatches(settings.token, match[1]!.trim())) {
          jsonRpcError(res, 401, "Unauthorized", { "www-authenticate": 'Bearer realm="padi-mcp"', ...corsHeaders });
          return;
        }
      }
      if (req.method !== "POST") {
        // Stateless server: no standalone SSE stream and no sessions to delete.
        jsonRpcError(res, 405, "Method not allowed", { allow: "POST", ...corsHeaders });
        return;
      }

      for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
      const mcp = options.createMcpServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      log(`HTTP request failed: ${(error as Error).message}`);
      if (!res.headersSent) jsonRpcError(res, 500, "Internal server error");
      else res.end();
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(settings.port, settings.host, () => {
      server.off("error", reject);
      log(`padi-mcp listening on http://${settings.host.includes(":") ? `[${settings.host}]` : settings.host}:${settings.port}/mcp`);
      resolve(server);
    });
  });
}
