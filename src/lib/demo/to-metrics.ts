import type { DemoDataset } from "@/lib/demo/dataset";
import type { MetricsRfq } from "@/lib/metrics";

/** Shapes the demo dataset like loadMetricsRfqs output (used by tests and the design preview). */
export function demoToMetricsRfqs(d: DemoDataset): MetricsRfq[] {
  return d.rfqs.map((r) => {
    const award = d.rfq_awards.find((a) => a.rfq_id === r.id) ?? null;
    return {
      id: r.id,
      title: r.title,
      currency: r.currency,
      created_at: r.created_at,
      status: r.status,
      deadline: r.deadline,
      items: d.rfq_items.filter((i) => i.rfq_id === r.id).map((i) => ({ id: i.id, name: i.name, quantity: i.quantity })),
      invites: d.rfq_suppliers
        .filter((s) => s.rfq_id === r.id)
        .map((s) => ({ id: s.id, label: s.company_name, email: s.email, supplier_id: s.supplier_id, status: s.status, invited_at: s.invited_at })),
      quotes: d.quotes
        .filter((q) => q.rfq_id === r.id)
        .map((q) => ({
          id: q.id,
          invite_id: q.supplier_id,
          status: q.status,
          submitted_at: q.submitted_at,
          delivery_days: q.delivery_days,
          warranty: q.warranty,
          lines: d.quote_items.filter((qi) => qi.quote_id === q.id).map((qi) => ({ item_id: qi.rfq_item_id, total: qi.total_price })),
        })),
      award: award
        ? { decision: award.decision, quote_id: award.recommended_quote_id, po_sent_at: award.po_sent_at, created_at: award.created_at, reason: award.reason }
        : null,
    };
  });
}
