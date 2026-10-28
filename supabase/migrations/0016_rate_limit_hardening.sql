-- Clarix — Migration 0016
-- Security fix for consume_rate_limit (0015, already in production).
--
-- 0015 trusted the caller's p_limit and p_window_seconds, and cleaned up rows
-- older than the caller's window. Any signed-in user could call it straight
-- through PostgREST with a 1-second window to wipe their own bucket (unlimited
-- AI drafts and emails), or with made-up action names to fill the table.
--
-- Now the database decides: only known actions, each with a fixed limit and
-- window; the caller's numbers are ignored (the signature is kept so the
-- app's call and any rollback stay compatible). Cleanup uses a fixed one-day
-- retention, the demo account is refused, and the service role (for which
-- auth.uid() is null anyway) loses EXECUTE.
--
-- Rollback: re-apply the function body from 0015.

create or replace function public.consume_rate_limit(p_action text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  max_events int;
  window_secs int;
  used int;
begin
  if uid is null then
    raise exception 'consume_rate_limit: not authenticated';
  end if;
  if public.is_demo_account() then
    raise exception 'consume_rate_limit: not available in the demo';
  end if;

  -- The only limits that exist. p_limit and p_window_seconds are ignored.
  case p_action
    when 'negotiation_draft' then max_events := 20; window_secs := 3600;
    when 'negotiation_send'  then max_events := 20; window_secs := 3600;
    else raise exception 'consume_rate_limit: unknown action %', p_action;
  end case;

  perform pg_advisory_xact_lock(hashtext(uid::text || ':' || p_action));
  delete from public.rate_limit_events
   where user_id = uid and action = p_action and created_at < now() - interval '1 day';
  select count(*) into used from public.rate_limit_events
   where user_id = uid and action = p_action and created_at >= now() - make_interval(secs => window_secs);
  if used >= max_events then
    return false;
  end if;
  insert into public.rate_limit_events (user_id, action) values (uid, p_action);
  return true;
end;
$$;

revoke execute on function public.consume_rate_limit(text, int, int) from public, anon, service_role;
grant execute on function public.consume_rate_limit(text, int, int) to authenticated;
