/**
 * The welcome e-mail to a person whose access request was approved (sent by request-notices.ts):
 * a plain-text part and an HTML part with the same texts, in the person's language.
 *
 * The HTML is written for mail apps, which support much less than browsers: a layout of tables,
 * styles inline (a <style> block only adds dark mode and narrow screens, where it works), a
 * "bulletproof" button (a coloured table cell around the link), and the logo as an image inside
 * the e-mail (cid:), because many mail apps block images from the web. The texts are the same
 * translated keys as the plain text: list markers ("1. ", "- ") and the colon at the end of a
 * heading are left out, the addresses of pages become links, and the MCP address (for AI apps,
 * not a page to open) is shown as code. Every value is HTML-escaped. Nothing in it was typed by
 * the person.
 *
 * Like the footer of every page, it ends with the line that says the service is not made by
 * Suunto and that Suunto is a trademark of Suunto Oy.
 */

import { ICON_PNG } from "./brand-assets.js";
import { escapeHtml } from "../util/text.js";
import { HTML_LANG, t, type Locale } from "./i18n/index.js";
import { OPERATOR_NAME } from "./operator.js";

export const LOGO_CID = "logo@mcp-for-suunto";

export interface WelcomeMail {
  subject: string;
  text: string;
  html: string;
  /** Images the HTML shows (cid:), attached inline. */
  inline: { cid: string; filename: string; contentType: string; content: Buffer }[];
}

/** Single quotes only: it goes into style="..." attributes. */
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const ACCENT = "#0071e3";

/** A heading from a text that ends with a colon ("To get started:"): without it. */
const heading = (s: string) => s.replace(/[\s ]*[:：]\s*$/, "");
/** A list item without its marker ("1. ", "- "). */
const item = (s: string) => s.replace(/^\s*(?:\d+\.|-)\s+/, "");

/** Escaped text, with the given page addresses turned into links. */
function linked(text: string, urls: string[]): string {
  let out = escapeHtml(text);
  for (const url of urls) {
    const e = escapeHtml(url);
    out = out.split(e).join(`<a href="${e}" class="link" style="color:${ACCENT};text-decoration:underline;">${e}</a>`);
  }
  return out;
}

/**
 * Escaped text, with the given address shown as code on a line of its own (easy to copy, not a
 * page to open).
 */
function coded(text: string, value: string): string {
  const e = escapeHtml(value);
  return escapeHtml(text)
    .split(e)
    .join(
      `<br><span class="code" style="display:inline-block;margin-top:6px;font-family:${MONO};font-size:14px;line-height:1.4;background:#f5f5f7;color:#1d1d1f;border-radius:6px;padding:4px 8px;word-break:break-all;">${e}</span>`,
    );
}

export function welcomeMail(lang: Locale, publicUrl: URL): WelcomeMail {
  const app = t("common.appName", undefined, lang);
  const at = (path: string) => new URL(path, publicUrl).href;
  const login = at("login");
  const account = at("account");
  const terms = at("terms");
  const mcp = at("mcp");
  const subject = t("admin.welcome.subject", { app }, lang);
  const texts = {
    hello: t("admin.welcome.hello", undefined, lang),
    approved: t("admin.welcome.approved", { app }, lang),
    next: t("admin.welcome.next", undefined, lang),
    step1: t("admin.welcome.step1", { url: account }, lang),
    step2: t("admin.welcome.step2", { url: mcp }, lang),
    notes: t("admin.welcome.notes", undefined, lang),
    free: t("admin.welcome.free", { app }, lang),
    risk: t("admin.welcome.risk", { operator: OPERATOR_NAME }, lang),
    terms: t("admin.welcome.terms", { url: terms }, lang),
    questions: t("admin.welcome.questions", undefined, lang),
    button: t("auth.signIn.button", undefined, lang),
    disclaimer: t("common.footer.disclaimer", undefined, lang),
  };

  const text = [
    texts.hello,
    "",
    texts.approved,
    login,
    "",
    texts.next,
    texts.step1,
    texts.step2,
    "",
    texts.notes,
    texts.free,
    texts.risk,
    texts.terms,
    "",
    texts.questions,
    "",
    "-- ",
    app,
    publicUrl.href,
    "",
    texts.disclaimer,
  ].join("\n");

  const p = (inner: string, extra = "") => `<p class="text" style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.55;color:#1d1d1f;${extra}">${inner}</p>`;
  const step = (n: number, body: string) => `
            <tr>
              <td valign="top" width="40" style="padding:0 0 14px;">
                <div class="num" style="font-family:${FONT};width:28px;height:28px;border-radius:14px;background:${ACCENT};color:#ffffff;font-size:14px;font-weight:600;line-height:28px;text-align:center;">${n}</div>
              </td>
              <td valign="top" class="text" style="padding:3px 0 14px;font-family:${FONT};font-size:15px;line-height:1.55;color:#1d1d1f;">${body}</td>
            </tr>`;
  const note = (body: string) => `
              <tr>
                <td valign="top" width="18" class="muted" style="padding:0 0 8px;font-size:15px;line-height:1.5;color:#6e6e73;">&#8226;</td>
                <td valign="top" class="muted" style="padding:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.5;color:#424245;">${body}</td>
              </tr>`;

  const html = `<!doctype html>
<html lang="${HTML_LANG[lang]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .bg { background:#000000 !important; }
    .card { background:#1c1c1e !important; }
    .text, .brand { color:#f5f5f7 !important; }
    .muted { color:#aeaeb2 !important; }
    .note, .code { background:#2c2c2e !important; }
    .code { color:#f5f5f7 !important; }
    .link { color:#2997ff !important; }
    .footer, .footer a { color:#8e8e93 !important; }
  }
  @media (max-width: 600px) {
    .pad { padding:28px 22px !important; }
    h1.text { font-size:23px !important; }
    .code { font-size:13px !important; padding:4px 6px !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#f5f5f7;font-family:${FONT};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(texts.approved)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#f5f5f7;font-family:${FONT};">
    <tr>
      <td align="center" style="padding:32px 12px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 6px 18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td style="padding-right:12px;"><img src="cid:${LOGO_CID}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;"></td>
                <td class="brand" style="font-family:${FONT};font-size:17px;font-weight:600;color:#1d1d1f;">${escapeHtml(app)}</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td class="card pad" style="background:#ffffff;border-radius:20px;padding:40px 44px;">
              <h1 class="text" style="margin:0 0 20px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.01em;color:#1d1d1f;">${escapeHtml(subject)}</h1>
              ${p(escapeHtml(texts.hello))}
              ${p(escapeHtml(texts.approved), "margin-bottom:24px;")}
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
                <tr>
                  <td align="center" style="border-radius:999px;background:${ACCENT};">
                    <a href="${escapeHtml(login)}" style="display:inline-block;padding:13px 30px;font-family:${FONT};font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(texts.button)}</a>
                  </td>
                </tr>
              </table>
              <h2 class="text" style="margin:0 0 16px;font-family:${FONT};font-size:18px;line-height:1.3;font-weight:600;color:#1d1d1f;">${escapeHtml(heading(texts.next))}</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${step(1, linked(item(texts.step1), [account]))}${step(2, coded(item(texts.step2), mcp))}
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 26px;">
                <tr>
                  <td class="note" style="background:#f5f5f7;border-radius:14px;padding:18px 20px 12px;">
                    <p class="text" style="margin:0 0 10px;font-family:${FONT};font-size:14px;font-weight:600;color:#1d1d1f;">${escapeHtml(heading(texts.notes))}</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${note(escapeHtml(item(texts.free)))}${note(escapeHtml(item(texts.risk)))}${note(linked(item(texts.terms), [terms]))}
                    </table>
                  </td>
                </tr>
              </table>
              ${p(escapeHtml(texts.questions), "margin:0;")}
            </td>
          </tr>
          <tr>
            <td class="footer" align="center" style="padding:22px 6px 0;font-family:${FONT};font-size:12px;line-height:1.5;color:#86868b;">
              ${escapeHtml(app)} &middot; <a href="${escapeHtml(publicUrl.href)}" style="color:#86868b;text-decoration:underline;">${escapeHtml(publicUrl.host)}</a>
              <br>${escapeHtml(texts.disclaimer)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject,
    text,
    html,
    inline: [{ cid: LOGO_CID, filename: "logo.png", contentType: "image/png", content: ICON_PNG[180]! }],
  };
}
