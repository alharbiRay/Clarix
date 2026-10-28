-- Clarix — Migration 0020
-- Phase 12: waitlist leads from the public pricing page.
--
-- leads: name, work email, company, team size, an optional note, the page
-- language and the tier they looked at. Written only by the server
-- (service role) after validation and a rate limit; nobody reads it through
-- the API: RLS on, no policies, table access revoked. The owner reads leads
-- in the Supabase dashboard. Personal data: the app never logs these values.
--
-- consume_public_rate_limit gains one action, lead_submit_ip (5 an hour).
-- Additive.
-- Rollback: drop table public.leads; then re-apply the function from 0019.

create table public.leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  email        text not null check (char_length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  company      text check (company is null or char_length(company) <= 160),
  team_size    text check (team_size is null or team_size in ('1-10', '11-50', '51-200', '200+')),
  note         text check (note is null or char_length(note) <= 1000),
  tier         text check (tier is null or tier in ('starter', 'team', 'business')),
  locale       text check (locale is null or locale in ('ar', 'en')),
  created_at   timestamptz not null default now()
);

-- One row per email: a repeat sign-up keeps the first row (the app treats it as done).
create unique index leads_email_idx on public.leads (lower(email));

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;

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
    -- Joining the pricing waitlist.
    when 'lead_submit_ip'     then max_events := 5;  window_secs := 3600;
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
