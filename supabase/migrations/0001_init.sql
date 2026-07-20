-- Clarix — RFQ comparison tool
-- Migration 0001: core schema
-- Run this in the Supabase SQL Editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type rfq_status as enum ('draft', 'sent', 'closed', 'awarded');

create type supplier_invite_status as enum ('pending', 'sent', 'viewed', 'submitted', 'declined');

-- How the quote entered the system: structured form vs. PDF extraction
create type quote_source as enum ('form', 'pdf');

-- pdf quotes start as 'needs_review' and must be confirmed by the buyer
-- before they participate in the comparison.
create type quote_status as enum ('submitted', 'needs_review', 'confirmed', 'rejected');

-- ---------------------------------------------------------------------------
-- Profiles (buyers)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  company    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RFQs
-- ---------------------------------------------------------------------------

create table public.rfqs (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references public.profiles (id) on delete cascade,
  title       text not null,
  project     text,
  description text,
  currency    text not null default 'USD',
  deadline    timestamptz,
  status      rfq_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index rfqs_buyer_id_idx on public.rfqs (buyer_id);
create index rfqs_status_idx on public.rfqs (status);

-- Line items the buyer wants quoted
create table public.rfq_items (
  id          uuid primary key default gen_random_uuid(),
  rfq_id      uuid not null references public.rfqs (id) on delete cascade,
  position    int not null default 0,
  name        text not null,
  description text,
  quantity    numeric(14, 3) not null default 1 check (quantity > 0),
  unit        text not null default 'pcs',
  created_at  timestamptz not null default now()
);

create index rfq_items_rfq_id_idx on public.rfq_items (rfq_id);

-- ---------------------------------------------------------------------------
-- Supplier invites
-- Each supplier gets a unique token → /quote/[token] form link (no login).
-- ---------------------------------------------------------------------------

create table public.rfq_suppliers (
  id           uuid primary key default gen_random_uuid(),
  rfq_id       uuid not null references public.rfqs (id) on delete cascade,
  email        text not null,
  company_name text,
  contact_name text,
  token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  status       supplier_invite_status not null default 'pending',
  invited_at   timestamptz,
  viewed_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (rfq_id, email)
);

create index rfq_suppliers_rfq_id_idx on public.rfq_suppliers (rfq_id);
create index rfq_suppliers_token_idx on public.rfq_suppliers (token);

-- ---------------------------------------------------------------------------
-- Quotes
-- One quote per supplier invite. source = 'form' | 'pdf'.
-- PDF quotes carry the storage path + raw Claude extraction and require
-- buyer confirmation (status 'needs_review' → 'confirmed').
-- ---------------------------------------------------------------------------

create table public.quotes (
  id              uuid primary key default gen_random_uuid(),
  rfq_id          uuid not null references public.rfqs (id) on delete cascade,
  supplier_id     uuid not null references public.rfq_suppliers (id) on delete cascade,
  source          quote_source not null,
  status          quote_status not null,
  delivery_days   int check (delivery_days >= 0),
  payment_terms   text,
  warranty        text,
  notes           text,
  pdf_path        text,   -- storage path in the quote-pdfs bucket (pdf source only)
  extraction_raw  jsonb,  -- raw Claude extraction payload, kept for audit
  submitted_at    timestamptz not null default now(),
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (supplier_id),
  check (source <> 'pdf' or pdf_path is not null)
);

create index quotes_rfq_id_idx on public.quotes (rfq_id);

create table public.quote_items (
  id           uuid primary key default gen_random_uuid(),
  quote_id     uuid not null references public.quotes (id) on delete cascade,
  rfq_item_id  uuid not null references public.rfq_items (id) on delete cascade,
  unit_price   numeric(14, 2) check (unit_price >= 0),
  total_price  numeric(14, 2) check (total_price >= 0),
  notes        text,
  unique (quote_id, rfq_item_id)
);

create index quote_items_quote_id_idx on public.quote_items (quote_id);

-- ---------------------------------------------------------------------------
-- AI recommendations (one latest per RFQ, history kept)
-- ---------------------------------------------------------------------------

create table public.ai_recommendations (
  id         uuid primary key default gen_random_uuid(),
  rfq_id     uuid not null references public.rfqs (id) on delete cascade,
  content    jsonb not null,  -- { recommendation, ranking[], risks[], reasoning }
  model      text not null,
  created_at timestamptz not null default now()
);

create index ai_recommendations_rfq_id_idx on public.ai_recommendations (rfq_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger rfqs_updated_at before update on public.rfqs
  for each row execute function public.set_updated_at();
create trigger quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Buyers (authenticated) only ever see their own RFQs and children.
-- Suppliers never authenticate: the token-based quote form and PDF intake go
-- through server routes using the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.rfqs enable row level security;
alter table public.rfq_items enable row level security;
alter table public.rfq_suppliers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.ai_recommendations enable row level security;

create policy "own profile: select" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile: update" on public.profiles
  for update using (auth.uid() = id);

create policy "own rfqs: all" on public.rfqs
  for all using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

create policy "own rfq items: all" on public.rfq_items
  for all using (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  ) with check (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  );

create policy "own rfq suppliers: all" on public.rfq_suppliers
  for all using (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  ) with check (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  );

create policy "own quotes: all" on public.quotes
  for all using (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  ) with check (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  );

create policy "own quote items: all" on public.quote_items
  for all using (
    exists (
      select 1 from public.quotes q
      join public.rfqs r on r.id = q.rfq_id
      where q.id = quote_id and r.buyer_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.quotes q
      join public.rfqs r on r.id = q.rfq_id
      where q.id = quote_id and r.buyer_id = auth.uid()
    )
  );

create policy "own recommendations: all" on public.ai_recommendations
  for all using (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  ) with check (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Storage: private bucket for supplier quote PDFs.
-- Path convention: {rfq_id}/{quote_id}.pdf
-- Buyers can read/upload files under RFQs they own; supplier-emailed PDFs are
-- written by the server with the service-role key.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('quote-pdfs', 'quote-pdfs', false)
on conflict (id) do nothing;

create policy "quote pdfs: buyer read" on storage.objects
  for select using (
    bucket_id = 'quote-pdfs'
    and exists (
      select 1 from public.rfqs r
      where r.id::text = (storage.foldername(name))[1]
        and r.buyer_id = auth.uid()
    )
  );

create policy "quote pdfs: buyer upload" on storage.objects
  for insert with check (
    bucket_id = 'quote-pdfs'
    and exists (
      select 1 from public.rfqs r
      where r.id::text = (storage.foldername(name))[1]
        and r.buyer_id = auth.uid()
    )
  );
