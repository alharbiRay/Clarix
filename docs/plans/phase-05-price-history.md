# Phase 5: Price history and price alerts

1. Deterministic normalizer (Arabic/English, units, sizes, glossary), test-first with bilingual cases.
2. Derived price history from the metrics snapshot (which gains unit prices and units). "vs their last" and
   "vs market" insights, test-first (same RFQ and future points excluded, units and currency must match).
3. Migration 0010: `profiles.price_alert_threshold` (default 0.10, range-checked, column grant).
   A settings action (validated, demo-guarded) and a form.
4. Compare page: per-line badges plus a per-item history popover (a dot plot and recent prices). Fail-soft loading.
