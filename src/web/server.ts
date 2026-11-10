/**
 * Multi-user web mode: accounts, admin page, OAuth for Claude custom connectors and a per-user
 * MCP endpoint, all in one process.
 */

import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { callLimitsFromEnv, envValue, suuntoKeysFromEnv } from "../config.js";
import { demoRegistry, type DemoRegistry } from "../demo/index.js";
import { endpointsFromEnv, isLoopbackHost } from "../suunto/endpoints.js";
import { CallLimiter, type CallLimits } from "../suunto/limiter.js";
import type { SuuntoAppKeys } from "../suunto/oauth.js";
import { ConfigError, maskEmails, redactForLog } from "../util/errors.js";
import { VERSION } from "../version.js";
import { operatorOverrides, ServicePool } from "./accounts.js";
import { APP_CSS, APP_JS } from "./assets.js";
import { page, type WebContext } from "./context.js";
import { hashPassword, loadMasterKey, SecretBox } from "./crypto.js";
import { openDatabase } from "./db.js";
import { html, layout } from "./html.js";
import { brandMark } from "./icons.js";
import { brandRoutes } from "./brand.js";
import { securityTxtRoutes } from "./security-txt.js";
import { mediaRoutes } from "./media.js";
import { ActivityHub } from "./live.js";
import { mcpRoutes } from "./mcp-endpoint.js";
import { OAuthProvider, plainText } from "./oauth.js";
import { accountRoutes } from "./routes-account.js";
import { adminRoutes } from "./routes-admin.js";
import { authRoutes, passwordProblem } from "./routes-auth.js";
import { homeRoutes } from "./routes-home.js";
import { legalRoutes } from "./routes-legal.js";
import { oauthRoutes } from "./routes-oauth.js";
import { RequestNotices, smtpSender, smtpUrlProblem, smtpUserAddress, type NoticeSender, type NoticeTiming } from "./request-notices.js";
import { localeMiddleware, t } from "./i18n/index.js";
import { isEmail } from "./email.js";
import { Cookies, LANGUAGE_COOKIE_DAYS, parseCookies, securityHeaders, sessionMiddleware } from "./session.js";
import { Store } from "./store.js";

export interface WebOptions {
  publicUrl: URL;
  host: string;
  port: number;
  dataDir: string;
  masterKey?: string;
  trustProxy?: string;
  adminEmail?: string;
  adminPassword?: string;
  /** Allow client metadata documents on private addresses (tests only). */
  allowPrivateClientMetadata?: boolean;
  /**
   * The operator's Suunto host overrides (SUUNTO_OAUTH_URL, SUUNTO_API_URL), for tests against a
   * mock. Suunto app keys found here are used when `suuntoKeys` is not given, but never kept in it.
   */
  operator: Record<string, string>;
  /** The operator's Suunto app keys (SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET, SUUNTO_SUBSCRIPTION_KEY). */
  suuntoKeys?: SuuntoAppKeys;
  /** SUUNTO_REDIRECT_URI (default: <PUBLIC_URL>/suunto/callback). */
  suuntoRedirectUri?: string;
  /**
   * The limits of Suunto data requests (SUUNTO_CALLS_PER_MINUTE, SUUNTO_CALLS_PER_USER_PER_DAY).
   * Default WEB_DEFAULT_LIMITS: 10 per minute for the whole server, 100 per user per day.
   */
  callLimits?: CallLimits;
  /** The operator's SMTP server for e-mails to administrators (none: no e-mails). */
  smtpUrl?: string;
  /** Sender address of those e-mails (default: the SMTP user when it is an e-mail address; one of them is needed). */
  notifyFrom?: string;
  platform?: NodeJS.Platform;
  /** Keep-alive interval of the live activity streams (tests use a short one). */
  liveHeartbeatMs?: number;
  /** The demo accounts' in-memory stores (default: the process-wide registry; tests pass their own). */
  demo?: DemoRegistry;
  /** fetch for every request to Suunto (tests pass a mock; default: the global fetch). */
  suuntoFetch?: typeof fetch;
  /** How e-mails about access requests are sent, and when (tests). */
  sendNotice?: NoticeSender;
  noticeTiming?: NoticeTiming;
  log: (m: string) => void;
}

type Env = Record<string, string | undefined>;

/**
 * SMTP_URL without a sender address. The administrator's own address is not used as the sender:
 * relays such as Amazon SES or SendGrid refuse senders they do not know, and other servers send
 * e-mails that bounce (DMARC).
 */
const NO_SENDER = "Set NOTIFY_FROM to a sender address your SMTP server accepts (the user name in SMTP_URL is not an e-mail address).";

/** An example administrator password that must never be used. */
const EXAMPLE_ADMIN_PASSWORD = "change-me-to-a-long-password";

/**
 * The limits of Suunto data requests in web mode: the Developer API's 10 calls per minute for the
 * whole server, and at most 100 calls per user per day, so one user cannot use up the shared
 * weekly quota (200 calls on the Developer API) alone.
 */
export const WEB_DEFAULT_LIMITS: CallLimits = { perMinute: 10, perUserPerDay: 100 };

/** The path of the "Connect Suunto" callback (routes-account.ts). */
const CALLBACK_PATH = "/suunto/callback";

/**
 * The address Suunto sends the browser back to after "Connect Suunto". It must be registered in
 * the Suunto API Zone exactly as it is here. A configured SUUNTO_REDIRECT_URI must be on
 * PUBLIC_URL's host (only there does the browser send the sign-in cookie) and have the path of
 * the callback route; https, or plain http on a loopback host.
 */
export function suuntoRedirectUri(publicUrl: URL, configured: string | undefined): string {
  const base = publicUrl.href.replace(/\/+$/, "");
  const fallback = `${base}${CALLBACK_PATH}`;
  const value = configured?.trim();
  if (!value) return fallback;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`SUUNTO_REDIRECT_URI is not a valid URL. Leave it empty to use ${fallback}.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new ConfigError("SUUNTO_REDIRECT_URI must be an https URL (plain http only on localhost).");
  }
  if (url.hash) throw new ConfigError("SUUNTO_REDIRECT_URI must not contain a fragment.");
  if (url.origin !== publicUrl.origin) {
    throw new ConfigError(`SUUNTO_REDIRECT_URI must be on the address of PUBLIC_URL (${publicUrl.origin}): the browser sends the sign-in cookie only there. Leave it empty to use ${fallback}.`);
  }
  if (url.pathname !== new URL(fallback).pathname) {
    throw new ConfigError(`SUUNTO_REDIRECT_URI must have the path ${new URL(fallback).pathname}, where this server takes the answer from Suunto. Leave it empty to use ${fallback}.`);
  }
  return value;
}

/**
 * Whether a Host header names this server: PUBLIC_URL's host, or any loopback name when PUBLIC_URL
 * is a loopback address (localhost, 127.0.0.1 and [::1] are the same machine). Other names are
 * refused, so a web page cannot reach a local server through DNS rebinding.
 */
export function isPublicHost(hostHeader: string | undefined, publicUrl: URL): boolean {
  // A host name or an IPv6 address in brackets, maybe with a port; nothing else.
  const match = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+?)\.?(?::\d{1,5})?$/i.exec(hostHeader?.trim() ?? "");
  if (!match) return false;
  const hostname = match[1]!.toLowerCase();
  const own = publicUrl.hostname.toLowerCase();
  if (hostname === own) return true;
  return isLoopbackHost(own) && isLoopbackHost(hostname);
}

/** A web log line: one line (no forged lines from client text) and no e-mail addresses (DESIGN.md section 9). */
function webLog(log: (m: string) => void): (m: string) => void {
  return (m) => log(maskEmails(plainText(m)));
}

function readSecret(env: Env, name: string): string | undefined {
  const direct = env[name]?.trim();
  if (direct) return direct;
  const file = env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, "utf8").trim();
  return undefined;
}

/** Read the web-mode settings from the environment (and CLI overrides). */
export function webOptionsFromEnv(env: Env, cli: { host?: string; port?: number }, log: (m: string) => void): WebOptions {
  // Docker Compose passes unset variables as empty strings: those mean "not set".
  const rawPort = envValue(env, "PORT") ?? envValue(env, "MCP_HTTP_PORT");
  const port = cli.port ?? (rawPort !== undefined ? Number(rawPort) : 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError("PORT must be a valid port");
  const host = cli.host ?? (env.HOST || env.MCP_HTTP_HOST || "127.0.0.1");
  const rawUrl = (env.PUBLIC_URL ?? "").trim() || `http://localhost:${port}`;
  let publicUrl: URL;
  try {
    publicUrl = new URL(rawUrl);
  } catch {
    throw new ConfigError(`PUBLIC_URL is not a valid URL: ${rawUrl}`);
  }
  if (publicUrl.search || publicUrl.hash) throw new ConfigError("PUBLIC_URL must not contain a query or fragment");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(publicUrl.hostname);
  if (publicUrl.protocol !== "https:" && !local) {
    log(`warning: PUBLIC_URL ${publicUrl.href} is not https. AI apps only connect to https servers; put this behind an HTTPS reverse proxy.`);
  }
  const smtpUrl = readSecret(env, "SMTP_URL");
  const smtpProblem = smtpUrl ? smtpUrlProblem(smtpUrl) : undefined;
  if (smtpProblem) throw new ConfigError(smtpProblem);
  const notifyFrom = env.NOTIFY_FROM?.trim();
  // An address, or a name and an address: "MCP for Suunto <noreply@example.com>".
  const fromAddress = notifyFrom?.match(/^[^<>\r\n]*<([^<>\s]+)>$/)?.[1] ?? notifyFrom;
  if (fromAddress && !isEmail(fromAddress)) throw new ConfigError("NOTIFY_FROM must be an e-mail address (or a name and an address in < >)");
  if (smtpUrl && !notifyFrom && !smtpUserAddress(smtpUrl)) throw new ConfigError(NO_SENDER);
  return {
    publicUrl,
    host,
    port,
    dataDir: env.DATA_DIR?.trim() || "./data",
    ...(readSecret(env, "MASTER_KEY") ? { masterKey: readSecret(env, "MASTER_KEY")! } : {}),
    ...(env.TRUST_PROXY?.trim() ? { trustProxy: env.TRUST_PROXY.trim() } : {}),
    ...(env.ADMIN_EMAIL?.trim() ? { adminEmail: env.ADMIN_EMAIL.trim() } : {}),
    ...(readSecret(env, "ADMIN_PASSWORD") ? { adminPassword: readSecret(env, "ADMIN_PASSWORD")! } : {}),
    allowPrivateClientMetadata: env.ALLOW_PRIVATE_CLIENT_METADATA === "true",
    operator: operatorOverrides(env),
    // Undefined unless all three are set; a ConfigError when only some are.
    ...withKeys(suuntoKeysFromEnv(env)),
    ...(env.SUUNTO_REDIRECT_URI?.trim() ? { suuntoRedirectUri: suuntoRedirectUri(publicUrl, env.SUUNTO_REDIRECT_URI) } : {}),
    // A ConfigError for a value that is not a whole number of 0 or more.
    callLimits: callLimitsFromEnv(env, { perUserPerDay: WEB_DEFAULT_LIMITS.perUserPerDay }),
    ...(smtpUrl ? { smtpUrl } : {}),
    ...(notifyFrom ? { notifyFrom } : {}),
    log,
  };
}

function withKeys(keys: SuuntoAppKeys | undefined): { suuntoKeys?: SuuntoAppKeys } {
  return keys ? { suuntoKeys: keys } : {};
}

function trustProxyValue(v: string | undefined): boolean | number | string {
  if (!v) return false;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^\d+$/.test(v)) return Number(v);
  return v; // e.g. "loopback", "uniquelocal" or a list of addresses
}

export interface WebApp {
  app: express.Express;
  ctx: WebContext;
  close(): Promise<void>;
}

export async function createWebApp(webOpts: WebOptions): Promise<WebApp> {
  // Every log line of the web mode is one line without e-mail addresses.
  const opts: WebOptions = { ...webOpts, log: webLog(webOpts.log) };
  const db = openDatabase(opts.dataDir);
  // An in-memory database (tests) gets an ephemeral key unless one is given.
  const masterKey =
    opts.dataDir === ":memory:" && !opts.masterKey ? randomBytes(32) : loadMasterKey(opts.dataDir, opts.masterKey, opts.log);
  const box = new SecretBox(masterKey);
  const store = new Store(db, box);
  const publicUrl = new URL(opts.publicUrl.href.replace(/\/+$/, "") + "/");
  const mcpUrl = new URL("mcp", publicUrl);
  const provider = new OAuthProvider({
    store,
    issuer: publicUrl.href.replace(/\/+$/, ""),
    mcpUrl,
    allowPrivateMetadataHosts: !!opts.allowPrivateClientMetadata,
    log: opts.log,
  });
  const demo = opts.demo ?? demoRegistry;
  // The operator's Suunto settings. Only the host overrides are kept as "operator": the keys stay
  // out of it, so nothing that shows or passes on operator settings can leak them.
  const operator = operatorOverrides(opts.operator);
  const suuntoEndpoints = endpointsFromEnv(operator);
  const suuntoKeys = opts.suuntoKeys ?? suuntoKeysFromEnv(opts.operator);
  const redirectUri = suuntoRedirectUri(publicUrl, opts.suuntoRedirectUri ?? opts.operator.SUUNTO_REDIRECT_URI);
  if (!suuntoKeys) {
    opts.log(
      `warning: SUUNTO_CLIENT_ID, SUUNTO_CLIENT_SECRET and SUUNTO_SUBSCRIPTION_KEY are not set. Nobody can connect Suunto until they are (demo accounts work). Register ${redirectUri} as the redirect URI of your app in the Suunto API Zone.`,
    );
  }
  // One limiter of Suunto data requests for the whole process (the user id is its key).
  const limits = opts.callLimits ?? WEB_DEFAULT_LIMITS;
  const limiter =
    limits.perMinute > 0 || limits.perUserPerDay > 0
      ? new CallLimiter({ perMinute: limits.perMinute, ...(limits.perUserPerDay > 0 ? { perKeyPerDay: limits.perUserPerDay } : {}) })
      : undefined;
  const pool = new ServicePool(store, {
    operator,
    ...(suuntoKeys ? { keys: suuntoKeys } : {}),
    demo,
    log: opts.log,
    ...(opts.suuntoFetch ? { fetch: opts.suuntoFetch } : {}),
    connectAgain: `Connect Suunto again at ${publicUrl.href.replace(/\/+$/, "")}/account.`,
    ...(limiter ? { limiter } : {}),
    limits,
  });
  const send = opts.sendNotice ?? (opts.smtpUrl ? smtpSender(opts.smtpUrl) : undefined);
  const from = opts.notifyFrom ?? (opts.smtpUrl ? smtpUserAddress(opts.smtpUrl) : undefined);
  if (send && !from) throw new ConfigError(NO_SENDER);
  const cookies = new Cookies(publicUrl.protocol === "https:");
  const ctx: WebContext = {
    store,
    provider,
    pool,
    demo,
    notices: new RequestNotices({
      store,
      publicUrl,
      log: opts.log,
      ...(send ? { send } : {}),
      ...(from ? { from } : {}),
      ...opts.noticeTiming,
    }),
    live: new ActivityHub({ sessionActive: (hash) => store.sessionActive(hash), ...(opts.liveHeartbeatMs ? { heartbeatMs: opts.liveHeartbeatMs } : {}) }),
    cookies,
    publicUrl,
    mcpUrl,
    operator,
    ...(suuntoKeys ? { suuntoKeys } : {}),
    suuntoRedirectUri: redirectUri,
    suuntoEndpoints,
    ...(opts.suuntoFetch ? { suuntoFetch: opts.suuntoFetch } : {}),
    version: VERSION,
    platform: opts.platform ?? process.platform,
    log: opts.log,
  };

  if (opts.adminEmail && opts.adminPassword && !store.getUserByEmail(opts.adminEmail)) {
    // The value an earlier deploy/.env.example shipped: everyone who read it knows it.
    if (opts.adminPassword === EXAMPLE_ADMIN_PASSWORD) throw new ConfigError("ADMIN_PASSWORD is still the example value; set your own");
    const problem = passwordProblem(opts.adminPassword);
    if (problem) throw new ConfigError(`ADMIN_PASSWORD: ${problem}`);
    store.createUser(opts.adminEmail, await hashPassword(opts.adminPassword), true);
    // The address itself is not logged (DESIGN.md section 9: no e-mail addresses in logs).
    opts.log("Created the administrator account from ADMIN_EMAIL");
  } else if (!!opts.adminEmail !== !!opts.adminPassword && store.countUsers() === 0) {
    opts.log("warning: set both ADMIN_EMAIL and ADMIN_PASSWORD to create the administrator; with only one of them, the first person who signs up becomes the administrator.");
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxyValue(opts.trustProxy));
  // Keep express-rate-limit quiet about proxy headers when no proxy is trusted.
  app.use((req, _res, next) => {
    if (!opts.trustProxy) delete req.headers["x-forwarded-for"];
    next();
  });

  app.get("/healthz", (_req, res) => void res.json({ status: "ok", version: VERSION }));
  // Every other request must name this server (the health check above is asked by address).
  app.use((req, res, next) => {
    if (isPublicHost(req.headers.host, publicUrl)) return next();
    res.status(421).type("text").send("This server does not answer for this host name.");
  });
  app.use(brandRoutes());
  app.use(securityTxtRoutes(publicUrl));
  app.use(mediaRoutes());
  app.get("/static/app.css", (_req, res) => void res.type("css").set("cache-control", "public, max-age=3600").send(APP_CSS));
  app.get("/static/app.js", (_req, res) => void res.type("js").set("cache-control", "public, max-age=3600").send(APP_JS));

  // Machine endpoints (no cookies, no HTML).
  app.use(mcpRoutes(ctx));

  // Browser endpoints, in the visitor's language.
  app.use(
    localeMiddleware(
      { name: cookies.lang, serialize: (value) => cookies.serialize(cookies.lang, value, LANGUAGE_COOKIE_DAYS * 86_400) },
      (header) => parseCookies(header)[cookies.lang],
    ),
  );
  app.use(sessionMiddleware(store, cookies));
  app.use(oauthRoutes(ctx));
  app.use(securityHeaders());
  app.use(homeRoutes(ctx));
  app.use(legalRoutes(ctx));
  app.use(authRoutes(ctx));
  app.use(accountRoutes(ctx));
  app.use(adminRoutes(ctx));

  app.use((req, res) => {
    // Browsers get a page; API clients (which do not ask for text/html) get plain text.
    if (req.method === "GET" && (req.headers.accept ?? "").includes("text/html")) {
      page(
        req,
        res,
        { title: t("common.error.notFoundTitle") },
        html`<div class="sheet"><div class="sheet-head">${brandMark("lg")}<h1>${t("common.error.notFoundTitle")}</h1><p>${t("common.error.notFoundText")}</p></div><div class="center"><a class="button" href="/">${t("common.error.goHome")}</a></div></div>`,
        404,
      );
      return;
    }
    res.status(404).type("text").send("Not found");
  });
  app.use((error: Error & { status?: number; statusCode?: number; expose?: boolean }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status ?? error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      // Client errors from body parsing (too large, malformed JSON or forms).
      if (!res.headersSent) res.status(status).json({ error: "invalid_request", error_description: error.expose ? error.message : "Bad request" });
      return;
    }
    opts.log(`Unhandled error: ${redactForLog(error.message, [])}`);
    if (res.headersSent) return;
    if (_req.method === "GET" && (_req.headers.accept ?? "").includes("text/html")) {
      res
        .status(500)
        .type("html")
        .send(layout({ title: t("common.error.title") }, html`<div class="sheet"><div class="sheet-head"><h1>${t("common.error.somethingWrong")}</h1><p>${t("common.error.tryAgain")}</p></div></div>`));
      return;
    }
    res.status(500).type("text").send("Something went wrong.");
  });

  // Requests that came in just before the last stop and were not reported yet.
  ctx.notices.start();

  const cleanup = setInterval(() => {
    try {
      store.cleanup();
    } catch (error) {
      opts.log(`Cleanup failed: ${(error as Error).message}`);
    }
  }, 3600_000);
  cleanup.unref();

  return {
    app,
    ctx,
    async close() {
      clearInterval(cleanup);
      ctx.live.closeAll();
      // An e-mail being sent would write to the closed database.
      await ctx.notices.close();
      await pool.closeAll();
      db.close();
    },
  };
}

export async function startWebServer(opts: WebOptions): Promise<{ server: Server; web: WebApp }> {
  const web = await createWebApp(opts);
  const server = await new Promise<Server>((resolve, reject) => {
    const s = web.app.listen(opts.port, opts.host, () => resolve(s));
    s.once("error", reject);
  });
  opts.log(`Web mode listening on http://${opts.host}:${opts.port} (public URL ${web.ctx.publicUrl.href})`);
  opts.log(`MCP endpoint for AI apps: ${web.ctx.mcpUrl.href}`);
  opts.log(`Suunto redirect URI (register it in the Suunto API Zone): ${web.ctx.suuntoRedirectUri}`);
  if (web.ctx.store.countUsers() === 0) opts.log(`No accounts yet: open ${web.ctx.publicUrl.href}signup to create the administrator account.`);
  const unreadable = web.ctx.store.countUnreadableSettings();
  if (unreadable > 0) {
    opts.log(
      `warning: the Suunto connection of ${unreadable} user(s) cannot be decrypted with the current key (MASTER_KEY or ${opts.dataDir}/master.key changed?). They will be asked to connect Suunto again.`,
    );
  }
  return { server, web };
}
