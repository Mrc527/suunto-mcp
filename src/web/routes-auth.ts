/**
 * Sign up, sign in and sign out.
 */

import express, { type Router } from "express";
import { rateLimit } from "express-rate-limit";
import { bool, page, str, type WebContext } from "./context.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./crypto.js";
import { html } from "./html.js";
import { t, th, tn, type Locale } from "./i18n/index.js";
import { brandMark, glyph } from "./icons.js";
import { isEmail } from "./email.js";
import { csrfOk, locals, preCsrf, safeNext, setCookie } from "./session.js";

/** Whether a sign-in name looks like an email address (the same check as sign-up). */
export { isEmail } from "./email.js";
export const MIN_PASSWORD = 10;
/** Open access requests allowed at the same time (protects the database from floods). */
export const MAX_ACCESS_REQUESTS = 100;
/** Access requests one IP address can send per day. */
export const REQUESTS_PER_IP_PER_DAY = 5;

/**
 * What is wrong with a new password, in the language of the current request (English outside a
 * request, e.g. for ADMIN_PASSWORD at startup), or undefined when it is fine.
 */
export function passwordProblem(password: string, lang?: Locale): string | undefined {
  if (password.length < MIN_PASSWORD) return tn("auth.password.tooShort", MIN_PASSWORD, {}, lang);
  if (password.length > 200) return t("auth.password.tooLong", undefined, lang);
  return undefined;
}

export function signupAllowedFor(ctx: WebContext): { allowed: boolean; invite: boolean; approval: boolean } {
  if (ctx.store.countUsers() === 0) return { allowed: true, invite: false, approval: false };
  const mode = ctx.store.getSettings().registration;
  return { allowed: mode !== "closed", invite: mode === "invite", approval: mode === "approval" };
}

export function authRoutes(ctx: WebContext): Router {
  const r = express.Router();
  const form = express.urlencoded({ extended: false, limit: "64kb" });
  const limiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: () => t("auth.error.tooManyAttempts"),
  });
  // Access requests (no invite code) per IP and day. Answers of 400 and more (form errors, full
  // queue) do not count. Runs after the form is parsed, so it can tell requests from invites.
  const requestLimiter = rateLimit({
    windowMs: 24 * 3_600_000,
    limit: REQUESTS_PER_IP_PER_DAY,
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true,
    skip: (req) => !signupAllowedFor(ctx).approval || str(req.body?.invite, 200).trim() !== "",
    message: () => t("auth.error.tooManyRequestsToday"),
  });

  const signupAllowed = () => signupAllowedFor(ctx);

  const loginPage = (req: express.Request, res: express.Response, error?: string, email = "", status = 200, kind: "error" | "info" = "error") => {
    const csrf = preCsrf(res, ctx.cookies);
    const next = safeNext(req.query.next ?? req.body?.next);
    const { allowed, approval } = signupAllowed();
    page(
      req,
      res,
      { title: t("auth.signIn.title"), hideSignIn: true, ...(error ? { flash: { kind, text: error } } : {}) },
      html`<div class="sheet">
        <div class="sheet-head">
          ${brandMark("lg")}
          <h1>${t("auth.signIn.title")}</h1>
          <p>${t("auth.signIn.intro")}</p>
        </div>
        <div class="card">
        <form method="post" action="/login">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input type="hidden" name="next" value="${next}">
          <label for="email">${t("auth.field.email")}</label>
          <input id="email" name="email" type="email" autocomplete="username" required value="${email}">
          <label for="password">${t("auth.field.password")}</label>
          <input id="password" name="password" type="password" autocomplete="current-password" required>
          <div class="stack"><button type="submit" class="block">${t("auth.signIn.button")}</button></div>
        </form>
        </div>
        ${allowed
          ? html`<p class="muted">${th(approval ? "auth.signIn.noAccountRequest" : "auth.signIn.noAccountCreate", { url: `/signup?next=${encodeURIComponent(next)}` })}</p>`
          : ""}
      </div>`,
      status,
    );
  };

  r.get("/login", (req, res) => {
    if (locals(res).session) {
      res.redirect(303, safeNext(req.query.next));
      return;
    }
    loginPage(req, res);
  });

  r.post("/login", limiter, form, async (req, res) => {
    if (!csrfOk(req, res, ctx.cookies)) {
      loginPage(req, res, t("auth.error.formExpired"), str(req.body.email), 400);
      return;
    }
    const email = str(req.body.email, 320).trim().toLowerCase();
    const password = str(req.body.password, 500);
    const user = email ? ctx.store.getUserByEmail(email) : undefined;
    let ok = false;
    if (user) ok = await verifyPassword(password, user.passwordHash);
    else await burnPasswordCheck(password);
    if (!user || !ok || user.disabled) {
      ctx.log(`Failed sign-in for ${email ? "an account" : "empty email"}`);
      // A waiting request gets the same answer as a wrong password: whoever sent the request chose
      // the password, so a different answer would tell strangers which emails were free. Only the
      // holder of a real account's password learns that it is disabled.
      const denied = !user || !ok || user.pending;
      loginPage(req, res, denied ? t("auth.signIn.wrongCredentials") : t("auth.signIn.disabled"), email, denied ? 401 : 403);
      return;
    }
    const settings = ctx.store.getSettings();
    const session = ctx.store.createSession(user.id, settings.sessionTtlDays);
    ctx.store.touchLogin(user.id);
    setCookie(res, ctx.cookies.serialize(ctx.cookies.session, session.cookie, settings.sessionTtlDays * 86_400));
    res.redirect(303, safeNext(req.body.next));
  });

  const signupPage = (req: express.Request, res: express.Response, error?: string, values: Record<string, string> = {}, status = 200) => {
    const { allowed, invite, approval } = signupAllowed();
    if (!allowed) {
      page(
        req,
        res,
        { title: t("auth.signUp.closedTitle") },
        html`<div class="sheet"><div class="sheet-head">${brandMark("lg")}<h1>${t("auth.signUp.closedHeading")}</h1><p>${t("auth.signUp.closedText")}</p></div></div>`,
        403,
      );
      return;
    }
    const csrf = preCsrf(res, ctx.cookies);
    const first = ctx.store.countUsers() === 0;
    const domains = ctx.store.getSettings().allowedEmailDomains;
    const title = approval ? t("auth.signUp.requestTitle") : t("auth.signUp.createTitle");
    page(
      req,
      res,
      { title, hideSignIn: true, ...(error ? { flash: { kind: "error", text: error } } : {}) },
      html`<div class="sheet">
        <div class="sheet-head">
          ${brandMark("lg")}
          <h1>${title}</h1>
          <p>${first
            ? t("auth.signUp.introFirst")
            : approval
              ? t("auth.signUp.introApproval")
              : t("auth.signUp.introOpen")}</p>
        </div>
        <div class="card">
        <form method="post" action="/signup">
          <input type="hidden" name="_csrf" value="${csrf}">
          <input type="hidden" name="next" value="${safeNext(req.query.next ?? req.body?.next)}">
          <label for="email">${t("auth.field.email")}<span class="hint">${domains.length ? t("auth.signUp.emailHintDomains", { domains: domains.join(", ") }) : t("auth.signUp.emailHint")}</span></label>
          <input id="email" name="email" type="email" autocomplete="username" required value="${values.email ?? ""}">
          <label for="password">${t("auth.field.password")}<span class="hint">${tn("auth.signUp.passwordHint", MIN_PASSWORD)}</span></label>
          <input id="password" name="password" type="password" autocomplete="new-password" required minlength="${MIN_PASSWORD}">
          <label for="password2">${t("auth.signUp.repeatPassword")}</label>
          <input id="password2" name="password2" type="password" autocomplete="new-password" required>
          ${invite && !first
            ? html`<label for="invite">${t("auth.signUp.inviteCode")}</label><input id="invite" name="invite" type="text" required value="${values.invite ?? ""}">`
            : ""}
          ${approval
            ? html`<label for="note">${t("auth.signUp.note")}<span class="hint">${t("auth.signUp.noteHint")}</span></label>
                <textarea id="note" name="note" rows="3" maxlength="500">${values.note ?? ""}</textarea>
                <label for="invite">${t("auth.signUp.inviteCode")}<span class="hint">${t("auth.signUp.inviteHint")}</span></label>
                <input id="invite" name="invite" type="text" value="${values.invite ?? ""}">`
            : ""}
          <label class="check"><input type="checkbox" name="consent" required ${bool(values.consent) ? "checked" : ""}>
            <span>${t("auth.signUp.consent")} ${th("auth.signUp.consentTerms")}</span></label>
          <div class="stack"><button type="submit" class="block">${approval ? t("auth.signUp.sendRequest") : t("auth.signUp.createAccount")}</button></div>
        </form>
        </div>
        <p class="muted">${th("auth.signUp.alreadyRegistered")}</p>
      </div>`,
      status,
    );
  };

  r.get("/signup", (req, res) => signupPage(req, res));

  const requestSent = (req: express.Request, res: express.Response) =>
    page(
      req,
      res,
      { title: t("auth.requestSent.title"), hideSignIn: true },
      html`<div class="sheet">
        <div class="sheet-head">
          <span class="mark mark-lg">${glyph("check")}</span>
          <h1>${t("auth.requestSent.title")}</h1>
          <p>${t("auth.requestSent.thanks")}</p>
        </div>
        <div class="card">
          <p>${t("auth.requestSent.noEmail")}</p>
          <p>${t("auth.requestSent.signInLater")}</p>
          <p class="fine">${t("auth.requestSent.expiry")}</p>
          <div class="stack"><a class="button secondary block" href="/login">${t("auth.requestSent.goToSignIn")}</a></div>
        </div>
      </div>`,
    );

  r.post("/signup", limiter, form, requestLimiter, async (req, res) => {
    const values = {
      email: str(req.body.email, 320).trim().toLowerCase(),
      invite: str(req.body.invite, 200).trim(),
      note: str(req.body.note, 500).trim(),
      consent: str(req.body.consent),
    };
    if (!csrfOk(req, res, ctx.cookies)) return signupPage(req, res, t("auth.error.formExpired"), values, 400);
    const { allowed, invite, approval } = signupAllowed();
    if (!allowed) return signupPage(req, res);
    const first = ctx.store.countUsers() === 0;
    const password = str(req.body.password, 500);
    if (!isEmail(values.email)) return signupPage(req, res, t("auth.error.invalidEmail"), values, 400);
    const domains = ctx.store.getSettings().allowedEmailDomains;
    if (!first && domains.length && !domains.includes(values.email.split("@")[1] ?? "")) {
      return signupPage(req, res, t("auth.error.domainNotAllowed", { domains: domains.join(", ") }), values, 400);
    }
    const problem = passwordProblem(password);
    if (problem) return signupPage(req, res, problem, values, 400);
    if (password !== str(req.body.password2, 500)) return signupPage(req, res, t("auth.error.passwordsDiffer"), values, 400);
    if (!bool(values.consent)) return signupPage(req, res, t("auth.error.consent"), values, 400);
    // In approval mode an invite code is optional and skips the approval.
    const useInvite = !first && (invite || (approval && values.invite !== ""));
    const request = approval && !first && !useInvite;
    // Check the invite first, so people without one cannot learn which e-mails have accounts.
    if (useInvite && !ctx.store.inviteIsValid(values.invite)) {
      return signupPage(req, res, t("auth.error.inviteInvalid"), values, 400);
    }
    if (request) {
      // Same answer and similar timing whether or not the email has an account, so a request
      // never tells strangers which addresses are registered. The queue limit comes first for
      // the same reason.
      if (ctx.store.countAccessRequests() >= MAX_ACCESS_REQUESTS) {
        return signupPage(req, res, t("auth.error.tooManyOpenRequests"), values, 429);
      }
      const hash = await hashPassword(password);
      if (ctx.store.getUserByEmail(values.email)) return requestSent(req, res);
      try {
        ctx.store.createUser(values.email, hash, false, { note: values.note });
      } catch {
        return requestSent(req, res);
      }
      ctx.log("New access request");
      ctx.notices.requested();
      return requestSent(req, res);
    }
    // A valid invite replaces a waiting request for the same address (which anyone could have
    // sent), so an administrator can always let the real owner in with an invite.
    const existing = ctx.store.getUserByEmail(values.email);
    const replacesRequest = useInvite && existing?.pending === true;
    if (existing && !replacesRequest) return signupPage(req, res, t("auth.error.accountExists"), values, 400);
    const hash = await hashPassword(password);
    if (useInvite && !ctx.store.consumeInvite(values.invite, values.email)) {
      return signupPage(req, res, t("auth.error.inviteInvalid"), values, 400);
    }
    if (replacesRequest) {
      ctx.store.rejectAccessRequest(existing.id);
      ctx.log("A waiting access request was replaced by an invited account");
    }
    let user;
    try {
      user = ctx.store.createUser(values.email, hash, ctx.store.countUsers() === 0);
    } catch {
      return signupPage(req, res, t("auth.error.accountExists"), values, 400);
    }
    ctx.log(`New account created${user.isAdmin ? " (administrator)" : ""}`);
    const settings = ctx.store.getSettings();
    const session = ctx.store.createSession(user.id, settings.sessionTtlDays);
    setCookie(res, ctx.cookies.serialize(ctx.cookies.session, session.cookie, settings.sessionTtlDays * 86_400));
    const next = safeNext(req.body.next);
    res.redirect(303, next === "/account" ? "/account?m=welcome" : next);
  });

  r.post("/logout", form, (req, res) => {
    const s = locals(res).session;
    if (s && csrfOk(req, res, ctx.cookies)) ctx.store.deleteSession(s.idHash);
    setCookie(res, ctx.cookies.clear(ctx.cookies.session));
    res.redirect(303, "/");
  });

  return r;
}
