-- Clarix — Migration 0005
-- Default currency is SAR, not USD. Only changes the column default for
-- future inserts that omit currency — existing rows are untouched.

alter table public.rfqs
  alter column currency set default 'SAR';
