-- Clarix — Migration 0015
-- Negotiation assistant (Phase 8).
--
-- * rate_limit_events + consume_rate_limit(): a per-account sliding-window
--   limit for actions that spend money (Gemini drafts, outgoing email). The
--   function checks and records in one transaction under an advisory lock,
--   so parallel requests can't both slip under the limit. The table is
--   reachable only through the function.
-- * suppliers.preferred_language: which language negotiation messages go out
--   in ('ar' | 'en'); null = not known yet (the app guesses from the name).
--
-- Additive. Rollback: drop function public.consume_rate_limit(text, int, int);
--   drop table public.rate_limit_events; alter table public.suppliers drop column preferred_language;

create table public.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_lookup_idx on public.rate_limit_events (user_id, action, created_at desc);

alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

create or replace function public.consume_rate_limit(p_action text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  used int;
begin
  if uid is null then
    raise exception 'consume_rate_limit: not authenticated';
  end if;
  if p_limit < 1 or p_window_seconds < 1 or length(p_action) not between 1 and 64 then
    raise exception 'consume_rate_limit: invalid arguments';
  end if;
  perform pg_advisory_xact_lock(hashtext(uid::text || ':' || p_action));
  -- Old rows are no longer needed by any window this action uses.
  delete from public.rate_limit_events
   where user_id = uid and action = p_action and created_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into used from public.rate_limit_events
   where user_id = uid and action = p_action and created_at >= now() - make_interval(secs => p_window_seconds);
  if used >= p_limit then
    return false;
  end if;
  insert into public.rate_limit_events (user_id, action) values (uid, p_action);
  return true;
end;
$$;

revoke execute on function public.consume_rate_limit(text, int, int) from public, anon;
grant execute on function public.consume_rate_limit(text, int, int) to authenticated, service_role;

alter table public.suppliers
  add column if not exists preferred_language text check (preferred_language in ('ar', 'en'));
