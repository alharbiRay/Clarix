/**
 * Auto-approval rule engine: a pure function from (policy, the AI's pick, the
 * cheapest complete quote) to a decision plus the reasons a human can read.
 * evaluateAutoApproval (src/lib/auto-approval.ts) applies it and writes the
 * explanation to the audit log; the settings page runs it over history for
 * the live preview. Exhaustively table-tested (rules.test.ts).
 */
import { z } from "zod";

export interface ApprovalPolicy {
  enabled: boolean;
  maxDeliveryDays: number;
  requireWarranty: boolean;
  /** Above this total a manager must approve. null = no limit. */
  spendLimit: number | null;
  /** Minimum supplier score (0-100). null = not required. */
  minSupplierScore: number | null;
  /** The AI's pick must be the cheapest complete quote. */
  requireCheapest: boolean;
}

export const DEFAULT_POLICY: ApprovalPolicy = {
  enabled: true,
  maxDeliveryDays: 14,
  requireWarranty: true,
  spendLimit: null,
  minSupplierScore: null,
  requireCheapest: true,
};

const policySchema = z.object({
  enabled: z.boolean().default(DEFAULT_POLICY.enabled),
  maxDeliveryDays: z
    .number({ invalid_type_error: "Max delivery days must be a number" })
    .int("Max delivery days must be a whole number")
    .min(1, "Max delivery days must be at least 1")
    .max(365, "Max delivery days can be at most 365")
    .default(DEFAULT_POLICY.maxDeliveryDays),
  requireWarranty: z.boolean().default(DEFAULT_POLICY.requireWarranty),
  spendLimit: z.number().min(0, "The spend limit can't be negative").max(1e12).nullable().default(null),
  minSupplierScore: z
    .number()
    .int("The minimum score must be a whole number")
    .min(0, "The minimum score must be between 0 and 100")
    .max(100, "The minimum score must be between 0 and 100")
    .nullable()
    .default(null),
  requireCheapest: z.boolean().default(DEFAULT_POLICY.requireCheapest),
});

export function parsePolicy(input: unknown): { ok: true; policy: ApprovalPolicy } | { ok: false; error: string } {
  const r = policySchema.safeParse(input ?? {});
  return r.success ? { ok: true, policy: r.data } : { ok: false, error: r.error.errors[0]?.message ?? "Invalid policy" };
}

export interface CandidateQuote {
  quoteId: string;
  supplier: string;
  total: number;
  deliveryDays: number | null;
  warranty: string | null;
  supplierScore: number | null;
}

export type ApprovalDecision = "auto_approved" | "review_needed" | "differs_from_cheapest";
export type ApprovalRule =
  | "all_rules_passed"
  | "auto_approval_disabled"
  | "recommended_differs_from_cheapest"
  | "above_spend_limit"
  | "requirements_not_met";

export interface ApprovalResult {
  decision: ApprovalDecision | null;
  rule: ApprovalRule | null;
  /** Why it was held (each a lower-case clause). */
  reasons: string[];
  /** Why it passed (each a lower-case clause). */
  explanation: string[];
  /** One sentence for notifications and rfq_awards.reason (null when approved). */
  reason: string | null;
  /** Only a manager may approve this one. */
  requiresManager: boolean;
}

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const none: ApprovalResult = { decision: null, rule: null, reasons: [], explanation: [], reason: null, requiresManager: false };

export function evaluateApprovalRules({
  policy,
  recommended,
  cheapest,
  currency,
}: {
  policy: ApprovalPolicy;
  recommended: CandidateQuote | null;
  cheapest: CandidateQuote | null;
  currency: string;
}): ApprovalResult {
  if (!policy.enabled) {
    const reason = "auto-approval is turned off — review and approve manually";
    return { ...none, decision: "review_needed", rule: "auto_approval_disabled", reasons: [reason], reason };
  }
  if (!recommended || !cheapest) return none;

  const isCheapest = recommended.quoteId === cheapest.quoteId;
  const premium = Math.round((recommended.total - cheapest.total) * 100) / 100;

  if (policy.requireCheapest && !isCheapest) {
    const reason = `recommended supplier is ${money(premium, currency)} more than the cheapest quote`;
    return { ...none, decision: "differs_from_cheapest", rule: "recommended_differs_from_cheapest", reasons: [reason], reason };
  }

  const reasons: string[] = [];
  const explanation: string[] = [
    isCheapest ? "cheapest complete quote" : `AI recommendation (${money(premium, currency)} above the cheapest)`,
  ];

  if (recommended.deliveryDays === null) reasons.push("delivery time not confirmed");
  else if (recommended.deliveryDays > policy.maxDeliveryDays)
    reasons.push(`delivery is ${recommended.deliveryDays} days (must be ${policy.maxDeliveryDays} or less)`);
  else explanation.push(`delivery ${recommended.deliveryDays} days (limit ${policy.maxDeliveryDays})`);

  const hasWarranty = Boolean(recommended.warranty && recommended.warranty.trim());
  if (policy.requireWarranty && !hasWarranty) reasons.push("no warranty provided");
  else if (hasWarranty) explanation.push(`${recommended.warranty!.trim()} warranty`);

  if (policy.minSupplierScore !== null) {
    if (recommended.supplierScore === null)
      reasons.push(`supplier has no score yet (minimum ${policy.minSupplierScore} required)`);
    else if (recommended.supplierScore < policy.minSupplierScore)
      reasons.push(`supplier score ${recommended.supplierScore} is below the minimum of ${policy.minSupplierScore}`);
    else explanation.push(`supplier score ${recommended.supplierScore} (minimum ${policy.minSupplierScore})`);
  }

  const overLimit = policy.spendLimit !== null && recommended.total > policy.spendLimit;
  if (overLimit) {
    reasons.push(
      `${money(recommended.total, currency)} is above the auto-approval limit of ${money(policy.spendLimit!, currency)} — a manager must approve`
    );
  } else if (policy.spendLimit !== null) {
    explanation.push(`within the ${money(policy.spendLimit, currency)} limit`);
  }

  if (reasons.length === 0) {
    return { decision: "auto_approved", rule: "all_rules_passed", reasons, explanation, reason: null, requiresManager: false };
  }
  return {
    decision: "review_needed",
    rule: overLimit ? "above_spend_limit" : "requirements_not_met",
    reasons,
    explanation: [],
    reason: `${isCheapest ? "cheapest option" : "recommended option"} has issues — ${reasons.join("; ")}`,
    requiresManager: overLimit,
  };
}
