/**
 * Translations outside a page request (emails, server actions, background
 * jobs, tests): plain functions over the message files, no request context.
 * Pages and components use next-intl's getTranslations / useTranslations.
 */
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { isLocale, type Locale } from "@/i18n/config";

export const MESSAGES = { en, ar } as const;

export function messagesFor(locale: Locale) {
  return MESSAGES[locale];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function translatorFor(locale: Locale, namespace: string): (key: string, values?: Record<string, any>) => string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createTranslator({ locale, messages: MESSAGES[locale] as any, namespace: namespace as any }) as any;
}

/**
 * Which language to write to a supplier in: their saved preference, else
 * Arabic if their name is written in Arabic, else the buyer's language.
 */
export function supplierLanguage(input: {
  preferred?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  buyerLocale?: string | null;
}): Locale {
  if (isLocale(input.preferred)) return input.preferred;
  if (/[؀-ۿ]/.test(`${input.companyName ?? ""} ${input.contactName ?? ""}`)) return "ar";
  return isLocale(input.buyerLocale) ? input.buyerLocale : "en";
}
