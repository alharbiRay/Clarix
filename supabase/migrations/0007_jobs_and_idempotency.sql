-- Clarix — Migration 0007
-- Durable background jobs + idempotency guards for the auto-recommendation
-- pipeline.
--
-- Why: the recommendation + auto-approval flow used to run inline (or worse,
-- fire-and-forget) inside the request that saved the final quote. On a
-- serverless runtime that work is not guaranteed to finish, and a Gemini
-- quota error simply dropped it. Work is now recorded in `jobs` first, run
-- right away when possible, and swept up by /api/jobs/process otherwise —
-- with retries, backoff, and a visible status.
--
-- Additive only. Rollback:
--   drop function if exists public.claim_jobs(int, uuid, interval);
--   drop function if exists public.enqueue_job(text, uuid, uuid, jsonb, text, int);
--   drop table if exists public.jobs; drop type if exists job_status;
--   drop index if exists ai_recommendations_one_auto_per_rfq;
--   alter table public.ai_recommendations drop column if exists auto_generated;

create type job_status as enum ('pending', 'running', 'succeeded', 'failed');

create table public.jobs (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  buyer_id     uuid references public.profiles (id) on delete cascade,
  rfq_id       uuid references public.rfqs (id) on delete cascade,
  payload      jsonb not null default '{}'::jsonb,
  -- Two enqueues with the same key collapse into one while still pending.
  dedupe_key   text,
  status       job_status not null default 'pending',
  attempts     int not null default 0,
  max_attempts int not null default 5 check (max_attempts > 0),
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  last_error   text,
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index jobs_pending_dedupe_key
  on public.jobs (dedupe_key)
  where status = 'pending' and dedupe_key is not null;
create index jobs_runnable_idx on public.jobs (run_after) where status in ('pending', 'running');
create index jobs_rfq_id_idx on public.jobs (rfq_id);
create index jobs_buyer_id_idx on public.jobs (buyer_id);

create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- Buyers may see the status of their own jobs ("recommendation is being
-- generated…"); only the service role writes.
alter table public.jobs enable row level security;
create policy "own jobs: select" on public.jobs
  for select using (buyer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- enqueue_job: insert, or return the already-pending job with the same key.
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_job(
  p_type text,
  p_buyer_id uuid,
  p_rfq_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_max_attempts int default 5
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.jobs (type, buyer_id, rfq_id, payload, dedupe_key, max_attempts)
  values (p_type, p_buyer_id, p_rfq_id, coalesce(p_payload, '{}'::jsonb), p_dedupe_key, p_max_attempts)
  on conflict (dedupe_key) where status = 'pending' and dedupe_key is not null
  do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.jobs
    where dedupe_key = p_dedupe_key and status = 'pending'
    limit 1;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_jobs: atomically lease runnable jobs. `skip locked` lets concurrent
-- workers (the inline runner and the cron sweep) never grab the same row.
-- A job stuck in 'running' past p_stale_after (its worker was killed) is
-- reclaimed.
-- ---------------------------------------------------------------------------
create or replace function public.claim_jobs(
  p_limit int default 5,
  p_job_id uuid default null,
  p_stale_after interval default interval '5 minutes'
)
returns setof public.jobs
language sql
set search_path = public
as $$
  with picked as (
    select id
    from public.jobs
    where (p_job_id is null or id = p_job_id)
      and (
        (status = 'pending' and run_after <= now())
        or (status = 'running' and locked_at < now() - p_stale_after)
      )
    order by run_after
    limit p_limit
    for update skip locked
  )
  update public.jobs j
  set status = 'running', locked_at = now(), attempts = j.attempts + 1
  from picked
  where j.id = picked.id
  returning j.*;
$$;

revoke execute on function public.enqueue_job(text, uuid, uuid, jsonb, text, int) from public, anon, authenticated;
revoke execute on function public.claim_jobs(int, uuid, interval) from public, anon, authenticated;
grant execute on function public.enqueue_job(text, uuid, uuid, jsonb, text, int) to service_role;
grant execute on function public.claim_jobs(int, uuid, interval) to service_role;

-- ---------------------------------------------------------------------------
-- Exactly one auto-generated recommendation per RFQ. Manual "Regenerate"
-- runs stay unlimited (auto_generated = false), so history is unaffected.
-- Two concurrent final submissions can no longer both create one.
-- ---------------------------------------------------------------------------
alter table public.ai_recommendations
  add column if not exists auto_generated boolean not null default false;

create unique index if not exists ai_recommendations_one_auto_per_rfq
  on public.ai_recommendations (rfq_id)
  where auto_generated;
