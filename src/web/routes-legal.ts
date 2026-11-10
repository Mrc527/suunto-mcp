/**
 * The privacy policy (/privacy) and the terms of use (/terms), open to everyone.
 *
 * The texts (i18n/en/legal.ts) describe what the code does. The figures that the administrator
 * can change (how long sessions and tokens last) are read from the server settings, and the
 * cookie names from the cookies this server really sets.
 */

import express, { type Router } from "express";
import { page, type WebContext } from "./context.js";
import { html, type SafeHtml } from "./html.js";
import { HTML_LANG, locale, t, th, tn, type MessageKey } from "./i18n/index.js";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR_NAME } from "./operator.js";
import { LANGUAGE_COOKIE_DAYS, PRE_CSRF_HOURS } from "./session.js";

/** PADI's website (the terms of use point to it). */
const PADI_URL = "https://www.padi.com";

interface Section {
  id: string;
  title: MessageKey;
  body: SafeHtml;
}

type Params = Record<string, string | number | SafeHtml>;

/** The date of the last change, written out in the page's language (8 November 2026, ...). */
export function legalDate(iso = LEGAL_UPDATED): string {
  return new Intl.DateTimeFormat(HTML_LANG[locale()], { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}

export function legalRoutes(ctx: WebContext): Router {
  const r = express.Router();

  /** Values every legal text may use. */
  const common = (): Params => ({
    app: t("common.appName"),
    operator: OPERATOR_NAME,
    site: ctx.publicUrl.host,
    email: html`<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`,
    url: PADI_URL,
  });

  const render = (req: express.Request, res: express.Response, title: MessageKey, intro: MessageKey, sections: Section[], end: SafeHtml) => {
    const params = common();
    page(
      req,
      res,
      { title: t(title) },
      html`<article class="legal">
        <div class="page-title">
          <h1>${t(title)}</h1>
          <p>${t("legal.updated", { date: legalDate() })}</p>
        </div>
        <div class="card">
          <p>${th(intro, params)}</p>
        </div>
        <nav class="card legal-toc" aria-labelledby="legal-toc-title">
          <h2 id="legal-toc-title">${t("legal.onThisPage")}</h2>
          <ol>${sections.map((s) => html`<li><a href="#${s.id}">${t(s.title)}</a></li>`)}</ol>
        </nav>
        ${sections.map(
          (s) => html`<section class="card" id="${s.id}" aria-labelledby="${s.id}-title">
            <h2 id="${s.id}-title">${t(s.title)}</h2>
            ${s.body}
          </section>`,
        )}
        <p class="fine legal-end">${end}</p>
        <p class="fine legal-end">${t("legal.englishPrevails")}</p>
      </article>`,
    );
  };

  r.get("/privacy", (req, res) => {
    const params = common();
    const p = (key: MessageKey, extra: Params = {}) => html`<p>${th(key, { ...params, ...extra })}</p>`;
    const ul = (...items: (MessageKey | [MessageKey, Params])[]) =>
      html`<ul>${items.map((item) => (Array.isArray(item) ? html`<li>${th(item[0], { ...params, ...item[1] })}</li>` : html`<li>${th(item, params)}</li>`))}</ul>`;
    const settings = ctx.store.getSettings();
    const cookie = (name: string) => html`<code>${name}</code>`;

    const sections: Section[] = [
      { id: "controller", title: "legal.privacy.controller.title", body: html`${p("legal.privacy.controller.text")}${p("legal.privacy.controller.contact")}` },
      {
        id: "data",
        title: "legal.privacy.data.title",
        body: html`${p("legal.privacy.data.lead")}${ul(
          "legal.privacy.data.account",
          "legal.privacy.data.request",
          "legal.privacy.data.invite",
          "legal.privacy.data.padi",
          "legal.privacy.data.apps",
          "legal.privacy.data.activity",
          "legal.privacy.data.sessions",
          "legal.privacy.data.ip",
          "legal.privacy.data.log",
        )}`,
      },
      { id: "content", title: "legal.privacy.content.title", body: html`${p("legal.privacy.content.text")}${p("legal.privacy.content.sent")}` },
      {
        id: "legal-bases",
        title: "legal.privacy.bases.title",
        body: html`${p("legal.privacy.bases.lead")}${ul("legal.privacy.bases.contract", "legal.privacy.bases.interest", "legal.privacy.bases.law")}`,
      },
      {
        id: "retention",
        title: "legal.privacy.retention.title",
        body: ul(
          "legal.privacy.retention.account",
          "legal.privacy.retention.padi",
          "legal.privacy.retention.request",
          ["legal.privacy.retention.sessions", { lifetime: tn("legal.duration.days", settings.sessionTtlDays) }],
          [
            "legal.privacy.retention.tokens",
            { access: tn("legal.duration.minutes", settings.accessTokenTtlMinutes), refresh: tn("legal.duration.days", settings.refreshTokenTtlDays) },
          ],
          "legal.privacy.retention.clients",
          "legal.privacy.retention.activity",
          "legal.privacy.retention.invites",
          "legal.privacy.retention.log",
          "legal.privacy.retention.backups",
        ),
      },
      {
        id: "recipients",
        title: "legal.privacy.recipients.title",
        body: html`${p("legal.privacy.recipients.lead")}${ul(
          "legal.privacy.recipients.padi",
          "legal.privacy.recipients.apps",
          "legal.privacy.recipients.hosting",
          "legal.privacy.recipients.admin",
          "legal.privacy.recipients.authorities",
        )}${p("legal.privacy.recipients.noTracking")}`,
      },
      { id: "transfers", title: "legal.privacy.transfers.title", body: p("legal.privacy.transfers.text") },
      {
        id: "security",
        title: "legal.privacy.security.title",
        body: html`${ul(
          "legal.privacy.security.encryption",
          "legal.privacy.security.transport",
          "legal.privacy.security.web",
          "legal.privacy.security.server",
        )}${p("legal.privacy.security.token")}${p("legal.privacy.security.report")}`,
      },
      {
        id: "rights",
        title: "legal.privacy.rights.title",
        body: html`${p("legal.privacy.rights.lead")}${ul("legal.privacy.rights.padi", "legal.privacy.rights.apps", "legal.privacy.rights.delete")}${p(
          "legal.privacy.rights.email",
        )}${p("legal.privacy.rights.complaint")}`,
      },
      {
        id: "cookies",
        title: "legal.privacy.cookies.title",
        body: html`${p("legal.privacy.cookies.lead")}${ul(
          ["legal.privacy.cookies.session", { name: cookie(ctx.cookies.session), lifetime: tn("legal.duration.days", settings.sessionTtlDays) }],
          ["legal.privacy.cookies.pre", { name: cookie(ctx.cookies.pre), lifetime: tn("legal.duration.hours", PRE_CSRF_HOURS) }],
          ["legal.privacy.cookies.lang", { name: cookie(ctx.cookies.lang), lifetime: tn("legal.duration.days", LANGUAGE_COOKIE_DAYS) }],
        )}`,
      },
      { id: "children", title: "legal.privacy.children.title", body: p("legal.privacy.children.text") },
      { id: "changes", title: "legal.privacy.changes.title", body: p("legal.privacy.changes.text") },
    ];
    render(req, res, "legal.privacy.title", "legal.privacy.intro", sections, th("legal.seeTerms"));
  });

  r.get("/terms", (req, res) => {
    const params = common();
    const p = (key: MessageKey) => html`<p>${th(key, params)}</p>`;
    const ul = (...items: MessageKey[]) => html`<ul>${items.map((key) => html`<li>${th(key, params)}</li>`)}</ul>`;

    const sections: Section[] = [
      { id: "service", title: "legal.terms.service.title", body: p("legal.terms.service.text") },
      { id: "affiliation", title: "legal.terms.affiliation.title", body: p("legal.terms.affiliation.text") },
      { id: "account", title: "legal.terms.account.title", body: ul("legal.terms.account.age", "legal.terms.account.secret", "legal.terms.account.approval") },
      { id: "padi", title: "legal.terms.padi.title", body: p("legal.terms.padi.text") },
      { id: "ai-apps", title: "legal.terms.ai.title", body: html`${p("legal.terms.ai.access")}${p("legal.terms.ai.responsible")}` },
      {
        id: "use",
        title: "legal.terms.use.title",
        body: html`${p("legal.terms.use.lead")}${ul("legal.terms.use.spam", "legal.terms.use.law", "legal.terms.use.others", "legal.terms.use.harm")}${p("legal.terms.use.report")}`,
      },
      { id: "availability", title: "legal.terms.availability.title", body: p("legal.terms.availability.text") },
      { id: "administrator", title: "legal.terms.admin.title", body: p("legal.terms.admin.text") },
      { id: "ending", title: "legal.terms.end.title", body: p("legal.terms.end.text") },
      { id: "liability", title: "legal.terms.liability.title", body: p("legal.terms.liability.text") },
      { id: "privacy", title: "legal.terms.privacy.title", body: p("legal.terms.privacy.text") },
      { id: "changes", title: "legal.terms.changes.title", body: p("legal.terms.changes.text") },
      { id: "law", title: "legal.terms.law.title", body: p("legal.terms.law.text") },
      { id: "contact", title: "legal.terms.contact.title", body: p("legal.terms.contact.text") },
    ];
    render(req, res, "legal.terms.title", "legal.terms.intro", sections, th("legal.seePrivacy"));
  });

  return r;
}
