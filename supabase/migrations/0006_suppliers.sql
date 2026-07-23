-- Clarix — Migration 0006
-- Global (per-buyer) supplier profiles, independent of any single RFQ.
-- rfq_suppliers stays as the per-RFQ invite record; supplier_id links it to
-- the buyer's persistent profile for that email, auto-populated whenever a
-- quote comes in (src/lib/supplier-profile.ts) and used to compute
-- cross-RFQ performance stats (src/lib/supplier-stats.ts).

create table public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  buyer_id     uuid not null references public.profiles (id) on delete cascade,
  email        text not null,
  company_name text,
  contact_name text,
  phone        text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (buyer_id, email)
);

create index suppliers_buyer_id_idx on public.suppliers (buyer_id);

create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;

create policy "own suppliers: all" on public.suppliers
  for all using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Link rfq_suppliers -> suppliers
-- ---------------------------------------------------------------------------

alter table public.rfq_suppliers
  add column supplier_id uuid references public.suppliers (id);

create index rfq_suppliers_supplier_id_idx on public.rfq_suppliers (supplier_id);

-- Backfill: one suppliers row per (buyer, email) already referenced by
-- existing rfq_suppliers rows, preferring the most recently-added name info.
insert into public.suppliers (buyer_id, email, company_name, contact_name)
select distinct on (r.buyer_id, lower(rs.email))
  r.buyer_id,
  lower(rs.email),
  rs.company_name,
  rs.contact_name
from public.rfq_suppliers rs
join public.rfqs r on r.id = rs.rfq_id
order by r.buyer_id, lower(rs.email), rs.created_at desc
on conflict (buyer_id, email) do nothing;

update public.rfq_suppliers rs
set supplier_id = s.id
from public.rfqs r, public.suppliers s
where rs.rfq_id = r.id
  and s.buyer_id = r.buyer_id
  and s.email = lower(rs.email)
  and rs.supplier_id is null;
