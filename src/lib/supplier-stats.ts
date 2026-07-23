import type { SupabaseClient } from "@supabase/supabase-js";
import { computeQuoteTotal } from "@/lib/quote-comparison";
import type { Quote, QuoteItem, RfqItem, SupplierStats } from "@/lib/types";

// Matches the "fast delivery" bar the auto-approval rules engine already
// uses (src/lib/auto-approval.ts) — kept consistent across the app.
const FAST_DELIVERY_DAYS = 14;
const DAY_MS = 86_400_000;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

const EMPTY_STATS: SupplierStats = {
  rfqsParticipated: 0,
  timesAwarded: 0,
  winRate: null,
  avgResponseDays: null,
  priceCompetitivenessPct: null,
  rating: null,
  lastActive: null,
};

/**
 * Computes a supplier's cross-RFQ performance from their rfq_suppliers rows,
 * quotes, and any rfq_awards referencing them. Nothing here is stored —
 * always derived fresh from the same tables the compare page and
 * auto-approval rules engine already use, so the numbers stay in lockstep
 * with what a buyer sees elsewhere in the app.
 */
export async function computeSupplierStats(
  supabase: SupabaseClient,
  supplierId: string
): Promise<SupplierStats> {
  const { data: rfqSuppliers } = await supabase
    .from("rfq_suppliers")
    .select("id, rfq_id, invited_at, created_at")
    .eq("supplier_id", supplierId);

  if (!rfqSuppliers || rfqSuppliers.length === 0) return EMPTY_STATS;

  const rfqSupplierIds = rfqSuppliers.map((s) => s.id);

  const { data: theirQuotesRaw } = await supabase
    .from("quotes")
    .select("*, quote_items(*)")
    .in("supplier_id", rfqSupplierIds)
    .neq("status", "rejected");

  const quotes = (theirQuotesRaw ?? []) as (Quote & { quote_items: QuoteItem[] })[];
  const participatedRfqIds = Array.from(new Set(quotes.map((q) => q.rfq_id)));
  const rfqsParticipated = participatedRfqIds.length;

  if (rfqsParticipated === 0) {
    const lastActive =
      rfqSuppliers
        .map((s) => s.invited_at ?? s.created_at)
        .filter((d): d is string => Boolean(d))
        .sort()
        .at(-1) ?? null;
    return { ...EMPTY_STATS, lastActive };
  }

  // --- Win rate: the only real "awarded" signal is an auto-approved PO ---
  const { data: awards } = await supabase
    .from("rfq_awards")
    .select("recommended_supplier_id, decision")
    .in("recommended_supplier_id", rfqSupplierIds);
  const timesAwarded = (awards ?? []).filter((a) => a.decision === "auto_approved").length;
  const winRate = timesAwarded / rfqsParticipated;

  // --- Average response time (invite -> submission), only where invited_at is known ---
  const invitedAtByRfqSupplierId = new Map(rfqSuppliers.map((s) => [s.id, s.invited_at]));
  const responseDays: number[] = [];
  for (const q of quotes) {
    const invitedAt = invitedAtByRfqSupplierId.get(q.supplier_id);
    if (!invitedAt) continue;
    const days = (new Date(q.submitted_at).getTime() - new Date(invitedAt).getTime()) / DAY_MS;
    if (days >= 0) responseDays.push(days);
  }
  const avgResponseDays =
    responseDays.length > 0
      ? Math.round((responseDays.reduce((s, d) => s + d, 0) / responseDays.length) * 10) / 10
      : null;

  // --- Price competitiveness vs. other suppliers on the same RFQs ---
  const { data: rfqItemsRows } = await supabase
    .from("rfq_items")
    .select("*")
    .in("rfq_id", participatedRfqIds);
  const itemsByRfqId = new Map<string, RfqItem[]>();
  for (const item of (rfqItemsRows ?? []) as RfqItem[]) {
    const list = itemsByRfqId.get(item.rfq_id) ?? [];
    list.push(item);
    itemsByRfqId.set(item.rfq_id, list);
  }

  const { data: allQuotesRaw } = await supabase
    .from("quotes")
    .select("*, quote_items(*)")
    .in("rfq_id", participatedRfqIds)
    .in("status", ["submitted", "confirmed"]);
  const allQuotes = (allQuotesRaw ?? []) as (Quote & { quote_items: QuoteItem[] })[];

  const pctDiffs: number[] = [];
  for (const rfqId of participatedRfqIds) {
    const items = itemsByRfqId.get(rfqId) ?? [];
    const quotesInRfq = allQuotes.filter((q) => q.rfq_id === rfqId);
    const mine = quotesInRfq.find((q) => rfqSupplierIds.includes(q.supplier_id));
    if (!mine) continue;
    const myTotal = computeQuoteTotal(items, mine).total;
    if (myTotal === null) continue;
    const otherTotals = quotesInRfq
      .filter((q) => q.supplier_id !== mine.supplier_id)
      .map((q) => computeQuoteTotal(items, q).total)
      .filter((t): t is number => t !== null);
    if (otherTotals.length === 0) continue;
    const avgOther = otherTotals.reduce((s, t) => s + t, 0) / otherTotals.length;
    if (avgOther === 0) continue;
    pctDiffs.push(((myTotal - avgOther) / avgOther) * 100);
  }
  const priceCompetitivenessPct =
    pctDiffs.length > 0
      ? Math.round((pctDiffs.reduce((s, d) => s + d, 0) / pctDiffs.length) * 10) / 10
      : null;

  // --- Rating: equal-weighted average of the metrics above, mapped to 1-5 stars ---
  const scores = [winRate];
  if (avgResponseDays !== null) {
    scores.push(clamp(1 - avgResponseDays / FAST_DELIVERY_DAYS, 0, 1));
  }
  if (priceCompetitivenessPct !== null) {
    scores.push(clamp(1 - priceCompetitivenessPct / 40, 0, 1));
  }
  const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
  const rating = Math.round((1 + 4 * avgScore) * 2) / 2;

  const lastActive = quotes.map((q) => q.submitted_at).sort().at(-1) ?? null;

  return {
    rfqsParticipated,
    timesAwarded,
    winRate,
    avgResponseDays,
    priceCompetitivenessPct,
    rating,
    lastActive,
  };
}
