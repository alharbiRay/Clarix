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
--   Two exceptions: a cascade from deleting the whole account, and
--   reset_demo_audit_events() — service-role only, demo accounts only — so a
--   demo re-seed can rebuild its sample trail with fresh dates.
-- * rfq_id is deliberately NOT a foreign key: the trail outlives the RFQ.
--
-- Additive. Rollback: drop table public.audit_events;
--   drop function public.audit_events_append_only(); drop function public.reset_demo_audit_events(uuid);

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
  for select using (buyer_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;
revoke update, delete, truncate on public.audit_events from service_role;

create or replace function public.audit_events_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'audit_events is append-only (TRUNCATE refused)';
  end if;
  -- pg_trigger_depth() > 1 means we're inside a foreign-key cascade (the
  -- whole account is being deleted) — the only allowed removal.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  -- The demo reset (below) tags its transaction with the demo buyer's id.
  if tg_op = 'DELETE' and old.buyer_id::text = current_setting('clarix.demo_audit_reset', true) then
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


create trigger audit_events_no_truncate
  before truncate on public.audit_events
  for each statement execute function public.audit_events_append_only();

-- Demo re-seed only: clears the demo account's sample trail so it can be
-- regenerated with dates that match the refreshed RFQs. Refuses any account
-- that isn't flagged is_demo, and only the service role may call it.
create or replace function public.reset_demo_audit_events(p_buyer uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.profiles where id = p_buyer and is_demo) then
    raise exception 'reset_demo_audit_events: % is not a demo account', p_buyer;
  end if;
  perform set_config('clarix.demo_audit_reset', p_buyer::text, true);
  delete from public.audit_events where buyer_id = p_buyer;
  get diagnostics n = row_count;
  perform set_config('clarix.demo_audit_reset', '', true);
  return n;
end;
$$;

revoke execute on function public.reset_demo_audit_events(uuid) from public, anon, authenticated;
grant execute on function public.reset_demo_audit_events(uuid) to service_role;
