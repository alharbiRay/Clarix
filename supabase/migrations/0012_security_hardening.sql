-- Clarix — Migration 0012
-- Fixes from the Supabase security advisor (applied 2026-10-28):
-- * set_updated_at: pin search_path (function_search_path_mutable).
-- * handle_new_user: a trigger function — nobody should call it over
--   /rest/v1/rpc. Revoking EXECUTE doesn't affect the trigger firing.
-- * is_demo_account: needed by the "demo read-only" RLS policies, which only
--   apply to `authenticated`; anon has no reason to call it.
-- Rollback: grant execute on the two functions back to anon/authenticated;
--           alter function public.set_updated_at() reset search_path;

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_demo_account() from anon;
