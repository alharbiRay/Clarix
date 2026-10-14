/**
 * Procurement metrics: savings, KPIs, series, rankings. Pure functions over a
 * normalized snapshot (see ./load.ts for the Supabase loader). Definitions
 * live in docs/METRICS.md; the dashboard (Phase 3) and reports (Phase 9) both
 * consume these, so a number never means two different things.
 */

export type AwardDecision = "auto_approved" | "review_needed" | "differs_from_cheapest";
export type InviteStatus = "pending" | "sent" | "viewed" | "submitted" | "declined";
export type QuoteStatusValue = "submitted" | "confirmed" | "needs_review" | "rejected";

export interface MetricsRfq {
  id: string;
  title: string;
  currency: string;
  created_at: string;
  items: { id: string; name: string; quantity: number }[];
  invites: {
    id: string;
    label: string;
    /** Persistent supplier profile, when linked. */
    supplier_id: string | null;
    status: InviteStatus;
    invited_at: string | null;
  }[];
  quotes: {
    id: string;
    invite_id: string;
    status: QuoteStatusValue;
    submitted_at: string;
    lines: { item_id: string; total: number | null }[];
    /** Promised delivery (days) and warranty text — used by the supplier scorecard. */
    delivery_days?: number | null;
    warranty?: string | null;
  }[];
  award: {
    decision: AwardDecision;
    quote_id: string | null;
    po_sent_at: string | null;
    created_at: string;
    reason: string | null;
  } | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Saudi Arabia: UTC+3, no daylight saving. */
const RIYADH_OFFSET_MS = 3 * HOUR;
export const DEFAULT_CURRENCY = "SAR";
export const AUTO_APPROVAL_WINDOW_DAYS = 90;

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);

const isComparable = (q: MetricsRfq["quotes"][number]) => q.status === "submitted" || q.status === "confirmed";

/** "YYYY-MM" in Saudi time. */
export function monthKey(iso: string | Date): string {
  const t = (typeof iso === "string" ? new Date(iso) : iso).getTime() + RIYADH_OFFSET_MS;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The `back`-th month before the one containing `now` (0 = this month). */
export function monthBefore(now: Date, back: number): string {
  const shifted = new Date(now.getTime() + RIYADH_OFFSET_MS);
  const d = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Last instant of a "YYYY-MM" month in Saudi time. */
export function monthEnd(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1) - RIYADH_OFFSET_MS - 1);
}

/** Total of a quote, or null if any RFQ line is unpriced. */
export function completeTotal(rfq: MetricsRfq, quote: MetricsRfq["quotes"][number]): number | null {
  const byItem = new Map(quote.lines.map((l) => [l.item_id, num(l.total)]));
  let sum = 0;
  for (const item of rfq.items) {
    const t = byItem.get(item.id);
    if (t === null || t === undefined || Number.isNaN(t)) return null;
    sum += t;
  }
  return rfq.items.length === 0 ? null : round2(sum);
}

export type SavingsBasis = "average_of_other_quotes" | "no_baseline" | "unmeasurable";

export interface RfqSavings {
  rfqId: string;
  title: string;
  currency: string;
  awardedQuoteId: string;
  awardedLabel: string;
  supplierKey: string;
  awardedTotal: number | null;
  baseline: number | null;
  savings: number;
  savingsPct: number | null;
  basis: SavingsBasis;
  otherQuoteCount: number;
  awardedAt: string;
}

/** Savings for an RFQ whose PO has been sent; null otherwise. See docs/METRICS.md. */
export function computeRfqSavings(rfq: MetricsRfq): RfqSavings | null {
  const award = rfq.award;
  if (!award?.po_sent_at || !award.quote_id) return null;
  const awarded = rfq.quotes.find((q) => q.id === award.quote_id);
  if (!awarded) return null;

  const invite = rfq.invites.find((i) => i.id === awarded.invite_id);
  const base = {
    rfqId: rfq.id,
    title: rfq.title,
    currency: rfq.currency,
    awardedQuoteId: awarded.id,
    awardedLabel: invite?.label ?? "Unknown supplier",
    supplierKey: invite?.supplier_id ?? invite?.label ?? awarded.invite_id,
    awardedAt: award.po_sent_at,
  };

  const awardedTotal = completeTotal(rfq, awarded);
  if (awardedTotal === null) {
    return { ...base, awardedTotal: null, baseline: null, savings: 0, savingsPct: null, basis: "unmeasurable", otherQuoteCount: 0 };
  }

  const others = rfq.quotes
    .filter((q) => q.id !== awarded.id && isComparable(q))
    .map((q) => completeTotal(rfq, q))
    .filter((t): t is number => t !== null);
  if (others.length === 0) {
    return { ...base, awardedTotal, baseline: null, savings: 0, savingsPct: null, basis: "no_baseline", otherQuoteCount: 0 };
  }

  const baseline = round2(mean(others)!);
  const savings = round2(baseline - awardedTotal);
  return {
    ...base,
    awardedTotal,
    baseline,
    savings,
    savingsPct: baseline === 0 ? null : savings / baseline,
    basis: "average_of_other_quotes",
    otherQuoteCount: others.length,
  };
}

export interface ItemSavings {
  itemId: string;
  name: string;
  awarded: number;
  baseline: number;
  savings: number;
}

/** Per-line savings (informational; does not sum to the RFQ figure). */
export function itemSavings(rfq: MetricsRfq): ItemSavings[] {
  const award = rfq.award;
  if (!award?.po_sent_at || !award.quote_id) return [];
  const awarded = rfq.quotes.find((q) => q.id === award.quote_id);
  if (!awarded) return [];
  const others = rfq.quotes.filter((q) => q.id !== awarded.id && isComparable(q));

  const out: ItemSavings[] = [];
  for (const item of rfq.items) {
    const mine = num(awarded.lines.find((l) => l.item_id === item.id)?.total);
    if (mine === null) continue;
    const theirs = others
      .map((q) => num(q.lines.find((l) => l.item_id === item.id)?.total))
      .filter((t): t is number => t !== null);
    if (theirs.length === 0) continue;
    const baseline = round2(mean(theirs)!);
    out.push({ itemId: item.id, name: item.name, awarded: round2(mine), baseline, savings: round2(baseline - mine) });
  }
  return out;
}

export function primaryCurrency(rfqs: MetricsRfq[]): string {
  const counts = new Map<string, number>();
  for (const r of rfqs) {
    if (!r.award?.po_sent_at) continue;
    counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  }
  let best = DEFAULT_CURRENCY;
  let bestCount = 0;
  counts.forEach((count, currency) => {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  });
  return best;
}

function measuredSavings(rfqs: MetricsRfq[], currency: string) {
  return rfqs
    .map(computeRfqSavings)
    .filter((s): s is RfqSavings => s !== null && s.currency === currency);
}

export interface Kpis {
  currency: string;
  savingsThisMonth: number;
  savingsLastMonth: number;
  /** Relative change vs last month; null when last month had no savings to compare against. */
  savingsChange: number | null;
  /** Savings as a share of the baseline spend this month. */
  savingsPctThisMonth: number | null;
  rfqsCreatedThisMonth: number;
  rfqsCreatedLastMonth: number;
  /** Trailing AUTO_APPROVAL_WINDOW_DAYS. */
  autoApprovalRate: number | null;
  avgSentToAllRepliedHours: number | null;
  avgSupplierResponseHours: number | null;
  /** Awarded RFQs in other currencies, left out of money KPIs. */
  excludedOtherCurrency: number;
}

export function computeKpis(rfqs: MetricsRfq[], now: Date): Kpis {
  const currency = primaryCurrency(rfqs);
  const thisMonth = monthBefore(now, 0);
  const lastMonth = monthBefore(now, 1);
  const savings = measuredSavings(rfqs, currency);

  const sumFor = (month: string) =>
    round2(savings.filter((s) => monthKey(s.awardedAt) === month).reduce((acc, s) => acc + s.savings, 0));
  const savingsThisMonth = sumFor(thisMonth);
  const savingsLastMonth = sumFor(lastMonth);

  const thisMonthMeasured = savings.filter((s) => monthKey(s.awardedAt) === thisMonth && s.baseline !== null);
  const baselineThisMonth = thisMonthMeasured.reduce((acc, s) => acc + (s.baseline ?? 0), 0);

  const windowStart = now.getTime() - AUTO_APPROVAL_WINDOW_DAYS * DAY;
  const decided = rfqs.filter((r) => r.award && new Date(r.award.created_at).getTime() >= windowStart);

  const sentToReplied: number[] = [];
  const responses: number[] = [];
  for (const r of rfqs) {
    const invitedTimes = r.invites
      .filter((i) => i.status !== "pending" && i.invited_at)
      .map((i) => new Date(i.invited_at!).getTime());
    const comparable = r.quotes.filter(isComparable);
    for (const q of comparable) {
      const invitedAt = r.invites.find((i) => i.id === q.invite_id)?.invited_at;
      if (!invitedAt) continue;
      const hours = (new Date(q.submitted_at).getTime() - new Date(invitedAt).getTime()) / HOUR;
      if (hours >= 0) responses.push(hours);
    }
    const invited = r.invites.filter((i) => i.status !== "pending");
    const allResolved = invited.length > 0 && invited.every((i) => i.status === "submitted" || i.status === "declined");
    if (allResolved && comparable.length > 0 && invitedTimes.length > 0) {
      const last = Math.max(...comparable.map((q) => new Date(q.submitted_at).getTime()));
      const hours = (last - Math.min(...invitedTimes)) / HOUR;
      if (hours >= 0) sentToReplied.push(hours);
    }
  }

  return {
    currency,
    savingsThisMonth,
    savingsLastMonth,
    savingsChange: savingsLastMonth === 0 ? null : (savingsThisMonth - savingsLastMonth) / Math.abs(savingsLastMonth),
    savingsPctThisMonth: baselineThisMonth === 0 ? null : savingsThisMonth / baselineThisMonth,
    rfqsCreatedThisMonth: rfqs.filter((r) => monthKey(r.created_at) === thisMonth).length,
    rfqsCreatedLastMonth: rfqs.filter((r) => monthKey(r.created_at) === lastMonth).length,
    autoApprovalRate: decided.length === 0 ? null : decided.filter((r) => r.award!.decision === "auto_approved").length / decided.length,
    avgSentToAllRepliedHours: mean(sentToReplied),
    avgSupplierResponseHours: mean(responses),
    excludedOtherCurrency: rfqs.filter((r) => r.award?.po_sent_at && r.currency !== currency).length,
  };
}

export interface SeriesPoint {
  month: string;
  savings: number;
  spend: number;
  awarded: number;
}

/** Monthly savings and spend (primary currency), oldest first, empty months included. */
export function savingsSeries(rfqs: MetricsRfq[], now: Date, months = 6, currency = primaryCurrency(rfqs)): SeriesPoint[] {
  const keys = Array.from({ length: months }, (_, i) => monthBefore(now, months - 1 - i));
  const points = new Map(keys.map((k) => [k, { month: k, savings: 0, spend: 0, awarded: 0 }]));
  for (const s of measuredSavings(rfqs, currency)) {
    const p = points.get(monthKey(s.awardedAt));
    if (!p || s.awardedTotal === null) continue;
    p.savings = round2(p.savings + s.savings);
    p.spend = round2(p.spend + s.awardedTotal);
    p.awarded += 1;
  }
  return keys.map((k) => points.get(k)!);
}

export interface SupplierSpend {
  supplierKey: string;
  label: string;
  spend: number;
  awards: number;
}

export function spendBySupplier(rfqs: MetricsRfq[], currency = primaryCurrency(rfqs)): SupplierSpend[] {
  const map = new Map<string, SupplierSpend>();
  for (const s of measuredSavings(rfqs, currency)) {
    if (s.awardedTotal === null) continue;
    const entry = map.get(s.supplierKey) ?? { supplierKey: s.supplierKey, label: s.awardedLabel, spend: 0, awards: 0 };
    entry.spend = round2(entry.spend + s.awardedTotal);
    entry.awards += 1;
    map.set(s.supplierKey, entry);
  }
  return Array.from(map.values()).sort((a, b) => b.spend - a.spend);
}

/** RFQs with positive measured savings, largest first (premiums paid are not "savings"). */
export function topSavings(rfqs: MetricsRfq[], limit = 5, currency = primaryCurrency(rfqs)): RfqSavings[] {
  return measuredSavings(rfqs, currency)
    .filter((s) => s.basis === "average_of_other_quotes" && s.savings > 0)
    .sort((a, b) => b.savings - a.savings)
    .slice(0, limit);
}

export interface ReviewItem {
  rfqId: string;
  title: string;
  currency: string;
  decision: AwardDecision;
  reason: string | null;
  createdAt: string;
  recommendedLabel: string | null;
  recommendedTotal: number | null;
}

/** Rules-engine decisions waiting on a human (no PO sent yet), oldest first. */
export function reviewQueue(rfqs: MetricsRfq[]): ReviewItem[] {
  return rfqs
    .filter((r) => r.award && r.award.decision !== "auto_approved" && !r.award.po_sent_at)
    .map((r) => {
      const quote = r.quotes.find((q) => q.id === r.award!.quote_id);
      const invite = quote ? r.invites.find((i) => i.id === quote.invite_id) : undefined;
      return {
        rfqId: r.id,
        title: r.title,
        currency: r.currency,
        decision: r.award!.decision,
        reason: r.award!.reason,
        createdAt: r.award!.created_at,
        recommendedLabel: invite?.label ?? null,
        recommendedTotal: quote ? completeTotal(r, quote) : null,
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export interface PendingExtraction {
  rfqId: string;
  title: string;
  quoteId: string;
  supplierLabel: string;
  submittedAt: string;
}

/**
 * PDF/email quotes the AI extracted but the buyer hasn't confirmed yet.
 * They hold back the comparison and auto-approval until reviewed.
 */
export function pendingExtractions(rfqs: MetricsRfq[]): PendingExtraction[] {
  return rfqs
    .flatMap((r) =>
      r.quotes
        .filter((q) => q.status === "needs_review")
        .map((q) => ({
          rfqId: r.id,
          title: r.title,
          quoteId: q.id,
          supplierLabel: r.invites.find((i) => i.id === q.invite_id)?.label ?? "Unknown supplier",
          submittedAt: q.submitted_at,
        }))
    )
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}
