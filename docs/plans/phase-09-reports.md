# Phase 9: Reports

1. `src/lib/reports`:
   - `buildReport(rfqs, {from, to, supplier})` filters and groups. All money comes from the
     Phase 3 metrics module (`measuredSavings`, `savingsSeriesForMonths`, `spendBySupplier`) and the
     Phase 4 scorecard (`supplierMetrics`). On the demo dataset, a test checks that it matches the
     dashboard's functions exactly.
   - `parseReportFilters` defaults to the last six months, reads Saudi calendar days, swaps reversed
     dates, and caps the range at 36 months.
2. Categories (`categories.ts`): derived from item names through the bilingual price-history
   normalizer, then keyword rules. Line items have no category field (D-058).
3. CSV (`csv.ts`, `GET /api/reports/csv`): built on the server from the same report.
   - Four sections: purchase orders, monthly, suppliers, categories.
   - UTF-8 with a BOM and CRLF, RFC 4180 quoting, and a guard against formula injection.
   - Uses the RLS-scoped client and returns `no-store`.
4. `/reports` page:
   - Filter form (GET), summary row, monthly spend and savings charts (one measure each) with a
     table version, supplier comparison, category shares, and purchase orders.
   - Print or save as PDF: the sidebar, top bar, filters and buttons are hidden when printing, and
     sections don't split across pages.
   - The Reports nav item is enabled.
