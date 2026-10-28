-- Clarix — Migration 0019
-- Phase 11: rate limits for the public (signed-out) endpoints.
--
-- consume_rate_limit (0015/0016) is per signed-in account. The supplier
-- quote form and "Try the demo" have no account, so these limits are keyed
-- by an opaque hash the server computes (sha-256 of the quote token or the
-- client IP; raw IPs are never stored). Only the service role can call the
-- function — the app calls it server-side — so visitors can't reset or
-- probe their own buckets through PostgREST. Limits are fixed here, like
-- 0016. Additive.
-- Rollback: drop function public.consume_public_rate_limit(text, text); drop table public.public_rate_limit_events;

create table public.public_rate_limit_events (
  id         bigint generated always as identity primary key,
  key_hash   text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  action     text not null,
  created_at timestamptz not null default now()
);

create index public_rate_limit_events_lookup_idx on public.public_rate_limit_events (key_hash, action, created_at desc);
create index public_rate_limit_events_created_idx on public.public_rate_limit_events (created_at);

alter table public.public_rate_limit_events enable row level security;
revoke all on public.public_rate_limit_events from anon, authenticated;

create or replace function public.consume_public_rate_limit(p_action text, p_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  max_events int;
  window_secs int;
  used int;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'consume_public_rate_limit: invalid key';
  end if;

  case p_action
    -- Submitting the supplier form: per invitation token and per IP.
    when 'quote_submit_token' then max_events := 10; window_secs := 3600;
    when 'quote_submit_ip'    then max_events := 30; window_secs := 3600;
    -- Opening a demo session (each one mints a magic link).
    when 'demo_start_ip'      then max_events := 20; window_secs := 3600;
    else raise exception 'consume_public_rate_limit: unknown action %', p_action;
  end case;

  perform pg_advisory_xact_lock(hashtext(p_key_hash || ':' || p_action));
  -- Every key, not just this one: a quote token is rarely seen again, so
  -- per-key cleanup would leave its rows forever. Indexed, and the table
  -- never holds more than a day of events.
  delete from public.public_rate_limit_events where created_at < now() - interval '1 day';
  select count(*) into used from public.public_rate_limit_events
   where key_hash = p_key_hash and action = p_action and created_at >= now() - make_interval(secs => window_secs);
  if used >= max_events then
    return false;
  end if;
  insert into public.public_rate_limit_events (key_hash, action) values (p_key_hash, p_action);
  return true;
end;
$$;

revoke execute on function public.consume_public_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, text) to service_role;
