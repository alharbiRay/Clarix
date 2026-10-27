import type { Quote, QuoteItem, RfqItem, RfqSupplier } from "@/lib/types";

/** Small builders for the RFQ/quote shapes the comparison + approval code consumes. */
export function rfqItem(id: string, overrides: Partial<RfqItem> = {}): RfqItem {
  return {
    id,
    rfq_id: "rfq-1",
    position: 0,
    name: `Item ${id}`,
    description: null,
    quantity: 1,
    unit: "pcs",
    ...overrides,
  };
}

export function supplier(id: string, overrides: Partial<RfqSupplier> = {}): RfqSupplier {
  return {
    id,
    rfq_id: "rfq-1",
    email: `${id}@supplier.test`,
    company_name: `Supplier ${id}`,
    contact_name: null,
    token: `token-${id}`,
    status: "submitted",
    invited_at: "2026-01-01T00:00:00Z",
    viewed_at: null,
    supplier_id: null,
    ...overrides,
  };
}

export function quote(
  id: string,
  supplierId: string,
  lineTotals: Record<string, number | null>,
  overrides: Partial<Quote> = {}
): Quote & { quote_items: QuoteItem[] } {
  return {
    id,
    rfq_id: "rfq-1",
    supplier_id: supplierId,
    source: "form",
    status: "submitted",
    delivery_days: 7,
    payment_terms: "Net 30",
    warranty: "12 months",
    notes: null,
    pdf_path: null,
    extraction_raw: null,
    submitted_at: "2026-01-02T00:00:00Z",
    confirmed_at: null,
    ...overrides,
    quote_items: Object.entries(lineTotals).map(([itemId, total]) => ({
      id: `${id}-${itemId}`,
      quote_id: id,
      rfq_item_id: itemId,
      unit_price: total,
      total_price: total,
      notes: null,
    })),
  };
}
