# Phase 2: Demo data and demo mode

## Goal
"Try the demo" opens a believable, read-only workspace with no signup. Writes are
blocked on the server, not just hidden.

## Tasks
1. Seeded PRNG plus deterministic UUIDs (`src/lib/demo/random.ts`).
2. Pure dataset generator (`src/lib/demo/dataset.ts`): 25 RFQs over 6 months, 7 supplier
   personas, a bilingual catalog with price drift, and all 7 lifecycle stages. Awards satisfy
   the real auto-approval rules. Tests cover determinism and invariants.
3. Migration 0008: `is_demo` flags, `is_demo_account()`, RESTRICTIVE write policies on every
   buyer table plus storage, and column-limited profile UPDATE. PGlite tests.
4. Writer with upserts on deterministic ids. A PGlite test proves every constraint holds and that seeding is idempotent.
5. Seed script plus a safety guard (`ALLOW_SEED=true`; hosted projects need `DEMO_SEED_PROJECT_REF`)
   and `--dry-run`.
6. `requireWritableUser()` in every buyer server action. The supplier form and inbound email refuse
   demo RFQs.
7. Demo session: a server-minted one-time magic-link token, verified into cookies only when the
   profile is flagged `is_demo`. The entry point is a POST form action.
8. UI: the login entry, the `/demo` page, and the in-app read-only banner. Also the R7 color token fix and Geist wiring.
