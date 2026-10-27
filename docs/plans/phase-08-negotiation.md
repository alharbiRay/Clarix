# Phase 8: Negotiation assistant

1. Pure core in `src/lib/negotiation`:
   - `buildNegotiationContext` keeps only the supplier's own figures, plus "a lower offer exists" and "faster delivery exists".
   - `buildNegotiationPrompt` states the privacy rule.
   - `findPrivacyLeaks` checks text against every other supplier's names, emails, domain, totals, line totals and unit prices. It reads Arabic-Indic digits and thousands separators.
   - `templateDraft` is the bilingual fallback.
   Tests prove the prompt never contains a competitor's name or price.
2. Migration 0015:
   - `consume_rate_limit()`: an atomic per-account sliding window (advisory lock). Its table is reachable only through the function.
   - `suppliers.preferred_language`.
3. Server actions (`rfqs/negotiation-actions.ts`):
   - **Draft:** 20 per hour. It falls back to the template on AI quota errors, AI failures, or a draft that leaks.
   - **Send:** 20 per hour. It re-checks privacy on the final text, so a buyer's own edit can't leak either. Sent via Resend with reply-to set to the buyer. Logged as `negotiation_sent`. Remembers the language.
   - **Demo:** drafts come from the template with no AI call, and sending is refused.
4. UI: a "Negotiate" row on the compare page while no PO has been sent. The dialog has a language toggle (default: saved preference, else a guess from the name), an optional target %, and an editable draft that is right-to-left for Arabic. It can be copied or sent.
