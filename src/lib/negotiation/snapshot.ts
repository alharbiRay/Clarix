import type { ComparisonSnapshot, Language } from "@/lib/negotiation";

/** The rows a negotiation needs: an RFQ with its items, invites (and their supplier profile's language) and quotes. */
export const NEGOTIATION_RFQ_SELECT =
  "id, title, currency, buyer_id, rfq_items(*), rfq_suppliers(*, suppliers(preferred_language)), quotes(*, quote_items(*))";

interface RfqRow {
  title: string;
  currency: string;
  rfq_items: { id: string; name: string; quantity: number | string; unit: string; position?: number }[];
  rfq_suppliers: {
    id: string;
    email: string;
    company_name: string | null;
    contact_name: string | null;
    supplier_id?: string | null;
    suppliers?: { preferred_language: string | null } | null;
  }[];
  quotes: {
    id: string;
    supplier_id: string;
    status: string;
    delivery_days: number | null;
    warranty: string | null;
    quote_items: { rfq_item_id: string; total_price: number | string | null; unit_price?: number | string | null }[];
  }[];
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const lang = (v: string | null | undefined): Language | null => (v === "ar" || v === "en" ? v : null);

export function snapshotFromRows(rfq: RfqRow, buyer: { company: string | null; full_name: string | null } | null): ComparisonSnapshot {
  return {
    rfqTitle: rfq.title,
    currency: rfq.currency,
    items: [...rfq.rfq_items]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((i) => ({ id: i.id, name: i.name, quantity: Number(i.quantity), unit: i.unit })),
    quotes: rfq.quotes.map((q) => ({
      id: q.id,
      inviteId: q.supplier_id,
      status: q.status,
      deliveryDays: q.delivery_days,
      warranty: q.warranty,
      lines: q.quote_items.map((l) => ({ itemId: l.rfq_item_id, total: num(l.total_price), unit: num(l.unit_price) })),
    })),
    suppliers: rfq.rfq_suppliers.map((s) => ({
      id: s.id,
      email: s.email,
      companyName: s.company_name,
      contactName: s.contact_name,
      preferredLanguage: lang(s.suppliers?.preferred_language),
      supplierId: s.supplier_id ?? null,
    })),
    buyer: { company: buyer?.company ?? null, name: buyer?.full_name ?? null },
  };
}
