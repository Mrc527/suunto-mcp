/**
 * The authenticated MCP endpoint. Each request runs with the PADI account of the user the access
 * token belongs to.
 */

import express, { type Request, type Response, type Router } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Icon } from "@modelcontextprotocol/sdk/types.js";
import { DEMO_NOTICE } from "../demo/index.js";
import { DemoLogbookStore } from "../demo/logbook.js";
import { PadiAuthError, type PadiAuthErrorCode } from "../padi/auth.js";
import { createMcpServer, createServices, type Services } from "../server.js";
import { redactForLog, UserFacingError } from "../util/errors.js";
import { buildDemoConfig } from "./accounts.js";
import { mcpIcons } from "./brand.js";
import type { WebContext } from "./context.js";
import { rateLimit } from "express-rate-limit";
import { SCOPE } from "./oauth.js";
import { issuerOf } from "./routes-oauth.js";
import type { User } from "./store.js";

/** A placeholder logbook store for the setup server (never read: every call is stopped first). */
const SETUP_STORE = new DemoLogbookStore();

/**
 * Server for users who have not connected PADI yet (or whose connection cannot be used). It
 * offers the same tools as a connected account, because Claude caches the tool list, but every
 * call answers with setup instructions.
 */
function setupServer(ctx: WebContext, user: User, problem?: string | "reconnect"): McpServer {
  const accountUrl = `${issuerOf(ctx.publicUrl)}/account`;
  const message =
    problem === "reconnect"
      ? expiredMessage(ctx)
      : problem
        ? `The PADI connection saved for ${user.email} cannot be used: ${problem} Fix it at ${accountUrl}.`
        : `PADI is not connected yet for ${user.email}. Ask the user to open ${accountUrl}, sign in with their PADI e-mail and password, then try again.`;
  // The tool list of a writable account. Nothing is ever read from the placeholder store: the
  // guard below stops every call before it runs.
  const config = buildDemoConfig(ctx.store.getSettings(), false);
  const services = createServices(config, { demo: SETUP_STORE });
  const mcp = createMcpServer(config, services, ctx.log, {
    ...branding(ctx),
    beforeToolCall: () => {
      throw new UserFacingError(message);
    },
    extraInstructions: message,
  });
  return mcp;
}

/** PADI client errors that mean "sign in to PADI again" (in web mode only "expired" happens). */
const SIGN_IN_AGAIN: ReadonlySet<PadiAuthErrorCode> = new Set(["expired", "bad_credentials", "challenge", "not_confirmed", "password_reset"]);

/** The answer of a tool call that found that the user's PADI sign-in stopped working. */
function expiredMessage(ctx: WebContext): string {
  return `Your PADI sign-in expired. Sign in again at ${issuerOf(ctx.publicUrl)}/account.`;
}

/**
 * A connected user's services, with the errors that mean "sign in to PADI again" turned into a
 * message with the address of the account page. The PADI client does not know that address: it
 * says "Sign in to PADI again", and an AI app could then send the user to padi.com, which does
 * not help. Later calls get the same message from the setup server (the user is then marked
 * "needs reconnect"), but the call that finds the dead sign-in, and calls running at the same
 * time, run here.
 */
function withAccountLink(services: Services, message: string): Services {
  if (!services.logbook) return services;
  const map = (error: unknown) =>
    error instanceof PadiAuthError && SIGN_IN_AGAIN.has(error.code) ? new UserFacingError(message, { cause: error }) : error;
  const logbook = new Proxy(services.logbook, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        let result: unknown;
        try {
          result = value.apply(target, args);
        } catch (error) {
          throw map(error);
        }
        return result instanceof Promise
          ? result.catch((error: unknown) => {
              throw map(error);
            })
          : result;
      };
    },
  });
  return { ...services, logbook };
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

  // Same size limit as the MCP SDK. Parsing here lets the batch size be checked.
  const json = express.json({ limit: "4mb" });

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
      const userCtx = user.padiNeedsReconnect && !user.demo ? undefined : ctx.pool.get(user);
      server = userCtx
        ? createMcpServer(userCtx.config, user.demo ? userCtx.services : withAccountLink(userCtx.services, expiredMessage(ctx)), ctx.log, {
            ...branding(ctx),
            onToolCall: (tool, ok, ms) => {
              try {
                ctx.live.publish(user.id, ctx.store.logActivity(user.id, tool, ok, ms, auth.clientId));
              } catch {
                // Activity logging must never break a tool call.
              }
            },
            extraInstructions: user.demo
              ? `${DEMO_NOTICE}\nAccount settings (read-only switch) are managed at ${issuerOf(ctx.publicUrl)}/account.`
              : `Account settings (PADI connection, units, read-only) are managed at ${issuerOf(ctx.publicUrl)}/account.`,
            ...(user.demo ? { accountInfo: { demo_account: DEMO_NOTICE } } : {}),
          })
        : setupServer(ctx, user, user.padiNeedsReconnect && !user.demo ? "reconnect" : undefined);
    } catch (error) {
      server = setupServer(ctx, user, (error as Error).message);
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
