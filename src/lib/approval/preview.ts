/**
 * "What would this policy have done?" — replays past RFQs through
 * decideApproval, the exact function auto-approval uses (D-046), so the
 * settings preview can't drift from real behaviour. Pure: the settings page
 * loads the history; the client re-runs previewPolicy on every edit.
 */
import { completeTotal, type MetricsRfq } from "@/lib/metrics";
import { decideApproval, type ApprovalPolicy, type ApprovalRule, type DecisionQuote } from "@/lib/approval/rules";

export interface PreviewCase {
  rfqId: string;
  currency: string;
  /** The AI's rank-1 supplier label from the RFQ's latest automatic recommendation. */
  pickLabel: string | null;
  quotes: DecisionQuote[];
}

export interface PolicyPreview {
  total: number;
  autoApproved: number;
  /** Why the rest would have been held. */
  byRule: Partial<Record<ApprovalRule, number>>;
}

/**
 * @param picks  RFQ id → rank-1 label of its latest *automatic* recommendation
 *               (auto-approval only ever runs after those). RFQs without one are skipped.
 * @param scores supplier profile id → current score (absent = no score yet).
 */
export function buildPreviewCases(
  rfqs: MetricsRfq[],
  picks: Map<string, string | null>,
  scores: Map<string, number>
): PreviewCase[] {
  const cases: PreviewCase[] = [];
  for (const rfq of rfqs) {
    if (!picks.has(rfq.id)) continue;
    const invites = new Map(rfq.invites.map((i) => [i.id, i]));
    const quotes: DecisionQuote[] = [];
    for (const q of rfq.quotes) {
      if (q.status !== "submitted" && q.status !== "confirmed") continue;
      const invite = invites.get(q.invite_id);
      if (!invite) continue;
      quotes.push({
        quoteId: q.id,
        supplier: invite.label,
        total: completeTotal(rfq, q),
        deliveryDays: q.delivery_days ?? null,
        warranty: q.warranty ?? null,
        supplierScore: invite.supplier_id ? (scores.get(invite.supplier_id) ?? null) : null,
      });
    }
    cases.push({ rfqId: rfq.id, currency: rfq.currency, pickLabel: picks.get(rfq.id) ?? null, quotes });
  }
  return cases;
}

export function previewPolicy(policy: ApprovalPolicy, cases: PreviewCase[]): PolicyPreview {
  const out: PolicyPreview = { total: 0, autoApproved: 0, byRule: {} };
  for (const c of cases) {
    const r = decideApproval({ policy, pickLabel: c.pickLabel, quotes: c.quotes, currency: c.currency });
    if (!r.decision) continue;
    out.total += 1;
    if (r.decision === "auto_approved") out.autoApproved += 1;
    else if (r.rule) out.byRule[r.rule] = (out.byRule[r.rule] ?? 0) + 1;
  }
  return out;
}
