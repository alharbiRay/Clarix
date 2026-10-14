# Metrics definitions

Every number on the dashboard (Phase 3) and on the reports page (Phase 9) comes from
`src/lib/metrics/`, a pure, unit-tested module. Pages only load data and format it.
Neither page recomputes anything.

## Shared rules

- **Comparable quote:** status `submitted` or `confirmed`. PDF extractions still `needs_review`
  and `rejected` quotes never count.
- **Complete quote:** a comparable quote that prices *every* line item on the RFQ. Totals come
  from line totals (`quote_items.total_price`), rounded to the cent. This is the same
  definition the compare page and the auto-approval engine use (`src/lib/quote-comparison.ts`).
- **Awarded RFQ:** has an `rfq_awards` row whose `po_sent_at` is set. That covers
  auto-approved RFQs and manually approved ones. The awarded quote is
  `rfq_awards.recommended_quote_id`, which `approveAward` overwrites with whoever actually got the PO.
- **Time zone:** months and "this month" use Saudi time (UTC+3; Saudi Arabia has no DST).
- **Currency:** RFQs are single-currency, since every quote is entered in the RFQ's currency.
  Amounts are aggregated **per currency** and never summed across currencies. Dashboard KPIs use
  the *primary currency* (the currency of most awarded RFQs, defaulting to SAR) and report how
  many awarded RFQs in other currencies were left out.

## Savings (per awarded RFQ)

```
baseline = average(total of every OTHER complete quote on the RFQ)
savings  = baseline − awarded total
savings% = savings / baseline
```

**Why the average of the other quotes?** It's the conservative, standard "cost avoidance
versus the average bid" measure:

| Option | Problem |
| --- | --- |
| Highest quote − awarded | Overstates savings. One outlier quote inflates the number, and suppliers can game it. |
| Second-lowest − awarded | Unstable with two or three quotes, and it is zero whenever the buyer picks a non-cheapest supplier. |
| **Average of other quotes − awarded** | Uses every alternative the buyer actually had, a single outlier moves it less, and it reads naturally ("we paid X% less than the average alternative"). |

Edge cases:

| Case | Result |
| --- | --- |
| No other complete quote (single quote, or the others are incomplete) | `basis = "no_baseline"`, savings `0`. The RFQ counts toward spend but not toward savings%. |
| Awarded quote is incomplete or missing | Excluded from savings and spend (`basis = "unmeasurable"`). |
| Awarded quote is pricier than the average (premium for delivery or warranty) | **Negative** savings, reported as a premium paid, never clamped to zero. |
| RFQ not awarded (no PO sent yet) | No savings yet. |

Savings are attributed to the month of `po_sent_at`.

**Line-item savings** use the same formula per item: the average of the other quotes'
*line* totals for that item minus the awarded line total. They help find which items save
money, but they don't add up to the RFQ-level savings (each item averages over a different
set of quotes), so KPIs always use the RFQ-level figure.

## Operational KPIs

| KPI | Definition |
| --- | --- |
| RFQs created | Count of RFQs whose `created_at` falls in the month. |
| Auto-approval rate | Over the trailing 90 days: among RFQs whose rules-engine decision (`rfq_awards.created_at`) falls in the window, the share with `decision = auto_approved`. |
| Sent → all replied | For RFQs where every invited supplier has resolved (submitted or declined) and at least one quoted: last quote `submitted_at` minus first `invited_at`. Reported as the mean, in hours. |
| Supplier response time | For each comparable quote with a known invite time: `submitted_at − invited_at`. Reported as the mean, in hours. |
| Spend by supplier | Sum of awarded totals per supplier (the persistent supplier profile when linked, otherwise the invite label), primary currency only. |
| Needs review | Awards with a decision other than `auto_approved` and no PO sent yet. |
| Change vs last month | `(this − last) / |last|`. Shown as "new" when last month was zero. |
