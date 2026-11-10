import type { Request, Response } from "express";
import type { DemoRegistry } from "../demo/index.js";
import type { ServicePool } from "./accounts.js";
import { layout, type LayoutOptions, type SafeHtml } from "./html.js";
import { LOCALES, t, type Locale, type MessageKey } from "./i18n/index.js";
import type { ActivityHub } from "./live.js";
import type { OAuthProvider } from "./oauth.js";
import type { RequestNotices } from "./request-notices.js";
import { locals, safeNext, type Cookies } from "./session.js";
import type { Store } from "./store.js";

export interface WebContext {
  store: Store;
  provider: OAuthProvider;
  pool: ServicePool;
  /** The in-memory stores of the demo accounts and their daily reset. */
  demo: DemoRegistry;
  /** E-mails to administrators about new access requests. */
  notices: RequestNotices;
  live: ActivityHub;
  cookies: Cookies;
  publicUrl: URL;
  mcpUrl: URL;
  operator: Record<string, string>;
  version: string;
  platform: NodeJS.Platform;
  /** fetch for every request to PADI (tests pass a mock; default: the global fetch). */
  padiFetch?: typeof fetch;
  log: (m: string) => void;
}

/** Messages shown after redirects, referenced by a short code (no user-controlled text in URLs). */
export const FLASH: Record<string, { kind: "ok" | "error" | "info"; key: MessageKey }> = {
  saved: { kind: "ok", key: "common.flash.saved" },
  removed: { kind: "ok", key: "common.flash.removed" },
  revoked: { kind: "ok", key: "common.flash.revoked" },
  password: { kind: "ok", key: "common.flash.password" },
  sessions: { kind: "ok", key: "common.flash.sessions" },
  settings: { kind: "ok", key: "common.flash.settings" },
  user: { kind: "ok", key: "common.flash.user" },
  approved: { kind: "ok", key: "common.flash.approved" },
  rejected: { kind: "ok", key: "common.flash.rejected" },
  deleted: { kind: "ok", key: "common.flash.deleted" },
  welcome: { kind: "info", key: "common.flash.welcome" },
  denied: { kind: "info", key: "common.flash.denied" },
  csrf: { kind: "error", key: "common.flash.csrf" },
  lastadmin: { kind: "error", key: "common.flash.lastadmin" },
  demoreset: { kind: "ok", key: "admin.demo.flash.reset" },
  connected: { kind: "ok", key: "account.flash.connected" },
  logbookfailed: { kind: "error", key: "account.flash.logbookFailed" },
};

/** Where to go after saving the PADI connection: only back to a pending consent page. */
export function returnTo(req: Request): string | undefined {
  const raw = (typeof req.body?.next === "string" ? req.body.next : undefined) ?? (typeof req.query.next === "string" ? req.query.next : undefined);
  return raw && /^\/oauth\/consent\?request=[A-Za-z0-9_-]+$/.test(raw) ? raw : undefined;
}

/**
 * The page a GET request asked for, as a path on this site and its query. The path never starts
 * with two slashes (or a slash and a backslash), which a browser would read as another site.
 */
function samePage(originalUrl: string): { path: string; query: URLSearchParams } {
  try {
    // "//host/x" would be read as an address on another host: collapse the leading slashes first.
    const target = new URL(originalUrl.replace(/^[/\\]+/, "/"), "http://x");
    // Dot segments ("/.//x") can still leave two slashes at the start.
    return { path: target.pathname.replace(/^[/\\]+/, "/"), query: target.searchParams };
  } catch {
    return { path: "/", query: new URLSearchParams() };
  }
}

/** The page a form's answer belongs to, keeping where the visitor goes next (sign-in for an AI app). */
function formPage(req: Request): { path: string; query: URLSearchParams } {
  const query = new URLSearchParams();
  const section = req.path.split("/")[1] ?? "";
  if (section === "login" || section === "signup") {
    // The same choice as the form's hidden field.
    const next = safeNext(req.query.next ?? req.body?.next);
    if (next !== "/account") query.set("next", next);
    return { path: `/${section}`, query };
  }
  if (section === "oauth" && req.path === "/oauth/consent") {
    // The consent page shown again (Allow without the box ticked): the same request.
    const request = typeof req.body?.request === "string" ? req.body.request : "";
    if (/^[A-Za-z0-9_-]{1,200}$/.test(request)) {
      query.set("request", request);
      return { path: "/oauth/consent", query };
    }
    return { path: "/", query };
  }
  if (section === "account") {
    if (/^\/account\/(password|sessions|delete)\/?$/.test(req.path)) return { path: "/account/security", query };
    const back = returnTo(req);
    if (back) query.set("next", back);
    return { path: "/account", query };
  }
  return { path: section === "admin" ? "/admin" : "/", query };
}

/**
 * Where the language menu sends the visitor: the same page in the other language. Pages shown
 * after a form was sent (POST) link to the page the form is on.
 */
export function languageLinks(req: Request): Record<Locale, string> {
  const out = {} as Record<Locale, string>;
  const { path, query } = req.method === "GET" ? samePage(req.originalUrl) : formPage(req);
  // A message from the last redirect is not shown again.
  query.delete("m");
  for (const lang of LOCALES) {
    query.set("lang", lang);
    out[lang] = `${path}?${query}`;
  }
  return out;
}

export function page(req: Request, res: Response, opts: Omit<LayoutOptions, "user" | "csrf" | "flash" | "languages"> & { flash?: LayoutOptions["flash"] }, body: SafeHtml, status = 200): void {
  const s = locals(res).session;
  const code = typeof req.query.m === "string" ? req.query.m : undefined;
  const coded = code && Object.hasOwn(FLASH, code) ? FLASH[code] : undefined;
  const flash = opts.flash ?? (coded ? { kind: coded.kind, text: t(coded.key) } : undefined);
  res
    .status(status)
    .type("html")
    .send(
      layout(
        {
          ...opts,
          ...(s
            ? {
                user: {
                  email: s.user.email,
                  isAdmin: s.user.isAdmin,
                  ...(locals(res).accessRequests ? { accessRequests: locals(res).accessRequests } : {}),
                },
                csrf: s.csrf,
              }
            : {}),
          ...(flash ? { flash } : {}),
          languages: languageLinks(req),
        },
        body,
      ),
    );
}

export function str(value: unknown, max = 2000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function bool(value: unknown): boolean {
  return value === "on" || value === "true" || value === "1";
}
