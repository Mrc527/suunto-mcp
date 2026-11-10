/**
 * OAuth endpoints, discovery metadata and the consent page.
 */

import express, { type NextFunction, type Request, type Response, type Router } from "express";
import { ipKeyGenerator } from "express-rate-limit";
import { BlockList, isIP } from "node:net";
import { InvalidRequestError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { page, type WebContext } from "./context.js";
import { ASSET_VERSION, escapeHtml as escapeAttr, html } from "./html.js";
import { HTML_LANG, locale, t, th } from "./i18n/index.js";
import { brandMark, glyph, serviceIcon } from "./icons.js";
import { classifyReturn, displayName } from "./known-apps.js";
import { SCOPE } from "./oauth.js";
import { csrfOk, locals, securityHeaders, type SessionInfo } from "./session.js";
import type { PendingAuthorization } from "./store.js";

/** Anthropic's published outbound ranges (Claude's connectors). */
const ANTHROPIC = new BlockList();
ANTHROPIC.addSubnet("160.79.104.0", 21, "ipv4");
ANTHROPIC.addSubnet("153.61.208.0", 20, "ipv4");

export function isAnthropicAddress(ip: string): boolean {
  const v = ip.replace(/^::ffff:/i, "");
  try {
    return isIP(v) === 4 && ANTHROPIC.check(v, "ipv4");
  } catch {
    return false;
  }
}

export function issuerOf(publicUrl: URL): string {
  // RFC 8414: the issuer is the base URL without a trailing slash.
  return publicUrl.href.replace(/\/+$/, "");
}

export function authorizationServerMetadata(ctx: WebContext) {
  const base = issuerOf(ctx.publicUrl);
  const settings = ctx.store.getSettings();
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    ...(settings.allowDynamicRegistration ? { registration_endpoint: `${base}/register` } : {}),
    revocation_endpoint: `${base}/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    // Only public clients: Claude registers a confidential client when client_secret_* is listed,
    // and uses Client ID Metadata Documents only when "none" is listed.
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: settings.allowClientMetadataDocuments,
    service_documentation: `${base}/`,
  };
}

export function protectedResourceMetadata(ctx: WebContext) {
  return {
    resource: ctx.mcpUrl.href,
    authorization_servers: [issuerOf(ctx.publicUrl)],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "PADI dive logbook",
    resource_documentation: `${issuerOf(ctx.publicUrl)}/`,
  };
}

function cors(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, mcp-protocol-version");
  next();
}

/**
 * The SDK token/revocation handlers only read client credentials from the form body. Accept
 * HTTP Basic client authentication (client_secret_basic) by copying the credentials into the body.
 */
function basicClientAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const m = header.match(/^Basic\s+([A-Za-z0-9+/=._~-]+)$/i);
  if (m && req.body && typeof req.body === "object") {
    const decoded = Buffer.from(m[1]!, "base64").toString("utf8");
    const i = decoded.indexOf(":");
    if (i > 0) {
      const id = decodeURIComponent(decoded.slice(0, i).replace(/\+/g, " "));
      const secret = decodeURIComponent(decoded.slice(i + 1).replace(/\+/g, " "));
      const body = req.body as Record<string, unknown>;
      if (body.client_id === undefined || body.client_id === id) {
        body.client_id = id;
        body.client_secret = secret;
      }
    }
  }
  next();
}

export function oauthRoutes(ctx: WebContext): Router {
  const r = express.Router();
  const { provider } = ctx;

  // Discovery documents (RFC 8414 / RFC 9728). The protected resource metadata is served both at
  // the root and at the path-specific location for /mcp.
  const sendAs = (_req: Request, res: Response) => res.json(authorizationServerMetadata(ctx));
  const sendPrm = (_req: Request, res: Response) => res.json(protectedResourceMetadata(ctx));
  r.options(/^\/\.well-known\/.*/, cors, (_req, res) => void res.status(204).end());
  r.get("/.well-known/oauth-authorization-server", cors, sendAs);
  r.get("/.well-known/oauth-authorization-server/mcp", cors, sendAs);
  r.get("/.well-known/openid-configuration", cors, sendAs);
  r.get("/.well-known/oauth-protected-resource", cors, sendPrm);
  r.get("/.well-known/oauth-protected-resource/mcp", cors, sendPrm);

  // Rate limits. Claude calls /register, /token and /revoke from a few Anthropic IP ranges for
  // ALL users, so /token and /revoke only count FAILED requests per IP: normal traffic is never
  // throttled, and nobody can use a shared client_id (Claude's) to lock other users out.
  // /authorize is opened in each user's own browser and stays per IP.
  const failuresPerIp = {
    windowMs: 15 * 60_000,
    max: 200,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? "unknown"),
    // Claude's servers act for every user at once; their failures must not lock everyone out.
    skip: (req: Request) => isAnthropicAddress(req.ip ?? ""),
  };
  r.use("/authorize", authorizationHandler({ provider, rateLimit: { windowMs: 15 * 60_000, max: 300 } }));
  r.use("/token", express.urlencoded({ extended: false }), basicClientAuth, tokenHandler({ provider, rateLimit: failuresPerIp }));
  r.use("/revoke", express.urlencoded({ extended: false }), basicClientAuth, revocationHandler({ provider, rateLimit: failuresPerIp }));
  r.use(
    "/register",
    // Registrations are small; the SDK's own parser would accept 100 KB.
    express.json({ limit: "8kb" }),
    clientRegistrationHandler({
      clientsStore: provider.clientsStore,
      // Secrets of registered clients do not expire (Claude keeps its registration for good).
      clientSecretExpirySeconds: 0,
      rateLimit: { windowMs: 3600_000, max: 2000 },
    }),
  );

  // Consent page ---------------------------------------------------------------------------
  const form = express.urlencoded({ extended: false, limit: "16kb" });

  /**
   * The consent request is gone (it expired, or was already answered and cleaned up). This router
   * runs before the app-wide security headers, so the page sets them itself.
   */
  const expiredPage = (req: Request, res: Response) => {
    securityHeaders()(req, res, () => undefined);
    page(
      req,
      res,
      { title: t("oauth.expired.title") },
      html`<div class="sheet"><div class="sheet-head">${brandMark("lg")}<h1>${t("oauth.expired.heading")}</h1><p>${t("oauth.expired.text")}</p></div></div>`,
      400,
    );
  };

  /**
   * The consent page. Where the answer goes decides what it says: a recognized AI app (by host),
   * an app on this device (localhost or an app's own scheme), or an unknown web address, which
   * gets a warning and a box to tick before Allow works (so a link someone sent cannot get a quick
   * "Allow"). `error` is shown when that box was not ticked.
   */
  const consentPage = async (req: Request, res: Response, s: SessionInfo, pending: PendingAuthorization, error?: string) => {
    const client = await provider.clientsStore.getClient(pending.clientId);
    const redirectOrigin = new URL(pending.redirectUri).origin;
    // Chrome applies form-action to the redirect that follows the form POST.
    securityHeaders(redirectOrigin.startsWith("http") ? [redirectOrigin] : [])(req, res, () => undefined);
    // The name is chosen by whoever registered the app, so it is shown as a claim, shortened,
    // and never as the headline. The return address is the part people should check.
    const fullName = displayName(client?.client_name ?? "") || new URL(pending.redirectUri).host || t("oauth.consent.unknownApp");
    const name = fullName.length > 60 ? `${fullName.slice(0, 57)}...` : fullName;
    const target = classifyReturn(pending.redirectUri, client?.client_name);
    const settings = ctx.store.getSettings();
    // A demo account counts as set up: it has its sample data instead of a PADI connection.
    const padi = s.user.demo ? undefined : ctx.store.getPadiSettings(s.user.id);
    const readOnly = settings.forceReadOnly || (s.user.demo ? s.user.demoReadOnly : padi?.readOnly);
    page(
      req,
      res,
      { title: t("oauth.consent.title"), ...(error ? { flash: { kind: "error" as const, text: error } } : {}) },
      html`<div class="sheet">
        <div class="sheet-head">
          ${brandMark("lg")}
          <h1>${t("oauth.consent.heading")}</h1>
          <p>${th("oauth.consent.intro", { name: html`<bdi>${name}</bdi>`, email: s.user.email })}</p>
        </div>
        <div class="card">
          ${target.kind === "known"
            ? html`<p class="returns known">${glyph("check")}<span>${th("oauth.consent.known", { app: target.app, host: target.host })}</span></p>`
            : target.kind === "device"
              ? html`<p class="returns">${glyph("device")}<span>${th("oauth.consent.device", { host: target.host })}</span></p>`
              : html`<div class="flash warn" role="alert">
                  <p><strong>${t("oauth.consent.unknown.title")}</strong></p>
                  ${target.claims ? html`<p>${th("oauth.consent.unknown.claims", { app: target.claims, host: target.host })}</p>` : ""}
                  <p>${th("oauth.consent.unknown.text", { host: target.host })}</p>
                </div>`}
          <ul class="perm-list">
            <li>${serviceIcon("logbook")}<div><strong>${t("oauth.consent.logbook")}</strong><span class="what">${t(readOnly ? "oauth.consent.logbookRead" : "oauth.consent.logbookWrite")}</span></div></li>
            <li>${serviceIcon("cards")}<div><strong>${t("oauth.consent.cards")}</strong><span class="what">${t("oauth.consent.cardsRead")}</span></div></li>
          </ul>
          ${s.user.demo
            ? html`<div class="flash info">${t("oauth.consent.demo")}</div>`
            : padi
              ? ""
              : html`<div class="flash info">${th("oauth.consent.noPadi", { url: `/account?next=${encodeURIComponent(`/oauth/consent?request=${pending.id}`)}` })}</div>`}
          <form method="post" action="/oauth/consent">
            <input type="hidden" name="_csrf" value="${s.csrf}">
            <input type="hidden" name="request" value="${pending.id}">
            ${target.kind === "unknown"
              ? html`<label class="check"><input type="checkbox" name="trust" value="1" required><span>${th("oauth.consent.unknown.confirm", { host: target.host })}</span></label>`
              : ""}
            <div class="stack">
              <button type="submit" name="decision" value="allow" class="block">${t("oauth.consent.allow")}</button>
              <button type="submit" name="decision" value="deny" class="secondary block" formnovalidate>${t("oauth.consent.deny")}</button>
            </div>
          </form>
          <p class="fine center">${t("oauth.consent.disconnectHint")}</p>
        </div>
      </div>`,
      error ? 400 : 200,
    );
  };

  r.get("/oauth/consent", async (req, res) => {
    const id = typeof req.query.request === "string" ? req.query.request : "";
    const s = locals(res).session;
    if (!s) {
      res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
      return;
    }
    const pending = ctx.store.getPending(id);
    if (pending?.approvedRedirect) {
      // Already approved (e.g. the app reopened the page): the same answer again, but only for the
      // person who approved (it holds their authorization code).
      if (pending.approvedBy === s.user.id) res.redirect(303, pending.approvedRedirect);
      else expiredPage(req, res);
      return;
    }
    if (!pending) {
      expiredPage(req, res);
      return;
    }
    await consentPage(req, res, s, pending);
  });

  /**
   * Send the browser back to the app. https and http://localhost targets use a plain redirect
   * (allowed by the page's form-action). Private-use schemes and IPv6 loopback cannot be listed in
   * CSP, so they get a small page that navigates there instead.
   */
  const returnTo = (res: Response, target: string) => {
    const u = new URL(target);
    const cspFriendly = u.protocol === "https:" || (u.protocol === "http:" && !u.hostname.startsWith("["));
    if (cspFriendly) {
      res.redirect(303, target);
      return;
    }
    res
      .status(200)
      .type("html")
      .send(
        `<!doctype html><html lang="${HTML_LANG[locale()]}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=${escapeAttr(target)}"><title>${escapeAttr(t("oauth.returning.title"))} · ${escapeAttr(t("common.appName"))}</title><link rel="stylesheet" href="/static/app.css?v=${ASSET_VERSION}"></head><body><main><div class="sheet"><div class="sheet-head"><h1>${escapeAttr(t("oauth.returning.heading"))}</h1><p>${escapeAttr(t("oauth.returning.text"))}</p></div><div class="card"><div class="stack"><a class="button block" href="${escapeAttr(target)}">${escapeAttr(t("oauth.returning.continue"))}</a></div></div></div></main></body></html>`,
      );
  };

  r.post("/oauth/consent", form, async (req, res) => {
    const s = locals(res).session;
    if (!s) {
      res.redirect(303, "/login");
      return;
    }
    if (!csrfOk(req, res, ctx.cookies)) {
      securityHeaders()(req, res, () => undefined);
      page(
        req,
        res,
        { title: t("oauth.formExpired.title") },
        html`<div class="sheet"><div class="sheet-head">${brandMark("lg")}<h1>${t("oauth.formExpired.heading")}</h1><p>${t("oauth.formExpired.text")}</p></div></div>`,
        400,
      );
      return;
    }
    const id = typeof req.body.request === "string" ? req.body.request : "";
    if (req.body.decision === "allow") {
      // An unknown web address needs the box ticked (the form asks for it; this is the check).
      const pending = ctx.store.getPending(id);
      if (pending && !pending.approvedRedirect && req.body.trust !== "1") {
        const client = await provider.clientsStore.getClient(pending.clientId);
        if (classifyReturn(pending.redirectUri, client?.client_name).kind === "unknown") {
          await consentPage(req, res, s, pending, t("oauth.consent.unknown.confirmMissing"));
          return;
        }
      }
      let target: string;
      try {
        target = provider.approve(id, s.user.id);
      } catch (error) {
        // The only refusal is a request that expired in the meantime; anything else is a real error.
        if (!(error instanceof InvalidRequestError)) throw error;
        expiredPage(req, res);
        return;
      }
      ctx.log("A user approved an OAuth connection");
      returnTo(res, target);
      return;
    }
    const target = provider.deny(id);
    if (target) returnTo(res, target);
    else res.redirect(303, "/account?m=denied");
  });

  return r;
}
