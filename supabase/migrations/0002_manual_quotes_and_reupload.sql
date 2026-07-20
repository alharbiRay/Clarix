-- Clarix — Migration 0002
-- 1. Allow re-uploading a PDF quote for a supplier after their previous quote
--    was rejected. The original unique(supplier_id) constraint blocked this
--    at the DB level even after the app-side "already has a quote" checks
--    were relaxed for rejected quotes — a rejected quote should not
--    permanently occupy the supplier's one quote slot.
-- 2. Add 'manual' as a quote source so buyers can key in a supplier's prices
--    directly (phone/email quotes) without a PDF or the supplier form.

alter table public.quotes drop constraint if exists quotes_supplier_id_key;

create unique index if not exists quotes_supplier_id_active_key
  on public.quotes (supplier_id)
  where status <> 'rejected';

alter type quote_source add value if not exists 'manual';
