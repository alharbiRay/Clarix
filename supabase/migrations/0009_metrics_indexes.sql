-- Clarix — Migration 0009
-- Indexes for the savings dashboard and reports (src/lib/metrics/load.ts):
-- the buyer's RFQs newest-first, and award lookups by PO date. Additive.
-- Rollback: drop index if exists rfqs_buyer_created_idx, rfq_awards_po_sent_at_idx, quotes_supplier_id_idx;

create index if not exists rfqs_buyer_created_idx on public.rfqs (buyer_id, created_at desc);
create index if not exists rfq_awards_po_sent_at_idx on public.rfq_awards (po_sent_at) where po_sent_at is not null;
-- supplier-scorecard queries filter quotes by invite (rfq_suppliers.id)
create index if not exists quotes_supplier_id_idx on public.quotes (supplier_id);
