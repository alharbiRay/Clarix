import type {
  RecommendationInput,
  RecommendationPreferences,
  RecommendationWeights,
} from "@/lib/gemini";
import type { Quote, QuoteItem, Rfq, RfqItem, RfqSupplier } from "@/lib/types";

export type RfqWithComparisonData = Rfq & {
  rfq_items: RfqItem[];
  rfq_suppliers: RfqSupplier[];
  quotes: (Quote & { quote_items: QuoteItem[] })[];
};

/**
 * Shapes a fetched RFQ row (items, suppliers, quotes) into the input Gemini's
 * recommendation prompt expects. Shared by the manual "Get AI recommendation"
 * action and the auto-recommendation trigger so both stay in lockstep with
 * how a quote's total/comparability is computed.
 *
 * Returns null when there are no comparable (submitted/confirmed) quotes.
 */
export function buildRecommendationInput(
  rfq: RfqWithComparisonData,
  weights: RecommendationWeights,
  preferences?: RecommendationPreferences
): RecommendationInput | null {
  const items = rfq.rfq_items.slice().sort((a, b) => a.position - b.position);
  const suppliers = new Map(rfq.rfq_suppliers.map((s) => [s.id, s]));
  const itemNames = new Map(items.map((i) => [i.id, i.name]));

  const comparableQuotes = rfq.quotes.filter(
    (q) => q.status === "submitted" || q.status === "confirmed"
  );
  if (comparableQuotes.length === 0) return null;

  return {
    rfq: {
      title: rfq.title,
      description: rfq.description,
      currency: rfq.currency,
      deadline: rfq.deadline,
    },
    weights,
    preferences,
    items: items.map((i) => ({
      name: i.name,
      quantity: Number(i.quantity),
      unit: i.unit,
    })),
    quotes: comparableQuotes.map((q) => {
      const supplier = suppliers.get(q.supplier_id);
      const lineItems = q.quote_items.map((qi) => ({
        item: itemNames.get(qi.rfq_item_id) ?? "Unknown item",
        unit_price: qi.unit_price === null ? null : Number(qi.unit_price),
        total_price: qi.total_price === null ? null : Number(qi.total_price),
        notes: qi.notes,
      }));
      const priced = lineItems.filter((li) => li.total_price !== null);
      return {
        supplier:
          supplier?.company_name || supplier?.email || "Unknown supplier",
        source: q.source,
        total:
          priced.length === 0
            ? null
            : Math.round(
                priced.reduce((s, li) => s + (li.total_price ?? 0), 0) * 100
              ) / 100,
        delivery_days: q.delivery_days,
        payment_terms: q.payment_terms,
        warranty: q.warranty,
        notes: q.notes,
        items: lineItems,
      };
    }),
  };
}
