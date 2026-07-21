-- Clarix — Migration 0004
-- Auto-approval rules engine: per-buyer opt-in setting, and a per-RFQ record
-- of the rules-engine decision (auto-approved / needs review / differs from
-- cheapest) used to drive the compare-page card and dashboard notifications.

alter table public.profiles
  add column auto_approval_enabled boolean not null default true;

create type auto_approval_decision as enum (
  'auto_approved',
  'review_needed',
  'differs_from_cheapest'
);

create table public.rfq_awards (
  rfq_id                  uuid primary key references public.rfqs (id) on delete cascade,
  decision                auto_approval_decision not null,
  recommended_supplier_id uuid references public.rfq_suppliers (id),
  recommended_quote_id    uuid references public.quotes (id),
  cheapest_supplier_id    uuid references public.rfq_suppliers (id),
  cheapest_quote_id       uuid references public.quotes (id),
  reason                  text,
  po_sent_at              timestamptz,
  created_at              timestamptz not null default now()
);

alter table public.rfq_awards enable row level security;

create policy "own rfq awards: all" on public.rfq_awards
  for all using (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  ) with check (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  );
