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

type QuoteWithItems = Quote & { quote_items: QuoteItem[] };

/**
 * Computes cross-RFQ performance stats for a batch of suppliers at once —
 * a fixed handful of queries regardless of how many suppliers are passed,
 * instead of computeSupplierStats' ~5 queries repeated per supplier (the
 * suppliers list page used to call that once per row, an N+1 that got
 * slower as the supplier list grew). Nothing here is stored — always
 * derived fresh from the same tables the compare page and auto-approval
 * rules engine already use, so the numbers stay in lockstep with what a
 * buyer sees elsewhere in the app.
 */
export async function computeAllSupplierStats(
  supabase: SupabaseClient,
  supplierIds: string[]
): Promise<Map<string, SupplierStats>> {
  const results = new Map<string, SupplierStats>();
  for (const id of supplierIds) results.set(id, EMPTY_STATS);
  if (supplierIds.length === 0) return results;

  const { data: rfqSuppliersRaw } = await supabase
    .from("rfq_suppliers")
    .select("id, supplier_id, invited_at, created_at")
    .in("supplier_id", supplierIds);
  const rfqSuppliers = rfqSuppliersRaw ?? [];
  if (rfqSuppliers.length === 0) return results;

  const rfqSupplierIds = rfqSuppliers.map((s) => s.id);
  const rfqSuppliersBySupplierId = new Map<string, typeof rfqSuppliers>();
  for (const rs of rfqSuppliers) {
    const list = rfqSuppliersBySupplierId.get(rs.supplier_id) ?? [];
    list.push(rs);
    rfqSuppliersBySupplierId.set(rs.supplier_id, list);
  }

  // --- Round 2: both only depend on rfqSupplierIds, so run concurrently ---
  const [{ data: theirQuotesRaw }, { data: awardsRaw }] = await Promise.all([
    supabase
      .from("quotes")
      .select("*, quote_items(*)")
      .in("supplier_id", rfqSupplierIds)
      .neq("status", "rejected"),
    supabase
      .from("rfq_awards")
      .select("recommended_supplier_id, decision")
      .in("recommended_supplier_id", rfqSupplierIds),
  ]);

  const quotes = (theirQuotesRaw ?? []) as QuoteWithItems[];
  const quotesByRfqSupplierId = new Map<string, QuoteWithItems[]>();
  for (const q of quotes) {
    const list = quotesByRfqSupplierId.get(q.supplier_id) ?? [];
    list.push(q);
    quotesByRfqSupplierId.set(q.supplier_id, list);
  }

  const timesAwardedByRfqSupplierId = new Map<string, number>();
  for (const a of awardsRaw ?? []) {
    if (a.decision !== "auto_approved" || !a.recommended_supplier_id) continue;
    timesAwardedByRfqSupplierId.set(
      a.recommended_supplier_id,
      (timesAwardedByRfqSupplierId.get(a.recommended_supplier_id) ?? 0) + 1
    );
  }

  const allParticipatedRfqIds = Array.from(new Set(quotes.map((q) => q.rfq_id)));

  // --- Round 3: rfq_items and comparable quotes for every RFQ any supplier
  // in this batch participated in, fetched once and shared across all of
  // them (a competitor's quote is reused for every other supplier's price
  // comparison on that same RFQ instead of being re-fetched per supplier).
  const itemsByRfqId = new Map<string, RfqItem[]>();
  const comparableQuotesByRfqId = new Map<string, QuoteWithItems[]>();
  if (allParticipatedRfqIds.length > 0) {
    const [{ data: rfqItemsRows }, { data: comparableQuotesRaw }] = await Promise.all([
      supabase.from("rfq_items").select("*").in("rfq_id", allParticipatedRfqIds),
      supabase
        .from("quotes")
        .select("*, quote_items(*)")
        .in("rfq_id", allParticipatedRfqIds)
        .in("status", ["submitted", "confirmed"]),
    ]);
    for (const item of (rfqItemsRows ?? []) as RfqItem[]) {
      const list = itemsByRfqId.get(item.rfq_id) ?? [];
      list.push(item);
      itemsByRfqId.set(item.rfq_id, list);
    }
    for (const q of (comparableQuotesRaw ?? []) as QuoteWithItems[]) {
      const list = comparableQuotesByRfqId.get(q.rfq_id) ?? [];
      list.push(q);
      comparableQuotesByRfqId.set(q.rfq_id, list);
    }
  }

  for (const supplierId of supplierIds) {
    const mySuppliers = rfqSuppliersBySupplierId.get(supplierId) ?? [];
    if (mySuppliers.length === 0) continue; // stays EMPTY_STATS

    const myRfqSupplierIds = mySuppliers.map((s) => s.id);
    const myQuotes = myRfqSupplierIds.flatMap(
      (id) => quotesByRfqSupplierId.get(id) ?? []
    );
    const participatedRfqIds = Array.from(new Set(myQuotes.map((q) => q.rfq_id)));
    const rfqsParticipated = participatedRfqIds.length;

    if (rfqsParticipated === 0) {
      const lastActive =
        mySuppliers
          .map((s) => s.invited_at ?? s.created_at)
          .filter((d): d is string => Boolean(d))
          .sort()
          .at(-1) ?? null;
      results.set(supplierId, { ...EMPTY_STATS, lastActive });
      continue;
    }

    // --- Win rate: the only real "awarded" signal is an auto-approved PO ---
    const timesAwarded = myRfqSupplierIds.reduce(
      (sum, id) => sum + (timesAwardedByRfqSupplierId.get(id) ?? 0),
      0
    );
    const winRate = timesAwarded / rfqsParticipated;

    // --- Average response time (invite -> submission), only where invited_at is known ---
    const invitedAtByRfqSupplierId = new Map(mySuppliers.map((s) => [s.id, s.invited_at]));
    const responseDays: number[] = [];
    for (const q of myQuotes) {
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
    const pctDiffs: number[] = [];
    for (const rfqId of participatedRfqIds) {
      const items = itemsByRfqId.get(rfqId) ?? [];
      const quotesInRfq = comparableQuotesByRfqId.get(rfqId) ?? [];
      const mine = quotesInRfq.find((q) => myRfqSupplierIds.includes(q.supplier_id));
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

    const lastActive = myQuotes.map((q) => q.submitted_at).sort().at(-1) ?? null;

    results.set(supplierId, {
      rfqsParticipated,
      timesAwarded,
      winRate,
      avgResponseDays,
      priceCompetitivenessPct,
      rating,
      lastActive,
    });
  }

  return results;
}

/** Single-supplier convenience wrapper around computeAllSupplierStats. */
export async function computeSupplierStats(
  supabase: SupabaseClient,
  supplierId: string
): Promise<SupplierStats> {
  const map = await computeAllSupplierStats(supabase, [supplierId]);
  return map.get(supplierId) ?? EMPTY_STATS;
}
