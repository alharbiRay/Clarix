/**
 * Auto-approval rule engine: pure functions from (policy, the AI's pick, the
 * quotes) to a decision plus the reasons a human can read.
 * evaluateAutoApproval (src/lib/auto-approval.ts) applies decideApproval and
 * writes the explanation to the audit log; the settings page runs the same
 * decideApproval over history for its preview (D-046), so the two can't drift.
 * Exhaustively table-tested (rules.test.ts).
 */
import { z } from "zod";

export interface ApprovalPolicy {
  enabled: boolean;
  maxDeliveryDays: number;
  requireWarranty: boolean;
  /** Above this total a manager must approve. null = no limit. */
  spendLimit: number | null;
  /** Currency the spend limit is in. null = legacy row: the RFQ's own currency. */
  spendLimitCurrency: string | null;
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
  spendLimitCurrency: null,
  minSupplierScore: null,
  requireCheapest: true,
};

/** numeric(14, 2) in the database. */
export const MAX_SPEND_LIMIT = 999_999_999_999.99;

const fields = {
  enabled: z.boolean(),
  maxDeliveryDays: z
    .number({ invalid_type_error: "Max delivery days must be a number" })
    .int("Max delivery days must be a whole number")
    .min(1, "Max delivery days must be at least 1")
    .max(365, "Max delivery days can be at most 365"),
  requireWarranty: z.boolean(),
  spendLimit: z
    .number({ invalid_type_error: "The spend limit must be a number" })
    .min(0, "The spend limit can't be negative")
    .max(MAX_SPEND_LIMIT, "The spend limit is too large")
    .nullable(),
  spendLimitCurrency: z.string().regex(/^[A-Z]{3}$/, "Unknown currency").nullable(),
  minSupplierScore: z
    .number({ invalid_type_error: "The minimum score must be a number" })
    .int("The minimum score must be a whole number")
    .min(0, "The minimum score must be between 0 and 100")
    .max(100, "The minimum score must be between 0 and 100")
    .nullable(),
  requireCheapest: z.boolean(),
};

const withDefaults = z.object({
  enabled: fields.enabled.default(DEFAULT_POLICY.enabled),
  maxDeliveryDays: fields.maxDeliveryDays.default(DEFAULT_POLICY.maxDeliveryDays),
  requireWarranty: fields.requireWarranty.default(DEFAULT_POLICY.requireWarranty),
  spendLimit: fields.spendLimit.default(null),
  spendLimitCurrency: fields.spendLimitCurrency.default(null),
  minSupplierScore: fields.minSupplierScore.default(null),
  requireCheapest: fields.requireCheapest.default(DEFAULT_POLICY.requireCheapest),
});

/** Every field required: a save must never silently reset what it left out. */
const strict = z.object(fields).strict();

export function parsePolicy(
  input: unknown,
  opts: { strict?: boolean } = {}
): { ok: true; policy: ApprovalPolicy } | { ok: false; error: string } {
  const r = opts.strict ? strict.safeParse(input) : withDefaults.safeParse(input ?? {});
  if (!r.success) return { ok: false, error: r.error.errors[0]?.message ?? "Invalid policy" };
  const policy = r.data as ApprovalPolicy;
  if (policy.spendLimit !== null && opts.strict && !policy.spendLimitCurrency) {
    return { ok: false, error: "Choose the spend limit's currency" };
  }
  return { ok: true, policy };
}

export interface CandidateQuote {
  quoteId: string;
  supplier: string;
  total: number;
  deliveryDays: number | null;
  warranty: string | null;
  supplierScore: number | null;
  /** The score lookup failed (as opposed to "no score yet"). */
  scoreUnavailable?: boolean;
}

export type ApprovalDecision = "auto_approved" | "review_needed" | "differs_from_cheapest";
export type ApprovalRule =
  | "all_rules_passed"
  | "auto_approval_disabled"
  | "recommended_differs_from_cheapest"
  | "above_spend_limit"
  | "requirements_not_met"
  | "ai_pick_unmatched";

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

/** Spend-limit check, shared by the engine and approveAward. null = within the limit (or no limit). */
export function spendLimitProblem(policy: ApprovalPolicy, total: number | null, currency: string): string | null {
  if (policy.spendLimit === null) return null;
  const limitCurrency = policy.spendLimitCurrency ?? currency;
  if (limitCurrency !== currency) {
    return `the spend limit is set in ${limitCurrency} but this RFQ is in ${currency} — a manager must approve`;
  }
  if (total === null) return "the total isn't complete, so it can't be checked against the spend limit — a manager must approve";
  if (total > policy.spendLimit) {
    return `${money(total, currency)} is above the auto-approval limit of ${money(policy.spendLimit, currency)} — a manager must approve`;
  }
  return null;
}

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
  const limitProblem = spendLimitProblem(policy, recommended.total, currency);

  if (policy.requireCheapest && !isCheapest) {
    const reasons = [`recommended supplier is ${money(premium, currency)} more than the cheapest quote`];
    if (limitProblem) reasons.push(limitProblem);
    return {
      ...none,
      decision: "differs_from_cheapest",
      // The spend limit names the rule whenever it applies (D-050): it decides who must act.
      rule: limitProblem ? "above_spend_limit" : "recommended_differs_from_cheapest",
      reasons,
      reason: reasons.join("; "),
      requiresManager: Boolean(limitProblem),
    };
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
    if (recommended.scoreUnavailable)
      reasons.push("the supplier score couldn't be checked right now");
    else if (recommended.supplierScore === null)
      reasons.push(`supplier has no score yet (minimum ${policy.minSupplierScore} required)`);
    else if (recommended.supplierScore < policy.minSupplierScore)
      reasons.push(`supplier score ${recommended.supplierScore} is below the minimum of ${policy.minSupplierScore}`);
    else explanation.push(`supplier score ${recommended.supplierScore} (minimum ${policy.minSupplierScore})`);
  }

  if (limitProblem) reasons.push(limitProblem);
  else if (policy.spendLimit !== null) explanation.push(`within the ${money(policy.spendLimit, currency)} limit`);

  if (reasons.length === 0) {
    return { decision: "auto_approved", rule: "all_rules_passed", reasons, explanation, reason: null, requiresManager: false };
  }
  return {
    decision: "review_needed",
    rule: limitProblem ? "above_spend_limit" : "requirements_not_met",
    reasons,
    explanation: [],
    reason: `${isCheapest ? "cheapest option" : "recommended option"} has issues — ${reasons.join("; ")}`,
    requiresManager: Boolean(limitProblem),
  };
}

// ---------------------------------------------------------------------------
// From quotes to a decision (shared by auto-approval and the preview)
// ---------------------------------------------------------------------------

export interface DecisionQuote {
  quoteId: string;
  /** Supplier label, as the AI ranking names it. */
  supplier: string;
  /** Total when every line is priced; null when the quote is incomplete. */
  total: number | null;
  deliveryDays: number | null;
  warranty: string | null;
  supplierScore: number | null;
  scoreUnavailable?: boolean;
}

export interface ApprovalOutcome extends ApprovalResult {
  /** The AI's pick, when it matched a quote. Never filled in with a stand-in. */
  recommendedQuoteId: string | null;
  cheapestQuoteId: string | null;
}

/**
 * Picks the AI's quote and the cheapest complete one out of the RFQ's
 * submitted/confirmed quotes, then applies the policy. Fail-safe on every
 * unknown (D-049): an unmatched or incomplete pick is held for a person,
 * never approved.
 *
 * Returns decision null when no quote is complete yet (nothing to decide).
 */
export function decideApproval({
  policy,
  pickLabel,
  quotes,
  currency,
}: {
  policy: ApprovalPolicy;
  pickLabel: string | null;
  quotes: DecisionQuote[];
  currency: string;
}): ApprovalOutcome {
  const complete = quotes.filter((q): q is DecisionQuote & { total: number } => q.total !== null);
  const cheapest = complete.length ? complete.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const pick = pickLabel ? (quotes.find((q) => q.supplier === pickLabel) ?? null) : null;
  const ids = { recommendedQuoteId: pick?.quoteId ?? null, cheapestQuoteId: cheapest?.quoteId ?? null };

  if (!policy.enabled) {
    return { ...evaluateApprovalRules({ policy, recommended: null, cheapest: null, currency }), recommendedQuoteId: null, cheapestQuoteId: null };
  }
  if (!cheapest) {
    return { ...none, reason: "no quote has a price for every line item yet", ...ids };
  }
  const hold = (rule: ApprovalRule, reason: string): ApprovalOutcome => ({
    ...none,
    decision: "review_needed",
    rule,
    reasons: [reason],
    reason,
    ...ids,
  });
  if (!pickLabel) return hold("ai_pick_unmatched", "the AI recommendation didn't name a top supplier — compare the quotes and choose");
  if (!pick) return hold("ai_pick_unmatched", `the AI's pick (${pickLabel}) couldn't be matched to a quote — check the comparison`);
  if (pick.total === null) {
    return hold("requirements_not_met", `the AI's pick (${pick.supplier}) hasn't priced every line — review the comparison`);
  }
  const asCandidate = (q: DecisionQuote & { total: number }): CandidateQuote => ({
    quoteId: q.quoteId,
    supplier: q.supplier,
    total: q.total,
    deliveryDays: q.deliveryDays,
    warranty: q.warranty,
    supplierScore: q.supplierScore,
    scoreUnavailable: q.scoreUnavailable,
  });
  return {
    ...evaluateApprovalRules({ policy, recommended: asCandidate(pick as DecisionQuote & { total: number }), cheapest: asCandidate(cheapest), currency }),
    ...ids,
  };
}
