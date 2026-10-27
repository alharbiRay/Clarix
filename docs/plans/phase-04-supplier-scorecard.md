# Phase 4: Supplier scorecard

1. Extend the metrics snapshot with each quote's delivery days and warranty (one loader for the dashboard and the scorecard).
2. `src/lib/scorecard`, test-first: per-supplier metrics, composite 0–100 score with documented weights,
   plain-language strengths and weaknesses, month-end trend, batch scoring.
3. List sort and filter as a tested pure function (score/name/recent; min 50/70/85).
4. UI: score badge (number plus tier word), score ring, weighted breakdown, trend sparkline,
   strengths and weaknesses. Supplier list with sort/filter links. Badges on the compare page headers.
5. Retire `supplier-stats.ts` and the star rating. Their win rate ignored manual approvals.
