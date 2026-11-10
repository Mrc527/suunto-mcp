#!/usr/bin/env node
/**
 * MCP for PADI (command: padi-mcp): MCP server for the PADI online dive logbook.
 *
 *   padi-mcp              # stdio transport (Claude Desktop, Claude Code, Cursor, ...)
 *   padi-mcp --web        # multi-user web service for AI apps (OAuth, admin page)
 *   padi-mcp --http       # single-user Streamable HTTP transport with a static bearer token
 *   padi-mcp --check      # sign in to PADI, count the dives and exit
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, describeConfig, type CliOverrides } from "./config.js";
import { startHttpServer } from "./http.js";
import { closeServices, createMcpServer, createServices } from "./server.js";
import { describeError, redact, redactForLog } from "./util/errors.js";
import { VERSION } from "./version.js";

const HELP = `MCP for PADI (padi-mcp) ${VERSION}
MCP server for your PADI online dive logbook.
MCP for PADI is an independent open-source project.
It is not made by, affiliated with, or endorsed by PADI.

Usage:
  padi-mcp                           single user, stdio (Claude Desktop, Claude Code, ...)
  padi-mcp --web [--port <n>] [--host <addr>]
                                     multi-user web service for AI apps (OAuth, accounts,
                                     admin page). Configure with PUBLIC_URL, DATA_DIR,
                                     MASTER_KEY, TRUST_PROXY, ADMIN_EMAIL, ADMIN_PASSWORD,
                                     and optionally SMTP_URL, NOTIFY_FROM.
  padi-mcp --http [--port <n>] [--host <addr>]
                                     single user over HTTP with MCP_HTTP_TOKEN
  padi-mcp --check                   sign in to PADI and count the dives (single-user settings)
  padi-mcp --help | --version

Single-user settings (one PADI account):
  PADI_EMAIL             The e-mail you sign in to PADI with
  PADI_PASSWORD          Your PADI password (or PADI_PASSWORD_FILE)
  PADI_REFRESH_TOKEN     Instead of the password: a PADI refresh token (or PADI_REFRESH_TOKEN_FILE)
  PADI_TOKEN_CACHE       File that keeps the current refresh token between runs (mode 0600).
                         Default: none (memory only)
  PADI_UNITS             auto (your PADI logbook setting, default) | metric | imperial
  PADI_READ_ONLY         true to disable adding, changing and deleting dives
  PADI_TIMEZONE          IANA time zone for "today" (default: the system time zone)
  PADI_LOGIN_METHOD      auto (default) | cognito | padi
  PADI_API_MODE          proxy (default) | direct | auto

HTTP mode (--http):
  MCP_HTTP_TOKEN         Bearer token required on every request (or MCP_HTTP_TOKEN_FILE)
  MCP_HTTP_HOST          Address to listen on (default 127.0.0.1)
  MCP_HTTP_PORT          Port (default 3000)
  MCP_HTTP_ALLOWED_HOSTS, MCP_HTTP_ALLOWED_ORIGINS
                         Extra Host header values and browser origins to accept

Operator only (tests against a local mock PADI API): PADI_COGNITO_URL, PADI_AUTH_URL,
PADI_LOGBOOK_URL, PADI_DIRECT_URL, PADI_INSTRUCTOR_URL, PADI_DIRECT_INSTRUCTOR_URL,
PADI_ECARD_URL, PADI_IMAGES_URL, PADI_CLIENT_ID, PADI_COGNITO_REGION.

See README.md for every option.`;

function parseArgs(argv: string[]): { cli: CliOverrides; check: boolean; web: boolean } {
  const cli: CliOverrides = {};
  let check = false;
  let web = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    switch (arg) {
      case "--help":
      case "-h":
        process.stdout.write(`${HELP}\n`);
        process.exit(0);
        break;
      case "--version":
      case "-v":
        process.stdout.write(`${VERSION}\n`);
        process.exit(0);
        break;
      case "--http":
        cli.transport = "http";
        break;
      case "--web":
        web = true;
        break;
      case "--stdio":
        cli.transport = "stdio";
        break;
      case "--port":
        cli.port = Number(next());
        if (!Number.isInteger(cli.port) || cli.port <= 0 || cli.port > 65535) throw new Error("--port must be a valid port");
        break;
      case "--host":
        cli.host = next();
        break;
      case "--check":
        check = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
    }
  }
  return { cli, check, web };
}

function log(message: string): void {
  process.stderr.write(`[padi-mcp] ${message}\n`);
}

async function main(): Promise<void> {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    log((error as Error).message);
    process.exit(2);
  }

  // MCP_TRANSPORT=web applies unless another mode was chosen explicitly on the command line.
  const envWeb = (process.env.MCP_TRANSPORT ?? "").toLowerCase() === "web" && !parsed.check && !parsed.cli.transport;
  if (parsed.web || envWeb) {
    await runWeb(parsed.cli);
    return;
  }

  let config;
  try {
    // --check does not serve anything: ignore MCP_TRANSPORT (which may say "web").
    const cli = parsed.check ? { ...parsed.cli, transport: parsed.cli.transport ?? ("stdio" as const) } : parsed.cli;
    config = loadConfig(process.env, cli, (w) => log(`warning: ${w}`));
  } catch (error) {
    log(`configuration error: ${(error as Error).message}`);
    process.exit(1);
  }
  // Log lines never hold secrets or e-mail addresses (DESIGN.md section 9).
  const safeLog = (m: string) => log(redactForLog(m, config.secrets));
  const services = createServices(config, { log: safeLog });

  if (parsed.check) {
    const result: Record<string, unknown> = { version: VERSION, config: describeConfig(config) };
    const logbook = services.logbook;
    result.logbook = logbook
      ? await logbook.check().catch((e: unknown) => ({ ok: false, error: describeError(e) }))
      : { ok: false, error: "No way to sign in to PADI: set PADI_EMAIL and PADI_PASSWORD, or PADI_REFRESH_TOKEN." };
    if (logbook && (result.logbook as { ok?: boolean }).ok) {
      // Who is signed in: the name and the affiliate id (never a token).
      const account = await logbook.account().catch(() => undefined);
      if (account) result.account = { ...(account.name ? { name: account.name } : {}), affiliate_id: account.affiliateId, is_pro: account.isPro };
    }
    process.stdout.write(`${redact(JSON.stringify(result, null, 2), config.secrets)}\n`);
    await closeServices(services);
    const failed = JSON.stringify(result).includes('"ok":false');
    process.exit(failed ? 1 : 0);
  }

  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await closeServices(services).catch(() => undefined);
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  if (config.transport === "http") {
    const httpServer = await startHttpServer({
      settings: config.http,
      createMcpServer: () => createMcpServer(config, services, safeLog),
      log: safeLog,
    });
    process.on("exit", () => httpServer.close());
    if (!config.http.token) safeLog("warning: no MCP_HTTP_TOKEN set; only use this on a trusted machine");
    return;
  }

  const server = createMcpServer(config, services, safeLog);
  const transport = new StdioServerTransport();
  transport.onclose = () => void shutdown(0);
  process.stdin.on("end", () => void shutdown(0));
  await server.connect(transport);
  safeLog(`ready (stdio). PADI logbook, units ${config.units}, API mode ${config.padi.apiMode}${config.readOnly ? " [read-only]" : ""}`);
}

async function runWeb(cli: CliOverrides): Promise<void> {
  // node:sqlite prints an ExperimentalWarning on Node 22; it is stable enough for this use.
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === "string" ? warning : warning.message;
    if (/SQLite is an experimental feature/.test(text)) return;
    return (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
  }) as typeof process.emitWarning;
  const { startWebServer, webOptionsFromEnv } = await import("./web/server.js");
  let options;
  try {
    options = webOptionsFromEnv(process.env, { ...(cli.host ? { host: cli.host } : {}), ...(cli.port !== undefined ? { port: cli.port } : {}) }, log);
  } catch (error) {
    log(`configuration error: ${(error as Error).message}`);
    process.exit(1);
  }
  const { server, web } = await startWebServer(options);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close();
    server.closeAllConnections?.();
    void web.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  log(`fatal: ${(error as Error).stack ?? String(error)}`);
  process.exit(1);
});
