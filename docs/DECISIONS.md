# Decision log

These are decisions made autonomously during the 12-phase build. Each entry
records the question, the decision, and the reason. Brainstorming outcomes
for every phase are recorded here too.

---

## D-001: Stacked phase branches and PRs

**Question:** Each phase gets its own branch (`feat/phase-XX-name`) and PR,
and nothing is merged automatically. How do later phases build on earlier
ones?

**Decision:** Branches are **stacked**. `feat/phase-01-*` is cut from
`feat/phase-00-*`, and so on. Each PR targets the previous phase's branch
(Phase 0 targets `master`), so every PR diff shows only that phase's work.
Merge them in order. GitHub retargets the next PR to `master` once its base
branch is merged and deleted.

**Why:** Later phases depend on earlier code (Phase 9 reuses the Phase 3
metrics module, Phase 6's audit log is consumed by Phases 7 and 8). Branching
every phase from `master` would mean duplicating or blocking work.

## D-002: Tenant = buyer account (no organizations table yet)

**Question:** The brief says "scope every query to the user's organization",
but the schema has no organization concept. Everything is owned by
`profiles.id` (`buyer_id`).

**Decision:** Treat each buyer account as the tenant. Every new table carries
`buyer_id uuid references profiles(id)` (or hangs off `rfqs`), and RLS uses
`buyer_id = auth.uid()`. Introducing organizations with memberships would
mean rewriting every existing RLS policy and server action. That is a
high-risk change to a working production flow, and it is out of proportion
to the rest of the brief.

**Why:** It satisfies the intent (tenant isolation, enforced server-side and
in RLS) without destabilizing the existing flow. The schema stays
forward-compatible: a later `organization_id` can be backfilled from
`buyer_id`.

## D-003: Test tooling = Vitest + Testing Library + PGlite, no Playwright

**Decision:** Vitest for unit and component tests. PGlite (Postgres compiled
to WASM, in process) applies the real migrations for schema and RLS tests.
Playwright is **not** added.

**Why:** Docker isn't running on this machine, so `supabase start` isn't
available. PGlite gives real-Postgres verification of every migration and RLS
policy in about 2 s, with no network access and no risk to production.
Playwright would need browser downloads plus a working auth backend to say
anything useful, so it isn't cheap here.

## D-004: Earlier feature branches are already merged

**Finding:** `fix/await-auto-recommendation`, `feat/respect-reduced-motion`,
and `feat/new-logo-login-tagline` were already merged into `origin/master`
(PRs #1, #2, #3). The local `master` was behind, so it was fast-forwarded
before any work began.

**Decision:** No new PR for `feat/respect-reduced-motion` is needed. Phase 11
records both branch statuses in `docs/PROGRESS.md` instead.

## D-005: The default branch is `master`

The brief says "never push to `main`". In this repo the default branch is
`master`, and the same rule is applied to it: nothing is pushed to `master`
directly.

## D-006: Production Supabase stays untouched

`.env.local` points at the hosted Supabase project, which is treated as
production. No migration, seed, or ad-hoc SQL is run against it. Migrations
are verified only in PGlite. Applying them to production is listed as a
manual step in the final summary.

---

# Phase 1: Middleware and durable jobs

## D-007: Middleware fails open for public routes and closed for protected ones
On an auth timeout or error, public routes continue. Protected routes redirect to
`/login?reason=session_unavailable&next=…` and the login page explains why.
Requests with **no** `sb-*-auth-token` cookie skip the Supabase call entirely,
because there is nothing to refresh. That covers most bot and crawler traffic
and every logged-out visitor. The timeout is enforced twice: an aborting `fetch`
releases the socket, and `Promise.race` guarantees control comes back even if a
library ignores the signal.

## D-008: The job queue lives in Postgres and runs inline through `waitUntil`, with a cron sweep as backstop
Options considered: (a) keep awaiting inline, (b) a third-party queue (Inngest,
QStash; ruled out because paid services aren't allowed), (c) a DB table plus a
cron sweep only, (d) a DB table plus an inline `waitUntil` run plus a cron sweep.
Chose **(d)**. With (c) alone, Vercel Hobby crons run at most once a day, so
buyers could wait up to 24 hours for a recommendation. With (d), the job is
recorded before the response is sent (durable) and starts immediately in the
background (fast). A daily Vercel cron and a free GitHub Actions schedule (every
15 minutes) pick up anything an instance didn't finish. `claim_jobs` uses
`for update skip locked`, so the inline run and the sweep never collide.

## D-009: Dedupe only *pending* jobs
`jobs_pending_dedupe_key` is a partial unique index on `status = 'pending'`. If a
second quote arrives while the first job is *running* (and has already read the
supplier statuses), a fresh pending job must be allowed, or the "last supplier
replied" trigger would be lost. The handler's idempotency makes the extra run
harmless.

## D-010: The auto flow still doesn't run after a manual recommendation
The original code skipped auto-generation if *any* recommendation existed. That
contract is preserved: a buyer who generated a recommendation by hand has taken
the RFQ over, and auto-approval must not send a PO behind their back. Only
`auto_generated = true` rows count toward the new uniqueness guarantee.

## D-011: Buyer actions no longer wait for the recommendation
Manual entry, PDF upload, and quote confirmation used to block (up to 60 s) on
Gemini plus auto-approval. They now return as soon as the quote is saved. The
compare page shows "Preparing the AI recommendation…", or "delayed, retrying at
HH:MM" after a quota error, and the buyer gets the usual notification when it
lands. The supplier form benefits most: suppliers no longer wait on Gemini.

## D-012: Any Gemini 429 is a "quota" retry; the buyer hears about it once
Every `RESOURCE_EXHAUSTED` is backed off at least an hour (exponential up to
6 hours, max 5 attempts). The buyer gets one "delayed, will retry automatically"
notification on the first quota failure, and an "act manually" notification if
the job gives up. Transient errors retry quietly.

## D-013: The shadcn token color bug (R7) is fixed in Phase 2, not here
The live check showed the default `Button` renders with a transparent background
(`tailwind.config.ts` wraps the `oklch(...)` variables in `hsl()`). It's a
visible production bug, but it's unrelated to the 504 work. Phase 2 reworks the
login page anyway, so the fix lands there, where it can be verified visually.

## D-014: Migration 0007 must be applied before the Phase 1 code is deployed
The new code calls `enqueue_job`/`claim_jobs` and writes
`ai_recommendations.auto_generated`. If the deploy goes first, scheduling fails
(logged, and the quote save still succeeds) and recommendations stop until the
migration is applied. This is listed as a manual step in the PR and the final summary.
