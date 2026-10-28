# Evals

## Quote extraction

How well Clarix reads a supplier's quote into structured data. Each case runs through the same
prompt, response schema, Zod validation and one-shot repair the app uses (`extractQuoteFromPdf` in
`src/lib/gemini.ts`). The only difference is that the quote is sent as text instead of a PDF.

**Fixtures** (`evals/extraction/fixtures.ts`): 22 synthetic quotes in English, Arabic and mixed
language. They are messy on purpose:
- Arabic-Indic digits and prices that include VAT;
- line totals only, or a single lump sum;
- casual emails, WhatsApp-style messages and pipe tables;
- other currencies, discounts, partial quantities, alternative brands and missing items.

Each case is labeled with the unit price excluding VAT (in the document's own currency), the
currency, the delivery days, and the warranty period in months.

**Scoring** (`evals/extraction/score.ts`):
- **Unit prices** count as correct within 0.5%. Expected nulls must be null, because inventing a
  price counts as a miss.
- **Currency** and **delivery days** must match exactly.
- **Warranty** is compared as a period in months, parsed from the extracted text in either language.

**Running**:

```bash
npx tsx evals/extraction/run.ts --write
RUN_LIVE_EVALS=true npx tsx --env-file=.env.local evals/extraction/run.ts --write
```

- The first command runs offline. A rule-based baseline stands in for the model.
- The second calls Gemini (about 22 to 44 requests, spaced for the free tier's per-minute limit).
- `--write` replaces the matching generated block below. Commentary goes outside the markers.
- Unit tests (`evals/extraction/evals.test.ts`) run the harness offline only. CI runs the offline
  baseline as a smoke test (the harness must complete with no errors). It has no accuracy
  threshold: accuracy is tracked here, run by run.

The baseline is a floor, not a competitor. It shows what keyword matching and "first number on the
line" get you, and so which cases need a model: Arabic item names, VAT removal, line totals, tables.

<!-- evals:baseline:start -->
### Rule-based baseline (offline mock) — 2026-10-28

22 fixtures.

| Field | Correct | Accuracy |
| --- | --- | --- |
| Unit price | 19 / 41 | 46.3% |
| Currency | 22 / 22 | 100% |
| Delivery days | 20 / 22 | 90.9% |
| Warranty period | 22 / 22 | 100% |

| By language | en | ar | mixed |
| --- | --- | --- | --- |
| Unit price | 63% | 0% | 100% |
| Currency | 100% | 100% | 100% |
| Delivery days | 86.7% | 100% | 100% |
| Warranty period | 100% | 100% | 100% |

Misses:
- `ar-clean`: price i1: expected 18, got null; price i2: expected 2900, got null
- `en-vat-inclusive`: price i1: expected 1000, got 1150
- `en-line-totals-only`: price i1: expected 850, got 14; price i2: expected 220, got 27
- `ar-indic-digits`: price i1: expected 850, got null; price i2: expected 120, got null
- `en-table`: price i1: expected 95, got 1; price i2: expected 42, got 2; delivery: expected 2, got null
- `en-per-box`: delivery: expected 1, got null
- `ar-vat-inclusive`: price i1: expected 2500, got 24000; price i2: expected 200, got null
- `en-casual-email`: price i2: expected 3200, got 18500
- `en-discount`: price i1: expected 30, got 1; price i2: expected 142.5, got 2
- `ar-weeks-months`: price i1: expected 3450, got 5000; price i2: expected 780, got null
- `en-partial-quantity`: price i1: expected 210, got 80
- `ar-chat`: price i1: expected 4.5, got null; price i2: expected 6, got null
- `en-both-prices`: price i1: expected 75, got null
- `ar-line-totals`: price i1: expected 450, got null; price i2: expected 1250, got null

<!-- evals:baseline:end -->

<!-- evals:live:start -->
### Gemini, live (gemini-3.5-flash) — 2026-10-28

22 fixtures: 17 answered, 5 errored (API errors, listed below and left out of the accuracy).

| Field | Correct | Accuracy |
| --- | --- | --- |
| Unit price | 32 / 32 | 100% |
| Currency | 17 / 17 | 100% |
| Delivery days | 16 / 17 | 94.1% |
| Warranty period | 17 / 17 | 100% |

| By language | en | ar | mixed |
| --- | --- | --- | --- |
| Unit price | 100% | 100% | 100% |
| Currency | 100% | 100% | 100% |
| Delivery days | 91.7% | 100% | 100% |
| Warranty period | 100% | 100% | 100% |

Misses:
- `en-euro`: delivery: expected 15, got 21
- `ar-chat`, `en-both-prices`, `en-dollar-sign`, `ar-line-totals`, `en-alternative-brand`: error 429 (quota)
<!-- evals:live:end -->

### About the latest live run

- **`en-euro`:** the model turned "15 working days" into 21 calendar days. That is defensible, but
  the label keeps the stated number.
- **The five 429 errors:** the free-tier daily quota ran out partway through the run. Run them
  again once billing is enabled.
- The model removed VAT correctly in both VAT-inclusive cases (English and Arabic). It divided line totals by quantity, read Arabic-Indic digits, kept prices in AED instead of converting them, and returned null for the lump-sum and unavailable items instead of inventing prices.
- An earlier run on the same day failed every case. `gemini-2.5-flash` now returns 404 ("no longer available to new users"), so the default model changed to `gemini-3.5-flash` (D-067).
