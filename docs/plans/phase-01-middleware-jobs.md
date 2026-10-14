# Phase 1: Production 504 fix and durable recommendation jobs

## Goal
Stop `MIDDLEWARE_INVOCATION_TIMEOUT` (504), and make the auto-recommendation and
auto-approval pipeline survive serverless teardown, Gemini quota errors, and
concurrent submissions.

## Tasks (TDD, in order)
1. `withTimeout` + `TimeoutError` (`src/lib/auth/with-timeout.ts`).
2. Pure `decideAccess` / `isPublicPath` (`src/lib/auth/route-access.ts`).
3. Middleware: no cookie means no auth call; capped `getUser` (aborting fetch + race);
   structured log; narrowed matcher. Tests cover the timeout, error, public,
   protected, stale-cookie, and missing-env paths, plus the matcher.
4. `/api/health`.
5. Migration 0007: `jobs`, `enqueue_job`, `claim_jobs`, RLS, revokes, and a
   one-auto-recommendation-per-RFQ index. PGlite tests for dedupe, claim-once,
   delayed, stale reclaim, claim-by-id, RLS, and permission denied.
6. Move the Gemini error classification into `gemini-errors.ts`, with characterization tests.
7. Job processor: backoff, permanent errors, quota kind, hooks that can't break the loop.
8. Fix the auto-approval race (R4): the award insert gates side effects.
9. `runAutoRecommendation`: not-ready / manual-exists / resume / race / propagate errors.
10. Hooks: buyer notification on the first quota failure and on give-up.
11. `inbound_email_quote` handler: idempotent on the email id, size and magic-byte checks.
12. Webhook: verify, match, enqueue, and return 500 if the enqueue fails.
13. Call sites move to `scheduleAutoRecommendation` (enqueue + `waitUntil`).
14. `/api/jobs/process` (CRON_SECRET, timing-safe), `vercel.json` daily cron, GitHub Actions every 15 min.
15. Login `?reason` message and a safe `?next` redirect. Compare-page progress banner.

## Verification
typecheck, lint, the full suite, build, and a live dev-server check of the redirects and the login notice.
