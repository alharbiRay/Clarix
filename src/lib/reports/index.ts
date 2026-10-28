/**
 * Reports: spend, savings, suppliers, categories and auto-approval over a
 * date range, optionally for one supplier. Built entirely from the Phase 3
 * metrics module (savings, monthly series, spend by supplier) and the Phase 4
 * scorecard (supplier metrics) — no calculation is repeated here, only
 * filtering and grouping. See docs/METRICS.md.
 *
 * Dates are Saudi calendar days (UTC+3), like the rest of the metrics.
 */
import {
  dayKey,
  measuredSavings,
  monthBefore,
  monthKeysBetween,
  primaryCurrency,
  savingsSeriesForMonths,
  spendBySupplier,
  type MetricsRfq,
  type RfqSavings,
  type SeriesPoint,
} from "@/lib/metrics";
import { supplierMetrics } from "@/lib/scorecard";
import { CATEGORY_LABELS, categorizeItem, type Category } from "@/lib/reports/categories";

export const MAX_RANGE_MONTHS = 36;

export interface ReportFilters {
  /** "YYYY-MM-DD", inclusive. */
  from: string;
  /** "YYYY-MM-DD", inclusive. */
  to: string;
  /** Supplier key (profile id, else label), or null for all suppliers. */
  supplier: string | null;
}

export interface SupplierRow {
  key: string;
  label: string;
  quoted: number;
  invited: number;
  /** Purchase orders sent to them in the range (the same population as spend). */
  posSent: number;
  /** Scorecard: RFQs created in the range that they won, out of those decided. */
  won: number;
  decided: number;
  winRate: number | null;
  spend: number;
  savings: number;
  /** Mean (their total − lowest) / lowest; 0 = always cheapest. */
  avgPriceVsLowest: number | null;
  responseRate: number | null;
}

export interface CategoryRow {
  category: Category;
  label: string;
  spend: number;
  lines: number;
  share: number;
}

export interface AwardRow {
  rfqId: string;
  title: string;
  /** Day the PO went out (Saudi time). */
  awardedOn: string;
  supplier: string;
  supplierKey: string;
  total: number | null;
  baseline: number | null;
  savings: number;
  savingsPct: number | null;
  basis: RfqSavings["basis"];
  automatic: boolean;
  categories: string[];
}

export interface Report {
  filters: ReportFilters;
  currency: string;
  months: SeriesPoint[];
  /** First/last months only partly inside the range (e.g. from the 15th). */
  partialMonths: string[];
  totals: {
    spend: number;
    savings: number;
    /** Spend the savings are measured against (awards with competing quotes). */
    measuredBaseline: number;
    savingsPct: number | null;
    awards: number;
    unmeasurable: number;
  };
  autoApproval: { decided: number; automatic: number; rate: number | null };
  suppliers: SupplierRow[];
  categories: CategoryRow[];
  awards: AwardRow[];
  /** Awards in the range in another currency, left out of the money figures. */
  excludedOtherCurrency: number;
  supplierOptions: { key: string; label: string }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE_RE.test(s) || s < "2000-01-01") return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function shiftMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** Default range: the start of the month five months ago, through today. */
export function defaultFilters(now: Date): ReportFilters {
  return { from: `${monthBefore(now, 5)}-01`, to: dayKey(now), supplier: null };
}

/** Reads ?from=&to=&supplier= leniently: bad values fall back to the defaults. */
export function parseReportFilters(params: Record<string, string | string[] | undefined>, now: Date): ReportFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const defaults = defaultFilters(now);
  let from = isRealDate(first(params.from)) ? first(params.from)! : defaults.from;
  let to = isRealDate(first(params.to)) ? first(params.to)! : defaults.to;
  if (from > to) [from, to] = [to, from];
  const earliest = shiftMonths(to, -MAX_RANGE_MONTHS);
  if (from < earliest) from = earliest;
  const supplier = first(params.supplier)?.trim() || null;
  return { from, to, supplier: supplier && supplier.length <= 200 ? supplier : null };
}

function inviteOf(rfq: MetricsRfq, quoteId: string | null) {
  const quote = rfq.quotes.find((q) => q.id === quoteId);
  return quote ? rfq.invites.find((i) => i.id === quote.invite_id) : undefined;
}


export function buildReport(rfqs: MetricsRfq[], filters: ReportFilters, now: Date = new Date()): Report {
  const currency = primaryCurrency(rfqs);
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const d = dayKey(iso);
    return d >= filters.from && d <= filters.to;
  };
  // One key per supplier. Invites aren't always linked to the supplier
  // profile (linking is best-effort), so an unlinked one is matched to its
  // profile by email, as the scorecard does; otherwise it falls back to its label.
  const profileByEmail = new Map<string, string>();
  for (const r of rfqs) for (const i of r.invites) if (i.supplier_id && i.email) profileByEmail.set(i.email.trim().toLowerCase(), i.supplier_id);
  const keyOf = (i: MetricsRfq["invites"][number]) =>
    i.supplier_id ?? (i.email ? profileByEmail.get(i.email.trim().toLowerCase()) : undefined) ?? i.label ?? i.id;
  const forSupplier = (rfq: MetricsRfq) => {
    if (!filters.supplier) return true;
    const invite = inviteOf(rfq, rfq.award?.quote_id ?? null);
    return Boolean(invite && keyOf(invite) === filters.supplier);
  };

  // Awards (PO sent) in range, for the chosen supplier.
  const awardedInScope = rfqs.filter((r) => r.award?.po_sent_at && inRange(r.award.po_sent_at) && forSupplier(r));
  const savings = measuredSavings(awardedInScope, currency);
  const byRfq = new Map(rfqs.map((r) => [r.id, r]));
  const byRfqEarly = byRfq;

  const monthKeys = monthKeysBetween(filters.from.slice(0, 7), filters.to.slice(0, 7));
  const months = savingsSeriesForMonths(awardedInScope, monthKeys, currency);
  const lastDay = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return `${key}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  };
  const partialMonths = monthKeys.filter(
    (k, i) => (i === 0 && filters.from !== `${k}-01`) || (i === monthKeys.length - 1 && filters.to !== lastDay(k))
  );
  // Metrics key (computeRfqSavings) → our supplier key, per award.
  const ourKey = new Map<string, string>();
  const keyForSavings = (x: RfqSavings) => {
    const invite = inviteOf(byRfqEarly.get(x.rfqId)!, x.awardedQuoteId);
    const k = invite ? keyOf(invite) : x.supplierKey;
    ourKey.set(x.supplierKey, k);
    return k;
  };

  const measured = savings.filter((s) => s.basis === "average_of_other_quotes");
  const measuredBaseline = round2(measured.reduce((a, s) => a + (s.baseline ?? 0), 0));
  const totalSavings = round2(measured.reduce((a, s) => a + s.savings, 0));
  const totals = {
    spend: round2(savings.reduce((a, s) => a + (s.awardedTotal ?? 0), 0)),
    savings: totalSavings,
    measuredBaseline,
    savingsPct: measuredBaseline === 0 ? null : totalSavings / measuredBaseline,
    awards: savings.length,
    unmeasurable: savings.filter((s) => s.basis === "unmeasurable").length,
  };

  // Auto-approval: decisions made in the range (for the chosen supplier: decisions about their quote).
  const decided = rfqs.filter((r) => r.award && inRange(r.award.created_at) && forSupplier(r));
  const automatic = decided.filter((r) => r.award!.decision === "auto_approved").length;

  // Categories: the awarded quote's line totals, grouped by derived category.
  const categoryTotals = new Map<Category, { spend: number; lines: number }>();
  const awards: AwardRow[] = [];
  for (const s of savings) {
    const rfq = byRfq.get(s.rfqId)!;
    const quote = rfq.quotes.find((q) => q.id === s.awardedQuoteId)!;
    const cats = new Set<string>();
    if (s.awardedTotal !== null) {
      const lines = new Map(quote.lines.map((l) => [l.item_id, l.total]));
      for (const item of rfq.items) {
        const total = Number(lines.get(item.id) ?? 0);
        const category = categorizeItem(item.name);
        cats.add(CATEGORY_LABELS[category]);
        const entry = categoryTotals.get(category) ?? { spend: 0, lines: 0 };
        entry.spend = round2(entry.spend + total);
        entry.lines += 1;
        categoryTotals.set(category, entry);
      }
    }
    awards.push({
      rfqId: s.rfqId,
      title: s.title,
      awardedOn: dayKey(s.awardedAt),
      supplier: s.awardedLabel,
      supplierKey: keyForSavings(s),
      total: s.awardedTotal,
      baseline: s.baseline,
      savings: s.savings,
      savingsPct: s.savingsPct,
      basis: s.basis,
      automatic: rfq.award?.decision === "auto_approved",
      categories: Array.from(cats),
    });
  }
  awards.sort((a, b) => (a.awardedOn === b.awardedOn ? a.title.localeCompare(b.title) : b.awardedOn.localeCompare(a.awardedOn)));
  const categorySpend = Array.from(categoryTotals.values()).reduce((a, c) => a + c.spend, 0);
  const categories: CategoryRow[] = Array.from(categoryTotals.entries())
    .map(([category, c]) => ({ category, label: CATEGORY_LABELS[category], spend: c.spend, lines: c.lines, share: categorySpend === 0 ? 0 : c.spend / categorySpend }))
    .sort((a, b) => b.spend - a.spend);

  // Suppliers: scorecard metrics over RFQs created in the range, plus spend and savings from the awards above.
  const createdInRange = rfqs.filter((r) => inRange(r.created_at));
  const labels = new Map<string, { label: string; email?: string }>();
  for (const r of [...createdInRange, ...awardedInScope]) {
    for (const i of r.invites) {
      const k = keyOf(i);
      if (!labels.has(k) && (i.supplier_id || profileByEmail.has(i.email?.trim().toLowerCase() ?? "") || awardedInScope.includes(r))) {
        labels.set(k, { label: i.label, email: i.email });
      }
    }
  }
  // spendBySupplier keys by the metrics key; fold those into ours.
  const spend = new Map<string, { spend: number; awards: number }>();
  for (const e of spendBySupplier(awardedInScope, currency)) {
    const k = ourKey.get(e.supplierKey) ?? e.supplierKey;
    const cur = spend.get(k) ?? { spend: 0, awards: 0 };
    spend.set(k, { spend: round2(cur.spend + e.spend), awards: cur.awards + e.awards });
  }
  const savingsBySupplier = new Map<string, number>();
  for (const s of measured) {
    const k = ourKey.get(s.supplierKey) ?? s.supplierKey;
    savingsBySupplier.set(k, round2((savingsBySupplier.get(k) ?? 0) + s.savings));
  }

  const supplierOptions = Array.from(labels.entries())
    .map(([key, v]) => ({ key, label: v.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // Keep a filtered supplier selectable even when this range doesn't include them.
  if (filters.supplier && !supplierOptions.some((o) => o.key === filters.supplier)) {
    const known = rfqs.flatMap((r) => r.invites).find((i) => keyOf(i) === filters.supplier);
    supplierOptions.push({ key: filters.supplier, label: known?.label ?? "Selected supplier" });
  }

  const suppliers: SupplierRow[] = supplierOptions
    .filter((o) => !filters.supplier || o.key === filters.supplier)
    .map(({ key, label }) => {
      const m = supplierMetrics(createdInRange, { id: key, email: labels.get(key)?.email ?? null }, now);
      return {
        key,
        label,
        quoted: m.quoted,
        invited: m.invited,
        posSent: spend.get(key)?.awards ?? 0,
        won: m.awarded,
        decided: m.decidedQuotes,
        winRate: m.winRate,
        spend: spend.get(key)?.spend ?? 0,
        savings: savingsBySupplier.get(key) ?? 0,
        avgPriceVsLowest: m.avgPriceVsLowest,
        responseRate: m.responseRate,
      };
    })
    .filter((s) => s.invited > 0 || s.posSent > 0)
    .sort((a, b) => b.spend - a.spend || b.quoted - a.quoted || a.label.localeCompare(b.label));

  return {
    filters,
    currency,
    months,
    partialMonths,
    totals,
    autoApproval: { decided: decided.length, automatic, rate: decided.length === 0 ? null : automatic / decided.length },
    suppliers,
    categories,
    awards,
    excludedOtherCurrency: awardedInScope.filter((r) => r.currency !== currency).length,
    supplierOptions,
  };
}
