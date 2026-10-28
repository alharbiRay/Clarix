# Phase 11: Engineering hardening

1. Gemini output (D-066, D-067):
   - `generateStructured` validates every response with zod.
   - Invalid output gets one repair call, which resends the original input with the bad output and
     what was wrong. If that fails too, it throws `GeminiOutputError`.
   - The job runner treats that error as permanent: no retries on the same input.
   - An unreadable emailed PDF notifies the buyer that it "needs manual entry". The upload dialog
     says the same.
   - The model call is injectable (`RawGenerate`).
   - `gemini-2.5-flash` now returns 404 for this key, so the default is `gemini-3.5-flash`.
     `GEMINI_MODEL` overrides it.
2. Extraction evals (`evals/extraction`, D-068):
   - 22 labeled synthetic quotes, half Arabic or mixed and half English, in messy formats.
   - Per-field scoring (price, currency, delivery days, warranty months).
   - A rule-based baseline is the default "model", so the harness runs offline. The live model runs
     only with `RUN_LIVE_EVALS=true`.
   - Results are recorded in `docs/EVALS.md`.
3. Security pass (`docs/SECURITY.md`, D-069):
   - Checked RLS on every table and the storage policies. Bucket limits added (0018).
   - Audited every server action for server-side auth: four are public by design.
   - Rate limits for the public endpoints (0019).
   - PDF magic bytes checked on every path.
   - The supplier token is format-checked before any query.
   - The RFQ search filter is escaped.
4. CI (`.github/workflows/ci.yml`): typecheck, lint, tests, offline evals and build on every PR
   and on master. No secrets are needed.
5. Observability: Sentry is skipped (D-070). Background jobs already log structured JSON events,
   and the job table keeps failures.
6. Layout:
   - Below `lg`, the sidebar becomes a drawer opened from a menu button in the top bar (from the
     right in Arabic).
   - The top bar and page padding compact on small screens.
   - No page scrolls sideways at 375px. Hidden accessible tables are wrapped in a hidden div,
     scroll containers are positioned, and header button rows wrap.
7. Tests: Vitest is capped at 4 workers (Windows file-locking crashes).
8. Pending branches from the brief: `feat/respect-reduced-motion` and `feat/new-logo-login-tagline`
   were merged long ago (PRs #2 and #3). There is nothing left to open.
