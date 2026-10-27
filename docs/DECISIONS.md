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

## D-015: Code review of Phase 1, and what changed as a result
An independent review (`requesting-code-review`) returned "ready with fixes".
Changes made, each with a test written first:
- Stale jobs past `max_attempts` now give up (the buyer is notified) instead of
  being reclaimed forever. Gemini calls have a 45 s request timeout.
- The sweep leases **one job at a time** within a 40 s budget, so unstarted jobs
  aren't stranded or charged attempts they never ran.
- Webhook: a DB error during the token lookup returns 500 so Resend retries.
  The RFQ deadline is checked against the email's arrival time
  (`payload.receivedAt`), not the retry time.
- Middleware: auth-js *returns* `AuthRetryableFetchError` and 5xx responses
  rather than throwing them. Both now count as "unavailable", so users see the
  timeout explanation instead of a silent logout. Refreshed cookies carry over
  onto redirects.
- `safeNextPath` resolves against a fixed origin and rejects control
  characters and backslashes. This closes an open redirect via `/%09/evil.com`.
- Smaller fixes: the recommendation chain also runs on `already_processed`;
  failure notices use a non-approvable `action_required` type; a profile load
  failure throws instead of recording "auto-approval off"; `enqueue_job`
  retries if its duplicate is claimed mid-call; buyers can read only the job
  status columns; the `/demo` and `/pricing` placeholders were removed from the
  public routes until those routes exist.
- Noted but not changed: GitHub disables scheduled workflows in repos with no
  activity for 60 days. The daily Vercel cron remains the backstop (see PROGRESS).

---

# Phase 2: Demo data and demo mode

## D-016: The demo is a real, shared, read-only account
Options: (a) a shared account that is read-only at the DB, (b) a sandbox account per
visitor, reset by a job, (c) render the demo from fixtures without auth. Chose **(a)**.
Every page and query path stays real (the demo exercises the actual product), and
read-only is enforced in Postgres through RESTRICTIVE policies, so it can't be bypassed by
calling a server action or PostgREST directly. (b) would mean unbounded account
creation, a cleanup job, and Gemini cost per visitor. (c) would mean a parallel
rendering path that drifts from the real one.

## D-017: Entering the demo uses a server-minted magic-link token, so no password exists
The server checks that the configured `DEMO_ACCOUNT_EMAIL` belongs to a profile flagged
`is_demo`, mints a one-time magic-link token hash with the service role (no email is
sent), and verifies it on the visitor's cookie-bound client. A misconfiguration can't
hand out a real buyer's session. The entry is a POST form action, so link prefetchers
and crawlers can't open sessions.

## D-018: Seed safety interlock
The seed refuses to run without `ALLOW_SEED=true`. Local URLs are allowed. A hosted
project additionally needs `DEMO_SEED_PROJECT_REF=<that project's ref>`, so a stray
`.env` pointing at production is refused (verified against this repo's `.env.local`).
The demo can live in production, because that's where visitors use it, but only as a
deliberate act, and the script only writes rows owned by the demo account. It also
refuses to adopt an email that belongs to a real account with RFQs.

## D-019: `is_demo` sits on top-level rows only
`profiles`, `rfqs`, and `suppliers` carry the flag. Child rows (items, invites, quotes,
awards …) are scoped through their RFQ. Read-only enforcement keys off the *account*
(`is_demo_account()`), not the rows, so a demo session can't write anything anywhere.

## D-020: Supplier-form tokens for demo RFQs can't be derived from the public seed
The dataset is deterministic, but each seed run mixes a random secret into the tokens.
The supplier form and inbound email also refuse demo RFQs outright.

## D-021: Profile UPDATE is column-limited
`profiles` UPDATE is granted only on (email, full_name, company,
auto_approval_enabled). This stops a buyer from toggling `is_demo`, and it's the
pattern the Phase 7 `role` column relies on.

## D-022: R7 fixed, and Geist actually applied
`tailwind.config.ts` used `hsl(var(--x))` around `oklch(...)` values, so every shadcn
token color was invalid (for example, the primary Button rendered transparent with
black text). Colors now map to `var(--x)`. The Geist font loaded in `layout.tsx` was never
applied either (`font-sans` wasn't mapped and `body` forced Arial); that's fixed too.
Both were verified visually.

## D-023: Code review of Phase 2, and what changed as a result
The review returned "ready with fixes". Fixed, test-first:
- **Demo identity hardening.** `profiles.email` is no longer user-editable (it was the
  demo lookup key, so any user could squat it and break or hijack the demo). The
  demo profile is found by email *and* `is_demo`, the minted token's auth user must
  equal that profile, and the seed refuses any existing non-demo profile with the
  demo email instead of adopting it.
- **Sign-out is `scope: "local"`.** The default global sign-out from one demo visitor
  revoked every visitor's refresh token. It's local for all users now: signing out
  ends only this browser's session.
- **Concurrent "Try the demo" clicks** retry up to three times, because GoTrue keeps
  one magic-link token per user.
- **Tailwind opacity modifiers** (`bg-primary/90`, `ring-ring/50`, …) emitted no CSS
  on bare `var()` colors. Theme colors are now
  `color-mix(in oklch, var(--x) calc(<alpha-value> * 100%), transparent)`, verified
  by compiling a probe through the project config.
- The supplier quote page shows a "demo RFQ" card for demo RFQs and no longer
  writes "viewed" into shared data.

Accepted for now, not fixed:
- The demo JWT reaches the browser, so a visitor could call `auth.updateUser`
  (password, metadata) or enroll MFA on the shared account. That's griefing, not
  data access: RLS still blocks every table, and the next seed run refreshes the
  data. Per-visitor ephemeral demo users would remove this but add account churn
  and cleanup. Revisit if abused. Production should keep "Secure email change"
  enabled in Supabase Auth (a manual check).
- Re-seeding upserts and never deletes. If a future generator drops or re-ids rows,
  delete the demo account's rows that are no longer in the dataset at that point.
- Rate limiting on `startDemoSession` is handled by the Phase 11 rate-limit work.

---

# Phase 3: Savings dashboard

## D-024: Savings = average of the other complete quotes − the awarded total
See `docs/METRICS.md` for the comparison against "highest quote" and "second-lowest".
Negative savings (a premium paid for a better supplier) are shown, never clamped. Month
boundaries use Saudi time.

## D-025: The dashboard leads with one number
The savings figure is the product's promise, so it's the single hero figure, paired with
the chart that explains it. The four operational KPIs sit in one hairline-divided strip
rather than four look-alike icon cards. The old "quoted value" and stat cards were
removed, because they measured activity, not outcomes.

## D-026: Chart choices
Savings by month uses columns in one validated accent (`#6D5FD6`, passing every check of
the dataviz validator on white). It has a hover tooltip, a screen-reader table, and an
animation that turns off under reduced motion. Spend by supplier is an HTML bar list,
because labels and values are the content and a canvas chart would hide them. Light
mode only, because the app has no dark theme yet.

## D-027: The demo dataset spreads decisions across the timeline (follow-up to Phase 2)
Feeding the demo through the metrics showed every purchase order landing in the first
three months, so the demo would have opened on "Saved this month: SAR 0". The stage plan
now spreads settled RFQs across the six months, with denser recent activity, and pending
decisions stay recent. A test asserts the demo tells a coherent savings story through
the real metrics module.

## D-028: Code review of Phase 3, and what changed as a result
"Ready with fixes". Fixed, test-first where testable:
- Unconfirmed AI-extracted quotes (`needs_review`) are back on the dashboard, in
  the review queue and linked to the confirm page. The removed stat card had been
  the only place they showed.
- Hydration: the count-up always starts at 0, so server and client render the same text.
- The metrics loader pages through PostgREST's max-rows cap, so all-time figures can't
  silently drop older RFQs (tested against a fake that enforces the cap).
- Review-queue rows get a visible focus ring.
- Smaller fixes: premiums aren't listed as "biggest savings" and get their own wording;
  negative durations from clock skew are ignored; money signs are decided after
  rounding; dates render in Saudi time on the (UTC) server; failed reads show the
  error state instead of an empty dashboard; the loading skeleton is announced;
  unused indexes were dropped from the not-yet-applied 0009.
- Deferred: precomputing totals in a SQL view/RPC. The paged loader is fine for SMB
  volumes; revisit past roughly 5,000 RFQs per buyer.

---

# Phase 4: Supplier scorecard

## D-029: The scorecard replaces the star rating
The old 1–5 star rating counted only *auto-approved* awards as wins, so manually
approved purchase orders made a supplier look worse. The new score uses every
purchase order actually sent and spells out every weight (`docs/METRICS.md`).

## D-030: The weights are a stated opinion, not tuned to a story
Price 30, responsiveness 20, delivery 20, warranty 15, win rate 15. In the demo, a
supplier ~22% above the lowest price but always offering a warranty ends up *below* a
cheap supplier that rarely offers one. That's the documented trade-off, not a bug, so the
test asserts robust properties (the fast-and-cheap supplier ranks first; warranty and
slowness weaknesses get called out) instead of a ranking that suits a hunch. Phase 7's
approval policy is where a buyer encodes "warranty is mandatory".

## D-031: "Delivery reliability" means promised vs typical
We have no actual delivery dates, so reliability is measured honestly as the promised
lead time against the median promise on the same RFQ. The UI calls it "Delivery vs typical".

## D-032: There's no score until a supplier has 2 quotes
Below that a score is noise. The badge says "New" and the detail page explains why.

## D-033: Tooling: target ES2017 and a line-ending-safe patch helper
`tsconfig.json` gets `"target": "ES2017"` (type-checking only; Next compiles with SWC),
which ends the recurring Map/Set iteration errors. Scripted edits normalize CRLF first,
because this checkout uses `core.autocrlf=true`.

## D-034: Code review of Phase 4, and what changed as a result
"Ready with fixes". The review caught two metrics that would mislead on real data, which
the demo data couldn't reveal because it links every invitation:
- Invitations are linked to a supplier profile only once the supplier quotes, so
  unanswered and declined invitations were invisible and the response rate was about 100%. Now
  they're matched by email too (tested with unlinked invites).
- Open RFQs counted as losses and non-responses. The win rate now uses decided RFQs only,
  and unanswered invitations on still-open RFQs are excluded.
- The compare page and the supplier detail page load only the RFQs these suppliers took part in
  (not the buyer's whole history), and the compare page's badges fail soft.
- Accessibility: the badge's accessible name is real sr-only text (`aria-label` on a span
  isn't announced), the ring isn't read twice, the meter role is only used when there's data,
  and low-contrast `slate-400` text moved to `slate-500`.
- Also: instant comparisons in the trend (no ISO string comparisons), breakdown points
  that add up exactly, "last active" is the supplier's own activity again, an empty `?min=` is
  "Any", and METRICS.md gaps are filled.

---

# Phase 5: Price history and alerts

## D-035: The normalizer is deterministic plus a glossary, and AI matching is skipped
The brief made AI-assisted matching optional. A small bilingual glossary handles the common
cross-language cases deterministically, at no cost and testably, so there's no new Gemini path
(quota, latency, privacy) to justify. Add it behind a flag later if real data shows
unmatched pairs.

## D-036: Price history is a derived query, not a table
Points come from quote lines already loaded for metrics, so there's nothing to keep in sync
and no migration beyond the threshold column. The compare page bounds it to the last 365 days.

## D-037: Badges show context; color shows alerts
Both "vs their last" and "vs market" are shown when available, as muted text. Only changes at or
above the threshold get color and an icon, which gives the "alert" meaning without hiding the
context. The threshold is per buyer (`profiles.price_alert_threshold`). Phase 7 can move it into
the organization's approval policy if that table lands.

## D-038: The history chart is dots only
Joining prices from different suppliers with a line implies a series that doesn't exist.

## D-039: Code review of Phase 5, and what changed as a result
"Ready with fixes". The reviewer probed the normalizer with real Arabic words and found:
- Glossary terms matched inside words ("تحديد" contains "حديد", so it became "steel"). Matching now runs on
  whole-word token sequences.
- The Arabic definite article wasn't stripped, so "الاسمنت البورتلاندي" didn't match "اسمنت بورتلاندي",
  even though the article is the most common way these names are written. Leading "ال/لل/وال/بال/فال/كال"
  is now stripped when at least two letters remain. Bare "و/ب" are left alone, because "ورق" must survive.
- Exact-threshold changes sometimes missed the alert through floating-point error. Alerts now
  compare whole percents, which is exactly what the badge shows.
- Badge details were in `title` only (mouse-only). The badges are now one focusable popover
  button per line.
- The compare page's one-year price load uses a narrow select (no awards, warranties or invite
  statuses).
- Also: canonical numbers ("12.0mm" = "12mm"), inch/litre sizes, unit aliases with trailing dots,
  a price scale on the dot plot, and the settings error shows only after interaction (announced politely).
- Not changed: the market average weights every quote equally (a frequent quoter counts more).
  That's simple and explainable; revisit with per-supplier averaging if it skews real data.

---

# Phase 6: Decision audit log

## D-040: Only server code writes the audit trail
There's no insert policy for buyers: every event is written with the service role from server
code, so a user can't forge history through PostgREST. Buyers read their own events through RLS.

## D-041: Append-only is enforced by a trigger, not just by permissions
UPDATE/DELETE are revoked from every API role, *and* a trigger refuses them for everyone,
including the table owner. The single exception is a foreign-key cascade
(`pg_trigger_depth() > 1`) when a whole account is deleted, so account deletion still works.

## D-042: `rfq_id` is not a foreign key
The trail should outlive the RFQ it describes. An FK would either block RFQ deletion or
cascade-delete the history.

## D-043: Audit writes are best-effort
supabase-js can't wrap the business write and the audit write in one transaction. A failed
audit write is logged loudly (`audit.write_failed`) and never breaks the flow it describes:
losing a PO because an audit row failed would be worse than a gap in the log.

## D-044: Overriding the AI's pick requires a reason
`approveAward` refuses an override without one. The UI offers common reasons plus free text.
With auto-approval off there's no AI pick, so no reason is needed.

## D-045: Production migrations applied 2026-10-28
At the owner's request, migrations 0007–0010 and 0012 were applied to the hosted project
(which was also restored from a paused state), after checking its schema matched 0001–0006,
and checking there were no policy-name collisions. 0011 goes in just before Phase 6 merges.
The Supabase security advisor's remaining findings: `is_demo_account` being executable by
signed-in users is intentional (RLS needs it), and leaked-password protection is the owner's Auth setting.
