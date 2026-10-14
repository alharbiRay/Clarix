# Phase 0: Recon

Goal: understand the system before changing it, and leave a safety net.

1. Read routes, actions, middleware, migrations, the Gemini integration, and the Resend webhook. Done.
2. Write `docs/ARCHITECTURE.md`: data model, both entry paths (Mermaid), risky spots.
3. Test setup: Vitest (`npm test`), Testing Library, and a PGlite harness that applies every migration and supports RLS assertions.
4. Regression tests for shared comparison code (`quote-comparison`, `recommendation-input`) before any phase touches it.
5. Gates: typecheck, lint, test, build.
