/**
 * Account pages: the Suunto connection, connected apps, activity and security.
 *
 * "Connect Suunto" runs Suunto's OAuth 2.0 sign-in: this server sends the browser to Suunto's
 * authorize page with a random, single-use state bound to the signed-in user, and Suunto sends it
 * back to /suunto/callback with a code. The code is exchanged for tokens once, one test request
 * counts the workouts of the last 30 days, and the tokens are saved encrypted (see store.ts). This
 * server never sees the Suunto password. Showing the page never calls Suunto: it shows what was
 * saved at connect time.
 */

import express, { type Request, type Response, type Router } from "express";
import type { UnitChoice } from "../activity/types.js";
import { DEMO_NAME, DEMO_TIME_ZONE, DEMO_USERNAME } from "../demo/index.js";
import { SuuntoApi } from "../suunto/api.js";
import { formatWait, retryAfterMs } from "../suunto/http.js";
import { authorizeUrl, callbackError, exchangeCode, type StoredSuuntoTokens, type TokenResult } from "../suunto/oauth.js";
import { withWaitBudget } from "../suunto/limiter.js";
import { SuuntoSession } from "../suunto/session.js";
import { isValidTimeZone } from "../util/dates.js";
import { describeError, redact, UserFacingError } from "../util/errors.js";
import { deauthorizeAtSuunto } from "./accounts.js";
import { connectCard } from "./connect.js";
import { bool, consentReturn, page, returnTo, str, type WebContext } from "./context.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { avatar, formatDate, html, type SafeHtml } from "./html.js";
import { t, th, type MessageKey } from "./i18n/index.js";
import { serviceIcon, type Service } from "./icons.js";
import { passwordProblem } from "./routes-auth.js";
import { csrfOk, locals, perUserLimit, requireUser, securityHeaders, setCookie } from "./session.js";
import type { SuuntoAccountSettings, SuuntoConnectionCheck } from "./store.js";

const UNIT_CHOICES: readonly UnitChoice[] = ["metric", "imperial"];
const UNIT_LABELS: Record<UnitChoice, MessageKey> = {
  metric: "account.suunto.units.metric",
  imperial: "account.suunto.units.imperial",
};

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

/** The test request at connect time lists at most this many workouts (one request). */
export const CHECK_LIMIT = 100;
/** The callback waits this long for the test request; nothing is sent to Suunto after it. */
export const CHECK_TIMEOUT_MS = 15_000;
const DAY_MS = 86_400_000;

/** Thrown instead of waiting for a second try: the test request is sent once. */
class NoRetry extends Error {}

/**
 * The session of the test request. Its access token was just issued, so it never refreshes: a
 * refresh could rotate the refresh token after the connection was saved, and the new one would
 * be lost.
 */
class CheckSession extends SuuntoSession {
  override refreshNow(): Promise<string> {
    return Promise.reject(new UserFacingError("Suunto refused the new sign-in."));
  }
}

/** Why the test request failed, as the account page shows it (English, no secrets). */
function checkError(error: unknown, state: { timedOut: boolean; sent: boolean; answer?: { status: number; wait?: number } }, secrets: string[]): string {
  if (state.timedOut) {
    // Still waiting for a free slot of this service's call limit: nothing was sent.
    return state.sent ? "Suunto did not answer in time." : "This service is at its Suunto call limit right now, so the test request was not sent.";
  }
  if (error instanceof NoRetry) {
    const answer = state.answer;
    if (answer?.status === 429) {
      return `Suunto's call limit for this service is reached (HTTP 429). ${answer.wait !== undefined ? `Try again in ${formatWait(answer.wait)}.` : "Try again later."}`;
    }
    if (answer && answer.status >= 500) return `Suunto is busy right now (HTTP ${answer.status}). Try again later.`;
    return "Could not reach Suunto. Try again later.";
  }
  return redact(error instanceof UserFacingError ? error.message : describeError(error), secrets);
}

/**
 * The test request right after the code exchange: the workouts of the last 30 days, with the
 * fresh access token. It is sent once: no retry, no token refresh, and it counts against the
 * user's share of the call limit. After `timeoutMs` the callback goes on, and nothing more
 * is sent. A refused request (for example HTTP 403: the subscription does not cover the workout
 * API) does not stop the connection: it is saved with the error. Returns the check and the
 * tokens.
 */
export async function testConnection(
  ctx: Pick<WebContext, "suuntoKeys" | "suuntoEndpoints" | "suuntoFetch" | "log"> & { pool: Pick<WebContext["pool"], "limiter"> },
  result: TokenResult,
  userId: string,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<{ check: SuuntoConnectionCheck; tokens: StoredSuuntoTokens }> {
  const keys = ctx.suuntoKeys!;
  const base = ctx.suuntoFetch ?? fetch;
  const stop = new AbortController();
  const state: { timedOut: boolean; sent: boolean; answer?: { status: number; wait?: number } } = { timedOut: false, sent: false };
  // Every request of the check goes through here: after the cutoff, nothing more is sent.
  const checkFetch: typeof fetch = async (input, init) => {
    if (stop.signal.aborted) throw stop.signal.reason;
    state.sent = true;
    const res = await base(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, stop.signal]) : stop.signal });
    const wait = retryAfterMs(res);
    state.answer = { status: res.status, ...(wait !== undefined ? { wait } : {}) };
    return res;
  };
  const session = new CheckSession({ tokens: result.tokens, keys, endpoints: ctx.suuntoEndpoints, fetch: checkFetch });
  const api = new SuuntoApi({
    session,
    keys,
    endpoints: ctx.suuntoEndpoints,
    log: ctx.log,
    fetch: checkFetch,
    // A retry would wait (Retry-After, backoff) and spend more calls: the first answer counts.
    sleep: () => Promise.reject(new NoRetry()),
    ...(ctx.pool.limiter ? { limiter: ctx.pool.limiter, limiterKey: userId } : {}),
  });
  const at = Date.now();
  const secrets = [keys.clientSecret, keys.subscriptionKey, result.tokens.refreshToken, result.tokens.accessToken];
  let timer: NodeJS.Timeout | undefined;
  const cutoff = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      state.timedOut = true;
      stop.abort(new DOMException("The test request took too long.", "TimeoutError"));
      reject(stop.signal.reason);
    }, timeoutMs);
  });
  // The request never waits for a slot of the call limiter past half the cutoff: a slot booked for
  // a request that the cutoff then stops would count against the limits for nothing.
  const request = withWaitBudget(Math.floor(timeoutMs / 2), () =>
    api.listWorkouts({ since: at - 30 * DAY_MS, until: at, limit: CHECK_LIMIT, offset: 0, byModificationTime: false }),
  );
  // Once the cutoff won, the request may still end (it sends nothing more): ignore its outcome.
  request.catch(() => undefined);
  let check: SuuntoConnectionCheck;
  try {
    const list = await Promise.race([request, cutoff]);
    check = { at, workouts: list.payload.length };
  } catch (error) {
    check = { at, error: checkError(error, state, secrets) };
  } finally {
    clearTimeout(timer);
  }
  await api.close().catch(() => undefined);
  return { check, tokens: session.storedTokens };
}

export function accountRoutes(ctx: WebContext): Router {
  const r = express.Router();
  const form = express.urlencoded({ extended: false, limit: "64kb" });
  r.use("/account", requireUser);
  const sensitive = perUserLimit(20);
  const fetchOpt = ctx.suuntoFetch ? { fetch: ctx.suuntoFetch } : {};
  // Suunto's sign-in page: the connect form's answer redirects there.
  const suuntoOrigin = new URL(ctx.suuntoEndpoints.oauthUrl).origin;

  const readOnlyBox = (checked: boolean, enforced: boolean) =>
    html`<label class="check"><input type="checkbox" name="readOnly" ${checked || enforced ? "checked" : ""} ${enforced ? "disabled" : ""}>
      <span>${t("account.suunto.readOnly")} <span class="hint">${enforced ? t("account.suunto.readOnlyEnforced") : t("account.suunto.readOnlyHint")}</span></span></label>`;

  const unitsField = (id: string, units: UnitChoice) =>
    html`<label for="${id}">${t("account.suunto.units")}<span class="hint">${t("account.suunto.unitsHint")}</span></label>
      <select id="${id}" name="units">${UNIT_CHOICES.map((u) => html`<option value="${u}" ${u === units ? "selected" : ""}>${t(UNIT_LABELS[u])}</option>`)}</select>`;

  /**
   * The time zone select. The first option (an empty value) is the server's default: a user who
   * never chose a zone keeps following it, also after saving units or read-only.
   */
  const timeZoneField = (id: string, timeZone: string | undefined, serverDefault: string) => {
    const list = allTimeZones();
    const options = !timeZone || list.includes(timeZone) ? list : [timeZone, ...list];
    return html`<label for="${id}">${t("account.suunto.timeZone")}<span class="hint">${t("account.suunto.timeZoneHint")}</span></label>
      <select id="${id}" name="timeZone"><option value="" ${timeZone ? "" : "selected"}>${t("account.suunto.timeZoneDefault", { timeZone: serverDefault })}</option>${options.map((tz) => html`<option value="${tz}" ${tz === timeZone ? "selected" : ""}>${tz}</option>`)}</select>`;
  };

  const tile = (service: Service, name: MessageKey, text: MessageKey, state: SafeHtml) =>
    html`<div class="tile"><div class="tile-head">${serviceIcon(service, "lg")}<strong>${t(name)}</strong></div><p>${t(text)}</p>${state}</div>`;

  const tiles = (readOnly: boolean, state: SafeHtml) =>
    html`<div class="tiles">
        ${tile("workouts", "account.service.workouts", "account.tile.workouts", state)}
        ${tile("health", "account.service.health", "account.tile.health", state)}
        ${tile("routes", "account.service.routes", readOnly ? "account.tile.routesReadOnly" : "account.tile.routes", state)}
      </div>`;

  const profile = (email: string, line: string) =>
    html`<section class="profile">
      ${avatar(email, "xl")}
      <div>
        <h1>${email.split("@")[0]}<wbr>@${email.split("@").slice(1).join("@")}</h1>
        <p>${line}</p>
      </div>
    </section>`;

  /**
   * A demo account's page: no Suunto connection (there is no Suunto account behind it), a notice
   * that the data is sample data, and the read-only switch. Nothing on this page reaches Suunto.
   */
  const renderDemoAccount = (req: Request, res: Response, opts: { status?: number; flash?: { kind: "ok" | "error"; text: string } } = {}) => {
    const s = locals(res).session!;
    const server = ctx.store.getSettings();
    const readOnly = server.forceReadOnly || s.user.demoReadOnly === true;
    const demoCard = html`<div class="card" id="demo">
        <h2>${t("account.demo.heading")} <span class="badge warn">${t("account.demo.badge")}</span></h2>
        <p>${t("account.demo.intro")}</p>
        <p>${t("account.demo.memory")}</p>
        <p>${t("account.demo.nothingSent")}</p>
        <p class="muted">${t("account.demo.identity", { identity: DEMO_NAME, username: DEMO_USERNAME, timeZone: DEMO_TIME_ZONE })}
          ${th("account.demo.nextReset", { date: formatDate(ctx.demo.nextReset().getTime()) })}</p>
        <form method="post" action="/account/demo">
          <input type="hidden" name="_csrf" value="${s.csrf}">
          <h3>${t("account.demo.settingsHeading")}</h3>
          <div class="group">${readOnlyBox(s.user.demoReadOnly === true, server.forceReadOnly)}</div>
          <div class="actions"><button type="submit">${t("account.suunto.save")}</button></div>
        </form>
      </div>`;
    page(
      req,
      res,
      { title: t("account.title"), active: "account", ...(opts.flash ? { flash: opts.flash } : {}) },
      html`${profile(s.user.email, readOnly ? t("account.profile.demoReadOnly") : t("account.profile.demo"))}
      ${tiles(readOnly, readOnly ? html`<span class="badge ok">${t("account.state.onReadOnly")}</span>` : html`<span class="badge ok">${t("account.state.on")}</span>`)}
      ${connectCard({ mcpUrl: ctx.mcpUrl.href, email: s.user.email })}${demoCard}`,
      opts.status ?? 200,
    );
  };

  /** The workouts counted at connect time, or why that test request failed. */
  const workoutsLine = (check: SuuntoConnectionCheck | undefined): SafeHtml => {
    if (!check) return html`<span class="muted">${t("account.suunto.workoutsUnknown")}</span>`;
    const when = html` <span class="muted">(${th("account.suunto.checkedAt", { date: formatDate(check.at) })})</span>`;
    if (typeof check.workouts === "number") return html`${check.workouts >= CHECK_LIMIT ? `${CHECK_LIMIT}+` : String(check.workouts)}${when}`;
    return html`<span class="badge bad">${t("account.suunto.workoutsUnknown")}</span>${when}
      <br><span class="muted">${t("account.suunto.checkFailed")} ${check.error ?? ""}</span>`;
  };

  const renderAccount = (req: Request, res: Response, opts: { error?: string; status?: number; flash?: { kind: "ok" | "error"; text: string } } = {}) => {
    const s = locals(res).session!;
    if (s.user.demo) {
      const flash = opts.error ? { kind: "error" as const, text: opts.error } : opts.flash;
      return renderDemoAccount(req, res, { ...(opts.status ? { status: opts.status } : {}), ...(flash ? { flash } : {}) });
    }
    const configured = !!ctx.suuntoKeys;
    // Chrome applies form-action to the redirect after the "Connect Suunto" form: allow Suunto's
    // sign-in page on the pages that show that form.
    if (configured) securityHeaders([suuntoOrigin])(req, res, () => undefined);
    const server = ctx.store.getSettings();
    const read = ctx.store.readSuuntoSettings(s.user.id);
    const stored: SuuntoAccountSettings | undefined = read.settings;
    // A saved connection without the operator's app keys cannot be used (and Suunto cannot be told about a removal).
    const unavailable = !!stored && !configured;
    const expired = !!stored && configured && s.user.suuntoNeedsReconnect;
    const readOnly = server.forceReadOnly || stored?.readOnly === true;
    const next = returnTo(req);
    const csrf = html`<input type="hidden" name="_csrf" value="${s.csrf}">${next ? html`<input type="hidden" name="next" value="${next}">` : ""}`;

    /** The "Connect Suunto" button. The page fills in the browser's time zone (saved with a first connection). */
    const connectForm = (label: MessageKey, secondary = false) =>
      html`<form method="post" action="/account/suunto/connect" class="actions">${csrf}<input type="hidden" name="timeZone" value="" data-browser-tz>
          <button type="submit"${secondary ? html` class="secondary"` : ""}>${t(label)}</button></form>`;

    const state = !stored
      ? html`<span class="badge warn">${t("account.state.notConnected")}</span>`
      : unavailable
        ? html`<span class="badge warn">${t("account.state.unavailable")}</span>`
        : expired
          ? html`<span class="badge bad">${t("account.state.connectAgain")}</span>`
          : html`<span class="badge ok">${readOnly ? t("account.state.onReadOnly") : t("account.state.on")}</span>`;
    const badge = !stored
      ? html`<span class="badge warn">${t("account.suunto.badgeNotConnected")}</span>`
      : unavailable
        ? html`<span class="badge warn">${t("account.suunto.badgeUnavailable")}</span>`
        : expired
          ? html`<span class="badge bad">${t("account.suunto.badgeReconnect")}</span>`
          : html`<span class="badge ok">${t("account.suunto.badgeConnected")}</span>`;
    const notConfigured = html`<div class="flash warn">${t("account.suunto.notConfigured")}</div>`;

    const suuntoCard = stored
      ? html`<div class="card" id="suunto">
          <h2>${t("account.suunto.heading")} ${badge}</h2>
          ${unavailable ? html`<div class="flash warn">${t("account.suunto.unavailable")}</div>` : ""}
          ${expired ? html`<div class="flash error">${t("account.suunto.expired")}</div>${connectForm("account.suunto.connectAgain")}` : ""}
          <dl class="kv">
            <div><dt>${t("account.suunto.username")}</dt><dd>${stored.username}</dd></div>
            <div><dt>${t("account.suunto.connectedAt")}</dt><dd>${formatDate(stored.connectedAt)}</dd></div>
            <div><dt>${t("account.suunto.workouts")}</dt><dd>${workoutsLine(stored.lastCheck)}</dd></div>
          </dl>
          <p class="muted">${t("account.suunto.syncHint")}</p>
          <h3>${t("account.suunto.settingsHeading")}</h3>
          <form method="post" action="/account/suunto/settings">
            ${csrf}
            <div class="row"><div>${unitsField("units-saved", stored.units)}</div><div>${timeZoneField("timeZone-saved", stored.timeZone, server.defaultTimeZone)}</div></div>
            <div class="group">${readOnlyBox(stored.readOnly, server.forceReadOnly)}</div>
            <div class="actions"><button type="submit">${t("account.suunto.save")}</button></div>
          </form>
          ${expired || !configured
            ? ""
            : html`<details id="reconnect">
                <summary>${t("account.suunto.reconnect")}</summary>
                <p class="muted">${t("account.suunto.reconnectHint")}</p>
                ${connectForm("account.suunto.connectAgain", true)}
              </details>`}
          <form method="post" action="/account/suunto/remove" class="actions">
            <input type="hidden" name="_csrf" value="${s.csrf}">
            <button type="submit" class="secondary" data-confirm="${t(configured ? "account.suunto.removeConfirm" : "account.suunto.removeConfirmUnavailable")}">${t("account.suunto.remove")}</button>
          </form>
        </div>`
      : html`<div class="card" id="suunto">
          <h2>${t("account.suunto.heading")} ${badge}</h2>
          ${read.unreadable ? html`<div class="flash error">${t("account.suunto.unreadable")}</div>` : ""}
          ${configured
            ? html`<p class="muted">${t("account.suunto.intro")}</p><p class="muted">${t("account.suunto.syncHint")}</p>${connectForm("account.suunto.connect")}`
            : notConfigured}
        </div>`;

    const line = !stored
      ? configured
        ? t("account.profile.getStarted")
        : t("account.profile.notConfigured")
      : unavailable
        ? t("account.profile.unavailable")
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
      ${tiles(readOnly, state)}
      ${stored && !expired && !unavailable ? html`${connectCard({ mcpUrl: ctx.mcpUrl.href, email: s.user.email })}${suuntoCard}` : html`${suuntoCard}${connectCard({ mcpUrl: ctx.mcpUrl.href, email: s.user.email })}`}`,
      opts.status ?? 200,
    );
  };

  r.get("/account", (req, res) => renderAccount(req, res));

  /**
   * "Connect Suunto" (also Reconnect): remember a random state for this user, then send the
   * browser to Suunto's sign-in page. The browser's time zone (hidden field) is kept with the
   * state and saved with a first connection.
   */
  r.post("/account/suunto/connect", sensitive, form, (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return renderAccount(req, res, { error: t("account.error.formExpired"), status: 400 });
    // A demo account never gets a Suunto connection.
    if (s.user.demo) return renderAccount(req, res, { error: t("account.demo.noSuunto"), status: 403 });
    if (!ctx.suuntoKeys) return void res.redirect(303, "/account?m=notconfigured");
    const timeZone = str(req.body.timeZone, 100).trim();
    const state = ctx.store.createOAuthState(s.user.id, returnTo(req), timeZone && isValidTimeZone(timeZone) ? timeZone : undefined);
    res.redirect(303, authorizeUrl(ctx.suuntoEndpoints, ctx.suuntoKeys.clientId, ctx.suuntoRedirectUri, state));
  });

  /**
   * Where Suunto sends the browser back: ?code=..&state=.. or ?error=..&state=... The state must
   * be one this user started (single use, 10 minutes). Nothing Suunto sends is put in a URL: the
   * outcome is a flash code.
   */
  r.get("/suunto/callback", async (req, res) => {
    const s = locals(res).session;
    // The session cookie (SameSite=Lax) comes with this redirect. Without it, start again: the
    // code is not carried through the sign-in page.
    if (!s) return void res.redirect(303, `/login?next=${encodeURIComponent("/account")}`);
    if (s.user.demo) return void res.redirect(303, "/account");
    const started = ctx.store.consumeOAuthState(str(req.query.state, 200), s.user.id);
    if (!started) {
      ctx.log("A Suunto callback came with an unknown, used or expired state");
      return void res.redirect(303, "/account?m=stateexpired");
    }
    const keys = ctx.suuntoKeys;
    if (!keys) return void res.redirect(303, "/account?m=notconfigured");
    const error = str(req.query.error, 200);
    if (error) {
      const refused = callbackError(error);
      ctx.log(`Suunto sign-in ended without a code (${refused.code})`);
      return void res.redirect(303, refused.code === "denied" ? "/account?m=denied" : "/account?m=connectfailed");
    }
    const code = str(req.query.code, 2000);
    if (!code) return void res.redirect(303, "/account?m=connectfailed");

    let result: TokenResult;
    try {
      result = await exchangeCode(code, ctx.suuntoRedirectUri, { endpoints: ctx.suuntoEndpoints, keys, ...fetchOpt });
    } catch (err) {
      // The client's messages hold no code, token or secret.
      ctx.log(`Suunto code exchange failed: ${err instanceof UserFacingError ? err.message : "unexpected error"}`);
      return void res.redirect(303, "/account?m=connectfailed");
    }

    const { check, tokens } = await testConnection(ctx, result, s.user.id);
    // A reconnect keeps the user's settings; a first connection takes the browser's time zone.
    const existing = ctx.store.getSuuntoSettings(s.user.id);
    // Another Suunto account replaces this one: its access ends at Suunto too (below). Not for the
    // same Suunto account: Suunto's deauthorize disconnects the user from this app, which would
    // end the new connection as well.
    const replaced = existing && existing.username !== result.username ? existing : undefined;
    const timeZone = existing?.timeZone ?? started.timeZone;
    const settings: SuuntoAccountSettings = {
      username: result.username,
      refreshToken: tokens.refreshToken,
      ...(tokens.accessToken ? { accessToken: tokens.accessToken } : {}),
      ...(tokens.accessTokenExpiresAt !== undefined ? { accessTokenExpiresAt: tokens.accessTokenExpiresAt } : {}),
      clientId: tokens.clientId,
      units: existing?.units ?? "metric",
      readOnly: existing?.readOnly ?? false,
      ...(timeZone ? { timeZone } : {}),
      connectedAt: Date.now(),
      lastCheck: check,
    };
    ctx.store.saveSuuntoSettings(s.user.id, settings);
    await ctx.pool.invalidate(s.user.id);
    ctx.log(`Suunto connection saved for a user${check.error ? " (the test request failed)" : ""}`);
    if (replaced) {
      // Best effort, after the new connection is saved: it never throws.
      await deauthorizeAtSuunto(replaced, { keys, endpoints: ctx.suuntoEndpoints, ...fetchOpt });
      ctx.log("A user connected another Suunto account; Suunto was asked to end the previous connection");
    }
    res.redirect(303, consentReturn(started.next) ?? (check.error ? "/account?m=checkfailed" : "/account?m=connected"));
  });

  /** Units, read-only switch and time zone of a saved connection (no call to Suunto). */
  r.post("/account/suunto/settings", form, async (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/account?m=csrf");
    const existing = ctx.store.getSuuntoSettings(s.user.id);
    if (s.user.demo || !existing) return void res.redirect(303, "/account");
    const server = ctx.store.getSettings();
    // A form without the field keeps the saved zone; the empty choice is the server's default
    // (no zone of the user's own).
    const sent = typeof req.body.timeZone === "string";
    const timeZone = str(req.body.timeZone, 100).trim();
    if (timeZone && !isValidTimeZone(timeZone)) return renderAccount(req, res, { error: t("account.error.timeZone"), status: 400 });
    ctx.store.saveSuuntoPreferences(s.user.id, {
      units: unitChoice(req.body.units) ?? existing.units,
      // While the administrator enforces read-only, the (disabled) box is not sent: keep the user's choice.
      readOnly: server.forceReadOnly ? existing.readOnly : bool(req.body.readOnly),
      ...(timeZone ? { timeZone } : sent ? { timeZone: null } : {}),
    });
    // New services on the same connection: its session and its cache stay.
    ctx.pool.rebuild(s.user.id);
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

  /** Remove the connection: tell Suunto first (best effort, with the stored tokens), then delete it. */
  r.post("/account/suunto/remove", form, async (req, res) => {
    const s = locals(res).session!;
    if (!csrfOk(req, res, ctx.cookies)) return void res.redirect(303, "/account?m=csrf");
    await deauthorizeAtSuunto(ctx.store.getSuuntoSettings(s.user.id), { keys: ctx.suuntoKeys, endpoints: ctx.suuntoEndpoints, ...fetchOpt });
    ctx.store.saveSuuntoSettings(s.user.id, undefined);
    await ctx.pool.invalidate(s.user.id);
    ctx.log("A user removed their Suunto connection");
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
        <p class="muted">${t(!ctx.suuntoKeys && ctx.store.getSuuntoSettings(s.user.id) ? "account.security.deleteTextUnavailable" : "account.security.deleteText")}</p>
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
    // Tell Suunto first (best effort), while the tokens are still stored.
    await deauthorizeAtSuunto(ctx.store.getSuuntoSettings(s.user.id), { keys: ctx.suuntoKeys, endpoints: ctx.suuntoEndpoints, ...fetchOpt });
    ctx.store.deleteUser(s.user.id);
    ctx.demo.forget(s.user.id);
    await ctx.pool.invalidate(s.user.id);
    setCookie(res, ctx.cookies.clear(ctx.cookies.session));
    res.redirect(303, "/");
  });

  return r;
}
