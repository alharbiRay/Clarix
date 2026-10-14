-- Clarix — Migration 0011
-- Decision audit log: an append-only record of what happened to each RFQ and
-- why (who sent it, how each quote arrived, what the AI extracted and
-- recommended, which approval rule fired, who overrode what and why).
--
-- Integrity model:
-- * Buyers can READ their own trail (RLS). They cannot write it: there is no
--   insert policy, and insert is revoked — only server code (service role)
--   records events, so a user can't forge history via PostgREST.
-- * Nobody updates or deletes events: UPDATE/DELETE are revoked from every
--   API role, and a trigger refuses them outright (even for the owner).
--   The one exception is a cascade from deleting the whole account.
-- * rfq_id is deliberately NOT a foreign key: the trail outlives the RFQ.
--
-- Additive. Rollback: drop table public.audit_events; drop function public.audit_events_append_only();

create table public.audit_events (
  id          uuid primary key default gen_random_uuid(),
  buyer_id    uuid not null references public.profiles (id) on delete cascade,
  rfq_id      uuid,
  actor_type  text not null check (actor_type in ('buyer', 'supplier', 'system')),
  actor_id    uuid,
  event_type  text not null check (event_type in (
    'rfq_created', 'rfq_sent',
    'quote_received', 'quote_confirmed', 'quote_rejected', 'quote_deleted',
    'extraction_completed', 'extraction_failed',
    'recommendation_generated',
    'auto_approval_decided', 'award_approved',
    'po_sent',
    'negotiation_sent',
    'ai_quota_error', 'job_failed'
  )),
  summary     text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_events_rfq_idx on public.audit_events (rfq_id, created_at);
create index audit_events_buyer_idx on public.audit_events (buyer_id, created_at desc);

alter table public.audit_events enable row level security;

create policy "own audit events: select" on public.audit_events
  for select using (buyer_id = auth.uid());

revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;
revoke update, delete, truncate on public.audit_events from service_role;

create or replace function public.audit_events_append_only()
returns trigger
language plpgsql
as $$
begin
  -- pg_trigger_depth() > 1 means we're inside a foreign-key cascade (the
  -- whole account is being deleted) — the only allowed removal.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'audit_events is append-only (% refused)', tg_op;
end;
$$;

create trigger audit_events_no_update
  before update on public.audit_events
  for each row execute function public.audit_events_append_only();

create trigger audit_events_no_delete
  before delete on public.audit_events
  for each row execute function public.audit_events_append_only();
