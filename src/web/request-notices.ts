/**
 * E-mails administrators when someone requests access (the waitlist).
 *
 * The e-mails go through the operator's SMTP server (SMTP_URL), from NOTIFY_FROM (or the SMTP user
 * name when it is an e-mail address) to the address each administrator signs in with. The
 * connection to the SMTP server must be encrypted (see smtpSender). Without SMTP_URL no e-mail
 * is sent: the admin page still lists the requests. Requests that come close together arrive in
 * one e-mail: the first one about a minute after a request, the next ones at least ten minutes
 * apart. Which requests were already reported is stored in the database, so a restart (a deploy)
 * neither loses nor repeats one. When no e-mail can be sent, it is tried again a few times, then
 * given up: the requests are still listed on the admin page.
 *
 * The address and the message of a request are typed by a stranger: the e-mail is plain text,
 * the subject never contains them, invisible, control and direction-changing characters are
 * removed, and links are made unclickable ("example[.]com").
 */

import nodemailer from "nodemailer";
import { isEmail } from "./email.js";
import { DEFAULT_LOCALE, HTML_LANG, isLocale, t, tn, type Locale } from "./i18n/index.js";
import type { Store, User } from "./store.js";

/** Why an administrator could not be e-mailed. */
export type NoticeProblem = "noSmtp" | "invalid" | "auth" | "network" | "rejected" | "other";

export interface NoticeMail {
  /** The administrator's address. */
  to: string;
  /** NOTIFY_FROM, or the SMTP user name when it is an e-mail address. */
  from: string;
  subject: string;
  text: string;
}

/** Sends one e-mail (tests pass their own). */
export type NoticeSender = (mail: NoticeMail) => Promise<void>;

export interface NoticeResult {
  at: number;
  ok: boolean;
  problem?: NoticeProblem;
}

export interface NoticeStatus {
  /** Where the e-mails go. Absent when they cannot be sent. */
  address?: string;
  /** Why no e-mail can be sent (no SMTP server configured, no valid address). */
  problem?: NoticeProblem;
  /** The last e-mail to this administrator since the server started. */
  last?: NoticeResult;
}

export interface NoticeTiming {
  /** Wait after a new request, so requests that come together arrive in one e-mail. */
  delayMs?: number;
  /** At least this much time between two e-mails. */
  gapMs?: number;
  /** Waits before trying again when no e-mail could be sent. After the last one, the requests are given up. */
  retryMs?: number[];
}

export interface RequestNoticesOptions extends NoticeTiming {
  store: Store;
  publicUrl: URL;
  log: (m: string) => void;
  /** How e-mails are sent. None: no e-mail is sent (no SMTP_URL). */
  send?: NoticeSender;
  /**
   * Sender address (NOTIFY_FROM, or the SMTP user when it is an e-mail address). Needed with
   * `send`: the administrator's own address is not used, because the operator's SMTP server
   * usually may not send as that address (it refuses the e-mail, or the e-mail bounces).
   */
  from?: string;
}

/** Requests listed one by one in an e-mail; more are only counted. */
export const MAX_LISTED = 10;

/**
 * Checks SMTP_URL (smtps://user:pass@host:465, or smtp://user:pass@host:587 with STARTTLS).
 * Returns an error message (that never contains the URL, which holds a password), or undefined
 * when it is fine.
 */
export function smtpUrlProblem(smtpUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(smtpUrl);
  } catch {
    return "SMTP_URL is not a valid URL (for example smtps://user:password@mail.example.com:465)";
  }
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") return "SMTP_URL must start with smtp:// or smtps://";
  if (!url.hostname) return "SMTP_URL has no host name";
  return undefined;
}

/** The SMTP user name when it is an e-mail address: the default sender (most servers only send as their user). */
export function smtpUserAddress(smtpUrl: string): string | undefined {
  try {
    const user = decodeURIComponent(new URL(smtpUrl).username);
    return isEmail(user) ? user : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sends through the operator's SMTP server, given as a URL (smtps://user:pass@host:465).
 *
 * The connection must be encrypted before the password is sent. smtps:// uses TLS from the
 * start. For smtp:// nodemailer would only switch to TLS when the server offers STARTTLS, and
 * someone on the network can remove that offer: then the password and the e-mail would go out
 * in clear text. requireTLS makes the send fail instead. An operator can turn this off on
 * purpose with ?requireTLS=false in the URL (the URL's options win), for example for a mail
 * server on the same machine.
 */
export function smtpSender(smtpUrl: string): NoticeSender {
  return async (mail) => {
    const transport = nodemailer.createTransport({ url: smtpUrl, requireTLS: true });
    try {
      await sendOne(transport, mail);
    } finally {
      transport.close();
    }
  };
}

async function sendOne(transport: ReturnType<typeof nodemailer.createTransport>, mail: NoticeMail): Promise<void> {
  await transport.sendMail({
    from: mail.from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    // Marks the e-mail as automatic, so no out-of-office reply answers it.
    headers: { "Auto-Submitted": "auto-generated" },
    xMailer: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

/** What went wrong, from a nodemailer error. */
export function classifySendError(error: unknown): NoticeProblem {
  const e = error as { code?: unknown; responseCode?: unknown };
  if (e?.code === "EAUTH" || e?.responseCode === 535 || e?.responseCode === 534) return "auth";
  if (typeof e?.code === "string" && ["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(e.code)) {
    return "network";
  }
  if (typeof e?.responseCode === "number" && e.responseCode >= 400) return "rejected";
  return "other";
}

/**
 * Text typed by a stranger, safe to show in a plain-text e-mail: compatibility forms folded
 * (fullwidth dots and colons become plain ones), every kind of line break turned into "\n", other
 * spaces into plain spaces, and control, format, private-use, unassigned and invisible characters
 * (direction changes, zero-width characters, variation selectors, tag characters) removed.
 */
export function cleanText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\r\n?|[\u000B\u000C\u0085\u2028\u2029]/g, "\n")
    .replace(/[^\S\n]|\u2800/g, " ")
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu, (c) => (c === "\n" ? c : ""));
}

/** Links that mail apps cannot turn into something to tap: "https[:]//example[.]com". */
export function defang(text: string): string {
  return text.replace(/:\/\//g, "[:]//").replace(/\.(?=[\p{L}\p{N}\p{M}])/gu, "[.]");
}

/**
 * A request's message, quoted line by line ("> ") with at most one empty line in a row, without
 * hidden characters and with unclickable links.
 */
export function quoteMessage(note: string): string[] {
  const clean = defang(cleanText(note))
    .replace(/ +$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean ? clean.split("\n").map((line) => `> ${line}`.trimEnd()) : [];
}

/**
 * A request's address on one line: as it is when it is an ordinary address (a mail app may offer
 * to write to it), otherwise cleaned and unclickable (older versions checked addresses less
 * strictly).
 */
export function showAddress(address: string): string {
  if (isEmail(address)) return address;
  return defang(cleanText(address).replace(/\s+/g, " ").trim());
}

/** A date and time in the administrator's language and time zone ("8 Nov 2026, 15:04 CET"). */
export function when(ms: number, lang: Locale, timeZone: string): string {
  try {
    // dateStyle and timeStyle cannot be combined with timeZoneName: the parts are listed instead.
    return new Intl.DateTimeFormat(HTML_LANG[lang], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }).format(new Date(ms));
  } catch {
    return `${new Date(ms).toISOString().replace("T", " ").slice(0, 16)} UTC`;
  }
}

interface Recipient {
  address: string;
  timeZone: string;
}

export class RequestNotices {
  private readonly store: Store;
  private readonly send: NoticeSender | undefined;
  private readonly delayMs: number;
  private readonly gapMs: number;
  private readonly retryMs: number[];
  private timer: NodeJS.Timeout | undefined;
  private dueAt = 0;
  private lastSentAt = 0;
  private failures = 0;
  /** While retrying after a failure: no run before this time, even for a new request. */
  private retryAt = 0;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;
  /** The last e-mail per administrator, shown on the admin page (memory only). */
  private readonly results = new Map<string, NoticeResult>();

  constructor(private readonly opts: RequestNoticesOptions) {
    if (opts.send && !opts.from) throw new Error("A sender address is needed to send e-mails (NOTIFY_FROM)");
    this.store = opts.store;
    this.send = opts.send;
    this.delayMs = opts.delayMs ?? 60_000;
    this.gapMs = opts.gapMs ?? 10 * 60_000;
    this.retryMs = opts.retryMs ?? [5 * 60_000, 30 * 60_000, 2 * 3600_000];
  }

  /** At startup: report requests that were not reported before the last stop. */
  start(): void {
    if (this.store.listUnnotifiedAccessRequests().length) this.schedule(this.delayMs);
  }

  /** Someone requested access: e-mail the administrators soon. */
  requested(): void {
    this.schedule(this.delayMs);
  }

  /** Where this administrator's e-mails go, or why none can be sent, and how the last one went. */
  status(admin: User): NoticeStatus {
    const recipient = this.recipient(admin);
    const last = this.results.get(admin.id);
    return {
      ...("problem" in recipient ? { problem: recipient.problem } : { address: recipient.address }),
      ...(last ? { last } : {}),
    };
  }

  /** Send a test e-mail to an administrator now, in their language. */
  async sendTest(admin: User, lang: Locale): Promise<{ ok: true; address: string } | { ok: false; problem: NoticeProblem }> {
    const recipient = this.recipient(admin);
    if ("problem" in recipient) return { ok: false, problem: recipient.problem };
    const app = t("common.appName", undefined, lang);
    const site = this.opts.publicUrl.host;
    const mail: NoticeMail = {
      to: recipient.address,
      from: this.opts.from!,
      subject: t("admin.notices.test.subject", { app }, lang),
      text: [t("admin.notices.test.text", { site }, lang), "", "-- ", this.footer(lang)].join("\n"),
    };
    try {
      await this.send!(mail);
      this.opts.log("Test e-mail about access requests sent to an administrator");
      return { ok: true, address: recipient.address };
    } catch (error) {
      const problem = classifySendError(error);
      this.opts.log(`Test e-mail about access requests failed (${problem})`);
      return { ok: false, problem };
    }
  }

  /** Send now what is due (tests; the timer calls it otherwise). Runs one at a time. */
  flush(): Promise<void> {
    const run = this.queue.then(() => this.deliver());
    this.queue = run.catch((error: Error) => this.opts.log(`Access request e-mails failed: ${error.message}`));
    return this.queue;
  }

  /** Stop the timer and wait (at most `maxMs`) for an e-mail being sent. */
  async close(maxMs = 3000): Promise<void> {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    let limit: NodeJS.Timeout | undefined;
    await Promise.race([this.queue, new Promise<void>((resolve) => (limit = setTimeout(resolve, maxMs)))]);
    clearTimeout(limit);
  }

  private schedule(waitMs: number): void {
    if (this.closed) return;
    const at = Math.max(Date.now() + waitMs, this.lastSentAt + this.gapMs, this.retryAt);
    // A run that is already planned earlier will include the new request.
    if (this.timer && this.dueAt <= at) return;
    clearTimeout(this.timer);
    this.dueAt = at;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, at - Date.now());
    this.timer.unref();
  }

  private async deliver(): Promise<void> {
    if (this.closed) return;
    const requests = this.store.listUnnotifiedAccessRequests();
    if (!requests.length) {
      this.failures = 0;
      return;
    }
    // Never two e-mails closer together than the gap (a request that came in during a send).
    if (Date.now() < this.lastSentAt + this.gapMs) return this.schedule(0);
    const ids = requests.map((u) => u.id);
    let sent = 0;
    let tried = 0;
    for (const admin of this.store.listRequestNoticeRecipients()) {
      // Shutting down: what was sent is already recorded, the rest waits for the next start.
      if (this.closed) break;
      const recipient = this.recipient(admin);
      if ("problem" in recipient) {
        this.results.set(admin.id, { at: Date.now(), ok: false, problem: recipient.problem });
        continue;
      }
      tried++;
      const lang = isLocale(admin.lang) ? admin.lang : DEFAULT_LOCALE;
      try {
        await this.send!(this.requestMail(requests, recipient, lang));
        // Recorded at the first success, so a stop in the middle never repeats an e-mail.
        if (sent++ === 0) this.store.markAccessRequestsNotified(ids);
        this.results.set(admin.id, { at: Date.now(), ok: true });
      } catch (error) {
        const problem = classifySendError(error);
        this.results.set(admin.id, { at: Date.now(), ok: false, problem });
        this.opts.log(`Could not e-mail an administrator about new access requests (${problem})`);
      }
    }
    if (sent > 0) {
      this.failures = 0;
      this.retryAt = 0;
      this.lastSentAt = Date.now();
      this.opts.log(`E-mailed ${sent} administrator(s) about ${ids.length} new access request(s)`);
    } else if (this.closed) {
      return;
    } else if (tried === 0) {
      // Nobody gets these e-mails (turned off, or no SMTP server): the admin page lists them.
      this.store.markAccessRequestsNotified(ids);
      this.failures = 0;
      this.retryAt = 0;
    } else if (this.failures < this.retryMs.length) {
      // A new request does not bring the next try forward (each try signs in to the SMTP server).
      const wait = this.retryMs[this.failures++]!;
      this.retryAt = Date.now() + wait;
      clearTimeout(this.timer);
      this.timer = undefined;
      this.schedule(wait);
      return;
    } else {
      this.store.markAccessRequestsNotified(ids);
      this.failures = 0;
      this.retryAt = 0;
      this.opts.log("Gave up e-mailing the administrators about new access requests; they are listed on the admin page");
    }
    // Requests that came in while the e-mails were being sent.
    if (this.store.listUnnotifiedAccessRequests().length) this.schedule(this.delayMs);
  }

  /** Where an administrator's e-mails go, or why none can be sent. */
  private recipient(admin: User): Recipient | { problem: NoticeProblem } {
    if (!this.send) return { problem: "noSmtp" };
    if (admin.demo || !isEmail(admin.email)) return { problem: "invalid" };
    return { address: admin.email, timeZone: this.store.getSettings().defaultTimeZone };
  }

  private requestMail(requests: User[], to: Recipient, lang: Locale): NoticeMail {
    const app = t("common.appName", undefined, lang);
    const site = this.opts.publicUrl.host;
    const review = new URL("admin#requests", this.opts.publicUrl).href;
    const lines = [tn("admin.notices.mail.intro", requests.length, { site }, lang), ""];
    for (const request of requests.slice(0, MAX_LISTED)) {
      lines.push(`${showAddress(request.email)} (${when(request.createdAt, lang, to.timeZone)})`);
      lines.push(...quoteMessage(request.requestNote ?? ""));
      lines.push("");
    }
    if (requests.length > MAX_LISTED) lines.push(tn("admin.notices.mail.more", requests.length - MAX_LISTED, {}, lang), "");
    lines.push(t("admin.notices.mail.warning", undefined, lang), "");
    lines.push(t("admin.notices.mail.review", { url: review }, lang), "");
    lines.push("-- ", this.footer(lang));
    return {
      to: to.address,
      from: this.opts.from!,
      subject: tn("admin.notices.mail.subject", requests.length, { app }, lang),
      text: lines.join("\n"),
    };
  }

  private footer(lang: Locale): string {
    return t("admin.notices.mail.footer", { app: t("common.appName", undefined, lang), url: new URL("admin#requests", this.opts.publicUrl).href }, lang);
  }
}
