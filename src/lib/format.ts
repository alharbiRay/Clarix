import { intlLocale, type Locale } from "@/i18n/config";

/**
 * "SAR 14,547.50" in both languages: Western digits and the currency code, as
 * Saudi invoices print them and as the dashboard/report figures do
 * (formatMoneyWhole). The locale argument is kept for call sites.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatMoney(value: number, currency: string, locale: Locale = "en") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso: string | null, locale: Locale = "en") {
  if (!iso) return "—";
  // Saudi time: on Vercel the server runs in UTC, which shifts dates near midnight.
  // Arabic: "22 أكتوبر 2026" (ar-SA's medium style is all digits with direction marks).
  const style: Intl.DateTimeFormatOptions =
    locale === "ar" ? { day: "numeric", month: "long", year: "numeric" } : { dateStyle: "medium" };
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...style,
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso));
}

/** A VAT rate (fraction) as a percentage for display, up to 2 decimals: 0.0725 → 7.25. */
export function vatPercent(rate: number) {
  return Math.round(rate * 10000) / 100;
}

/** 0–50 with at most two decimals. Tolerates float noise (1.15 * 100 = 114.99999999999999). */
export function isValidVatPercent(percent: number) {
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 50) return false;
  return Math.abs(percent * 100 - Math.round(percent * 100)) < 1e-6;
}

/** VAT on a total, rounded to halalas. rate is a fraction (0.15 = 15%). */
export function vatOn(total: number, rate: number) {
  return Math.round(total * rate * 100) / 100;
}
