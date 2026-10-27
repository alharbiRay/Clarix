# Build progress

Branches are stacked (see `docs/DECISIONS.md` D-001). Merge the PRs in order: each PR
targets the previous phase's branch.

| Phase | Status | Branch | PR | Verified |
| --- | --- | --- | --- | --- |
| 0. Recon | done | `feat/phase-00-recon` | [#4](https://github.com/alharbiRay/Clarix/pull/4) | tsc, lint, 15 tests, build |
| 1. Middleware 504 + durable jobs | done (reviewed, fixes applied) | `feat/phase-01-middleware-jobs` | [#5](https://github.com/alharbiRay/Clarix/pull/5) | tsc, lint, 159 tests, build, live redirect check |
| 2. Demo data + demo mode | done | `feat/phase-02-demo` | see PR list | tsc, lint, tests, build, visual check of /login and /demo (desktop and mobile) |
| 3. Savings dashboard | done | `feat/phase-03-savings-dashboard` | see PR list | tsc, lint, 246 tests, build, visual check (desktop, mobile, empty) |
| 4. Supplier scorecard | done | `feat/phase-04-supplier-scorecard` | see PR list | tsc, lint, 288 tests, build, visual check of the scorecard components |
| 5. Price history + alerts | done | `feat/phase-05-price-history` | see PR list | tsc, lint, tests, build, preview check of the badges and popover with demo data |
| 6. Decision audit log | in progress (WIP pushed, no PR yet) | `feat/phase-06-audit-log` | not opened | tsc, lint, 382 tests pass on the WIP commit |
| 7. Configurable approval rules | pending | | | |
| 8. Negotiation assistant | pending | | | |
| 9. Reports | pending | | | |
| 10. Arabic/English + RTL + VAT | pending | | | |
| 11. Engineering hardening | pending | | | |
| 12. Landing + pricing | pending | | | |

## Manual steps accumulated so far
1. Apply migrations `0007` → `0010` to production, in order, **before** deploying the matching code.
2. Vercel env: `CRON_SECRET`; optionally `DEMO_ACCOUNT_EMAIL`.
3. GitHub Actions: variable `APP_URL` and secret `CRON_SECRET` (the 15-minute job sweep).
   GitHub pauses scheduled workflows after 60 days with no repo activity; the daily Vercel cron stays as the backstop.
4. To enable "Try the demo" in production, run the seed deliberately:
   `ALLOW_SEED=true DEMO_SEED_PROJECT_REF=<ref> npx tsx --env-file=.env.local scripts/seed-demo.ts`.
   Until then, the demo button shows "demo isn't available right now".

## Known gaps
- No end-to-end browser tests (Playwright skipped; see D-003). Authenticated pages were verified by unit and wiring tests, not by logging in against production.
- The demo data ages after seeding. Re-run the seed about monthly so "this month" stays populated.
- Seen once: an intermittent test-file failure under parallel PGlite load (all tests passed; 3 reruns clean). Watch for it in CI.
