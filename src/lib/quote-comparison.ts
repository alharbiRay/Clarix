import type { Quote, QuoteItem, RfqItem } from "@/lib/types";

type QuoteWithItems = Quote & { quote_items: QuoteItem[] };

interface QuoteTotal {
  quote: QuoteWithItems;
  total: number | null;
  missingCount: number;
}

/** A quote's total price and how many RFQ line items it left unpriced. */
export function computeQuoteTotal(items: RfqItem[], quote: QuoteWithItems): QuoteTotal {
  const itemTotals = new Map(quote.quote_items.map((qi) => [qi.rfq_item_id, qi.total_price]));
  const priced = items
    .map((i) => itemTotals.get(i.id))
    .filter((t): t is number => t !== null && t !== undefined)
    .map(Number);
  return {
    quote,
    total:
      priced.length === 0 ? null : Math.round(priced.reduce((s, t) => s + t, 0) * 100) / 100,
    missingCount: items.length - priced.length,
  };
}

/**
 * The cheapest *complete* comparable quote: status submitted/confirmed (not
 * needs_review — an unreviewed AI extraction can't win) and priced on every
 * line item. Mirrors the "lowest complete quote" trophy logic on the compare
 * page (src/app/(dashboard)/rfqs/[id]/compare/page.tsx) — kept here so the
 * auto-approval rules engine uses the exact same definition of "cheapest".
 */
export function findCheapestQuote(
  items: RfqItem[],
  quotes: QuoteWithItems[]
): QuoteWithItems | null {
  const comparable = quotes.filter((q) => q.status === "submitted" || q.status === "confirmed");
  const complete = comparable
    .map((q) => computeQuoteTotal(items, q))
    .filter((c): c is QuoteTotal & { total: number } => c.missingCount === 0 && c.total !== null)
    .sort((a, b) => a.total - b.total);
  return complete[0]?.quote ?? null;
}
