/**
 * Multi-user web mode: accounts, admin page, OAuth for Claude custom connectors and a per-user
 * MCP endpoint, all in one process.
 */

import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { demoRegistry, type DemoRegistry } from "../demo/index.js";
import { ConfigError, redactForLog } from "../util/errors.js";
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
import { OAuthProvider } from "./oauth.js";
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
  /** Operator overrides (PADI_LOGBOOK_URL, PADI_API_MODE, ...) applied to every user. */
  operator: Record<string, string>;
  /** The operator's SMTP server for e-mails to administrators (none: no e-mails). */
  smtpUrl?: string;
  /** Sender address of those e-mails (default: the SMTP user when it is an e-mail address; one of them is needed). */
  notifyFrom?: string;
  platform?: NodeJS.Platform;
  /** Keep-alive interval of the live activity streams (tests use a short one). */
  liveHeartbeatMs?: number;
  /** The demo accounts' in-memory stores (default: the process-wide registry; tests pass their own). */
  demo?: DemoRegistry;
  /** fetch for every request to PADI (tests pass a mock; default: the global fetch). */
  padiFetch?: typeof fetch;
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

function readSecret(env: Env, name: string): string | undefined {
  const direct = env[name]?.trim();
  if (direct) return direct;
  const file = env[`${name}_FILE`]?.trim();
  if (file) return readFileSync(file, "utf8").trim();
  return undefined;
}

/** Read the web-mode settings from the environment (and CLI overrides). */
export function webOptionsFromEnv(env: Env, cli: { host?: string; port?: number }, log: (m: string) => void): WebOptions {
  const port = cli.port ?? Number(env.PORT ?? env.MCP_HTTP_PORT ?? 3000);
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
  // An address, or a name and an address: "MCP for PADI <noreply@example.com>".
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
    ...(smtpUrl ? { smtpUrl } : {}),
    ...(notifyFrom ? { notifyFrom } : {}),
    log,
  };
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

export async function createWebApp(opts: WebOptions): Promise<WebApp> {
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
  const pool = new ServicePool(store, opts.operator, undefined, demo, opts.log, opts.padiFetch);
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
    operator: opts.operator,
    version: VERSION,
    platform: opts.platform ?? process.platform,
    ...(opts.padiFetch ? { padiFetch: opts.padiFetch } : {}),
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
  if (web.ctx.store.countUsers() === 0) opts.log(`No accounts yet: open ${web.ctx.publicUrl.href}signup to create the administrator account.`);
  const unreadable = web.ctx.store.countUnreadableSettings();
  if (unreadable > 0) {
    opts.log(
      `warning: the PADI connection of ${unreadable} user(s) cannot be decrypted with the current key (MASTER_KEY or ${opts.dataDir}/master.key changed?). They will be asked to sign in to PADI again.`,
    );
  }
  return { server, web };
}
