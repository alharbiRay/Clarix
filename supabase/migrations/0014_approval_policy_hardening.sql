-- Clarix — Migration 0014
-- Review fixes for the approval policy (0013 is already in production, so
-- these go in a new migration).
--
-- * spend_limit_currency: a limit means nothing without its currency, and RFQs
--   can be in different currencies. When it doesn't match the RFQ's, the RFQ
--   waits for a manager (src/lib/approval/rules.ts spendLimitProblem). Null
--   on older rows means "the RFQ's own currency" — no row has a limit yet.
-- * Only managers may write the policy (restrictive policies). Otherwise a
--   future "buyer" seat could lift the spend limit and then approve above it.
--
-- Additive. Rollback: drop the two "managers only" policies;
--   alter table public.approval_policies drop column spend_limit_currency;

alter table public.approval_policies
  add column if not exists spend_limit_currency text check (spend_limit_currency ~ '^[A-Z]{3}$');

create policy "managers only: insert" on public.approval_policies
  as restrictive for insert to authenticated
  with check ((select role from public.profiles where id = (select auth.uid())) = 'manager');

create policy "managers only: update" on public.approval_policies
  as restrictive for update to authenticated
  using ((select role from public.profiles where id = (select auth.uid())) = 'manager')
  with check ((select role from public.profiles where id = (select auth.uid())) = 'manager');
