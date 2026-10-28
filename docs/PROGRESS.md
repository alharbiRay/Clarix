# Build progress

One branch and PR per phase, merged into `master` in order (merge commits, no squash; see
`docs/DECISIONS.md` D-001). Each phase's migration is applied to production just before its PR merges.

| Phase | Status | Branch | PR | Verified |
| --- | --- | --- | --- | --- |
| 0. Recon | merged | `feat/phase-00-recon` | [#4](https://github.com/alharbiRay/Clarix/pull/4) | tsc, lint, 15 tests, build |
| 1. Middleware 504 + durable jobs | merged | `feat/phase-01-middleware-jobs` | [#5](https://github.com/alharbiRay/Clarix/pull/5) | tsc, lint, 159 tests, build, live redirect check |
| 2. Demo data + demo mode | merged | `feat/phase-02-demo` | [#6](https://github.com/alharbiRay/Clarix/pull/6) | tsc, lint, tests, build, visual check of /login and /demo (desktop and mobile) |
| 3. Savings dashboard | merged | `feat/phase-03-savings-dashboard` | [#7](https://github.com/alharbiRay/Clarix/pull/7) | tsc, lint, 246 tests, build, visual check (desktop, mobile, empty) |
| 4. Supplier scorecard | merged | `feat/phase-04-supplier-scorecard` | [#8](https://github.com/alharbiRay/Clarix/pull/8) | tsc, lint, 288 tests, build, visual check |
| 5. Price history + alerts | merged | `feat/phase-05-price-history` | [#9](https://github.com/alharbiRay/Clarix/pull/9) | tsc, lint, tests, build, preview check with demo data |
| 6. Decision audit log | merged (reviewed, fixes applied) | `feat/phase-06-audit-log` | [#10](https://github.com/alharbiRay/Clarix/pull/10) | tsc, lint, 400 tests, build, production deploy and demo seed checked |
| 7. Configurable approval rules | merged (reviewed, fixes applied) | `feat/phase-07-approval-rules` | [#11](https://github.com/alharbiRay/Clarix/pull/11) | tsc, lint, tests, build, settings form and live preview checked in the browser (demo) |
| 8. Negotiation assistant | merged (reviewed, fixes applied) | `feat/phase-08-negotiation` | [#12](https://github.com/alharbiRay/Clarix/pull/12) | tsc, lint, 531 tests, build, dialog checked in the browser (English + Arabic, demo) |
| 9. Reports | merged (reviewed, fixes applied) | `feat/phase-09-reports` | [#13](https://github.com/alharbiRay/Clarix/pull/13) | tsc, lint, 609 tests, build, page + CSV checked in the browser (demo) |
| 10. Arabic/English + RTL + VAT | merged (reviewed, fixes applied) | `feat/phase-10-i18n` | [#14](https://github.com/alharbiRay/Clarix/pull/14) | tsc, lint, 659 tests, build, Arabic pages checked in the browser (settings, reports, supplier, compare, new RFQ; demo) |
| 11. Engineering hardening | merged (reviewed, fixes applied) | `feat/phase-11-hardening` | [#15](https://github.com/alharbiRay/Clarix/pull/15) | tsc, lint, 687 tests, build, CI green, live evals, 375px layout checked on every signed-in page |
| 12. Landing + pricing | merged (finish-reviewed, fixes applied) | `feat/phase-12-landing` | [#16](https://github.com/alharbiRay/Clarix/pull/16) | tsc, lint, 701 tests, build, finish review (impeccable), desktop and phone captures in both languages |

## Production state
- Supabase project restored and active. Migrations 0007 to 0020 are applied, in order.
- The demo is seeded (25 RFQs and a full decision trail). "Explore the live demo" works on production.
- Vercel production tracks `master`.

## Manual steps left for the owner
1. ~~Vercel env: `CRON_SECRET`~~ done by the owner (optionally `DEMO_ACCOUNT_EMAIL`).
2. GitHub Actions: variable `APP_URL` and secret `CRON_SECRET` (for the 15-minute job sweep).
   GitHub pauses scheduled workflows after 60 days with no repo activity; the daily Vercel cron stays as the backstop.
3. Recommended: enable Gemini billing. The free tier allows only a small daily quota; the live extraction evals alone used it up on 2026-10-28. When it runs out, jobs retry later and buyers are told. The model defaults to `gemini-3.5-flash`; set `GEMINI_MODEL` in Vercel to change it (D-067). Rotate the Gemini key only if it was ever exposed.
4. Supabase Auth: turn on leaked-password protection.
5. Re-run the demo seed about monthly so "this month" stays populated:
   `ALLOW_SEED=true DEMO_SEED_PROJECT_REF=<ref> npx tsx --env-file=.env.local scripts/seed-demo.ts`.

## Older branches
- `feat/respect-reduced-motion` and `feat/new-logo-login-tagline` were merged before Phase 0 (PRs #2 and #3), with no commits left. They can be deleted.

## Known gaps
- No end-to-end browser tests (Playwright skipped; see D-003). Authenticated pages were verified by unit and wiring tests and by preview checks.
- Stored text (notifications, approval reasons, older AI reasons) and most server error toasts stay in English; see D-065.
- Form and manual quote totals in the audit trail add up only the priced lines; PDF quotes use "no total" when a line is unpriced.
