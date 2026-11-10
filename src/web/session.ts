/**
 * Browser sessions, CSRF protection and security headers for the web pages.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { randomToken, safeEqual } from "./crypto.js";
import type { Store, User } from "./store.js";
import { t } from "./i18n/index.js";

export interface SessionInfo {
  user: User;
  csrf: string;
  idHash: string;
}

export interface WebLocals {
  session?: SessionInfo;
  cookies: Record<string, string>;
  /** CSRF token for forms shown to anonymous visitors (double-submit cookie). */
  preCsrf?: string;
  /** Open access requests (only computed for administrators, shown in the menu). */
  accessRequests?: number;
}

export function locals(res: Response): WebLocals {
  return res.locals as WebLocals;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k || k in out) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/** How long the anonymous CSRF cookie (sign-in and sign-up forms) lasts. */
export const PRE_CSRF_HOURS = 12;
/** How long the language cookie lasts. */
export const LANGUAGE_COOKIE_DAYS = 365;

export class Cookies {
  readonly session: string;
  readonly pre: string;
  /** The language chosen in the language menu. */
  readonly lang: string;

  constructor(readonly secure: boolean) {
    // The __Host- prefix makes browsers enforce Secure, Path=/ and no Domain attribute.
    this.session = secure ? "__Host-pdm_session" : "pdm_session";
    this.pre = secure ? "__Host-pdm_pre" : "pdm_pre";
    this.lang = secure ? "__Host-pdm_lang" : "pdm_lang";
  }

  serialize(name: string, value: string, maxAgeSeconds: number): string {
    const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
    if (this.secure) parts.push("Secure");
    return parts.join("; ");
  }

  clear(name: string): string {
    return this.serialize(name, "", 0);
  }
}

function appendCookie(res: Response, cookie: string): void {
  const existing = res.getHeader("set-cookie");
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  res.setHeader("set-cookie", [...list, cookie]);
}

export function setCookie(res: Response, cookie: string): void {
  appendCookie(res, cookie);
}

export function sessionMiddleware(store: Store, cookies: Cookies): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const jar = parseCookies(req.headers.cookie);
    const l = locals(res);
    l.cookies = jar;
    const sid = jar[cookies.session];
    if (sid) {
      const session = store.getSession(sid);
      if (session) {
        l.session = session;
        if (session.user.isAdmin) l.accessRequests = store.countAccessRequests();
      }
      else appendCookie(res, cookies.clear(cookies.session));
    }
    next();
  };
}

/** Ensure an anonymous CSRF cookie exists and return its value (for login/signup forms). */
export function preCsrf(res: Response, cookies: Cookies): string {
  const l = locals(res);
  if (l.preCsrf) return l.preCsrf;
  let value = l.cookies[cookies.pre];
  if (!value || value.length < 20) {
    value = randomToken("", 24);
    appendCookie(res, cookies.serialize(cookies.pre, value, PRE_CSRF_HOURS * 3600));
  }
  l.preCsrf = value;
  return value;
}

/** Validate the CSRF token of a form POST (session token when signed in, cookie otherwise). */
export function csrfOk(req: Request, res: Response, cookies: Cookies): boolean {
  const sent = typeof req.body?._csrf === "string" ? (req.body._csrf as string) : "";
  if (!sent) return false;
  const l = locals(res);
  if (l.session) return safeEqual(sent, l.session.csrf);
  const cookie = l.cookies[cookies.pre];
  return !!cookie && safeEqual(sent, cookie);
}

/**
 * Per-user limit for expensive or sensitive actions (password checks run scrypt; "Save and test"
 * signs in to PADI). Keyed by the signed-in user, falling back to the IP.
 */
export function perUserLimit(max: number, windowMs = 15 * 60_000): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
      const s = locals(res).session;
      return s ? `user:${s.user.id}` : `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
    },
    message: () => t("common.error.tooManyAttempts"),
  });
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!locals(res).session) {
    res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const s = locals(res).session;
  if (!s) {
    res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    return;
  }
  if (!s.user.isAdmin) {
    res.status(403).type("text").send(t("common.error.forbidden"));
    return;
  }
  next();
}

/** Only allow same-site relative redirect targets after login. */
export function safeNext(value: unknown): string {
  const v = typeof value === "string" ? value : "";
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return "/account";
  return v;
}

export function securityHeaders(extraFormAction: string[] = []): RequestHandler {
  return (_req, res, next) => {
    res.setHeader(
      "content-security-policy",
      [
        "default-src 'self'",
        "img-src 'self' data:",
        "style-src 'self'",
        "script-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        `form-action 'self'${extraFormAction.length ? ` ${extraFormAction.join(" ")}` : ""}`,
      ].join("; "),
    );
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("cache-control", "no-store");
    next();
  };
}
