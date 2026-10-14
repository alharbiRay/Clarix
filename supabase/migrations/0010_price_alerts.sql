-- Clarix — Migration 0010
-- Per-buyer price alert threshold for the comparison page's price-history
-- badges ("+12% vs this supplier's last quote"). Default 10%. Additive.
-- Rollback: alter table public.profiles drop column if exists price_alert_threshold;

alter table public.profiles
  add column if not exists price_alert_threshold numeric(4, 3) not null default 0.10
  check (price_alert_threshold >= 0.01 and price_alert_threshold <= 1);

-- Profile UPDATE is column-scoped (migration 0008); allow this one too.
grant update (price_alert_threshold) on public.profiles to authenticated;
