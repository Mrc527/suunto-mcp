/**
 * Account pages: the PADI connection, connected apps, activity and security.
 *
 * "Save and test" signs in to PADI with the e-mail and password from the form, reads the dive
 * count once with the fresh token, and saves the connection only when the sign-in worked. The
 * password is used for that one sign-in and never stored: only the refresh token is kept
 * (encrypted, see store.ts).
 */

import express, { type Request, type Response, type Router } from "express";
import { DEMO_ADDRESS, DEMO_NAME, DEMO_TIME_ZONE } from "../demo/index.js";
import type { BackendCheck, UnitChoice } from "../logbook/types.js";
import { PadiApi, type ApiMode } from "../padi/api.js";
import { PadiAuthError, signIn, type PadiAuthErrorCode } from "../padi/auth.js";
import { endpointsFromEnv } from "../padi/endpoints.js";
import { PadiSession } from "../padi/session.js";
import { isValidTimeZone } from "../util/dates.js";
import { describeError, UserFacingError } from "../util/errors.js";
import { connectCard } from "./connect.js";
import { bool, page, returnTo, str, type WebContext } from "./context.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { isEmail } from "./email.js";
import { avatar, formatDate, html, type SafeHtml } from "./html.js";
import { t, th, type MessageKey } from "./i18n/index.js";
import { serviceIcon, type Service } from "./icons.js";
import { passwordProblem } from "./routes-auth.js";
import { csrfOk, locals, perUserLimit, requireUser, setCookie } from "./session.js";
import type { PadiAccountSettings, User } from "./store.js";

/** Where people with a Google, Apple or Facebook sign-in set a PADI password. */
const PADI_ACCOUNT_URL = "https://account.padi.com";

const UNIT_CHOICES: readonly UnitChoice[] = ["auto", "metric", "imperial"];
const UNIT_LABELS: Record<UnitChoice, MessageKey> = {
  auto: "account.padi.units.auto",
  metric: "account.padi.units.metric",
  imperial: "account.padi.units.imperial",
};

const API_MODES: readonly ApiMode[] = ["proxy", "direct", "auto"];

function unitChoice(value: unknown): UnitChoice | undefined {
  return UNIT_CHOICES.find((u) => u === value);
}

let timeZones: string[] | undefined;
/** Every time zone the server knows, "UTC" first. */
function allTimeZones(): string[] {
  // Intl's list leaves out "UTC" itself; without it the form would show the first zone instead.
  timeZones ??= ["UTC", ...Intl.supportedValuesOf("timeZone").filter((tz) => tz !== "UTC")];
  return timeZones;
}

/** Why a PADI sign-in failed, by the PADI client's error code. */
const SIGN_IN_ERRORS: Record<Exclude<PadiAuthErrorCode, "unknown">, MessageKey> = {
  bad_credentials: "account.error.padi.badCredentials",
  challenge: "account.error.padi.challenge",
  expired: "account.error.padi.expired",
  not_confirmed: "account.error.padi.notConfirmed",
  password_reset: "account.error.padi.passwordReset",
  network: "account.error.padi.network",
};

/**
 * Why "Save and test" could not sign in to PADI, in the page's language. The PADI client's own
 * texts are English and end with an internal code ("[bad_credentials]"), so they are only used
 * as the detail of an unexpected answer.
 */
export function signInError(error: unknown): string {
  return t("account.error.signIn", { error: signInReason(error) });
}

function signInReason(error: unknown): string {
  if (!(error instanceof PadiAuthError)) return error instanceof UserFacingError ? error.message : describeError(error);
  // PADI also refuses a blocked or a disabled account as "wrong e-mail or password".
  if (error.refusal === "locked") return t("account.error.padi.locked");
  if (error.refusal === "disabled") return t("account.error.padi.disabled");
  if (error.code === "unknown") return t("account.error.padi.unknown", { detail: error.message });
  return t(SIGN_IN_ERRORS[error.code]);
}

/** How long a dive count read for the account page is reused. */
const CHECK_CACHE_MS = 5 * 60_000;
/** The account page waits this long for the dive count. */
const PAGE_CHECK_TIMEOUT_MS = 5_000;
/** "Save and test" waits this long for the dive count after the sign-in. */
const SAVE_CHECK_TIMEOUT_MS = 15_000;

/** A dive count read for the page, or why there is none. */
type DiveCount = BackendCheck | { ok: false; timeout: true };

/** Values typed into the sign-in form, shown again after an error (never the password). */
interface SignInValues {
  email: string;
  units: UnitChoice;
  readOnly: boolean;
  timeZone: string;
}

/** `promise`, or `onTimeout` when it takes longer than `ms`. */
async function within<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((resolve) => (timer = setTimeout(() => resolve(onTimeout), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

export function accountRoutes(ctx: WebContext): Router {
  const r = express.Router();
  const form = express.urlencoded({ extended: false, limit: "64kb" });
  r.use("/account", requireUser);
  const sensitive = perUserLimit(20);

  /**
   * Dive counts per user, for the account page. The key holds the time the connection was saved,
   * so a new sign-in never shows the count of the previous one.
   */
  const counts = new Map<string, { key: string; at: number; result: DiveCount }>();
  const countKey = (user: User) => `${user.id}:${user.serviceUpdatedAt ?? 0}`;
  const remember = (user: User, result: DiveCount) => {
    const cutoff = Date.now() - CHECK_CACHE_MS;
    for (const [id, entry] of counts) if (entry.at < cutoff) counts.delete(id);
    counts.set(user.id, { key: countKey(user), at: Date.now(), result });
  };

  /** The dive count of a connected account (cached for a few minutes; waits at most 5 s). */
  const diveCount = async (user: User): Promise<DiveCount | undefined> => {
    const cached = counts.get(user.id);
    if (cached && cached.key === countKey(user) && cached.at > Date.now() - CHECK_CACHE_MS) return cached.result;
    let logbook;
    try {
      logbook = ctx.pool.get(user)?.services.logbook;
    } catch {
      return undefined;
    }
    if (!logbook) return undefined;
    const result = await within<DiveCount>(
      logbook.check().catch((error: unknown) => ({ ok: false, error: describeError(error) })),
      PAGE_CHECK_TIMEOUT_MS,
      { ok: false, timeout: true },
    );
    // A timeout is not kept: the next visit tries again.
    if (!("timeout" in result)) remember(user, result);
    return result;
  };

  const readOnlyBox = (checked: boolean, enforced: boolean) =>
    html`<label class="check"><input type="checkbox" name="readOnly" ${checked || enforced ? "checked" : ""} ${enforced ? "disabled" : ""}>
      <span>${t("account.padi.readOnly")} <span class="hint">${enforced ? t("account.padi.readOnlyEnforced") : t("account.padi.readOnlyHint")}</span></span></label>`;

  const unitsField = (id: string, units: UnitChoice) =>
    html`<label for="${id}">${t("account.padi.units")}<span class="hint">${t("account.padi.unitsHint")}</span></label>
      <select id="${id}" name="units">${UNIT_CHOICES.map((u) => html`<option value="${u}" ${u === units ? "selected" : ""}>${t(UNIT_LABELS[u])}</option>`)}</select>`;

  /** The time zone; with `browser`, the page selects the browser's own zone when it is known. */
  const timeZoneField = (id: string, timeZone: string, browser = false) => {
    const list = allTimeZones();
    const options = list.includes(timeZone) ? list : [timeZone, ...list];
    return html`<label for="${id}">${t("account.padi.timeZone")}<span class="hint">${t("account.padi.timeZoneHint")}</span></label>
      <select id="${id}" name="timeZone"${browser ? html` data-browser-tz` : ""}>${options.map((tz) => html`<option value="${tz}" ${tz === timeZone ? "selected" : ""}>${tz}</option>`)}</select>`;
  };

  const tile = (service: Service, name: MessageKey, text: MessageKey, state: SafeHtml) =>
    html`<div class="tile"><div class="tile-head">${serviceIcon(service, "lg")}<strong>${t(name)}</strong></div><p>${t(text)}</p>${state}</div>`;

  const profile = (email: string, line: string) =>
    html`<section class="profile">
      ${avatar(email, "xl")}
      <div>
        <h1>${email.split("@")[0]}<wbr>@${email.split("@").slice(1).join("@")}</h1>
        <p>${line}</p>
      </div>
    </section>`;

  /**
   * A demo account's page: no PADI form (there is no PADI account behind it), a notice that the
   * logbook is sample data, and the read-only switch. Nothing on this page reaches PADI.
   */
  const renderDemoAccount = (req: Request, res: Response, opts: { status?: number; flash?: { kind: "ok" | "error"; text: string } } = {}) => {
    const s = locals(res).session!;
    const server = ctx.store.getSettings();
    const readOnly = server.forceReadOnly || s.user.demoReadOnly === true;
    const on = html`<span class="badge ok">${t("account.state.on")}</span>`;
    const demoCard = html`<div class="card" id="demo">
        <h2>${t("account.demo.heading")} <span class="badge warn">${t("account.demo.badge")}</span></h2>
        <p>${t("account.demo.intro")}</p>
        <p>${t("account.demo.memory")}</p>
        <p>${t("account.demo.nothingSent")}</p>
        <p class="muted">${t("account.demo.identity", { identity: `${DEMO_NAME} <${DEMO_ADDRESS}>`, timeZone: DEMO_TIME_ZONE })}
          ${th("account.demo.nextReset", { date: formatDate(ctx.demo.nextReset().getTime()) })}</p>
        <form method="post" action="/account/demo">
          <input type="hidden" name="_csrf" value="${s.csrf}">
          <h3>${t("account.demo.settingsHeading")}</h3>
          <div class="group">${readOnlyBox(s.user.demoReadOnly === true, server.forceReadOnly)}</div>
          <div class="actions"><button type="submit">${t("account.padi.save")}</button></div>
        </form>
      </div>`;
    page(
      req,
      res,
      { title: t("account.title"), active: "account", ...(opts.flash ? { flash: opts.flash } : {}) },
      html`${profile(s.user.email, readOnly ? t("account.profile.demoReadOnly") : t("account.profile.demo"))}
      <div class="tiles">
        ${tile("logbook", "account.service.logbook", readOnly ? "account.tile.logbookReadOnly" : "account.tile.logbook", readOnly ? html`<span class="badge ok">${t("account.state.onReadOnly")}</span>` : on)}
        ${tile("cards", "account.service.cards", "account.tile.cards", on)}
      </div>
      ${connectCard({ mcpUrl: ctx.mcpUrl.href, email: s.user.email })}${demoCard}`,
      opts.status ?? 200,
    );
  };

  /**
   * The fields of a PADI sign-in, and the "Save and test" button. `browserTimeZone`: nothing was
   * chosen yet, so the page may select the browser's time zone. The fields hold the PADI.com
   * sign-in, not this site's: autocomplete="off" keeps password managers from filing them (or
   * filling them in) as the login of this site.
   */
  const signInFields = (values: SignInValues, withSettings: boolean, enforced: boolean, browserTimeZone = false) =>
    html`<div class="row">
        <div>
          <label for="email">${t("account.padi.email")}</label>
          <input id="email" name="email" type="email" required autocomplete="off" value="${values.email}" placeholder="you@example.com">
        </div>
        <div>
          <label for="password">${t("account.padi.password")}<span class="hint">${t("account.padi.passwordHint")}</span></label>
          <input id="password" name="password" type="password" required autocomplete="off">
        </div>
      </div>
      ${withSettings
        ? html`<div class="row"><div>${unitsField("units", values.units)}</div><div>${timeZoneField("timeZone", values.timeZone, browserTimeZone)}</div></div>
            <div class="group">${readOnlyBox(values.readOnly, enforced)}</div>`
        : html`<input type="hidden" name="keep" value="settings">`}
      <div class="actions"><button type="submit">${t("account.padi.saveAndTest")}</button></div>`;

  const renderAccount = async (
    req: Request,
    res: Response,
    opts: { values?: SignInValues; error?: string; status?: number; flash?: { kind: "ok" | "error"; text: string } } = {},
  ) => {
    const s = locals(res).session!;
    if (s.user.demo) {
      const flash = opts.error ? { kind: "error" as const, text: opts.error } : opts.flash;
      return renderDemoAccount(req, res, { ...(opts.status ? { status: opts.status } : {}), ...(flash ? { flash } : {}) });
    }
    const server = ctx.store.getSettings();
    const read = ctx.store.readPadiSettings(s.user.id);
    const stored = read.settings;
    // Reading the dive count may find that the sign-in expired (the pool marks it): read the user again.
    const count = stored && !s.user.padiNeedsReconnect ? await diveCount(s.user) : undefined;
    const expired = !!stored && (ctx.store.getUser(s.user.id)?.padiNeedsReconnect ?? s.user.padiNeedsReconnect);
    const readOnly = server.forceReadOnly || stored?.readOnly === true;
    const csrf = html`<input type="hidden" name="_csrf" value="${s.csrf}">${returnTo(req) ? html`<input type="hidden" name="next" value="${returnTo(req)}">` : ""}`;
    const values: SignInValues = opts.values ?? {
      email: stored?.email ?? "",
      units: stored?.units ?? "auto",
      readOnly: stored?.readOnly ?? false,
      timeZone: stored?.timeZone || server.defaultTimeZone,
    };

    const logbookState = !stored
      ? html`<span class="badge warn">${t("account.state.notConnected")}</span>`
      : expired
        ? html`<span class="badge bad">${t("account.state.signInAgain")}</span>`
        : html`<span class="badge ok">${readOnly ? t("account.state.onReadOnly") : t("account.state.on")}</span>`;
    const cardsState = !stored
      ? html`<span class="badge warn">${t("account.state.notConnected")}</span>`
      : expired
        ? html`<span class="badge bad">${t("account.state.signInAgain")}</span>`
        : html`<span class="badge ok">${t("account.state.on")}</span>`;

    const badge = !stored
      ? html`<span class="badge warn">${t("account.padi.badgeNotConnected")}</span>`
      : expired
        ? html`<span class="badge bad">${t("account.padi.badgeExpired")}</span>`
        : html`<span class="badge ok">${t("account.padi.badgeConnected")}</span>`;
    const help = html`<p class="muted">${t("account.padi.intro")}</p><p class="muted">${th("account.padi.social", { url: PADI_ACCOUNT_URL })}</p>`;

    // The dive count, or why it is not known. The error text comes from the PADI client as it is.
    const dives = (c: DiveCount | undefined): SafeHtml | string => {
      if (!c) return html`<span class="muted">${t("account.padi.divesUnknown")}</span>`;
      if (c.ok && typeof c.dives === "number") return String(c.dives);
      const why = "timeout" in c ? t("account.padi.divesTimeout") : (c.error ?? "");
      return html`<span class="badge bad">${t("account.padi.divesUnknown")}</span>${why ? html` <span class="muted">${why}</span>` : ""}`;
    };

    const padiCard = stored
      ? html`<div class="card" id="padi">
          <h2>${t("account.padi.heading")} ${badge}</h2>
          ${expired ? html`<div class="flash error">${t("account.padi.expired")}</div>` : ""}
          <dl class="kv">
            ${stored.name ? html`<div><dt>${t("account.padi.diver")}</dt><dd>${stored.name}</dd></div>` : ""}
            <div><dt>${t("account.padi.email")}</dt><dd>${stored.email}</dd></div>
            <div><dt>${t("account.padi.affiliateId")}</dt><dd>${stored.affiliateId}</dd></div>
            ${expired ? "" : html`<div><dt>${t("account.padi.dives")}</dt><dd>${dives(count)}</dd></div>`}
            <div><dt>${t("account.padi.connectedAt")}</dt><dd>${formatDate(stored.connectedAt)}</dd></div>
          </dl>
          ${expired
            ? html`<h3>${t("account.padi.reconnect")}</h3>${help}
                <form method="post" action="/account/padi" autocomplete="off">${csrf}${signInFields(values, false, server.forceReadOnly)}</form>`
            : ""}
          <h3>${t("account.padi.settingsHeading")}</h3>
          <form method="post" action="/account/padi/settings">
            ${csrf}
            <div class="row"><div>${unitsField("units-saved", stored.units)}</div><div>${timeZoneField("timeZone-saved", stored.timeZone || server.defaultTimeZone)}</div></div>
            <div class="group">${readOnlyBox(stored.readOnly, server.forceReadOnly)}</div>
            <div class="actions"><button type="submit">${t("account.padi.save")}</button></div>
          </form>
          ${expired
            ? ""
            : html`<details id="reconnect"${opts.values ? html` open` : ""}>
                <summary>${t("account.padi.reconnect")}</summary>
                <p class="muted">${t("account.padi.reconnectHint")}</p>
                <p class="muted">${th("account.padi.social", { url: PADI_ACCOUNT_URL })}</p>
                <form method="post" action="/account/padi" autocomplete="off">${csrf}${signInFields(values, false, server.forceReadOnly)}</form>
              </details>`}
          <form method="post" action="/account/padi/remove" class="actions">
            <input type="hidden" name="_csrf" value="${s.csrf}">
            <button type="submit" class="secondary" data-confirm="${t("account.padi.removeConfirm")}">${t("account.padi.remove")}</button>
          </form>
        </div>`
      : html`<div class="card" id="padi">
          <h2>${t("account.padi.heading")} ${badge}</h2>
          ${read.unreadable ? html`<div class="flash error">${t("account.padi.unreadable")}</div>` : ""}
          ${help}
          <form method="post" action="/account/padi" autocomplete="off">${csrf}${signInFields(values, true, server.forceReadOnly, !opts.values)}</form>
        </div>`;

    const line = !stored
      ? t("account.profile.getStarted")
      : expired
        ? t("account.profile.reconnect")
        : readOnly
          ? t("account.profile.connectedReadOnly")
          : t("account.profile.connected");
    page(
      req,
      res,
      { title: t("account.title"), active: "account", ...(opts.error ? { flash: { kind: "error", text: opts.error } } : opts.flash ? { flash: opts.flash } : {}) },
      html`${profile(s.user.email, line)}
      <div class="tiles">
        ${tile("logbook", "account.service.logbook", readOnly ? "account.tile.logbookReadOnly" : "account.tile.logbook", logbookState)}
        ${tile("cards", "account.service.cards", "account.tile.cards", cardsState)}
      </div>
      ${stored && !expired ? html`${connectCard({ mcpUrl: ctx.mcpUrl.href, email: s.user.email })}${padiCard}` : html`${padiCard}${connectCard({ mcpUrl: ctx.mcpUrl.href, email: s.user.email })}`}`,
      opts.status ?? 200,
    );
  };

  r.get("/account", (req, res) => renderAccount(req, res));

  /**
   * "Save and test": sign in to PADI, read the dive count once, save the connection. From the
   * reconnect form (keep=settings) the saved units and read-only switch stay as they are.
   */
  r.post("/account/padi", sensitive, form, async (req, res) => {
    const s = locals(res).session!;
    const server = ctx.store.getSettings();
    const existing = ctx.store.getPadiSettings(s.user.id);
    const keep = req.body.keep === "settings" && !!existing;
    const values: SignInValues = {
      email: str(req.body.email, 320).trim().toLowerCase(),
      units: keep ? existing.units : (unitChoice(req.body.units) ?? existing?.units ?? "auto"),
      // While the administrator enforces read-only, the (disabled) box is not sent: keep the user's choice.
      readOnly: keep || server.forceReadOnly ? (existing?.readOnly ?? false) : bool(req.body.readOnly),
      timeZone: (keep ? existing.timeZone : str(req.body.timeZone, 100).trim() || existing?.timeZone) || server.defaultTimeZone,
    };
    if (!csrfOk(req, res, ctx.cookies)) return renderAccount(req, res, { values, error: t("account.error.formExpired"), status: 400 });
    // A demo account never gets a PADI connection (and never signs in to PADI).
    if (s.user.demo) return renderAccount(req, res, { error: t("account.demo.noPadi"), status: 403 });
    const password = str(req.body.password, 500);
    if (!values.email || !password) return renderAccount(req, res, { values, error: t("account.error.missing"), status: 400 });
    if (!isEmail(values.email)) return renderAccount(req, res, { values, error: t("account.error.email"), status: 400 });
    if (!isValidTimeZone(values.timeZone)) return renderAccount(req, res, { values, error: t("account.error.timeZone"), status: 400 });

    // The operator's PADI endpoints and API mode, as every user's services get them.
    let endpoints;
    try {
      endpoints = endpointsFromEnv(ctx.operator);
    } catch (error) {
      return renderAccount(req, res, { values, error: describeError(error), status: 400 });
    }
    const apiMode = API_MODES.find((m) => m === ctx.operator.PADI_API_MODE) ?? "proxy";
    const fetchOpt = ctx.padiFetch ? { fetch: ctx.padiFetch } : {};

    let result;
    try {
      result = await signIn(values.email, password, { method: "auto", endpoints, ...fetchOpt });
    } catch (error) {
      ctx.log("PADI sign-in on the account page failed");
      return renderAccount(req, res, { values, error: signInError(error), status: 400 });
    }

    const settings: PadiAccountSettings = {
      email: values.email,
      refreshToken: result.tokens.refreshToken,
      loginMethod: result.tokens.loginMethod,
      clientId: result.tokens.clientId,
      affiliateId: result.claims.affiliateId,
      ...(result.claims.name ? { name: result.claims.name } : {}),
      units: values.units,
      readOnly: values.readOnly,
      timeZone: values.timeZone,
      connectedAt: Date.now(),
    };
    ctx.store.savePadiSettings(s.user.id, settings);
    await ctx.pool.invalidate(s.user.id);
    ctx.log("PADI connection saved for a user");

    // The quick check: count the dives with the token from the sign-in (no second sign-in).
    const issued = { ...endpoints, clientId: result.tokens.clientId };
    const session = new PadiSession({ tokens: result.tokens, method: result.tokens.loginMethod, endpoints: issued, ...fetchOpt });
    const api = new PadiApi({ session, endpoints: issued, apiMode, ...fetchOpt, log: ctx.log });
    const check = await within<DiveCount>(
      api.check().catch((error: unknown) => ({ ok: false, error: describeError(error) })),
      SAVE_CHECK_TIMEOUT_MS,
      { ok: false, timeout: true },
    );
    await api.close();
    // A timeout is not kept (like on the page): the next page tries again, as it says.
    const user = ctx.store.getUser(s.user.id);
    if (user && !("timeout" in check)) remember(user, check);
    res.redirect(303, returnTo(req) ?? (check.ok ? "/account?m=connected" : "/account?m=logbookfailed"));
  });

  /** Units, read-only switch and time zone of a saved connection (no sign-in). */
  r.post("/account/padi/settings", form, async (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/account?m=csrf");
    const existing = ctx.store.getPadiSettings(s.user.id);
    if (s.user.demo || !existing) return void res.redirect(303, "/account");
    const server = ctx.store.getSettings();
    // A form without the field keeps the saved zone.
    const timeZone = str(req.body.timeZone, 100).trim() || undefined;
    if (timeZone && !isValidTimeZone(timeZone)) return renderAccount(req, res, { error: t("account.error.timeZone"), status: 400 });
    ctx.store.savePadiPreferences(s.user.id, {
      units: unitChoice(req.body.units) ?? existing.units,
      readOnly: server.forceReadOnly ? existing.readOnly : bool(req.body.readOnly),
      ...(timeZone ? { timeZone } : {}),
    });
    await ctx.pool.invalidate(s.user.id);
    res.redirect(303, returnTo(req) ?? "/account?m=saved");
  });

  /** A demo account's read-only switch. */
  r.post("/account/demo", form, async (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/account?m=csrf");
    if (!s.user.demo) return void res.redirect(303, "/account");
    // While the administrator enforces read-only, the (disabled) box is not sent: keep the user's choice.
    if (!ctx.store.getSettings().forceReadOnly) ctx.store.setDemoReadOnly(s.user.id, bool(req.body.readOnly));
    await ctx.pool.invalidate(s.user.id);
    res.redirect(303, "/account?m=saved");
  });

  r.post("/account/padi/remove", form, async (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/account?m=csrf");
    ctx.store.savePadiSettings(s.user.id, undefined);
    counts.delete(s.user.id);
    await ctx.pool.invalidate(s.user.id);
    res.redirect(303, "/account?m=removed");
  });

  r.get("/account/connections", (req, res) => {
    const s = locals(res).session!;
    const grants = ctx.store.listGrants(s.user.id);
    const activity = ctx.store.recentActivity(s.user.id, 50);
    const row = (a: (typeof activity)[number]) =>
      html`<tr data-id="${a.id}"><td>${formatDate(a.at)}</td><td><code>${a.tool}</code></td><td><span class="badge ${a.ok ? "ok" : "bad"}">${a.ok ? t("account.activity.ok") : t("account.activity.error")}</span> <span class="muted">${a.durationMs} ms</span></td></tr>`;
    page(
      req,
      res,
      { title: t("account.apps.title"), active: "connections" },
      html`<div class="page-title"><h1>${t("account.apps.title")}</h1><p>${t("account.apps.intro")}</p></div>
      <div class="card">
        <h2>${t("account.apps.heading")}</h2>
        ${grants.length
          ? html`<div class="table-wrap wide"><table>
              <tr><th>${t("account.apps.colApp")}</th><th>${t("account.apps.colConnected")}</th><th>${t("account.apps.colLastUsed")}</th><th></th></tr>
              ${grants.map(
                (g) => html`<tr>
                  <td>${g.clientName}</td><td>${formatDate(g.createdAt)}</td><td>${formatDate(g.lastUsedAt)}</td>
                  <td><form method="post" action="/account/connections/revoke" class="inline">
                    <input type="hidden" name="_csrf" value="${s.csrf}"><input type="hidden" name="family" value="${g.family}">
                    <button type="submit" class="secondary small">${t("account.apps.revoke")}</button></form></td>
                </tr>`,
              )}
            </table></div>`
          : html`<p class="muted">${th("account.apps.none", { url: ctx.mcpUrl.href })}</p>`}
      </div>
      <div class="card" id="activity" data-live="/account/activity/stream" data-last-id="${activity[0]?.id ?? 0}">
        <h2>${t("account.activity.heading")} <span class="live off" role="status" hidden><span class="dot" aria-hidden="true"></span><span class="live-text">${t("account.activity.connecting")}</span></span></h2>
        <p class="muted" data-empty ${activity.length ? "hidden" : ""}>${t("account.activity.empty")}</p>
        <div class="table-wrap" ${activity.length ? "" : "hidden"}><table>
          <thead><tr><th>${t("account.activity.colTime")}</th><th>${t("account.activity.colAction")}</th><th>${t("account.activity.colResult")}</th></tr></thead>
          <tbody>${activity.map(row)}</tbody>
        </table></div>
      </div>`,
    );
  });

  // Live activity (Server-Sent Events). The page connects while it is visible.
  r.get("/account/activity/stream", (req, res) => {
    const s = locals(res).session!;
    const header = Number(req.get("last-event-id"));
    const query = Number(typeof req.query.after === "string" ? req.query.after : NaN);
    const after = Math.max(Number.isSafeInteger(header) ? header : 0, Number.isSafeInteger(query) ? query : 0);
    // Always replay: with after=0 (a page that showed nothing yet) it sends the newest entries.
    if (!ctx.live.open(s.user.id, s.idHash, res, () => ctx.store.activitySince(s.user.id, after, 50))) {
      res.status(429).type("text").send(t("account.activity.tooManyStreams"));
    }
  });

  r.post("/account/connections/revoke", form, (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/account/connections?m=csrf");
    ctx.store.revokeGrant(s.user.id, str(req.body.family, 100));
    res.redirect(303, "/account/connections?m=revoked");
  });

  const renderSecurity = (req: Request, res: Response, error?: string, status = 200) => {
    const s = locals(res).session!;
    page(
      req,
      res,
      { title: t("account.security.title"), active: "security", ...(error ? { flash: { kind: "error", text: error } } : {}) },
      html`<div class="page-title"><h1>${t("account.security.title")}</h1><p>${t("account.security.intro")}</p></div>
      <div class="card">
        <h2>${t("account.security.passwordHeading")}</h2>
        <form method="post" action="/account/password">
          <input type="hidden" name="_csrf" value="${s.csrf}">
          <label for="current">${t("account.security.currentPassword")}</label><input id="current" name="current" type="password" autocomplete="current-password" required>
          <label for="password">${t("account.security.newPassword")}</label><input id="password" name="password" type="password" autocomplete="new-password" required>
          <label for="password2">${t("account.security.repeatPassword")}</label><input id="password2" name="password2" type="password" autocomplete="new-password" required>
          <div class="actions"><button type="submit">${t("account.security.changePassword")}</button></div>
        </form>
      </div>
      <div class="card">
        <h2>${t("account.security.sessionsHeading")}</h2>
        <form method="post" action="/account/sessions" class="actions">
          <input type="hidden" name="_csrf" value="${s.csrf}">
          <button type="submit" class="secondary">${t("account.security.signOutOthers")}</button>
        </form>
      </div>
      <div class="card">
        <h2>${t("account.security.deleteHeading")}</h2>
        <p class="muted">${t("account.security.deleteText")}</p>
        <form method="post" action="/account/delete">
          <input type="hidden" name="_csrf" value="${s.csrf}">
          <label for="confirm">${t("account.security.deleteConfirmLabel", { email: s.user.email })}</label>
          <input id="confirm" name="confirm" type="text" required>
          <div class="actions"><button type="submit" class="danger">${t("account.security.deleteButton")}</button></div>
        </form>
      </div>`,
      status,
    );
  };

  r.get("/account/security", (req, res) => renderSecurity(req, res));

  r.post("/account/password", sensitive, form, async (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return renderSecurity(req, res, t("account.error.formExpired"), 400);
    const hash = ctx.store.getPasswordHash(s.user.id);
    if (!hash || !(await verifyPassword(str(req.body.current, 500), hash))) return renderSecurity(req, res, t("account.security.wrongPassword"), 400);
    const password = str(req.body.password, 500);
    const problem = passwordProblem(password);
    if (problem) return renderSecurity(req, res, problem, 400);
    if (password !== str(req.body.password2, 500)) return renderSecurity(req, res, t("account.security.passwordsDiffer"), 400);
    ctx.store.setPassword(s.user.id, await hashPassword(password));
    ctx.store.deleteUserSessions(s.user.id, s.idHash);
    res.redirect(303, "/account/security?m=password");
  });

  r.post("/account/sessions", form, (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/account/security?m=csrf");
    ctx.store.deleteUserSessions(s.user.id, s.idHash);
    res.redirect(303, "/account/security?m=sessions");
  });

  r.post("/account/delete", sensitive, form, async (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return renderSecurity(req, res, t("account.error.formExpired"), 400);
    if (str(req.body.confirm, 320).trim().toLowerCase() !== s.user.email) return renderSecurity(req, res, t("account.security.emailMismatch"), 400);
    if (s.user.isAdmin && ctx.store.countAdmins() <= 1 && ctx.store.countUsers() > 1) {
      return renderSecurity(req, res, t("account.security.lastAdmin"), 400);
    }
    ctx.store.deleteUser(s.user.id);
    ctx.demo.forget(s.user.id);
    counts.delete(s.user.id);
    await ctx.pool.invalidate(s.user.id);
    setCookie(res, ctx.cookies.clear(ctx.cookies.session));
    res.redirect(303, "/");
  });

  return r;
}
