/**
 * CSV export for reports. Generated on the server from the same Report the
 * page shows. Excel-friendly: UTF-8 with a BOM (so Arabic isn't garbled),
 * CRLF line endings, RFC 4180 quoting, and text cells that would start a
 * formula are prefixed with an apostrophe (CSV injection — supplier names
 * and RFQ titles are user-controlled).
 */
import type { Report } from "@/lib/reports";

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
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

const pct = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 100);

export function reportCsv(report: Report, section: CsvSection): string {
  const c = report.currency;
  switch (section) {
    case "monthly":
      return toCsv([
        ["Month", "Currency", "Spend", "Savings", "POs sent"],
        // "Sep 2026", not "2026-09" (Excel turns that into a date).
        ...report.months.map((m) => [monthLabel(m.month), c, m.spend, m.savings, String(m.awarded)]),
      ]);
    case "suppliers":
      return toCsv([
        ["Supplier", "Invited", "Quoted", "Response rate %", "Won (RFQs created in range)", "Decided", "Win rate %", "POs sent in range", "Currency", "Spend", "Savings delivered", "Avg. price vs lowest %"],
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
        ["Category", "Currency", "Spend", "Share %", "Line items"],
        ...report.categories.map((k) => [k.label, c, k.spend, pct(k.share), String(k.lines)]),
      ]);
    case "awards":
    default:
      return toCsv([
        ["PO date", "RFQ", "Supplier", "Categories", "Currency", "Total", "Baseline (avg. other quotes)", "Savings", "Savings %", "Decision"],
        ...report.awards.map((a) => [
          a.awardedOn,
          a.title,
          a.supplier,
          a.categories.join("; "),
          c,
          a.total,
          a.baseline,
          a.basis === "average_of_other_quotes" ? a.savings : null,
          pct(a.savingsPct),
          a.automatic ? "Automatic" : "Manual",
        ]),
      ]);
  }
}

export function csvFilename(report: Report, section: CsvSection) {
  return `clarix-${section}-${report.filters.from}-to-${report.filters.to}.csv`;
}
