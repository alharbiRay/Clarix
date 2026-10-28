-- Clarix — Migration 0017
-- Phase 10: language preference and VAT.
--
-- * profiles.locale: the buyer's interface language ('ar' | 'en'); null =
--   not chosen yet (the app follows the browser). Mirrors the NEXT_LOCALE
--   cookie so the choice follows the buyer across devices.
-- * profiles.vat_rate: VAT applied on top of quoted prices, as a fraction.
--   Saudi Arabia's standard rate is 15%; 0 turns the VAT line off. Quote
--   prices are always stored EXCLUDING VAT (D-062), so comparison and reports
--   rank on the same basis and show VAT as its own line.
--
-- Both are added to the profile UPDATE column grant (0008), so buyers can
-- change them and nothing else new. Additive.
-- Rollback: alter table public.profiles drop column locale, drop column vat_rate;

alter table public.profiles
  add column if not exists locale text check (locale in ('ar', 'en')),
  add column if not exists vat_rate numeric(5, 4) not null default 0.15 check (vat_rate >= 0 and vat_rate <= 0.5);

grant update (locale, vat_rate) on public.profiles to authenticated;
