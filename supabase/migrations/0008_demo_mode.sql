-- Clarix — Migration 0008
-- Demo mode: a shared, read-only demo workspace ("Try the demo", no signup).
--
-- * is_demo flags on the top-level owned rows (profiles, rfqs, suppliers);
--   child rows are scoped through their RFQ.
-- * RESTRICTIVE policies: Postgres ANDs them with the existing permissive
--   "own …" policies, so for a demo account every INSERT/UPDATE/DELETE is
--   refused at the database — the server-action guards in the app are UX,
--   this is the actual enforcement.
-- * Profile UPDATE is narrowed to specific columns so nobody can toggle
--   is_demo (or future privilege columns) on their own account.
--
-- Additive. Rollback: drop the "demo read-only" policies, the
-- is_demo_account() function, the is_demo columns, and
-- `grant update on public.profiles to authenticated;`.

alter table public.profiles  add column if not exists is_demo boolean not null default false;
alter table public.rfqs      add column if not exists is_demo boolean not null default false;
alter table public.suppliers add column if not exists is_demo boolean not null default false;

create index if not exists rfqs_is_demo_idx on public.rfqs (is_demo) where is_demo;

-- security definer: reads profiles regardless of the caller's RLS, and is
-- evaluated once per statement (stable) rather than per row.
create or replace function public.is_demo_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = auth.uid()), false)
$$;

revoke execute on function public.is_demo_account() from public;
grant execute on function public.is_demo_account() to anon, authenticated, service_role;

-- One restrictive policy per write command per table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'rfqs', 'rfq_items', 'rfq_suppliers', 'quotes', 'quote_items',
    'ai_recommendations', 'rfq_preferences', 'rfq_awards', 'notifications', 'suppliers'
  ]
  loop
    execute format(
      'create policy "demo read-only: insert" on public.%I as restrictive for insert to authenticated with check (not public.is_demo_account())', t);
    execute format(
      'create policy "demo read-only: update" on public.%I as restrictive for update to authenticated using (not public.is_demo_account())', t);
    execute format(
      'create policy "demo read-only: delete" on public.%I as restrictive for delete to authenticated using (not public.is_demo_account())', t);
  end loop;
end
$$;

create policy "demo read-only: pdf upload" on storage.objects
  as restrictive for insert to authenticated
  with check (not public.is_demo_account());

-- Buyers may only change these profile columns themselves. is_demo (and the
-- role column added later) are managed by the service role. email is not
-- self-editable either: it mirrors auth.users and is how the demo account is
-- located, so letting a user overwrite it would let them impersonate it.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, company, auto_approval_enabled) on public.profiles to authenticated;
