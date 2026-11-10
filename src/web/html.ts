import { createHash } from "node:crypto";
import { APP_CSS, APP_JS } from "./assets.js";
import { clientMessages, HTML_LANG, LOCALE_NAMES, LOCALES, locale, t, th, type Locale } from "./i18n/index.js";
import { brandMark, glyph, initials } from "./icons.js";
import { CONTACT_EMAIL } from "./operator.js";

/**
 * Minimal server-side HTML templating with automatic escaping.
 *
 *   html`<p>${userInput}</p>`        -> userInput is escaped
 *   html`<div>${html`<b>x</b>`}</div>` -> nested templates are kept as HTML
 */

export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function render(value: unknown): string {
  if (value === undefined || value === null || value === false) return "";
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join("");
  return escapeHtml(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) out += render(values[i]) + (strings[i + 1] ?? "");
  return new SafeHtml(out);
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

export interface LayoutOptions {
  title: string;
  user?: { email: string; isAdmin: boolean; accessRequests?: number };
  csrf?: string;
  active?: string;
  flash?: { kind: "ok" | "error" | "info"; text: string };
  /** Wider page (admin tables, welcome tiles). */
  wide?: boolean;
  /** Hide the "Sign in" link in the bar (sign-in and sign-up pages). */
  hideSignIn?: boolean;
  /** The current page in each language, for the language menu. */
  languages?: Record<Locale, string>;
  /** <meta name="description"> (start page). */
  description?: string;
}

/** The round profile mark: the initials of the e-mail address. */
export function avatar(email: string, size: "" | "xl" = "", attrs: SafeHtml = html` aria-hidden="true"`): SafeHtml {
  return html`<span class="avatar${size ? ` ${size}` : ""}"${attrs}>${initials(email)}</span>`;
}

/** Changes whenever the stylesheet or script changes, so browsers never keep an old copy. */
export const ASSET_VERSION = createHash("sha256").update(APP_CSS).update(APP_JS).digest("hex").slice(0, 10);

export function layout(opts: LayoutOptions, body: SafeHtml): string {
  // Narrow screens show the short label so every tab fits.
  const tab = (href: string, key: string, label: string, extra: SafeHtml | string = "", short = label) =>
    html`<a href="${href}" class="${opts.active === key ? "active" : ""}"${opts.active === key ? raw(' aria-current="page"') : ""}${short === label ? "" : html` aria-label="${label}"`}>${short === label
      ? label
      : html`<span class="long">${label}</span><span class="short" aria-hidden="true">${short}</span>`}${extra}</a>`;
  const bar = opts.user
    ? html`<nav class="tabs" aria-label="${t("common.nav.main")}">
          ${tab("/account", "account", t("common.nav.account"), "", t("common.nav.accountShort"))}
          ${tab("/account/connections", "connections", t("common.nav.connections"), "", t("common.nav.connectionsShort"))}
          ${tab("/account/security", "security", t("common.nav.security"))}
          ${opts.user.isAdmin
            ? tab(
                "/admin",
                "admin",
                t("common.nav.admin"),
                opts.user.accessRequests ? html` <span class="badge warn" title="${t("common.nav.requestsWaiting")}">${opts.user.accessRequests}</span>` : "",
              )
            : ""}
        </nav>
        <div class="me">
          ${avatar(opts.user.email, "", html` role="img" title="${opts.user.email}" aria-label="${t("common.nav.signedInAs", { email: opts.user.email })}"`)}
          <form method="post" action="/logout" class="inline">
            <input type="hidden" name="_csrf" value="${opts.csrf ?? ""}">
            <button type="submit" class="link">${t("common.nav.signOut")}</button>
          </form>
        </div>`
    : opts.hideSignIn
      ? ""
      : html`<a class="signin" href="/login">${t("common.nav.signIn")}</a>`;
  const flash = opts.flash ? html`<div class="flash ${opts.flash.kind}" role="status">${opts.flash.text}</div>` : "";
  const current = locale();
  const languages = opts.languages
    ? html`<nav class="langs" aria-label="${t("common.footer.language")}">${LOCALES.map((l) =>
        l === current
          ? html`<span lang="${HTML_LANG[l]}" aria-current="true">${LOCALE_NAMES[l]}</span>`
          : html`<a href="${opts.languages![l]}" lang="${HTML_LANG[l]}" hreflang="${HTML_LANG[l]}">${LOCALE_NAMES[l]}</a>`,
      )}</nav>`
    : "";
  const legal = html`<nav class="links" aria-label="${t("common.footer.legal")}"><a href="/privacy">${t("common.footer.privacy")}</a><a href="/terms">${t("common.footer.terms")}</a><a href="mailto:${CONTACT_EMAIL}">${t("common.footer.contact")}</a></nav>`;
  return `<!doctype html>
<html lang="${HTML_LANG[current]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f5f5f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<title>${escapeHtml(opts.title)} · ${escapeHtml(t("common.appName"))}</title>
<meta property="og:site_name" content="${escapeHtml(t("common.appName"))}">${opts.description ? `\n<meta name="description" content="${escapeHtml(opts.description)}">` : ""}
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/static/app.css?v=${ASSET_VERSION}">
<script src="/static/app.js?v=${ASSET_VERSION}" defer></script>
</head>
<body data-i18n="${escapeHtml(JSON.stringify(clientMessages()))}">
<header class="topbar">
  <div class="topbar-inner">
    <a href="/" class="brand">${render(brandMark("sm"))}<span class="brand-name"><b>MCP</b> for PADI</span></a>
    ${render(bar)}
  </div>
</header>
<main${opts.wide ? ' class="wide"' : ""}>
${render(flash)}
${body.value}
</main>
<footer>
  ${render(languages)}
  <p class="author">${render(glyph("person"))}<span>${render(th("common.footer.author"))}</span></p>
  <p>${escapeHtml(t("common.footer.about"))}</p>
  <p>${escapeHtml(t("common.footer.disclaimer"))}</p>
  ${render(legal)}
</footer>
</body>
</html>`;
}

/** A date for tables and badges, kept on one line. */
export function formatDate(ms: number | undefined): SafeHtml {
  if (!ms) return html`<span class="date">${t("common.never")}</span>`;
  return html`<span class="date">${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC</span>`;
}
