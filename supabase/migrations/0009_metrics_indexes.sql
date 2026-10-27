-- Clarix — Migration 0009
-- Index for the savings dashboard and reports (src/lib/metrics/load.ts): the
-- buyer's RFQs newest-first, paged. Additive.
-- (rfqs_buyer_id_idx from 0001 becomes redundant but is left in place —
-- dropping it buys little and is not reversible-by-default.)
-- Rollback: drop index if exists rfqs_buyer_created_idx;

create index if not exists rfqs_buyer_created_idx on public.rfqs (buyer_id, created_at desc);
