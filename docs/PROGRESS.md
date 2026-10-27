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
| 7. Configurable approval rules | in review | `feat/phase-07-approval-rules` | | tsc, lint, tests, build, settings form and live preview checked in the browser (demo) |
| 8. Negotiation assistant | pending | | | |
| 9. Reports | pending | | | |
| 10. Arabic/English + RTL + VAT | pending | | | |
| 11. Engineering hardening | pending | | | |
| 12. Landing + pricing | pending | | | |

## Production state
- Supabase project restored and active. Migrations 0007 to 0013 are applied, in order.
- The demo is seeded (25 RFQs and a full decision trail). "Explore the live demo" works on production.
- Vercel production tracks `master`.

## Manual steps left for the owner
1. Vercel env: `CRON_SECRET` (and optionally `DEMO_ACCOUNT_EMAIL`).
2. GitHub Actions: variable `APP_URL` and secret `CRON_SECRET` (for the 15-minute job sweep).
   GitHub pauses scheduled workflows after 60 days with no repo activity; the daily Vercel cron stays as the backstop.
3. Rotate the Gemini API key and enable Gemini billing (the free tier's quota is what triggers the "AI delayed" path).
4. Supabase Auth: turn on leaked-password protection.
5. Re-run the demo seed about monthly so "this month" stays populated:
   `ALLOW_SEED=true DEMO_SEED_PROJECT_REF=<ref> npx tsx --env-file=.env.local scripts/seed-demo.ts`.

## Known gaps
- No end-to-end browser tests (Playwright skipped; see D-003). Authenticated pages were verified by unit and wiring tests and by preview checks.
- On phones the app sidebar stays 240px wide and squeezes the page. This affects every signed-in page (scheduled for Phase 11).
- Form and manual quote totals in the audit trail add up only the priced lines; PDF quotes use "no total" when a line is unpriced.
- Seen once: an intermittent test-file failure under parallel PGlite load (mitigated with a 60s hook timeout).
