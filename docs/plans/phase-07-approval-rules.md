# Phase 7: Configurable approval rules

1. A pure rule engine (`src/lib/approval/rules.ts`) maps (policy, the AI's pick, the cheapest complete quote) to a
   decision, the rule that fired, and plain-language reasons. It has 23 table-driven tests. The rules:
   on/off, maximum delivery days, warranty required, the AI's pick must be the cheapest, an optional
   spend limit (a manager must approve above it), and an optional minimum supplier score.
2. Migration 0013: one `approval_policies` row per account, backfilled from `profiles.auto_approval_enabled`
   so behaviour doesn't change, plus `profiles.role` (`manager` by default). Users can't change their own
   role (it's outside the profile column grant), and the demo account can't write a policy.
3. `evaluateAutoApproval` now gathers the facts and applies the engine. The audit event carries the rule,
   reasons, explanation and the policy in force. If the AI's pick can't be matched to a quote, the RFQ is held for
   review instead of silently skipped. A supplier score is computed only when the policy asks for one,
   and a missing score sends the RFQ to review (fail safe).
4. `approveAward` enforces the manager rule above the spend limit on the server.
5. Settings: an "Approval rules" form with a live preview of past RFQs replayed through the same
   engine (`src/lib/approval/preview.ts`). It shows "N of M would have been approved automatically" and why the rest
   would be held. The old on/off action now updates the policy and keeps the legacy flag in step.
6. The demo trail uses the new rule names and explanation format.
7. Review fixes (D-051): decideApproval is shared by the live path and the preview; incomplete or unmatched picks
   are held; migration 0014 adds the spend-limit currency and manager-only policy writes; the form is hardened
   (an immediate kill switch, tolerant number parsing, an error state instead of defaults).
