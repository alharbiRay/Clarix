import type { Locale } from "@/i18n/config";

const MINUS = "−";

/** Response-time style durations. Arabic uses س (hours) and يوم/أيام (days). */
export function formatHours(hours: number | null, locale: Locale = "en"): string {
  if (hours === null) return "—";
  const ar = locale === "ar";
  if (hours < 1) return ar ? "أقل من ساعة" : "< 1 h";
  if (hours < 10) return `${Math.round(hours * 10) / 10} ${ar ? "س" : "h"}`;
  if (hours < 48) return `${Math.round(hours)} ${ar ? "س" : "h"}`;
  return `${Math.round((hours / 24) * 10) / 10} ${ar ? "يوم" : "days"}`;
}

/** Signed relative change (+150%, −12%); null when there's nothing to compare against. */
export function formatChange(change: number | null): string | null {
  if (change === null) return null;
  const pct = Math.round(change * 100);
  if (pct === 0) return "0%";
  return pct > 0 ? `+${pct}%` : `${MINUS}${Math.abs(pct)}%`;
}

export function formatPct(ratio: number | null): string {
  if (ratio === null) return "—";
  const pct = Math.round(ratio * 100);
  return pct < 0 ? `${MINUS}${Math.abs(pct)}%` : `${pct}%`;
}

/**
 * "SAR 12,341" — headline figures drop the halalas. Uses a true minus sign.
 * Latin digits and the currency code in both languages (as Saudi invoices do).
 */
export function formatMoneyWhole(value: number, currency: string): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded).toLocaleString("en-US");
  return `${rounded < 0 ? MINUS : ""}${currency} ${abs}`;
}

const MONTHS: Record<Locale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ar: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
};

export function formatMonthLabel(key: string, withYear = false, locale: Locale = "en"): string {
  const [y, m] = key.split("-").map(Number);
  const name = MONTHS[locale][m - 1];
  return withYear ? `${name} ${y}` : name;
}
