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
