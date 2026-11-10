/**
 * The authenticated MCP endpoint. Each request runs with the Suunto connection of the user the
 * access token belongs to.
 */

import express, { type Request, type Response, type Router } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Icon } from "@modelcontextprotocol/sdk/types.js";
import { DEMO_NOTICE, DemoActivityStore } from "../demo/index.js";
import { createMcpServer, createServices } from "../server.js";
import { redactForLog, UserFacingError } from "../util/errors.js";
import { buildSetupConfig } from "./accounts.js";
import { mcpIcons } from "./brand.js";
import type { WebContext } from "./context.js";
import { rateLimit } from "express-rate-limit";
import { SCOPE } from "./oauth.js";
import { issuerOf } from "./routes-oauth.js";
import type { User } from "./store.js";

/**
 * A placeholder demo store for the setup server (never read: every call is stopped first). Built
 * on first use, because building sample data takes a moment.
 */
let setupStore: DemoActivityStore | undefined;

/** Why a user's tool calls cannot reach Suunto. */
type SetupProblem = { kind: "not_connected" } | { kind: "not_configured" } | { kind: "unusable"; detail: string };

/** The answer of every tool call while the problem lasts. */
export function setupMessage(ctx: WebContext, user: User, problem: SetupProblem): string {
  const accountUrl = `${issuerOf(ctx.publicUrl)}/account`;
  switch (problem.kind) {
    case "not_configured":
      return "The administrator of this server has not set up the Suunto connection yet, so Suunto data cannot be read. Try again later, or ask the administrator of this server.";
    case "unusable":
      return `The Suunto connection saved for ${user.email} cannot be used: ${problem.detail} Connect Suunto again at ${accountUrl}.`;
    default:
      return `Suunto is not connected yet for ${user.email}. Connect your Suunto account first at ${accountUrl}, then try again.`;
  }
}

/** Told to the AI app of a user whose time zone and units are not known yet. */
export function notKnownYet(timeZone: string): string {
  return `The user's time zone and units are not known until Suunto is connected: ${timeZone} and metric units above are only this server's defaults, so do not rely on them.`;
}

/**
 * Server for users who cannot use Suunto yet: not connected, the operator's app keys are missing,
 * or the stored connection cannot be read. It offers the same tools as a connected account,
 * because AI apps cache the tool list, but every call answers with what to do. It uses the
 * user's saved time zone and units when they can be read; otherwise the AI app is told that they
 * are not known yet (never a made-up value).
 */
function setupServer(ctx: WebContext, user: User, problem: SetupProblem): McpServer {
  const message = setupMessage(ctx, user, problem);
  const stored = problem.kind === "unusable" ? undefined : ctx.store.getSuuntoSettings(user.id);
  // Nothing is ever read from the placeholder store: the guard below stops every call before it runs.
  const config = buildSetupConfig(ctx.store.getSettings(), stored);
  setupStore ??= new DemoActivityStore();
  const services = createServices(config, { demo: setupStore });
  return createMcpServer(config, services, ctx.log, {
    ...branding(ctx),
    beforeToolCall: () => {
      throw new UserFacingError(message);
    },
    extraInstructions: stored ? message : `${message}\n${notKnownYet(config.timeZone)}`,
  });
}

function branding(ctx: WebContext): { icons: Icon[]; websiteUrl: string } {
  const base = issuerOf(ctx.publicUrl);
  return { icons: mcpIcons(base), websiteUrl: `${base}/` };
}

function cors(req: Request, res: Response, next: () => void): void {
  // Bearer tokens (no cookies) authenticate this endpoint, so any origin may call it.
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id");
  res.setHeader("access-control-expose-headers", "www-authenticate, mcp-session-id");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

/** JSON-RPC messages accepted in one batch. */
const MAX_BATCH = 20;

export function mcpRoutes(ctx: WebContext): Router {
  const r = express.Router();
  const bearer = requireBearerAuth({
    verifier: ctx.provider,
    resourceMetadataUrl: `${issuerOf(ctx.publicUrl)}/.well-known/oauth-protected-resource/mcp`,
    expectedResource: ctx.mcpUrl,
    requiredScopes: [SCOPE],
  });
  // Claude calls from a few shared IP ranges, so limit per user rather than per IP.
  const perUser = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request & { auth?: AuthInfo }) => `user:${String(req.auth?.extra?.userId ?? "")}`,
    message: { jsonrpc: "2.0", error: { code: -32000, message: "Too many requests, slow down" }, id: null },
  });

  r.use("/mcp", cors);

  // Parsing here lets the batch size be checked. 8 MB: a GPX file of up to 5 MB (suunto_import_route)
  // must fit after JSON escaping.
  const json = express.json({ limit: "8mb" });

  r.post("/mcp", bearer, perUser, json, async (req: Request & { auth?: AuthInfo }, res: Response) => {
    // The rate limit counts requests; a JSON-RPC batch could hide many tool calls in one.
    // MCP clients send single messages (current protocol versions have no batches).
    if (Array.isArray(req.body) && req.body.length > MAX_BATCH) {
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: `At most ${MAX_BATCH} messages per request` }, id: null });
      return;
    }
    const auth = req.auth!;
    const userId = String(auth.extra?.userId ?? "");
    const user = ctx.store.getUser(userId);
    if (!user || user.disabled) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Account not active" }, id: null });
      return;
    }
    let server: McpServer;
    try {
      // "Needs reconnect" does not block tool calls: Suunto has refused refresh tokens by mistake
      // during outages. The user's Suunto session decides (it tries again after a cool-down) and
      // answers "Your Suunto connection expired. Connect Suunto again at <url>/account."
      const userCtx = ctx.pool.get(user);
      const accountUrl = `${issuerOf(ctx.publicUrl)}/account`;
      // Running tool calls, so a shutdown waits a moment for them (a token refresh saves its tokens).
      const running: (() => void)[] = [];
      server = userCtx
        ? createMcpServer(userCtx.config, userCtx.services, ctx.log, {
            ...branding(ctx),
            beforeToolCall: () => void running.push(ctx.pool.begin()),
            onToolCall: (tool, ok, ms) => {
              running.pop()?.();
              try {
                ctx.live.publish(user.id, ctx.store.logActivity(user.id, tool, ok, ms, auth.clientId));
              } catch {
                // Activity logging must never break a tool call.
              }
            },
            extraInstructions: user.demo
              ? `${DEMO_NOTICE}\nAccount settings (read-only switch) are managed at ${accountUrl}.`
              : `Account settings (Suunto connection, units, time zone, read-only) are managed at ${accountUrl}.` +
                (user.suuntoNeedsReconnect ? `\nSuunto refused the stored sign-in of this account: if tool calls fail, ask the user to connect Suunto again at ${accountUrl}.` : ""),
            ...(user.demo ? { accountInfo: { demo_account: DEMO_NOTICE } } : {}),
          })
        : setupServer(ctx, user, ctx.suuntoKeys ? { kind: "not_connected" } : { kind: "not_configured" });
    } catch (error) {
      server = setupServer(ctx, user, { kind: "unusable", detail: (error as Error).message });
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      ctx.log(`MCP request failed: ${redactForLog((error as Error).message, [])}`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
    }
  });

  // Stateless server: no SSE stream to open and no session to delete. Unauthenticated requests
  // still get the 401 with discovery information.
  const notAllowed = (_req: Request, res: Response) => {
    res.setHeader("allow", "POST");
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  };
  r.get("/mcp", bearer, notAllowed);
  r.delete("/mcp", bearer, notAllowed);
  return r;
}
