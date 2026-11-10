/**
 * Administration: server settings, users, invites and OAuth clients.
 */

import express, { type Request, type Response, type Router } from "express";
import { customEndpoints, endpointsFromEnv } from "../padi/endpoints.js";
import { isValidTimeZone } from "../util/dates.js";
import { bool, page, str, type WebContext } from "./context.js";
import { hashPassword, randomToken, readablePassword } from "./crypto.js";
import { formatDate, html } from "./html.js";
import { locale, t, th, tn, type MessageKey } from "./i18n/index.js";
import type { NoticeProblem } from "./request-notices.js";
import { isEmail } from "./routes-auth.js";
import { csrfOk, locals, perUserLimit, requireAdmin } from "./session.js";
import type { RegistrationMode, ServerSettings } from "./store.js";

function list(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

interface SelfTestRow {
  label: string;
  ok: boolean;
  detail: string;
}

/**
 * Check the public URL the way AI apps will see it (from this server, so only reachability basics).
 * Runs inside the request, so the labels are in the visitor's language; the details are technical
 * (HTTP status, network errors) and stay as returned.
 */
async function selfTest(ctx: WebContext): Promise<SelfTestRow[]> {
  const base = ctx.publicUrl.href.replace(/\/+$/, "");
  const rows: SelfTestRow[] = [];
  rows.push({
    label: t("admin.selfTest.https"),
    ok: ctx.publicUrl.protocol === "https:" && !ctx.publicUrl.port,
    detail:
      ctx.publicUrl.protocol === "https:"
        ? ctx.publicUrl.port
          ? t("admin.selfTest.httpsPort", { port: ctx.publicUrl.port })
          : t("admin.selfTest.httpsOk")
        : t("admin.selfTest.httpsRequired"),
  });
  const get = async (path: string, init: RequestInit = {}) => {
    try {
      const res = await fetch(`${base}${path}`, { ...init, redirect: "manual", signal: AbortSignal.timeout(8000) });
      return res;
    } catch (error) {
      return error as Error;
    }
  };
  const mcp = await get("/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: "{}" });
  if (mcp instanceof Error) rows.push({ label: t("admin.selfTest.mcpReachable"), ok: false, detail: mcp.message });
  else {
    const www = mcp.headers.get("www-authenticate") ?? "";
    rows.push({ label: t("admin.selfTest.mcpDiscovery"), ok: mcp.status === 401 && www.includes("resource_metadata="), detail: `HTTP ${mcp.status} ${www}` });
  }
  for (const path of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource", "/.well-known/oauth-authorization-server"]) {
    const res = await get(path);
    if (res instanceof Error) rows.push({ label: path, ok: false, detail: res.message });
    else rows.push({ label: path, ok: res.status === 200, detail: `HTTP ${res.status}` });
  }
  // Which PADI servers the users' requests go to (nothing is sent to PADI here). Custom servers
  // are meant for tests against a mock.
  try {
    const custom = customEndpoints(endpointsFromEnv(ctx.operator));
    const mode = ctx.operator.PADI_API_MODE || "proxy";
    rows.push({
      label: t("admin.selfTest.padi"),
      ok: custom.length === 0,
      detail: custom.length ? t("admin.selfTest.padiCustom", { list: custom.join(", "), mode }) : t("admin.selfTest.padiDefault", { mode }),
    });
  } catch (error) {
    rows.push({ label: t("admin.selfTest.padi"), ok: false, detail: (error as Error).message });
  }
  return rows;
}

/** Why no e-mail about access requests could be sent, as a phrase for a sentence. */
export function noticeProblemText(problem: NoticeProblem): string {
  return t(`admin.notices.problem.${problem}` as MessageKey);
}

export function adminRoutes(ctx: WebContext): Router {
  const r = express.Router();
  const form = express.urlencoded({ extended: false, limit: "64kb" });
  r.use("/admin", requireAdmin);

  const render = (
    req: Request,
    res: Response,
    extra: { flash?: { kind: "ok" | "error" | "info"; text: string }; secret?: { label: string; value: string }; selfTest?: SelfTestRow[] } = {},
    status = 200,
  ) => {
    const s = locals(res).session!;
    const settings = ctx.store.getSettings();
    // Access requests are listed on their own, not with the users.
    const users = ctx.store.listUsers().filter((u) => !u.pending);
    const demoUsers = users.filter((u) => u.demo);
    // Connections on record that cannot be decrypted (the master key changed): they cannot be
    // used until the user signs in to PADI again.
    const unreadable = ctx.store.unreadablePadiUserIds();
    const padiWorks = (u: (typeof users)[number]) => u.hasPadi && !u.padiNeedsReconnect && !u.demo && !unreadable.has(u.id);
    const requests = ctx.store.listAccessRequests();
    const activity = ctx.store.activityCounts(Date.now() - 7 * 86_400_000);
    const invites = ctx.store.listInvites();
    const clients = ctx.store.listClients(200);
    const clientCount = ctx.store.countClients();
    const csrf = html`<input type="hidden" name="_csrf" value="${s.csrf}">`;
    const mode = (m: RegistrationMode, label: string) => html`<option value="${m}" ${settings.registration === m ? "selected" : ""}>${label}</option>`;
    // The language of the e-mails this administrator gets: the one they last used here.
    if (s.user.lang !== locale()) ctx.store.setLang(s.user.id, locale());
    const notice = ctx.notices.status(s.user);
    page(
      req,
      res,
      { title: t("admin.title"), active: "admin", wide: true, ...(extra.flash ? { flash: extra.flash } : {}) },
      html`<div class="page-title"><h1>${t("admin.heading")}</h1><p>${t("admin.intro")}</p></div>
      ${extra.secret
        ? html`<div class="card"><h2>${extra.secret.label}</h2><p>${t("admin.secret.copyNow")}</p>
            <div class="copy"><code id="secret">${extra.secret.value}</code><button type="button" class="secondary small" data-copy="secret">${t("admin.secret.copy")}</button></div></div>`
        : ""}
      <div class="card">
        <h2>${t("admin.overview.title")}</h2>
        <dl class="kv">
          <div><dt>${t("admin.overview.mcpUrl")}</dt><dd><code>${ctx.mcpUrl.href}</code></dd></div>
          <div><dt>${t("admin.overview.publicUrl")}</dt><dd>${ctx.publicUrl.href}</dd></div>
          <div><dt>${t("admin.overview.version")}</dt><dd>${ctx.version}</dd></div>
          <div><dt>${t("admin.overview.users")}</dt><dd>${t("admin.overview.userCount", { n: users.length, padi: users.filter(padiWorks).length })}</dd></div>
          <div><dt>${t("admin.overview.requests")}</dt><dd>${requests.length ? html`<a href="#requests">${tn("admin.overview.requestsWaiting", requests.length)}</a>` : t("admin.overview.noRequests")}</dd></div>
          <div><dt>${t("admin.overview.activeConnections")}</dt><dd>${ctx.pool.size}</dd></div>
          <div><dt>${t("admin.overview.platform")}</dt><dd>${ctx.platform}</dd></div>
        </dl>
        <form method="post" action="/admin/selftest" class="actions">${csrf}<button type="submit" class="secondary">${t("admin.selfTest.button")}</button>
          <span class="muted">${t("admin.selfTest.hint")}</span></form>
        ${extra.selfTest
          ? html`<ul class="status-list">${extra.selfTest.map((row) => html`<li><span class="badge ${row.ok ? "ok" : "bad"}">${row.ok ? t("admin.selfTest.badgeOk") : t("admin.selfTest.badgeProblem")}</span> ${row.label} <span class="muted">${row.detail}</span></li>`)}</ul>`
          : ""}
      </div>

      <div class="card">
        <h2>${t("admin.settings.title")}</h2>
        <form method="post" action="/admin/settings">
          ${csrf}
          <div class="row">
            <div>
              <label for="registration">${t("admin.settings.registration.label")}</label>
              <select id="registration" name="registration">${mode("approval", t("admin.settings.registration.approval"))}${mode("invite", t("admin.settings.registration.invite"))}${mode("open", t("admin.settings.registration.open"))}${mode("closed", t("admin.settings.registration.closed"))}</select>
            </div>
            <div>
              <label for="allowedEmailDomains">${t("admin.settings.domains.label")}<span class="hint">${t("admin.settings.domains.hint")}</span></label>
              <input id="allowedEmailDomains" name="allowedEmailDomains" type="text" value="${settings.allowedEmailDomains.join(", ")}" placeholder="example.com">
            </div>
          </div>
          <div class="group">
          <label class="check"><input type="checkbox" name="forceReadOnly" ${settings.forceReadOnly ? "checked" : ""}><span>${t("admin.settings.readOnly.label")} <span class="hint">${t("admin.settings.readOnly.hint")}</span></span></label>
          </div>
          <h3>${t("admin.settings.connections")}</h3>
          <label for="allowedRedirectHosts">${t("admin.settings.redirectHosts.label")}<span class="hint">${th("admin.settings.redirectHosts.hint")}</span></label>
          <input id="allowedRedirectHosts" name="allowedRedirectHosts" type="text" value="${settings.allowedRedirectHosts.join(" ")}" placeholder="claude.ai claude.com">
          <div class="group">
          <label class="check"><input type="checkbox" name="allowDynamicRegistration" ${settings.allowDynamicRegistration ? "checked" : ""}><span>${t("admin.settings.dynamicRegistration.label")} <span class="hint">${t("admin.settings.dynamicRegistration.hint")}</span></span></label>
          <label class="check"><input type="checkbox" name="allowClientMetadataDocuments" ${settings.allowClientMetadataDocuments ? "checked" : ""}><span>${t("admin.settings.metadataDocuments.label")} <span class="hint">${t("admin.settings.metadataDocuments.hint")}</span></span></label>
          </div>
          <div class="row">
            <div><label for="accessTokenTtlMinutes">${t("admin.settings.accessTokenTtl")}</label>
              <input id="accessTokenTtlMinutes" name="accessTokenTtlMinutes" type="number" min="5" max="1440" value="${settings.accessTokenTtlMinutes}"></div>
            <div><label for="refreshTokenTtlDays">${t("admin.settings.refreshTokenTtl")}</label>
              <input id="refreshTokenTtlDays" name="refreshTokenTtlDays" type="number" min="1" max="365" value="${settings.refreshTokenTtlDays}"></div>
          </div>
          <div class="row">
            <div><label for="sessionTtlDays">${t("admin.settings.sessionTtl")}</label>
              <input id="sessionTtlDays" name="sessionTtlDays" type="number" min="1" max="90" value="${settings.sessionTtlDays}"></div>
            <div><label for="defaultTimeZone">${t("admin.settings.defaultTimeZone")}</label>
              <input id="defaultTimeZone" name="defaultTimeZone" type="text" value="${settings.defaultTimeZone}"></div>
          </div>
          <div class="actions"><button type="submit">${t("admin.settings.save")}</button></div>
        </form>
      </div>

      <div class="card" id="requests">
        <h2>${t("admin.requests.title")}</h2>
        ${requests.length
          ? html`<p class="muted">${t("admin.requests.intro")}</p>
            <p>${th("admin.requests.warning")}</p>
            <div class="table-wrap wide"><table><tr><th>${t("admin.requests.col.email")}</th><th>${t("admin.requests.col.requested")}</th><th>${t("admin.requests.col.message")}</th><th>${t("admin.requests.col.actions")}</th></tr>
              ${requests.map((u) => {
                const action = (name: string, label: string, confirm?: string, danger = false) =>
                  html`<form method="post" action="/admin/requests/action" class="inline">${csrf}<input type="hidden" name="id" value="${u.id}"><input type="hidden" name="action" value="${name}">
                    <button class="${danger ? "danger" : ""} small" ${confirm ? html`data-confirm="${confirm}"` : ""}>${label}</button></form>`;
                return html`<tr><td>${u.email}</td><td>${formatDate(u.createdAt)}</td><td>${u.requestNote ?? ""}</td>
                  <td><div class="row-actions">${action("approve", t("admin.requests.approve"))} ${action("reject", t("admin.requests.reject"), t("admin.requests.confirmReject", { email: u.email }), true)}</div></td></tr>`;
              })}</table></div>
            ${requests.length > 1
              ? html`<form method="post" action="/admin/requests/action" class="actions">${csrf}<input type="hidden" name="action" value="reject-all">
                  <button class="secondary small" data-confirm="${tn("admin.requests.confirmRejectAll", requests.length)}">${t("admin.requests.rejectAll")}</button></form>`
              : ""}`
          : html`<p class="muted">${settings.registration === "approval"
              ? t("admin.requests.none")
              : t("admin.requests.noneHowToEnable", { setting: t("admin.settings.registration.label"), value: t("admin.settings.registration.approval") })}</p>`}
        <h3>${t("admin.notices.title")}</h3>
        <form method="post" action="/admin/notices">
          ${csrf}
          <div class="group">
          <label class="check"><input type="checkbox" name="notify" ${s.user.notifyRequests ? "checked" : ""}><span>${t("admin.notices.label")} <span class="hint">${notice.address
            ? t("admin.notices.hint", { address: notice.address })
            : t("admin.notices.cannotSend", { reason: noticeProblemText(notice.problem ?? "other") })}</span></span></label>
          </div>
          ${notice.last
            ? html`<p class="fine">${notice.last.ok
                ? th("admin.notices.lastSent", { date: formatDate(notice.last.at) })
                : th("admin.notices.lastFailed", { date: formatDate(notice.last.at), reason: noticeProblemText(notice.last.problem ?? "other") })}</p>`
            : ""}
          <div class="actions"><button type="submit">${t("admin.notices.save")}</button>
            ${notice.address ? html`<button type="submit" class="secondary" formaction="/admin/notices/test">${t("admin.notices.test")}</button>` : ""}</div>
        </form>
      </div>

      <div class="card">
        <h2>${t("admin.invites.title")}</h2>
        <form method="post" action="/admin/invites" class="row">
          ${csrf}
          <div><label for="note">${t("admin.invites.note")}</label><input id="note" name="note" type="text" maxlength="200"></div>
          <div><label for="days">${t("admin.invites.days")}</label><input id="days" name="days" type="number" min="1" max="90" value="7"></div>
          <div class="actions"><button type="submit">${t("admin.invites.create")}</button></div>
        </form>
        ${invites.length
          ? html`<div class="table-wrap wide"><table><tr><th>${t("admin.invites.col.note")}</th><th>${t("admin.invites.col.created")}</th><th>${t("admin.invites.col.status")}</th><th></th></tr>
              ${invites.map((i) => {
                const status = i.usedBy
                  ? html`<span class="badge">${t("admin.invites.usedBy", { email: i.usedBy })}</span>`
                  : i.expiresAt < Date.now()
                    ? html`<span class="badge bad">${t("admin.invites.expired")}</span>`
                    : html`<span class="badge ok">${th("admin.invites.validUntil", { date: formatDate(i.expiresAt) })}</span>`;
                return html`<tr><td>${i.note}</td><td>${formatDate(i.createdAt)}</td><td>${status}</td>
                  <td><form method="post" action="/admin/invites/delete" class="inline">${csrf}<input type="hidden" name="code" value="${i.codeHash}"><button class="secondary small">${t("admin.invites.delete")}</button></form></td></tr>`;
              })}</table></div>`
          : html`<p class="muted">${t("admin.invites.none")}</p>`}
      </div>

      <div class="card" id="demo">
        <h2>${t("admin.demo.title")}</h2>
        <p class="muted">${t("admin.demo.intro")}</p>
        <form method="post" action="/admin/demo" class="row">
          ${csrf}
          <div><label for="demoEmail">${t("admin.demo.email")}<span class="hint">${t("admin.demo.emailHint")}</span></label>
            <input id="demoEmail" name="email" type="email" maxlength="320" required placeholder="reviewer@example.com"></div>
          <div class="actions"><button type="submit">${t("admin.demo.create")}</button></div>
        </form>
        ${demoUsers.length
          ? html`<div class="table-wrap wide"><table><tr><th>${t("admin.demo.col.email")}</th><th>${t("admin.demo.col.lastSignIn")}</th><th>${t("admin.demo.col.toolCalls")}</th><th>${t("admin.demo.col.data")}</th><th>${t("admin.demo.col.actions")}</th></tr>
              ${demoUsers.map((u) => {
                const account = ctx.demo.peek(u.id);
                return html`<tr><td>${u.email}${u.disabled ? html` <span class="badge bad">${t("admin.users.disabled")}</span>` : ""}</td>
                  <td>${formatDate(u.lastLoginAt)}</td><td>${activity.get(u.id) ?? 0}</td>
                  <td>${account ? formatDate(account.resetAt.getTime()) : html`<span class="muted">${t("admin.demo.dataOnFirstUse")}</span>`}</td>
                  <td><form method="post" action="/admin/demo/reset" class="inline">${csrf}<input type="hidden" name="id" value="${u.id}">
                    <button class="secondary small" data-confirm="${t("admin.demo.confirmReset", { email: u.email })}">${t("admin.demo.reset")}</button></form></td></tr>`;
              })}</table></div>`
          : html`<p class="muted">${t("admin.demo.none")}</p>`}
        <p class="muted">${th("admin.demo.nextReset", { date: formatDate(ctx.demo.nextReset().getTime()) })}</p>
      </div>

      <div class="card">
        <h2>${t("admin.users.title")}</h2>
        <div class="table-wrap wide"><table>
          <tr><th>${t("admin.users.col.email")}</th><th>${t("admin.users.col.status")}</th><th>${t("admin.users.col.padi")}</th><th>${t("admin.users.col.lastSignIn")}</th><th>${t("admin.users.col.toolCalls")}</th><th>${t("admin.users.col.actions")}</th></tr>
          ${users.map((u) => {
            const self = u.id === s.user.id;
            const action = (name: string, label: string, confirm?: string, danger = false) =>
              html`<form method="post" action="/admin/users/action" class="inline">${csrf}<input type="hidden" name="id" value="${u.id}"><input type="hidden" name="action" value="${name}">
                <button class="${danger ? "danger" : "secondary"} small" ${confirm ? html`data-confirm="${confirm}"` : ""}>${label}</button></form>`;
            return html`<tr>
              <td>${u.email}${self ? html` <span class="badge">${t("admin.users.you")}</span>` : ""}</td>
              <td>${u.isAdmin ? html`<span class="badge ok">${t("admin.users.admin")}</span> ` : ""}${u.demo ? html`<span class="badge warn">${t("admin.users.demo")}</span> ` : ""}${u.disabled ? html`<span class="badge bad">${t("admin.users.disabled")}</span>` : ""}</td>
              <td>${u.demo
                ? html`<span class="badge">${t("admin.users.padiDemo")}</span>`
                : u.padiNeedsReconnect || unreadable.has(u.id)
                  ? html`<span class="badge bad">${t("admin.users.padiReconnect")}</span>`
                  : u.hasPadi
                    ? html`<span class="badge ok">${t("admin.users.padiConnected")}</span>`
                    : html`<span class="badge warn">${t("admin.users.padiMissing")}</span>`}</td>
              <td>${formatDate(u.lastLoginAt)}</td>
              <td>${activity.get(u.id) ?? 0}</td>
              <td>${self
                ? html`<span class="muted">-</span>`
                : html`<div class="row-actions">${u.demo ? "" : u.isAdmin ? action("demote", t("admin.users.removeAdmin")) : action("promote", t("admin.users.makeAdmin"))}
                  ${u.isAdmin
                    ? ""
                    : u.demo
                      ? action("demo-off", t("admin.users.makeNormal"), t("admin.users.confirmMakeNormal", { email: u.email }))
                      : action("demo-on", t("admin.users.makeDemo"), t("admin.users.confirmMakeDemo", { email: u.email }))}
                  ${u.disabled ? action("enable", t("admin.users.enable")) : action("disable", t("admin.users.disable"), t("admin.users.confirmDisable"))}
                  ${action("reset", t("admin.users.resetPassword"), t("admin.users.confirmResetPassword"))}
                  ${action("delete", t("admin.users.delete"), t("admin.users.confirmDelete", { email: u.email }), true)}</div>`}</td>
            </tr>`;
          })}
        </table></div>
      </div>

      <div class="card">
        <h2>${t("admin.clients.title")}</h2>
        ${clientCount > clients.length ? html`<p class="muted">${t("admin.clients.showing", { shown: clients.length, total: clientCount })}</p>` : ""}
        ${clients.length
          ? html`<div class="table-wrap wide"><table><tr><th>${t("admin.clients.col.client")}</th><th>${t("admin.clients.col.type")}</th><th>${t("admin.clients.col.redirects")}</th><th>${t("admin.clients.col.activeConnections")}</th><th>${t("admin.clients.col.registered")}</th><th></th></tr>
              ${clients.map(
                (c) => html`<tr><td>${c.name}</td><td>${c.kind === "cimd" ? t("admin.clients.kind.cimd") : t("admin.clients.kind.registered")}</td>
                  <td>${[...new Set(c.redirectUris.map((u) => { try { return new URL(u).host || u; } catch { return u; } }))].join(", ")}</td>
                  <td>${c.activeGrants}</td><td>${formatDate(c.createdAt)}</td>
                  <td><form method="post" action="/admin/clients/delete" class="inline">${csrf}<input type="hidden" name="clientId" value="${c.clientId}">
                    <button class="secondary small" data-confirm="${t("admin.clients.confirmRemove")}">${t("admin.clients.remove")}</button></form></td></tr>`,
              )}</table></div>`
          : html`<p class="muted">${t("admin.clients.none")}</p>`}
      </div>`,
      status,
    );
  };

  r.get("/admin", (req, res) => render(req, res));

  r.post("/admin/settings", form, async (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return render(req, res, { flash: { kind: "error", text: t("admin.error.formExpired") } }, 400);
    const b = req.body as Record<string, unknown>;
    const current = ctx.store.getSettings();
    const registration = (["open", "approval", "invite", "closed"] as const).find((m) => m === b.registration) ?? current.registration;
    const tz = str(b.defaultTimeZone, 100).trim() || "UTC";
    if (!isValidTimeZone(tz)) return render(req, res, { flash: { kind: "error", text: t("admin.error.unknownTimeZone", { tz }) } }, 400);
    const next: ServerSettings = {
      ...current,
      registration,
      allowedEmailDomains: list(str(b.allowedEmailDomains)),
      forceReadOnly: bool(b.forceReadOnly),
      allowedRedirectHosts: list(str(b.allowedRedirectHosts)),
      allowDynamicRegistration: bool(b.allowDynamicRegistration),
      allowClientMetadataDocuments: bool(b.allowClientMetadataDocuments),
      defaultTimeZone: tz,
      accessTokenTtlMinutes: clampInt(b.accessTokenTtlMinutes, 5, 1440, current.accessTokenTtlMinutes),
      refreshTokenTtlDays: clampInt(b.refreshTokenTtlDays, 1, 365, current.refreshTokenTtlDays),
      sessionTtlDays: clampInt(b.sessionTtlDays, 1, 90, current.sessionTtlDays),
    };
    ctx.store.saveSettings(next);
    ctx.log("Server settings changed by an administrator");
    res.redirect(303, "/admin?m=settings");
  });

  r.post("/admin/selftest", perUserLimit(10), form, async (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return render(req, res, { flash: { kind: "error", text: t("admin.error.formExpired") } }, 400);
    render(req, res, { selfTest: await selfTest(ctx) });
  });

  r.post("/admin/invites", form, (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return render(req, res, { flash: { kind: "error", text: t("admin.error.formExpired") } }, 400);
    const s = locals(res).session!;
    const code = ctx.store.createInvite(s.user.id, str(req.body.note, 200), clampInt(req.body.days, 1, 90, 7));
    render(req, res, { secret: { label: t("admin.secret.inviteCode"), value: code } });
  });

  r.post("/admin/invites/delete", form, (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/admin?m=csrf");
    ctx.store.deleteInvite(str(req.body.code, 200));
    res.redirect(303, "/admin?m=deleted");
  });

  r.post("/admin/users/action", form, async (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/admin?m=csrf");
    const s = locals(res).session!;
    const id = str(req.body.id, 100);
    const user = ctx.store.getUser(id);
    if (!user || id === s.user.id) return void res.redirect(303, "/admin");
    const lastAdmin = user.isAdmin && ctx.store.countAdmins() <= 1;
    switch (req.body.action) {
      case "promote":
        // A demo account (shared with app reviewers) never becomes an administrator.
        if (user.demo) return void res.redirect(303, "/admin");
        ctx.store.setAdmin(id, true);
        break;
      case "demote":
        if (lastAdmin) return void res.redirect(303, "/admin?m=lastadmin");
        ctx.store.setAdmin(id, false);
        break;
      case "disable":
        if (lastAdmin) return void res.redirect(303, "/admin?m=lastadmin");
        ctx.store.setDisabled(id, true);
        await ctx.pool.invalidate(id);
        break;
      case "enable":
        ctx.store.setDisabled(id, false);
        break;
      case "reset": {
        const temp = randomToken("", 12);
        ctx.store.setPassword(id, await hashPassword(temp));
        // A reset usually means the account may be in the wrong hands: sign out everywhere.
        ctx.store.deleteUserSessions(id);
        ctx.store.revokeUserTokens(id);
        render(req, res, { secret: { label: t("admin.secret.tempPassword", { email: user.email }), value: temp } });
        return;
      }
      case "delete":
        if (lastAdmin) return void res.redirect(303, "/admin?m=lastadmin");
        // Delete first (tokens go with it), then close the connection, so no request can
        // re-create it in between.
        ctx.store.deleteUser(id);
        ctx.demo.forget(id);
        await ctx.pool.invalidate(id);
        break;
      case "demo-on":
        // Deletes the user's PADI connection: from now on their apps see the sample data.
        if (!ctx.store.setDemo(id, true)) return void res.redirect(303, "/admin");
        // Forget the stores before the await below, so a request in between builds on new ones.
        ctx.demo.forget(id);
        await ctx.pool.invalidate(id);
        break;
      case "demo-off":
        if (!ctx.store.setDemo(id, false)) return void res.redirect(303, "/admin");
        ctx.demo.forget(id);
        await ctx.pool.invalidate(id);
        break;
      default:
        return void res.redirect(303, "/admin");
    }
    ctx.log(`Administrator action "${String(req.body.action)}" on a user`);
    res.redirect(303, "/admin?m=user");
  });

  r.post("/admin/demo", form, async (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return render(req, res, { flash: { kind: "error", text: t("admin.error.formExpired") } }, 400);
    const email = str(req.body.email, 320).trim().toLowerCase();
    if (!isEmail(email)) return render(req, res, { flash: { kind: "error", text: t("auth.error.invalidEmail") } }, 400);
    if (ctx.store.getUserByEmail(email)) return render(req, res, { flash: { kind: "error", text: t("admin.demo.error.exists") } }, 400);
    const password = readablePassword();
    const user = ctx.store.createDemoUser(email, await hashPassword(password));
    ctx.log("Demo account created by an administrator");
    render(req, res, { secret: { label: t("admin.secret.demoPassword", { email: user.email }), value: password } });
  });

  r.post("/admin/demo/reset", form, async (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/admin?m=csrf");
    const user = ctx.store.getUser(str(req.body.id, 100));
    if (!user?.demo) return void res.redirect(303, "/admin#demo");
    ctx.demo.reset(user.id);
    await ctx.pool.invalidate(user.id);
    ctx.log("Demo data of a demo account reset by an administrator");
    res.redirect(303, "/admin?m=demoreset#demo");
  });

  r.post("/admin/requests/action", form, (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/admin?m=csrf");
    const id = str(req.body.id, 100);
    if (req.body.action === "approve" && ctx.store.approveAccessRequest(id)) {
      ctx.log("Access request approved by an administrator");
      return void res.redirect(303, "/admin?m=approved#requests");
    }
    if (req.body.action === "reject" && ctx.store.rejectAccessRequest(id)) {
      ctx.log("Access request rejected by an administrator");
      return void res.redirect(303, "/admin?m=rejected#requests");
    }
    if (req.body.action === "reject-all") {
      ctx.log(`${ctx.store.rejectAllAccessRequests()} access requests rejected by an administrator`);
      return void res.redirect(303, "/admin?m=rejected#requests");
    }
    res.redirect(303, "/admin#requests");
  });

  r.post("/admin/notices", form, (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/admin?m=csrf");
    const s = locals(res).session!;
    const on = bool(req.body.notify);
    ctx.store.setNotifyRequests(s.user.id, on);
    ctx.store.setLang(s.user.id, locale());
    ctx.log(`An administrator turned ${on ? "on" : "off"} e-mails about access requests`);
    res.redirect(303, "/admin?m=saved#requests");
  });

  // Sends a real e-mail through the operator's SMTP server: a few per quarter of an hour.
  r.post("/admin/notices/test", perUserLimit(5), form, async (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return render(req, res, { flash: { kind: "error", text: t("admin.error.formExpired") } }, 400);
    const s = locals(res).session!;
    const result = await ctx.notices.sendTest(s.user, locale());
    render(req, res, {
      flash: result.ok
        ? { kind: "ok", text: t("admin.notices.testSent", { address: result.address }) }
        : { kind: "error", text: t("admin.notices.testFailed", { reason: noticeProblemText(result.problem) }) },
    });
  });

  r.post("/admin/clients/delete", form, (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/admin?m=csrf");
    ctx.store.deleteClient(str(req.body.clientId, 2000));
    res.redirect(303, "/admin?m=deleted");
  });

  return r;
}
