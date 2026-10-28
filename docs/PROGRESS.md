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

| Final. README case study + docs | merged | `docs/final-readme` | see below | README, ARCHITECTURE refresh, this file |

All twelve phases are merged. Each PR's description lists its verification, and each phase has a
plan in `docs/plans/`. Every phase from 6 on went through an independent code review, and the
review fixes are recorded in `docs/DECISIONS.md`.

## Production state
- **Supabase:** the project is active, and migrations 0007 to 0020 are applied in order (0001 to
  0006 were there before this build).
- **Vercel:** production tracks `master`. `/` is now the public landing page; signed-in buyers
  go straight to `/dashboard`.
- **Demo:** seeded with 25 RFQs and a full decision trail. "Explore the live demo" works on
  production.
- **CI:** `.github/workflows/ci.yml` runs typecheck, lint, 701 tests, the offline evals and the
  build on every PR.

## Manual steps left for the owner
1. **Gemini:**
   - Enable billing. The free tier's daily quota ran out during the live evals on 2026-10-28.
     Jobs retry later and buyers are told, but a real buyer would wait.
   - The model defaults to `gemini-3.5-flash` because `gemini-2.5-flash` now returns 404 for
     this key. Set `GEMINI_MODEL` in Vercel to change it (D-067).
   - Rotate the Gemini API key if it was ever shared outside Vercel and `.env.local`.
2. **Vercel:** confirm that `NEXT_PUBLIC_APP_URL` is the production address. It is set, but its
   value was not read. It now also drives canonical URLs, Open Graph, the sitemap and robots, and
   `NEXT_PUBLIC_*` values are fixed at build time, so redeploy after changing it.
3. **GitHub Actions:** add the variable `APP_URL` and the secret `CRON_SECRET` for the
   15-minute job sweep. Until then only the daily Vercel cron sweeps. GitHub pauses schedules
   after 60 days with no repo activity.
4. **Supabase Auth:** turn on leaked-password protection, the only open security advisor notice.
5. **Demo:** re-run the seed about monthly so "this month" stays populated:
   `ALLOW_SEED=true DEMO_SEED_PROJECT_REF=<ref> npx tsx --env-file=.env.local scripts/seed-demo.ts`.
6. **Waitlist:** sign-ups land in the `leads` table, readable in the Supabase dashboard only.
   Nothing emails them yet (D-073).
7. **Prices:** decide real prices. The pricing page shows illustrative tiers.
8. **Optional (D-075):** the sidebar avatar's violet gradient and a third chart violet
   (`#6D5FD6`) are pre-existing drift from `DESIGN.md`.

Out of scope for this build: the WhatsApp Business API, ERP integrations and billing.

## Older branches
- `feat/respect-reduced-motion` and `feat/new-logo-login-tagline` were merged before Phase 0
  (PRs #2 and #3). Every phase branch is merged; merged branches are deleted from GitHub at the
  end of the build.

## Known gaps
- **No end-to-end browser tests** (Playwright skipped; see D-003). Pages were verified by unit and
  wiring tests, in-browser measurement, and headless captures at 1440 and 375 in both languages.
- **Stored text stays in English:** notifications, approval reasons, older AI reasons, and most
  server error toasts (D-065).
- **Audit-trail totals:** for form and manual quotes they add up only the priced lines. PDF quotes
  show "no total" when a line is unpriced.
- **Eval coverage:** the live evals covered 17 of 22 cases before the quota ran out. Re-run them
  with billing on.
