/**
 * E-mails to administrators about new access requests (the waitlist), sent through the
 * operator's SMTP server. A fake sender records the e-mails instead of using SMTP.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { SMTPServer } from "smtp-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { t, tn } from "../../src/web/i18n/index.js";
import { isEmail } from "../../src/web/email.js";
import {
  classifySendError,
  MAX_LISTED,
  quoteMessage,
  RequestNotices,
  showAddress,
  smtpSender,
  smtpUrlProblem,
  smtpUserAddress,
  when,
  type NoticeMail,
} from "../../src/web/request-notices.js";
import { createWebApp, webOptionsFromEnv, type WebApp } from "../../src/web/server.js";
import { Browser, setBase } from "../helpers/web-client.js";

let web: WebApp;
let server: Server;
let base = "";
const PASSWORD = "correct horse battery";
const admin = new Browser();
const logs: string[] = [];
const sent: { mail: NoticeMail; at: number }[] = [];
/** What the next sends do: undefined sends, an error is thrown. */
let failWith: Error | undefined;
const fake = async (mail: NoticeMail) => {
  if (failWith) throw failWith;
  sent.push({ mail, at: Date.now() });
};
const smtpError = (code: string, responseCode?: number) => Object.assign(new Error(code), { code, ...(responseCode ? { responseCode } : {}) });

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  setBase(base);
  web = await createWebApp({
    publicUrl: new URL(base),
    host: "127.0.0.1",
    port: 0,
    dataDir: ":memory:",
    operator: { PADI_COGNITO_URL: "http://127.0.0.1:1/", PADI_AUTH_URL: "http://127.0.0.1:1/auth/api", PADI_LOGBOOK_URL: "http://127.0.0.1:1/api/Logbook" },
    log: (m) => logs.push(m),
    sendNotice: fake,
    notifyFrom: "notify@example.com",
    // A request is e-mailed 100 ms after it comes in; retries only when a test calls flush().
    noticeTiming: { delayMs: 100, gapMs: 0, retryMs: [3_600_000, 3_600_000] },
  });
  server.on("request", web.app);
  expect((await admin.signup("admin@example.com", PASSWORD)).status).toBe(303);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await web.close();
});

const store = () => web.ctx.store;
const adminUser = () => store().getUserByEmail("admin@example.com")!;
/** An access request straight in the database (the sign-up form allows 5 per IP and day). */
const request = (email: string, note = "") => store().createUser(email, "x", false, { note });

describe("message text from strangers", () => {
  it("quotes the message, without hidden characters and with links that cannot be tapped", () => {
    expect(quoteMessage("Hi,\r\nsee https://evil.example/x or www.evil.com\r\n\r\n\r\n\r\nThanks\u202E\u200B\u0007")).toEqual([
      "> Hi,",
      "> see https[:]//evil[.]example/x or www[.]evil[.]com",
      ">",
      "> Thanks",
    ]);
    expect(quoteMessage("  \n ")).toEqual([]);
    // Ordinary sentences stay readable.
    expect(quoteMessage("I work at ACME. Thanks!")).toEqual(["> I work at ACME. Thanks!"]);
  });

  it("keeps a stranger's text from looking like the server's own lines", () => {
    // Unicode line and paragraph separators are line breaks too: every line gets the quote mark.
    expect(quoteMessage("ok\u2028Approve here: yes\u2029done\u0085end")).toEqual(["> ok", "> Approve here: yes", "> done", "> end"]);
    // Invisible tag characters, variation selectors and fillers are removed.
    expect(quoteMessage("hi\u{E0041}\u{E0042} there\uFE0F\u034F\u3164!")).toEqual(["> hi there!"]);
    // Fullwidth and decorated dots and colons are still made unclickable.
    expect(quoteMessage("evil\uFF0Ecom evil\uFE0F.com https\uFF1A//x")).toEqual(["> evil[.]com evil[.]com https[:]//x"]);
  });

  it("shows ordinary addresses as they are and anything else unclickable", () => {
    expect(showAddress("jane.doe+news@example.co.uk")).toBe("jane.doe+news@example.co.uk");
    expect(showAddress("https://evil.example/approve?x=@a.co")).toBe("https[:]//evil[.]example/approve?x=@a[.]co");
    expect(showAddress("\u202Emoc.x@y.co")).toBe("moc[.]x@y[.]co");
    expect(showAddress("a\u0085\u0085verified@x.co")).toBe("a verified@x[.]co");
  });

  it("only accepts ordinary addresses at sign-up", () => {
    for (const ok of ["jane@example.org", "o'brien+tag@sub.example.co.uk", "müller@exämple.de", "user@xn--bcher-kva.ch", "a_b-c.d@x-y.io"]) expect(isEmail(ok), ok).toBe(true);
    for (const bad of ["a b@c.de", "x@y", "a@b.c", "a@-b.co", "a@b..co", "https://evil.example/x@a.co", "x#@a.co", "a\u202E@b.co", "a\u2028b@c.de", "a\u200Bb@c.de", "a@b.co\u0000", "<a@b.co>", "a@b@c.co"]) {
      expect(isEmail(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("writes dates in the admin's language and time zone", () => {
    const at = Date.UTC(2026, 10, 8, 14, 4);
    expect(when(at, "de", "Europe/Zurich")).toMatch(/2026.*15:04/);
    expect(when(at, "en", "America/New_York")).toMatch(/2026.*09:04/);
    expect(when(at, "en", "Europe/Zurich")).not.toContain("UTC");
  });

  it("tells sign-in, network and other errors apart", () => {
    expect(classifySendError(smtpError("EAUTH", 535))).toBe("auth");
    expect(classifySendError(smtpError("ECONNECTION"))).toBe("network");
    expect(classifySendError(smtpError("ETIMEDOUT"))).toBe("network");
    expect(classifySendError(smtpError("EENVELOPE", 550))).toBe("rejected");
    expect(classifySendError(new Error("boom"))).toBe("other");
  });
});

describe("e-mails about access requests", () => {
  it("is on by default", async () => {
    expect(adminUser().notifyRequests).toBe(true);
    const { html } = await admin.page("/admin");
    expect(html).toContain('<input type="checkbox" name="notify" checked>');
    expect(html).toContain("Sent to the address you sign in with: admin@example.com.");
    expect(html).toContain('formaction="/admin/notices/test"');
    expect(web.ctx.notices.status(adminUser()).address).toBe("admin@example.com");
  });

  it("sends nothing without an SMTP server, and the admin page says why", async () => {
    const notices = new RequestNotices({ store: store(), publicUrl: new URL(base), log: () => {} });
    expect(notices.status(adminUser()).problem).toBe("noSmtp");
    const plain = await createWebApp({ publicUrl: new URL(base), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: {}, log: () => {} });
    try {
      expect(plain.ctx.notices.status(adminUser()).problem).toBe("noSmtp");
      await plain.ctx.notices.sendTest(adminUser(), "en").then((r) => expect(r).toEqual({ ok: false, problem: "noSmtp" }));
    } finally {
      await plain.close();
    }
    expect(t("admin.notices.cannotSend", { reason: t("admin.notices.problem.noSmtp") })).toBe("No e-mail can be sent right now: no mail server is set up for this service (SMTP_URL).");
  });

  it("e-mails a request from the sign-up form to the admin's own address", async () => {
    const visitor = new Browser();
    expect((await visitor.signup("asker@example.com", PASSWORD, { note: "Jane from accounting, see https://example.org" })).status).toBe(200);
    await vi.waitFor(() => expect(sent).toHaveLength(1), { timeout: 3000 });
    const { mail } = sent[0]!;
    expect(mail.to).toBe("admin@example.com");
    expect(mail.subject).toBe("New access request for MCP for PADI");
    expect(mail.text).toContain(`Someone asked for an account on ${new URL(base).host}:`);
    const asked = store().getUserByEmail("asker@example.com")!.createdAt;
    expect(mail.text).toContain(`\nasker@example.com (${when(asked, "en", "UTC")})\n`);
    expect(mail.text).toContain("> Jane from accounting, see https[:]//example[.]org");
    expect(mail.text).toContain(`Approve or reject the requests here: ${base}/admin#requests`);
    expect(mail.text).toContain("not verified");
    // Reported once only.
    await web.ctx.notices.flush();
    expect(sent).toHaveLength(1);
    expect(store().listUnnotifiedAccessRequests()).toEqual([]);
    expect((await admin.page("/admin")).html).toContain("Last e-mail sent:");
  });

  it("puts requests that come together in one e-mail, and lists at most a few", async () => {
    sent.length = 0;
    for (let i = 1; i <= MAX_LISTED + 2; i++) request(`person${i}@example.com`, `Message ${i}`);
    await web.ctx.notices.flush();
    expect(sent).toHaveLength(1);
    const { mail } = sent[0]!;
    expect(mail.subject).toBe(`${MAX_LISTED + 2} new access requests for MCP for PADI`);
    expect(mail.text).toContain(`${MAX_LISTED + 2} people asked for an account`);
    expect(mail.text).toContain(`person${MAX_LISTED}@example.com`);
    expect(mail.text).not.toContain(`person${MAX_LISTED + 1}@example.com`);
    expect(mail.text).toContain("And 2 more requests.");
    store().rejectAllAccessRequests();
  });

  it("does not report requests that were answered before the e-mail went out", async () => {
    sent.length = 0;
    const early = request("early@example.com");
    store().rejectAccessRequest(early.id);
    await web.ctx.notices.flush();
    expect(sent).toHaveLength(0);
  });

  it("refuses addresses that look like links at sign-up, and defangs old ones in the e-mail", async () => {
    const visitor = new Browser();
    const res = await visitor.signup("https://evil.example/approve?x=@a.co", PASSWORD);
    expect(res.status).toBe(400);
    expect(store().getUserByEmail("https://evil.example/approve?x=@a.co")).toBeUndefined();
    sent.length = 0;
    // Saved by an older version, which checked addresses less strictly.
    request("https://evil.example/approve?x=@a.co");
    await web.ctx.notices.flush();
    expect(sent[0]!.mail.text).toContain("\nhttps[:]//evil[.]example/approve?x=@a[.]co (");
    expect(sent[0]!.mail.text).not.toContain("https://evil");
    store().rejectAllAccessRequests();
  });

  it("e-mails every administrator, and records the requests at the first success", async () => {
    const second = store().createUser("second-admin@example.com", "x", true);
    const seen: number[] = [];
    const notices = new RequestNotices({
      store: store(),
      publicUrl: new URL(base),
      log: () => {},
      from: "notify@example.com",
      send: async () => void seen.push(store().listUnnotifiedAccessRequests().length),
    });
    try {
      request("both@example.com");
      await notices.flush();
      // The first e-mail goes out while the request is unreported; the second after it was recorded.
      expect(seen).toEqual([1, 0]);
    } finally {
      await notices.close();
      store().deleteUser(second.id);
      store().rejectAllAccessRequests();
    }
  });

  it("never puts the stranger's text in the subject, and never logs addresses", async () => {
    sent.length = 0;
    request("subject-test@example.com", "Subject: fake\nBcc: victim@example.com");
    await web.ctx.notices.flush();
    expect(sent[0]!.mail.subject).toBe("New access request for MCP for PADI");
    expect(sent[0]!.mail.text).toContain("> Bcc: victim@example[.]com");
    expect(logs.filter((m) => /@/.test(m))).toEqual([]);
    store().rejectAllAccessRequests();
  });

  it("writes in the language the admin last used on the admin page", async () => {
    sent.length = 0;
    await admin.page("/admin?lang=it");
    expect(adminUser().lang).toBe("it");
    request("lingua@example.com");
    await web.ctx.notices.flush();
    const app = t("common.appName", undefined, "it");
    expect(sent[0]!.mail.subject).toBe(tn("admin.notices.mail.subject", 1, { app }, "it"));
    expect(sent[0]!.mail.text).toContain(t("admin.notices.mail.footer", { app, url: `${base}/admin#requests` }, "it"));
    await admin.page("/admin?lang=en");
    store().rejectAllAccessRequests();
  });

  it("can be turned off, and does not catch up later", async () => {
    sent.length = 0;
    const { csrf } = await admin.page("/admin");
    const off = await admin.post("/admin/notices", { _csrf: csrf });
    expect(off.status).toBe(303);
    expect(off.headers.get("location")).toBe("/admin?m=saved#requests");
    expect(adminUser().notifyRequests).toBe(false);
    expect((await admin.page("/admin")).html).toContain('<input type="checkbox" name="notify" >');
    request("quiet@example.com");
    await web.ctx.notices.flush();
    expect(sent).toHaveLength(0);
    // Turned on again: only new requests are e-mailed.
    expect((await admin.post("/admin/notices", { _csrf: csrf, notify: "on" })).status).toBe(303);
    expect(adminUser().notifyRequests).toBe(true);
    await web.ctx.notices.flush();
    expect(sent).toHaveLength(0);
    store().rejectAllAccessRequests();
  });

  it("refuses the form without the CSRF token", async () => {
    const res = await admin.post("/admin/notices", { _csrf: "wrong" });
    expect(res.headers.get("location")).toBe("/admin?m=csrf");
    expect(adminUser().notifyRequests).toBe(true);
  });

  it("is only for administrators", async () => {
    const user = new Browser();
    expect((await user.signup("plain@example.com", PASSWORD, { invite: store().createInvite(adminUser().id, "", 1) })).status).toBe(303);
    const { csrf } = await user.page("/account");
    const res = await user.post("/admin/notices", { _csrf: csrf, notify: "on" });
    expect(res.status).not.toBe(303);
    const test = await user.post("/admin/notices/test", { _csrf: csrf });
    expect(test.status).not.toBe(200);
    expect(store().getUserByEmail("plain@example.com")!.notifyRequests).toBe(true);
  });

  it("tries again when the SMTP server refuses, then gives up", async () => {
    sent.length = 0;
    failWith = smtpError("EAUTH", 535);
    request("retry@example.com");
    await web.ctx.notices.flush();
    expect(store().listUnnotifiedAccessRequests()).toHaveLength(1);
    const page = (await admin.page("/admin")).html;
    expect(page).toContain("The last e-mail could not be sent");
    // Two retries (as configured), then the request is given up.
    await web.ctx.notices.flush();
    expect(store().listUnnotifiedAccessRequests()).toHaveLength(1);
    await web.ctx.notices.flush();
    expect(store().listUnnotifiedAccessRequests()).toHaveLength(0);
    expect(logs.some((m) => m.startsWith("Gave up e-mailing"))).toBe(true);
    failWith = undefined;
    store().rejectAllAccessRequests();
  });

  it("sends a test e-mail in the admin's language", async () => {
    sent.length = 0;
    const { csrf } = await admin.page("/admin");
    const res = await admin.post("/admin/notices/test", { _csrf: csrf });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Test e-mail sent to admin@example.com.");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.mail.subject).toBe("Test e-mail from MCP for PADI");
    expect(sent[0]!.mail.to).toBe("admin@example.com");

    failWith = smtpError("ECONNECTION");
    const failed = await admin.post("/admin/notices/test", { _csrf: csrf });
    expect(await failed.text()).toContain("The test e-mail could not be sent:");
    failWith = undefined;
  });
});

describe("timing", () => {
  it("waits a moment, sends one e-mail for requests that come together, and keeps a gap", async () => {
    const mails: number[] = [];
    const notices = new RequestNotices({
      store: store(),
      publicUrl: new URL(base),
      log: () => {},
      from: "notify@example.com",
      send: async () => void mails.push(Date.now()),
      delayMs: 50,
      gapMs: 400,
    });
    try {
      const start = Date.now();
      request("t1@example.com");
      notices.requested();
      request("t2@example.com");
      notices.requested();
      await vi.waitFor(() => expect(mails).toHaveLength(1), { timeout: 2000 });
      expect(mails[0]! - start).toBeGreaterThanOrEqual(40);
      request("t3@example.com");
      notices.requested();
      await vi.waitFor(() => expect(mails).toHaveLength(2), { timeout: 3000 });
      expect(mails[1]! - mails[0]!).toBeGreaterThanOrEqual(380);
    } finally {
      await notices.close();
      store().rejectAllAccessRequests();
    }
  });

  it("does not let new requests shorten the wait before the next try", async () => {
    const tries: number[] = [];
    const notices = new RequestNotices({
      store: store(),
      publicUrl: new URL(base),
      log: () => {},
      from: "notify@example.com",
      send: async () => {
        tries.push(Date.now());
        throw smtpError("ECONNECTION");
      },
      delayMs: 20,
      gapMs: 0,
      retryMs: [1500, 1500],
    });
    try {
      request("r1@example.com");
      notices.requested();
      await vi.waitFor(() => expect(tries).toHaveLength(1), { timeout: 2000 });
      // New requests during the wait would otherwise trigger a try 20 ms later.
      for (let i = 2; i <= 4; i++) {
        request(`r${i}@example.com`);
        notices.requested();
        await new Promise((r) => setTimeout(r, 40));
      }
      expect(tries).toHaveLength(1);
      await vi.waitFor(() => expect(tries).toHaveLength(2), { timeout: 5000 });
      expect(tries[1]! - tries[0]!).toBeGreaterThanOrEqual(1450);
    } finally {
      await notices.close();
      store().rejectAllAccessRequests();
    }
  });

  it("reports requests left over from before a restart", async () => {
    // Requests waiting in the database and never e-mailed (the server stopped first).
    request("restart@example.com");
    const mails: NoticeMail[] = [];
    const notices = new RequestNotices({ store: store(), publicUrl: new URL(base), log: () => {}, from: "notify@example.com", send: async (m) => void mails.push(m), delayMs: 20 });
    try {
      notices.start();
      await vi.waitFor(() => expect(mails).toHaveLength(1), { timeout: 2000 });
      expect(mails[0]!.text).toContain("restart@example.com");
    } finally {
      await notices.close();
      store().rejectAllAccessRequests();
    }
  });

  it("sends nothing after close", async () => {
    const mails: NoticeMail[] = [];
    const notices = new RequestNotices({ store: store(), publicUrl: new URL(base), log: () => {}, from: "notify@example.com", send: async (m) => void mails.push(m), delayMs: 20 });
    request("closed@example.com");
    notices.requested();
    await notices.close();
    await new Promise((r) => setTimeout(r, 80));
    expect(mails).toHaveLength(0);
    store().rejectAllAccessRequests();
  });
});

describe("the operator's SMTP settings", () => {
  it("checks SMTP_URL and NOTIFY_FROM at startup, without showing the password", () => {
    expect(smtpUrlProblem("smtp://user:pass@mail.example.com:587")).toBeUndefined();
    expect(smtpUrlProblem("smtps://mail.example.com")).toBeUndefined();
    expect(smtpUrlProblem("http://mail.example.com")).toMatch(/smtp:\/\/ or smtps:\/\//);
    const bad = smtpUrlProblem("not a url with secret-pass");
    expect(bad).toBeTruthy();
    expect(bad).not.toContain("secret-pass");
    const env = (extra: Record<string, string>) => ({ PUBLIC_URL: "https://padi.example.com", ...extra });
    expect(() => webOptionsFromEnv(env({ SMTP_URL: "ftp://u:secret-pass@x" }), {}, () => {})).toThrow(/smtp/);
    expect(() => webOptionsFromEnv(env({ NOTIFY_FROM: "not an address" }), {}, () => {})).toThrow(/NOTIFY_FROM/);
    const ok = webOptionsFromEnv(env({ SMTP_URL: "smtp://u:p@mail.example.com:587", NOTIFY_FROM: "MCP for PADI <noreply@example.com>" }), {}, () => {});
    expect(ok).toMatchObject({ smtpUrl: "smtp://u:p@mail.example.com:587", notifyFrom: "MCP for PADI <noreply@example.com>" });
    expect(webOptionsFromEnv(env({}), {}, () => {}).smtpUrl).toBeUndefined();
    // A sender is needed: the SMTP user name when it is an address, or NOTIFY_FROM.
    expect(webOptionsFromEnv(env({ SMTP_URL: "smtps://notify%40example.com:p@mail.example.com:465" }), {}, () => {}).notifyFrom).toBeUndefined();
    for (const user of ["apikey", "AKIAEXAMPLE"]) {
      expect(() => webOptionsFromEnv(env({ SMTP_URL: `smtps://${user}:secret-pass@mail.example.com:465` }), {}, () => {})).toThrow(/NOTIFY_FROM/);
    }
  });

  it("never sends as the administrator's own address", async () => {
    // Relays such as SES or SendGrid refuse unknown senders: the server does not start without one.
    await expect(
      createWebApp({ publicUrl: new URL(base), host: "127.0.0.1", port: 0, dataDir: ":memory:", operator: {}, smtpUrl: "smtps://apikey:secret-pass@127.0.0.1:1", log: () => {} }),
    ).rejects.toThrow(/NOTIFY_FROM/);
    expect(() => new RequestNotices({ store: store(), publicUrl: new URL(base), log: () => {}, send: fake })).toThrow(/sender/);
  });

  it("sends from the SMTP user when it is an address and NOTIFY_FROM is not set", async () => {
    expect(smtpUserAddress("smtp://notify%40example.com:p@mail.example.com:587")).toBe("notify@example.com");
    expect(smtpUserAddress("smtp://notify:p@mail.example.com:587")).toBeUndefined();
    const mails: NoticeMail[] = [];
    const sender = await createWebApp({
      publicUrl: new URL(base),
      host: "127.0.0.1",
      port: 0,
      dataDir: ":memory:",
      operator: {},
      smtpUrl: "smtp://notify%40example.com:p@127.0.0.1:1",
      sendNotice: async (mail) => void mails.push(mail),
      log: () => {},
    });
    try {
      const adminOfIt = sender.ctx.store.createUser("boss@example.com", "x", true);
      expect(await sender.ctx.notices.sendTest(adminOfIt, "en")).toEqual({ ok: true, address: "boss@example.com" });
      expect(mails[0]).toMatchObject({ to: "boss@example.com", from: "notify@example.com" });
    } finally {
      await sender.close();
    }
  });
});

describe("sending through the operator's SMTP server", () => {
  /** Sign-ins the test SMTP server saw, and whether each one was encrypted. */
  const signIns: { password: string; secure: boolean }[] = [];

  it("signs in with the SMTP_URL details and sends an automatic plain-text e-mail", async () => {
    const received: { from: string; to: string[]; raw: string }[] = [];
    const smtp = new SMTPServer({
      // A server without TLS: only a URL that allows clear text (?requireTLS=false) may use it.
      disabledCommands: ["STARTTLS"],
      allowInsecureAuth: true,
      onAuth(auth, session, cb) {
        signIns.push({ password: auth.password ?? "", secure: session.secure });
        if (auth.username === "notify" && auth.password === "smtp-test-password") return cb(null, { user: "notify" });
        cb(Object.assign(new Error("Authentication failed"), { responseCode: 535 }));
      },
      onData(stream, session, cb) {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => {
          received.push({ from: String(session.envelope.mailFrom && session.envelope.mailFrom.address), to: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(chunks).toString() });
          cb();
        });
      },
    });
    await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", () => r()));
    const port = (smtp.server.address() as AddressInfo).port;
    try {
      // smtp:// without STARTTLS: refused before the password is sent (someone on the network
      // could have removed the STARTTLS offer).
      const clear = await smtpSender(`smtp://notify:smtp-test-password@127.0.0.1:${port}`)({ to: "admin@example.com", from: "notify@example.com", subject: "x", text: "x" }).catch((e: unknown) => e);
      expect((clear as { code?: string }).code).toBe("ETLS");
      expect(classifySendError(clear)).toBe("network");
      expect(signIns).toEqual([]);
      expect(received).toEqual([]);

      // The operator can allow clear text on purpose (a mail server on the same machine).
      await smtpSender(`smtp://notify:smtp-test-password@127.0.0.1:${port}?requireTLS=false`)({ to: "admin@example.com", from: "notify@example.com", subject: "New access request for MCP for PADI", text: "Someone asked.\n> hi" });
      expect(received).toHaveLength(1);
      expect(received[0]!.from).toBe("notify@example.com");
      expect(received[0]!.to).toEqual(["admin@example.com"]);
      expect(received[0]!.raw).toContain("Subject: New access request for MCP for PADI");
      expect(received[0]!.raw).toMatch(/Auto-Submitted: auto-generated/i);
      expect(received[0]!.raw).toContain("Content-Type: text/plain");

      const refused = await smtpSender(`smtp://notify:wrong@127.0.0.1:${port}?requireTLS=false`)({ to: "admin@example.com", from: "notify@example.com", subject: "x", text: "x" }).catch((e: unknown) => e);
      expect(classifySendError(refused)).toBe("auth");
    } finally {
      await new Promise<void>((r) => smtp.close(() => r()));
    }
  });
});
