# Phase 6: Decision audit log

1. Migration 0011: `audit_events`, append-only. Buyers read their own events, and only the service role writes.
   UPDATE/DELETE are revoked, and a trigger refuses them (account-deletion cascade excepted). `rfq_id` has
   no FK, so the trail outlives the RFQ. PGlite tests cover every rule.
2. `src/lib/audit`: best-effort `recordAuditEvent` (never breaks the flow it records) and a pure
   `describeAuditEvent` for plain-language titles and details. Test-first.
3. Instrumentation: RFQ created/sent; quote received (form, manual, PDF, email); extraction result and
   confidence; extraction failure; recommendation (auto/manual); the auto-approval rule that fired and
   why; manual approval and override **with a required reason**; PO sent; AI quota errors; job give-ups.
4. UI: an override-reason picker in "Choose different supplier", and a "Decision history" timeline on the RFQ page.
5. The demo dataset derives a matching trail. The seed inserts it insert-if-absent.
6. Migration 0012: fixes from the Supabase security advisor.
