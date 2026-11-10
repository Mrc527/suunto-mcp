/**
 * Translations for the web pages.
 *
 * The language of a request is chosen once (?lang=, the language cookie, then Accept-Language)
 * and kept in an AsyncLocalStorage for the rest of the request, so any code that renders a page
 * can call t() without passing the language around.
 *
 *   t("auth.signIn")                              plain text (escaped by html`` like any value)
 *   t("auth.minChars", { n: 10 })                 placeholders: {n}
 *   th("connect.claude.step1", { button: ... })   text with markup (<strong>, <code>, ...):
 *                                                 the message is trusted, values are escaped
 *   tn("admin.users", count)                      plurals: admin.users.one / admin.users.other
 *
 * English (./en) is the source and the fallback for a missing translation.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";
import { escapeHtml, SafeHtml } from "../html.js";
import { en, type MessageKey } from "./en/index.js";
import { messages as de } from "./de/index.js";
import { messages as es } from "./es/index.js";
import { messages as fr } from "./fr/index.js";
import { messages as it } from "./it/index.js";
import { messages as zh } from "./zh/index.js";
import { DEFAULT_LOCALE, HTML_LANG, isLocale, negotiate, type Locale } from "./locales.js";

export { DEFAULT_LOCALE, HTML_LANG, LOCALE_NAMES, LOCALES, isLocale, negotiate, type Locale } from "./locales.js";
export type { MessageKey } from "./en/index.js";

export const CATALOGS: Record<Locale, Partial<Record<MessageKey, string>>> = { en, it, de, fr, es, zh };

const store = new AsyncLocalStorage<Locale>();

/** The language of the current request (English outside a request). */
export function locale(): Locale {
  return store.getStore() ?? DEFAULT_LOCALE;
}

/** Run `fn` with a language (tests, scripts, and the request middleware). */
export function withLocale<T>(lang: Locale, fn: () => T): T {
  return store.run(lang, fn);
}

function message(key: MessageKey, lang: Locale): string {
  const text = CATALOGS[lang][key] ?? en[key];
  if (text === undefined) throw new Error(`Unknown message key: ${key}`);
  return text;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** Plain text. Messages with markup must use th() (checked outside production). */
export function t(key: MessageKey, params?: Record<string, string | number>, lang: Locale = locale()): string {
  const text = message(key, lang);
  if (process.env.NODE_ENV !== "production" && /<[a-z/!]/i.test(text)) {
    throw new Error(`Message ${key} contains markup: use th()`);
  }
  if (!params) return text;
  return text.replace(PLACEHOLDER, (all, name: string) => (name in params ? String(params[name]) : all));
}

/** Text with markup from the (trusted) message; values are escaped unless they are SafeHtml. */
export function th(key: MessageKey, params?: Record<string, string | number | SafeHtml>, lang: Locale = locale()): SafeHtml {
  const text = message(key, lang);
  return new SafeHtml(
    text.replace(PLACEHOLDER, (all, name: string) => {
      if (!params || !(name in params)) return all;
      const value = params[name]!;
      return value instanceof SafeHtml ? value.value : escapeHtml(value);
    }),
  );
}

/** Keys that have plural forms (key.one, key.other, ...). */
type PluralBase = MessageKey extends infer K ? (K extends `${infer B}.other` ? B : never) : never;

/** A plural form: `${key}.${Intl.PluralRules category}`, falling back to `${key}.other`. */
export function tn(key: PluralBase, count: number, params: Record<string, string | number> = {}, lang: Locale = locale()): string {
  const category = new Intl.PluralRules(HTML_LANG[lang]).select(count);
  const full = `${key}.${category}` as MessageKey;
  const chosen = (CATALOGS[lang][full] ?? en[full]) !== undefined ? full : (`${key}.other` as MessageKey);
  return t(chosen, { n: count, ...params }, lang);
}

/** Texts used by the page script (keys starting with "js."), for the current language. */
export function clientMessages(lang: Locale = locale()): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(en) as MessageKey[]) {
    if (key.startsWith("common.js.")) out[key.slice("common.js.".length)] = message(key, lang);
  }
  return out;
}

export interface LocaleCookie {
  name: string;
  serialize: (value: string) => string;
}

/**
 * Chooses the language of each request: ?lang= (also remembered in the cookie), the cookie,
 * then the browser's Accept-Language.
 */
export function localeMiddleware(cookie: LocaleCookie, readCookie: (header: string | undefined) => string | undefined): RequestHandler {
  return (req, res, next) => {
    let lang: Locale | undefined;
    const asked = req.query?.lang;
    if (isLocale(asked)) {
      lang = asked;
      const existing = res.getHeader("set-cookie");
      const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
      res.setHeader("set-cookie", [...list, cookie.serialize(asked)]);
    }
    if (!lang) {
      const saved = readCookie(req.headers.cookie);
      if (isLocale(saved)) lang = saved;
    }
    lang ??= negotiate(req.headers["accept-language"]);
    res.vary("Accept-Language");
    res.vary("Cookie");
    res.setHeader("content-language", HTML_LANG[lang]);
    store.run(lang, () => next());
  };
}
