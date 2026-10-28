/**
 * Clarix is bilingual (Arabic / English). The language is a preference, not
 * part of the URL: it lives in the NEXT_LOCALE cookie (and, for signed-in
 * buyers, profiles.locale), so every existing link keeps working. See D-062.
 */
export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "ar";
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** No saved choice yet: follow the browser (Arabic first if it prefers Arabic). */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const first = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q === undefined ? 1 : Number(q) };
    })
    .filter((x) => x.tag && Number.isFinite(x.q))
    .sort((a, b) => b.q - a.q)
    .find((x) => x.tag.startsWith("ar") || x.tag.startsWith("en"));
  return first?.tag.startsWith("ar") ? "ar" : DEFAULT_LOCALE;
}

/** Intl locale tags: Arabic with Latin digits and the Gregorian calendar, as Saudi business documents use. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-US";
}
