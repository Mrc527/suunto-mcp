/**
 * The start page: what MCP for PADI is, for people who are not signed in yet.
 * Signed-in people go straight to their account page.
 */

import express, { type Router } from "express";
import { page, type WebContext } from "./context.js";
import { html, raw, type SafeHtml } from "./html.js";
import { HTML_LANG, locale, t, th, type MessageKey } from "./i18n/index.js";
import { brandMark, glyph, serviceIcon, type Service } from "./icons.js";
import { introVideo } from "./media.js";
import { signupAllowedFor } from "./routes-auth.js";
import { locals } from "./session.js";

/** Where people with a Google, Apple or Facebook sign-in set a PADI password. */
const PADI_ACCOUNT_URL = "https://account.padi.com";

/** Glyphs used only here, drawn like the ones in icons.ts (24 px grid, currentColor). */
const HOME_GLYPHS = {
  stats: '<path d="M4 20h16"/><path d="M7 16.5v-5M12 16.5V6.5M17 16.5v-8"/>',
  apps: '<rect x="4" y="4" width="6.6" height="6.6" rx="1.9"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.9"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.9"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.9"/>',
  shield: '<path d="M12 3.2l7 2.7v5.5c0 4.3-2.9 7.8-7 9.4-4.1-1.6-7-5.1-7-9.4V5.9z"/><path d="M9 12.1l2.2 2.2 4-4.1"/>',
} as const;

function homeGlyph(name: keyof typeof HOME_GLYPHS): SafeHtml {
  return raw(
    `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${HOME_GLYPHS[name]}</svg>`,
  );
}

type Mode = "request" | "open" | "invite" | "closed";

/** Technical names such as "AES-256-GCM" never break at their hyphens (non-breaking hyphen U+2011). */
function noBreakTerms(text: string): string {
  return text.replace(/\bAES-256-GCM\b/g, "AES\u2011256\u2011GCM");
}

export function homeRoutes(ctx: WebContext): Router {
  const r = express.Router();

  r.get("/", (req, res) => {
    if (locals(res).session) {
      res.redirect(303, "/account");
      return;
    }
    const { allowed, approval, invite } = signupAllowedFor(ctx);
    const mode: Mode = !allowed ? "closed" : approval ? "request" : invite ? "invite" : "open";

    const buttons = html`<div class="actions">
      <a class="button" href="/login">${t("home.signIn")}</a>
      ${allowed ? html`<a class="button secondary" href="/signup">${t(approval ? "home.requestAccess" : "home.createAccount")}</a>` : ""}
    </div>`;

    page(
      req,
      res,
      { title: t("home.title"), description: t("home.description"), wide: true },
      html`<div class="home">
        ${hero(buttons)}
        ${videoSection()}
        ${featuresSection()}
        ${examplesSection()}
        ${howSection(mode, ctx.mcpUrl.href)}
        ${privacySection()}
        ${faqSection()}
        ${ctaSection(mode, buttons)}
      </div>`,
    );
  });

  return r;
}

function hero(buttons: SafeHtml): SafeHtml {
  return html`<section class="hero home-hero" aria-labelledby="home-title">
    ${brandMark("xl")}
    <h1 id="home-title">${t("home.hero.title")}</h1>
    <p class="lead">${t("home.hero.lead")}</p>
    ${buttons}
    <p class="home-works">${t("home.hero.worksWith")}</p>
  </section>`;
}

/** The explainer video, when there is one in assets/video (none in v1). */
function videoSection(): SafeHtml | "" {
  const video = introVideo(locale());
  if (!video) return "";
  return html`<section class="home-section home-video" id="video" aria-labelledby="home-video-title">
    <div class="home-head">
      <h2 id="home-video-title">${t("home.video.title")}</h2>
      <p id="home-video-text">${t("home.video.text")}</p>
    </div>
    <div class="home-video-frame">
      <video controls muted playsinline preload="metadata" data-autoplay poster="${video.poster}" width="1280" height="720" lang="${HTML_LANG[video.lang]}" aria-labelledby="home-video-title" aria-describedby="home-video-text">
        <source src="${video.mp4}" type="video/mp4">
        <p>${th("home.video.unsupported", { url: video.mp4 })}</p>
      </video>
    </div>
    ${video.lang !== locale() ? html`<p class="home-video-note">${t("home.video.inEnglish")}</p>` : ""}
  </section>`;
}

function featuresSection(): SafeHtml {
  const tile = (service: Service, name: MessageKey, text: MessageKey) =>
    html`<div class="tile"><div class="tile-head">${serviceIcon(service, "lg")}<h3>${t(name)}</h3></div><p>${t(text)}</p></div>`;
  const feature = (icon: SafeHtml, title: MessageKey, text: MessageKey) =>
    html`<li><span class="home-feature-icon">${icon}</span><div><h3>${t(title)}</h3><p>${t(text)}</p></div></li>`;
  return html`<section class="home-section" id="features" aria-labelledby="home-features-title">
    <div class="home-head">
      <h2 id="home-features-title">${t("home.features.title")}</h2>
      <p>${t("home.features.lead")}</p>
    </div>
    <div class="tiles home-services">
      ${tile("logbook", "home.logbook.name", "home.logbook.text")}
      ${tile("cards", "home.cards.name", "home.cards.text")}
    </div>
    <ul class="home-features" role="list">
      ${feature(homeGlyph("stats"), "home.stats.title", "home.stats.text")}
      ${feature(homeGlyph("apps"), "home.anyApp.title", "home.anyApp.text")}
      ${feature(homeGlyph("shield"), "home.control.title", "home.control.text")}
    </ul>
  </section>`;
}

const EXAMPLES: MessageKey[] = [
  "home.examples.countYear",
  "home.examples.logDive",
  "home.examples.deepest",
  "home.examples.yearReview",
  "home.examples.certifications",
  "home.examples.buddy",
];

function examplesSection(): SafeHtml {
  return html`<section class="home-section home-examples" id="examples" aria-labelledby="home-examples-title">
    <div class="home-head">
      <h2 id="home-examples-title">${t("home.examples.title")}</h2>
      <p>${t("home.examples.lead")}</p>
    </div>
    <ul class="home-bubbles" role="list">
      ${EXAMPLES.map((key) => html`<li><q>${t(key)}</q></li>`)}
    </ul>
  </section>`;
}

function howSection(mode: Mode, mcpUrl: string): SafeHtml {
  const step1Title: Record<Mode, MessageKey> = {
    request: "home.how.step1.titleRequest",
    open: "home.how.step1.titleCreate",
    invite: "home.how.step1.titleCreate",
    closed: "home.how.step1.titleClosed",
  };
  const step1Text: Record<Mode, MessageKey> = {
    request: "home.how.step1.request",
    open: "home.how.step1.open",
    invite: "home.how.step1.invite",
    closed: "home.how.step1.closed",
  };
  return html`<section class="home-section" id="how" aria-labelledby="home-how-title">
    <div class="home-head">
      <h2 id="home-how-title">${t("home.how.title")}</h2>
      <p>${t("home.how.lead")}</p>
    </div>
    <ol class="home-steps" role="list">
      <li><h3>${t(step1Title[mode])}</h3><p>${t(step1Text[mode])}</p></li>
      <li><h3>${t("home.how.step2.title")}</h3><p>${th("home.how.step2.text", { url: PADI_ACCOUNT_URL })}</p></li>
      <li><h3>${t("home.how.step3.title")}</h3><p>${t("home.how.step3.text")}</p></li>
    </ol>
    <div class="home-address">
      <p>${t("home.how.address")}</p>
      <div class="copy"><code id="home-mcp-url">${mcpUrl}</code><button type="button" class="secondary small" data-copy="home-mcp-url">${t("home.how.copy")}</button></div>
    </div>
  </section>`;
}

function privacySection(): SafeHtml {
  const item = (icon: SafeHtml, title: MessageKey, text: SafeHtml | string) =>
    html`<li><span class="home-check">${icon}</span><div><h3>${t(title)}</h3><p>${text}</p></div></li>`;
  return html`<section class="home-section" id="privacy" aria-labelledby="home-privacy-title">
    <div class="card home-privacy">
      <div class="home-head">
        <span class="home-privacy-icon">${glyph("lock")}</span>
        <h2 id="home-privacy-title">${t("home.privacy.title")}</h2>
        <p>${t("home.privacy.lead")}</p>
      </div>
      <ul class="home-checks" role="list">
        ${item(glyph("check"), "home.privacy.noPassword.title", t("home.privacy.noPassword.text"))}
        ${item(glyph("check"), "home.privacy.encrypted.title", noBreakTerms(t("home.privacy.encrypted.text")))}
        ${item(glyph("check"), "home.privacy.passThrough.title", t("home.privacy.passThrough.text"))}
        ${item(glyph("check"), "home.privacy.readOnly.title", t("home.privacy.readOnly.text"))}
        ${item(glyph("check"), "home.privacy.approve.title", t("home.privacy.approve.text"))}
      </ul>
      <p class="home-privacy-more">${th("home.privacy.more")}</p>
    </div>
  </section>`;
}

function faqSection(): SafeHtml {
  const qa = (q: MessageKey, a: SafeHtml | string) => html`<details><summary>${t(q)}</summary><p>${a}</p></details>`;
  return html`<section class="home-section home-faq" id="faq" aria-labelledby="home-faq-title">
    <div class="home-head">
      <h2 id="home-faq-title">${t("home.faq.title")}</h2>
    </div>
    <div class="card">
      ${qa("home.faq.official.q", t("home.faq.official.a"))}
      ${qa("home.faq.password.q", th("home.faq.password.a", { url: PADI_ACCOUNT_URL }))}
      ${qa("home.faq.changes.q", t("home.faq.changes.a"))}
      ${qa("home.faq.readOnly.q", t("home.faq.readOnly.a"))}
      ${qa("home.faq.apps.q", t("home.faq.apps.a"))}
      ${qa("home.faq.operator.q", t("home.faq.operator.a"))}
    </div>
  </section>`;
}

function ctaSection(mode: Mode, buttons: SafeHtml): SafeHtml {
  const texts: Record<Mode, MessageKey> = { request: "home.cta.request", open: "home.cta.open", invite: "home.cta.invite", closed: "home.cta.closed" };
  return html`<section class="home-section home-cta" aria-labelledby="home-cta-title">
    ${brandMark("lg")}
    <h2 id="home-cta-title">${t("home.cta.title")}</h2>
    <p>${t(texts[mode])}</p>
    ${buttons}
  </section>`;
}
