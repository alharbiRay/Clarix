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
| Sent → all replied | For RFQs where every invited supplier has resolved (submitted or declined) and at least one quoted: last quote `submitted_at` minus first `invited_at` (negative values from clock skew are ignored). Reported as the mean, in hours. |
| Supplier response time | For each comparable quote with a known invite time: `submitted_at − invited_at`. Reported as the mean, in hours. |
| Spend by supplier | Sum of awarded totals per supplier (the persistent supplier profile when linked, otherwise the invite label), primary currency only. |
| Needs review | Awards with a decision other than `auto_approved` and no PO sent yet, plus AI-extracted quotes (`needs_review`) waiting for the buyer to confirm them. |
| Biggest savings | RFQs with positive measured savings, all time, largest first. A premium paid is not a saving and is never listed here. |
| Change vs last month | `(this − last) / |last|`. When last month was zero there's nothing to compare against, so no percentage is shown. |

## Supplier scorecard

`src/lib/scorecard` is pure and unit-tested. It uses the same snapshot as the dashboard.
A supplier is the buyer's persistent supplier profile (`suppliers.id`), followed through
every RFQ invitation linked to it. Invitations are linked to the profile only once the supplier
quotes, so unlinked invitations are matched by **email** too. Otherwise ignored and declined
invitations would be invisible and the response rate would always look perfect.

"Quoted" means a comparable quote (`submitted` or `confirmed`). An AI extraction still waiting for review
doesn't count yet.

| Metric | Definition |
| --- | --- |
| Response rate | quotes ÷ invitations sent. Excluded: invitations never sent, and unanswered invitations on RFQs that are still open (deadline not passed), which aren't a miss yet. |
| Median response time | median of `submitted_at − invited_at`, in hours |
| Win rate | purchase orders received ÷ quotes on **decided** RFQs (PO sent, or RFQ closed/awarded). Manual approvals count, and open RFQs are neither wins nor losses. |
| Price vs lowest | mean of `(my total − lowest complete total) ÷ lowest`, over RFQs where at least two complete quotes competed. 0% means always the cheapest. |
| Delivery vs typical | the supplier's promised days compared with the median promised days on the same RFQ. We have no actual delivery dates, so "reliability" means promising at or faster than the market. |
| Warranty rate | share of quotes that include a warranty |

### Composite score (0–100)

| Component | Weight | Component score (0–1) |
| --- | --- | --- |
| Price | 30 | `1 − priceVsLowest ÷ 25%`, clamped (25% above the lowest scores 0) |
| Responsiveness | 20 | `0.6 × responseRate + 0.4 × (1 − medianHours ÷ 120)`, clamped. With no measurable response time, the response rate alone. |
| Delivery | 20 | share of quotes at or faster than the RFQ's median days |
| Warranty | 15 | warranty rate |
| Win rate | 15 | `winRate ÷ 50%`, clamped (winning half the time earns full marks) |

`score = round(100 × Σ weight·component ÷ Σ weight of the components with data)`. The breakdown's whole-number points are allocated by largest remainder, so they always add up to the score.
A component with no data (for example, the supplier never faced competition on price) is left
out and the remaining weights are renormalized. The breakdown shows which components counted.
With fewer than **2 quotes** the score is withheld and the supplier is shown as "New".

Strengths and weaknesses are plain-language rules on the raw metrics. For example, price
within 3% of the lowest is a strength and 10% or more above it is a weakness; a warranty on
half the quotes or fewer is a weakness. The trend recomputes the score from what was known at
the end of each of the last six months.

**Last active** is the supplier's own last quote, or the last invitation if they never quoted.

## Price history and alerts

Price history is derived, not stored. Every comparable quote line becomes a point
(normalized item key, unit, currency, supplier, unit price, time). The unit price is the quoted
`unit_price`, or the line total ÷ quantity when only a total was given.

**Item matching** (`src/lib/pricing/normalize.ts`) is deterministic. It normalizes case,
whitespace, punctuation, and Arabic script (diacritics, tatweel, alef/yaa/taa-marbuta variants,
Arabic-Indic digits). It turns sizes into tokens ("50 كجم" → `50kg`, "40×30×30" → `40x30x30`), ignores
word order and filler words, and maps common procurement terms between Arabic and English
through a small glossary ("حديد تسليح" ↔ "rebar"). Units are normalized too ("كيس" → bag), and prices are only
compared within the same item, unit, and currency.

| Badge | Definition |
| --- | --- |
| vs their last | change from this supplier's most recent earlier price for the same item, on a different RFQ |
| vs market | change from the average of all suppliers' prices for the item over the previous 180 days, excluding this RFQ. Needs at least 2 points. |

A change at or above the buyer's **price alert threshold** (Settings, default 10%) is highlighted:
amber when the price went up, green when it went down. The compare page uses the last 365 days
of quotes.

## Reports (Phase 9)
The Reports page (`src/lib/reports`) reuses the definitions above for a chosen date range and,
optionally, one supplier:
- **Spend and savings**: purchase orders sent in the range, primary currency only. Savings use the
  same "average of the other complete quotes" baseline.
- **Auto-approval rate**: auto-approved decisions divided by all decisions made in the range.
- **Supplier comparison**: scorecard metrics over RFQs created in the range. Wins, spend and savings
  come from purchase orders sent in it.
- **Categories**: the awarded quote's line totals, grouped by a category derived from each item's
  name (see D-058).
