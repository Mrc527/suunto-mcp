/**
 * The languages of the web pages and how a visitor's language is chosen.
 */

export const LOCALES = ["en", "it", "de", "fr", "es", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Each language's own name, for the language menu. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  it: "Italiano",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  zh: "简体中文",
};

/** The value of <html lang> (Chinese is Simplified Chinese). */
export const HTML_LANG: Record<Locale, string> = { en: "en", it: "it", de: "de", fr: "fr", es: "es", zh: "zh-Hans" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Map a language tag (en-GB, zh-Hant-TW, ...) to one of our languages. */
export function localeOfTag(tag: string): Locale | undefined {
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return isLocale(primary) ? primary : undefined;
}

/** The best of our languages for an Accept-Language header (RFC 9110 quality values). */
export function negotiate(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .slice(0, 1000)
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([0-9.]+)\s*$/i.exec(p)?.[1]).find(Boolean);
      return { tag, q: q === undefined ? 1 : Number(q), index };
    })
    .filter((x) => x.tag && x.tag !== "*" && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    const locale = localeOfTag(tag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}
