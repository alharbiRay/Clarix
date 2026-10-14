# Phase 3: Savings dashboard

1. Define the metrics precisely (`docs/METRICS.md`): savings = average of the other complete
   quotes minus the awarded total, plus every edge case.
2. Pure metrics module (`src/lib/metrics`), test-first: RFQ and line-item savings, KPIs, monthly series,
   spend by supplier, top savings, review queue, formatting.
3. Loader with a tested row mapper (RLS client plus an explicit `buyer_id` filter). Index migration 0009.
4. UI: savings panel (hero figure plus a validated single-hue chart, a tooltip, and a screen-reader table),
   ops strip, review queue, spend by supplier, top savings. Plus a skeleton, an error boundary, and empty states.
5. Fix R13: the top-bar dot shows only when unread notifications exist.
6. Visual check of the panels rendered from the demo dataset (desktop, mobile, empty) through a throwaway page.
