/**
 * CSV export for reports. Generated on the server from the same Report the
 * page shows. Excel-friendly: UTF-8 with a BOM (so Arabic isn't garbled),
 * CRLF line endings, RFC 4180 quoting, and text cells that would start a
 * formula are prefixed with an apostrophe (CSV injection — supplier names
 * and RFQ titles are user-controlled).
 */
import type { Report } from "@/lib/reports";
import { CATEGORY_LABELS, type Category } from "@/lib/reports/categories";
import { translatorFor } from "@/i18n/translator";
import type { Locale } from "@/i18n/config";
import { formatMonthLabel } from "@/lib/metrics/format";

export const CSV_SECTIONS = ["awards", "monthly", "suppliers", "categories"] as const;
export type CsvSection = (typeof CSV_SECTIONS)[number];

type Cell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2) : "";
  let s = String(v);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (key: string, locale: Locale) =>
  locale === "en" ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}` : formatMonthLabel(key, true, locale);

const pct = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 100);

/** Headers, categories and decision words in the viewer's language; data as recorded. */
export function reportCsv(report: Report, section: CsvSection, locale: Locale = "en"): string {
  const c = report.currency;
  const t = translatorFor(locale, "csv");
  const tc = translatorFor(locale, "reports.categories");
  const categoryKey = (label: string) => (Object.keys(CATEGORY_LABELS) as Category[]).find((k) => CATEGORY_LABELS[k] === label);
  const category = (label: string) => {
    const k = categoryKey(label);
    return k ? tc(k) : label;
  };
  switch (section) {
    case "monthly":
      return toCsv([
        [t("month"), t("currency"), t("spend"), t("savings"), t("posSent")],
        // "Sep 2026", not "2026-09" (Excel turns that into a date).
        ...report.months.map((m) => [monthLabel(m.month, locale), c, m.spend, m.savings, String(m.awarded)]),
      ]);
    case "suppliers":
      return toCsv([
        [t("supplier"), t("invited"), t("quoted"), t("responseRate"), t("won"), t("decided"), t("winRate"), t("posSentRange"), t("currency"), t("spend"), t("savingsDelivered"), t("priceVsLowest")],
        ...report.suppliers.map((s) => [
          s.label,
          String(s.invited),
          String(s.quoted),
          pct(s.responseRate),
          String(s.won),
          String(s.decided),
          pct(s.winRate),
          String(s.posSent),
          c,
          s.spend,
          s.savings,
          pct(s.avgPriceVsLowest),
        ]),
      ]);
    case "categories":
      return toCsv([
        [t("category"), t("currency"), t("spend"), t("share"), t("lineItems")],
        ...report.categories.map((k) => [tc(k.category), c, k.spend, pct(k.share), String(k.lines)]),
      ]);
    case "awards":
    default:
      return toCsv([
        [t("poDate"), t("rfq"), t("supplier"), t("categories"), t("currency"), t("totalExVat"), t("baseline"), t("savings"), t("savingsPct"), t("decision")],
        ...report.awards.map((a) => [
          a.awardedOn,
          a.title,
          a.supplier,
          a.categories.map(category).join(locale === "ar" ? "؛ " : "; "),
          c,
          a.total,
          a.baseline,
          a.basis === "average_of_other_quotes" ? a.savings : null,
          pct(a.savingsPct),
          a.automatic ? t("automatic") : t("manual"),
        ]),
      ]);
  }
}

export function csvFilename(report: Report, section: CsvSection) {
  return `clarix-${section}-${report.filters.from}-to-${report.filters.to}.csv`;
}
