import { intlLocale, type Locale } from "@/i18n/config";

export function formatMoney(value: number, currency: string, locale: Locale = "en") {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso: string | null, locale: Locale = "en") {
  if (!iso) return "—";
  // Saudi time: on Vercel the server runs in UTC, which shifts dates near midnight.
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeZone: "Asia/Riyadh",
  }).format(new Date(iso));
}

/** VAT on a total, rounded to halalas. rate is a fraction (0.15 = 15%). */
export function vatOn(total: number, rate: number) {
  return Math.round(total * rate * 100) / 100;
}
