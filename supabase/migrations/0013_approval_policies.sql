-- Clarix — Migration 0013
-- Configurable auto-approval rules per account (Phase 7), replacing the
-- hard-coded "cheapest, ≤14 days, warranty required" rules, plus a role so
-- only a manager can approve above the spend limit.
--
-- * approval_policies: one row per account (the tenant — see D-002),
--   backfilled from profiles.auto_approval_enabled so nothing changes for
--   existing accounts. That column stays for backward compatibility; the
--   policy row is the source of truth from now on.
-- * profiles.role: 'manager' for every existing account (each account is
--   its own organization today). Not in the profile UPDATE column grant, so
--   nobody can promote themselves.
--
-- Additive. Rollback: drop table public.approval_policies;
--                     alter table public.profiles drop column if exists role;

create table public.approval_policies (
  buyer_id           uuid primary key references public.profiles (id) on delete cascade,
  enabled            boolean not null default true,
  max_delivery_days  int not null default 14 check (max_delivery_days between 1 and 365),
  require_warranty   boolean not null default true,
  spend_limit        numeric(14, 2) check (spend_limit >= 0),
  min_supplier_score int check (min_supplier_score between 0 and 100),
  require_cheapest   boolean not null default true,
  updated_at         timestamptz not null default now()
);

create trigger approval_policies_updated_at before update on public.approval_policies
  for each row execute function public.set_updated_at();

alter table public.approval_policies enable row level security;

create policy "own approval policy: select" on public.approval_policies
  for select using (buyer_id = (select auth.uid()));
create policy "own approval policy: insert" on public.approval_policies
  for insert with check (buyer_id = (select auth.uid()));
create policy "own approval policy: update" on public.approval_policies
  for update using (buyer_id = (select auth.uid())) with check (buyer_id = (select auth.uid()));

create policy "demo read-only: insert" on public.approval_policies
  as restrictive for insert to authenticated with check (not public.is_demo_account());
create policy "demo read-only: update" on public.approval_policies
  as restrictive for update to authenticated using (not public.is_demo_account());
create policy "demo read-only: delete" on public.approval_policies
  as restrictive for delete to authenticated using (not public.is_demo_account());

insert into public.approval_policies (buyer_id, enabled)
select id, auto_approval_enabled from public.profiles
on conflict (buyer_id) do nothing;

alter table public.profiles
  add column if not exists role text not null default 'manager' check (role in ('buyer', 'manager'));
