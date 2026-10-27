import { stableUuid } from "@/lib/demo/random";
import type { DemoDataset } from "@/lib/demo/dataset";
import { DEFAULT_POLICY } from "@/lib/approval/rules";

export interface DemoAuditRow {
  id: string;
  buyer_id: string;
  rfq_id: string;
  actor_type: "buyer" | "supplier" | "system";
  actor_id: string | null;
  event_type: string;
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const SOURCE_TEXT: Record<string, string> = { form: "via the supplier form", manual: "entered manually", email: "by email" };

/**
 * Derives the demo workspace's decision history from its final rows, so the
 * timeline on every demo RFQ tells the same story the data does. Pure and
 * deterministic (ids from the row ids).
 */
export function buildDemoAuditTrail(d: Omit<DemoDataset, "audit_events">): DemoAuditRow[] {
  const out: DemoAuditRow[] = [];
  const buyer = d.profile.id;

  for (const rfq of d.rfqs) {
    const events: DemoAuditRow[] = [];
    let n = 0;
    const push = (e: Omit<DemoAuditRow, "id" | "buyer_id" | "rfq_id">) =>
      events.push({ id: stableUuid("demo-audit", `${rfq.id}:${n++}`), buyer_id: buyer, rfq_id: rfq.id, ...e });

    const items = d.rfq_items.filter((i) => i.rfq_id === rfq.id);
    const invites = d.rfq_suppliers.filter((s) => s.rfq_id === rfq.id);
    push({
      actor_type: "buyer",
      actor_id: buyer,
      event_type: "rfq_created",
      summary: `RFQ created: ${rfq.title}`,
      payload: { title: rfq.title, items: items.length, suppliers: invites.length, currency: rfq.currency },
      created_at: rfq.created_at,
    });

    const sentAt = invites.map((s) => s.invited_at).filter((t): t is string => Boolean(t)).sort()[0];
    if (sentAt) {
      push({
        actor_type: "buyer",
        actor_id: buyer,
        event_type: "rfq_sent",
        summary: `Sent to ${invites.length} suppliers`,
        payload: { invited: invites.length, emailFailures: 0 },
        created_at: sentAt,
      });
    }

    for (const q of d.quotes.filter((x) => x.rfq_id === rfq.id)) {
      const invite = invites.find((s) => s.id === q.supplier_id)!;
      const lines = d.quote_items.filter((qi) => qi.quote_id === q.id);
      const complete = lines.length === items.length && lines.every((l) => l.total_price !== null);
      const total = complete ? Math.round(lines.reduce((s, l) => s + (l.total_price ?? 0), 0) * 100) / 100 : null;
      push({
        actor_type: q.source === "manual" ? "buyer" : "supplier",
        actor_id: q.source === "manual" ? buyer : invite.id,
        event_type: "quote_received",
        summary: `Quote received from ${invite.company_name} ${SOURCE_TEXT[q.source]}`,
        payload: { source: q.source, supplier: invite.company_name, quoteId: q.id, total, currency: rfq.currency },
        created_at: q.submitted_at,
      });
      if (q.source === "email" && q.extraction_raw) {
        push({
          actor_type: "system",
          actor_id: null,
          event_type: "extraction_completed",
          summary: `AI read ${invite.company_name}'s PDF`,
          payload: { supplier: invite.company_name, quoteId: q.id, confidence: q.extraction_raw.confidence, warnings: [] },
          created_at: q.confirmed_at ?? q.submitted_at,
        });
      }
    }

    const rec = d.ai_recommendations.find((r) => r.rfq_id === rfq.id);
    if (rec) {
      const pick = rec.content.ranking.find((r) => r.rank === 1)?.supplier ?? null;
      push({
        actor_type: rec.auto_generated ? "system" : "buyer",
        actor_id: rec.auto_generated ? null : buyer,
        event_type: "recommendation_generated",
        summary: `AI recommended ${pick ?? "a supplier"}`,
        payload: { mode: rec.auto_generated ? "auto" : "manual", model: rec.model, recommended: pick },
        created_at: rec.created_at,
      });
    }

    const award = d.rfq_awards.find((a) => a.rfq_id === rfq.id);
    if (award) {
      const quote = d.quotes.find((q) => q.id === award.recommended_quote_id)!;
      const invite = invites.find((s) => s.id === award.recommended_supplier_id)!;
      const lines = d.quote_items.filter((qi) => qi.quote_id === quote.id);
      const total = Math.round(lines.reduce((s, l) => s + (l.total_price ?? 0), 0) * 100) / 100;
      const auto = award.decision === "auto_approved";
      push({
        actor_type: "system",
        actor_id: null,
        event_type: "auto_approval_decided",
        summary: auto ? `Auto-approved ${invite.company_name}` : `Held for review: ${award.reason}`,
        payload: auto
          ? {
              decision: "auto_approved",
              rule: "all_rules_passed",
              supplier: invite.company_name,
              quoteId: quote.id,
              explanation: [
                "cheapest complete quote",
                `delivery ${quote.delivery_days} days (limit ${DEFAULT_POLICY.maxDeliveryDays})`,
                `${quote.warranty} warranty`,
              ],
              policy: DEFAULT_POLICY,
            }
          : {
              decision: award.decision,
              rule: award.decision === "review_needed" ? "requirements_not_met" : "recommended_differs_from_cheapest",
              supplier: invite.company_name,
              reason: award.reason,
              policy: DEFAULT_POLICY,
            },
        created_at: award.created_at,
      });
      if (award.po_sent_at) {
        if (!auto) {
          push({
            actor_type: "buyer",
            actor_id: buyer,
            event_type: "award_approved",
            summary: `Approved ${invite.company_name}`,
            payload: { supplier: invite.company_name, quoteId: quote.id, override: false, decision: award.decision },
            created_at: award.po_sent_at,
          });
        }
        push({
          actor_type: auto ? "system" : "buyer",
          actor_id: auto ? null : buyer,
          event_type: "po_sent",
          summary: `PO sent to ${invite.company_name}`,
          payload: { supplier: invite.company_name, quoteId: quote.id, total, currency: rfq.currency, automatic: auto, emailDelivered: true },
          created_at: award.po_sent_at,
        });
      }
    }

    // Stable chronological order (the seeded clock can produce equal stamps).
    events.sort((a, b) => a.created_at.localeCompare(b.created_at));
    out.push(...events);
  }
  return out;
}
