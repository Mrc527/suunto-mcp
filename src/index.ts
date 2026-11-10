#!/usr/bin/env node
/**
 * MCP for Suunto (command: suunto-mcp): MCP server for Suunto workouts, sleep and recovery.
 *
 *   suunto-mcp              # stdio transport (Claude Desktop, Claude Code, Cursor, ...)
 *   suunto-mcp --web        # multi-user web service for AI apps (OAuth, admin page)
 *   suunto-mcp --http       # single-user Streamable HTTP transport with a static bearer token
 *   suunto-mcp --check      # test the Suunto connection and exit
 *   suunto-mcp --login      # sign in to Suunto once and save the tokens to SUUNTO_TOKEN_CACHE
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { describeConfig, loadConfig, loadLoginConfig, type AppConfig, type CliOverrides } from "./config.js";
import { startHttpServer } from "./http.js";
import { accountInfo, closeServices, createMcpServer, createServices, runLogin } from "./server.js";
import { describeError, redact, redactForLog, UserFacingError } from "./util/errors.js";
import { VERSION } from "./version.js";

const HELP = `MCP for Suunto (suunto-mcp) ${VERSION}
MCP server for your Suunto workouts, daily activity, sleep, recovery, routes and points of interest.
MCP for Suunto is an independent open-source project. It uses the official Suunto Cloud API,
but it is not made by, affiliated with, or endorsed by Suunto.
Suunto is a registered trademark of Suunto Oy.

Usage:
  suunto-mcp                         single user, stdio (Claude Desktop, Claude Code, ...)
  suunto-mcp --login                 sign in to Suunto in your browser once and save the tokens
                                     to SUUNTO_TOKEN_CACHE (prints the address to open)
  suunto-mcp --check                 test the Suunto connection and exit (single-user settings)
  suunto-mcp --http [--port <n>] [--host <addr>]
                                     single user over HTTP with MCP_HTTP_TOKEN
  suunto-mcp --web [--port <n>] [--host <addr>]
                                     multi-user web service for AI apps (OAuth, accounts,
                                     admin page). Configure with PUBLIC_URL, DATA_DIR,
                                     MASTER_KEY, TRUST_PROXY, ADMIN_EMAIL, ADMIN_PASSWORD,
                                     SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET,
                                     SUUNTO_SUBSCRIPTION_KEY, and optionally SMTP_URL, NOTIFY_FROM.
  suunto-mcp --help | --version

Suunto app keys (your app in the Suunto API Zone, https://apizone.suunto.com):
  SUUNTO_CLIENT_ID         Client id (OAuth settings of your app)
  SUUNTO_CLIENT_SECRET     Client secret (or SUUNTO_CLIENT_SECRET_FILE)
  SUUNTO_SUBSCRIPTION_KEY  Subscription key from your API Zone profile
                           (or SUUNTO_SUBSCRIPTION_KEY_FILE)

Single-user settings (one Suunto account):
  SUUNTO_TOKEN_CACHE       File that keeps the current Suunto tokens between runs (mode 0600).
                           --login writes it. Default: none (memory only)
  SUUNTO_REFRESH_TOKEN     Instead of the token cache: a Suunto refresh token
                           (or SUUNTO_REFRESH_TOKEN_FILE)
  SUUNTO_REDIRECT_URI      Address Suunto sends the browser back to after --login
                           (default http://localhost:8723/callback; it must be on this machine
                           and registered in the OAuth settings of your app)
  SUUNTO_UNITS             metric (default) | imperial
  SUUNTO_READ_ONLY         true to disable adding routes and points of interest
  SUUNTO_TIMEZONE          IANA time zone of your dates (default: TZ, else the system time zone)

HTTP mode (--http):
  MCP_HTTP_TOKEN           Bearer token required on every request (or MCP_HTTP_TOKEN_FILE)
  MCP_HTTP_HOST            Address to listen on (default 127.0.0.1)
  MCP_HTTP_PORT            Port (default 3000)
  MCP_HTTP_ALLOWED_HOSTS, MCP_HTTP_ALLOWED_ORIGINS
                           Extra Host header values and browser origins to accept

Operator only (tests against a local mock Suunto API): SUUNTO_OAUTH_URL, SUUNTO_API_URL.

Heart rate, sleep and recovery values come from the watch and are not medical advice.
See README.md for every option.`;

interface ParsedArgs {
  cli: CliOverrides;
  check: boolean;
  login: boolean;
  web: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const cli: CliOverrides = {};
  let check = false;
  let login = false;
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
      case "--login":
        login = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}. Use --help for usage.`);
    }
  }
  if (login && (check || web || cli.transport)) throw new Error("--login cannot be combined with --check, --web, --http or --stdio.");
  return { cli, check, login, web };
}

function log(message: string): void {
  process.stderr.write(`[suunto-mcp] ${message}\n`);
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    log((error as Error).message);
    process.exit(2);
  }

  if (parsed.login) {
    await runLoginCommand();
    return;
  }

  // MCP_TRANSPORT=web applies unless another mode was chosen explicitly on the command line.
  const envWeb = (process.env.MCP_TRANSPORT ?? "").trim().toLowerCase() === "web" && !parsed.check && !parsed.cli.transport;
  if (parsed.web || envWeb) {
    await runWeb(parsed.cli);
    return;
  }

  let config: AppConfig;
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
    let info: Record<string, unknown>;
    try {
      info = await accountInfo(config, services, true);
    } catch (error) {
      info = { connected: false, check: { ok: false, error: describeError(error) } };
    }
    const result = { version: VERSION, config: describeConfig(config), account: info };
    process.stdout.write(`${redact(JSON.stringify(result, null, 2), config.secrets)}\n`);
    await closeServices(services);
    const ok = (info.check as { ok?: boolean } | undefined)?.ok === true;
    process.exit(ok ? 0 : 1);
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
  safeLog(`ready (stdio). Suunto, units ${config.units}, time zone ${config.timeZone}${config.readOnly ? " [read-only]" : ""}${services.activity ? "" : " [no sign-in: run suunto-mcp --login]"}`);
}

/** suunto-mcp --login (DESIGN.md section 7): sign in once, save the tokens, print the username. */
async function runLoginCommand(): Promise<void> {
  let config: AppConfig;
  try {
    config = loadLoginConfig(process.env, (w) => log(`warning: ${w}`));
  } catch (error) {
    log(`configuration error: ${(error as Error).message}`);
    process.exit(1);
  }
  const stop = () => {
    log("login stopped.");
    process.exit(130);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    // The authorize URL goes on its own lines, without the prefix, so it is easy to copy.
    const result = await runLogin(config, { print: (line) => process.stderr.write(`${line}\n`) });
    log(`Signed in to Suunto as ${result.username}. The tokens are saved in ${result.tokenCache}; use the same SUUNTO_TOKEN_CACHE when you start the server.`);
    process.exit(0);
  } catch (error) {
    const text = error instanceof UserFacingError ? error.message : describeError(error);
    log(`login failed: ${redactForLog(text, config.secrets)}`);
    process.exit(1);
  }
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
