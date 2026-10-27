/**
 * "What would this policy have done?" — replays past RFQs through the same
 * rule engine auto-approval uses (rules.ts), so the settings preview can't
 * drift from real behaviour. Pure: the settings page loads the history and
 * passes the cases to the client, which re-runs previewPolicy on every edit.
 */
import { completeTotal, type MetricsRfq } from "@/lib/metrics";
import { evaluateApprovalRules, type ApprovalPolicy, type ApprovalRule, type CandidateQuote } from "@/lib/approval/rules";

export interface PreviewCase {
  rfqId: string;
  currency: string;
  recommended: CandidateQuote | null;
  cheapest: CandidateQuote | null;
}

export interface PolicyPreview {
  total: number;
  autoApproved: number;
  /** Why the rest would have been held. */
  byRule: Partial<Record<ApprovalRule, number>>;
}

/**
 * @param picks  RFQ id → the AI recommendation's rank-1 supplier label.
 * @param scores supplier profile id → current score (absent = no score yet).
 */
export function buildPreviewCases(
  rfqs: MetricsRfq[],
  picks: Map<string, string>,
  scores: Map<string, number>
): PreviewCase[] {
  const cases: PreviewCase[] = [];
  for (const rfq of rfqs) {
    const pick = picks.get(rfq.id);
    if (!pick) continue;
    const invites = new Map(rfq.invites.map((i) => [i.id, i]));
    const candidates: CandidateQuote[] = [];
    for (const q of rfq.quotes) {
      if (q.status !== "submitted" && q.status !== "confirmed") continue;
      const total = completeTotal(rfq, q);
      const invite = invites.get(q.invite_id);
      if (total === null || !invite) continue;
      candidates.push({
        quoteId: q.id,
        supplier: invite.label,
        total,
        deliveryDays: q.delivery_days ?? null,
        warranty: q.warranty ?? null,
        supplierScore: invite.supplier_id ? (scores.get(invite.supplier_id) ?? null) : null,
      });
    }
    if (candidates.length === 0) continue;
    const cheapest = candidates.reduce((a, b) => (b.total < a.total ? b : a));
    // Same fallback as auto-approval: an unmatched pick is judged on the cheapest.
    const recommended = candidates.find((c) => c.supplier === pick) ?? cheapest;
    cases.push({ rfqId: rfq.id, currency: rfq.currency, recommended, cheapest });
  }
  return cases;
}

export function previewPolicy(policy: ApprovalPolicy, cases: PreviewCase[]): PolicyPreview {
  const out: PolicyPreview = { total: 0, autoApproved: 0, byRule: {} };
  for (const c of cases) {
    const r = evaluateApprovalRules({ policy, recommended: c.recommended, cheapest: c.cheapest, currency: c.currency });
    if (!r.decision) continue;
    out.total += 1;
    if (r.decision === "auto_approved") out.autoApproved += 1;
    else if (r.rule) out.byRule[r.rule] = (out.byRule[r.rule] ?? 0) + 1;
  }
  return out;
}
