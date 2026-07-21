-- Clarix — Migration 0003
-- Email automation: inbound-emailed PDF quotes, buyer AI preferences per RFQ,
-- and in-app notifications for the auto-generated recommendation flow.

-- ---------------------------------------------------------------------------
-- Quotes: a supplier can now reply to their invitation email with a PDF.
-- 'email' is a distinct source from 'pdf' (which is a buyer-side upload) so
-- the UI can label provenance correctly. source_email_id guards against
-- Resend webhook retries creating a duplicate quote.
-- ---------------------------------------------------------------------------

alter type quote_source add value if not exists 'email';

alter table public.quotes add column if not exists source_email_id text;

create unique index if not exists quotes_source_email_id_key
  on public.quotes (source_email_id)
  where source_email_id is not null;

-- ---------------------------------------------------------------------------
-- Buyer priority preferences for the AI recommendation, one row per RFQ.
-- Captured via the "Get AI recommendation" form and reused by the
-- auto-recommendation trigger when a buyer hasn't opened that form yet.
-- ---------------------------------------------------------------------------

create table public.rfq_preferences (
  rfq_id       uuid primary key references public.rfqs (id) on delete cascade,
  weights      jsonb not null,
  has_deadline boolean not null default false,
  deadline_date date,
  max_budget   numeric(14, 2) check (max_budget >= 0),
  updated_at   timestamptz not null default now()
);

alter table public.rfq_preferences enable row level security;

create policy "own rfq preferences: all" on public.rfq_preferences
  for all using (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  ) with check (
    exists (select 1 from public.rfqs r where r.id = rfq_id and r.buyer_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- In-app notifications (e.g. "comparison ready" dashboard banner). Written by
-- server code with the service-role key; buyers read/dismiss their own.
-- ---------------------------------------------------------------------------

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  buyer_id   uuid not null references public.profiles (id) on delete cascade,
  rfq_id     uuid not null references public.rfqs (id) on delete cascade,
  type       text not null,
  message    text not null,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_buyer_unread_idx on public.notifications (buyer_id, read_at);

alter table public.notifications enable row level security;

create policy "own notifications: select" on public.notifications
  for select using (buyer_id = auth.uid());
create policy "own notifications: update" on public.notifications
  for update using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());
