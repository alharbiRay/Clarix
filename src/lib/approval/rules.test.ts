import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  evaluateApprovalRules,
  parsePolicy,
  type ApprovalPolicy,
  type CandidateQuote,
} from "@/lib/approval/rules";

const cheap: CandidateQuote = { quoteId: "q-cheap", supplier: "Al Rashid", total: 10_000, deliveryDays: 9, warranty: "12 months", supplierScore: 77 };
const pricey: CandidateQuote = { quoteId: "q-pricey", supplier: "Gulf Office", total: 12_000, deliveryDays: 5, warranty: "24 months", supplierScore: 55 };

function run(policy: Partial<ApprovalPolicy>, recommended: CandidateQuote | null = cheap, cheapest: CandidateQuote | null = cheap) {
  return evaluateApprovalRules({ policy: { ...DEFAULT_POLICY, ...policy }, recommended, cheapest, currency: "SAR" });
}

describe("evaluateApprovalRules", () => {
  it.each([
    {
      name: "defaults: cheapest AI pick that meets every rule is auto-approved",
      policy: {},
      rec: cheap,
      cheapest: cheap,
      decision: "auto_approved",
      rule: "all_rules_passed",
      explanation: ["cheapest complete quote", "delivery 9 days (limit 14)", "12 months warranty"],
    },
    {
      name: "auto-approval switched off",
      policy: { enabled: false },
      rec: cheap,
      cheapest: cheap,
      decision: "review_needed",
      rule: "auto_approval_disabled",
      reasons: ["auto-approval is turned off — review and approve manually"],
    },
    {
      name: "AI pick isn't the cheapest (required by default)",
      policy: {},
      rec: pricey,
      cheapest: cheap,
      decision: "differs_from_cheapest",
      rule: "recommended_differs_from_cheapest",
      reasons: ["recommended supplier is SAR 2,000.00 more than the cheapest quote"],
    },
    {
      name: "AI pick isn't the cheapest but that's allowed and it passes everything",
      policy: { requireCheapest: false },
      rec: pricey,
      cheapest: cheap,
      decision: "auto_approved",
      rule: "all_rules_passed",
      explanation: ["AI recommendation (SAR 2,000.00 above the cheapest)", "delivery 5 days (limit 14)", "24 months warranty"],
    },
    {
      name: "delivery too slow",
      policy: { maxDeliveryDays: 7 },
      rec: cheap,
      cheapest: cheap,
      decision: "review_needed",
      rule: "requirements_not_met",
      reasons: ["delivery is 9 days (must be 7 or less)"],
    },
    {
      name: "delivery unknown",
      policy: {},
      rec: { ...cheap, deliveryDays: null },
      cheapest: { ...cheap, deliveryDays: null },
      decision: "review_needed",
      rule: "requirements_not_met",
      reasons: ["delivery time not confirmed"],
    },
    {
      name: "no warranty when required",
      policy: {},
      rec: { ...cheap, warranty: "  " },
      cheapest: { ...cheap, warranty: "  " },
      decision: "review_needed",
      rule: "requirements_not_met",
      reasons: ["no warranty provided"],
    },
    {
      name: "no warranty but warranty not required",
      policy: { requireWarranty: false },
      rec: { ...cheap, warranty: null },
      cheapest: { ...cheap, warranty: null },
      decision: "auto_approved",
      rule: "all_rules_passed",
      explanation: ["cheapest complete quote", "delivery 9 days (limit 14)"],
    },
    {
      name: "above the spend limit",
      policy: { spendLimit: 5_000 },
      rec: cheap,
      cheapest: cheap,
      decision: "review_needed",
      rule: "above_spend_limit",
      reasons: ["SAR 10,000.00 is above the auto-approval limit of SAR 5,000.00 — a manager must approve"],
    },
    {
      name: "exactly at the spend limit is allowed",
      policy: { spendLimit: 10_000 },
      rec: cheap,
      cheapest: cheap,
      decision: "auto_approved",
      rule: "all_rules_passed",
      explanation: ["cheapest complete quote", "delivery 9 days (limit 14)", "12 months warranty", "within the SAR 10,000.00 limit"],
    },
    {
      name: "supplier score too low",
      policy: { minSupplierScore: 80 },
      rec: cheap,
      cheapest: cheap,
      decision: "review_needed",
      rule: "requirements_not_met",
      reasons: ["supplier score 77 is below the minimum of 80"],
    },
    {
      name: "supplier has no score yet but a minimum is set",
      policy: { minSupplierScore: 50 },
      rec: { ...cheap, supplierScore: null },
      cheapest: { ...cheap, supplierScore: null },
      decision: "review_needed",
      rule: "requirements_not_met",
      reasons: ["supplier has no score yet (minimum 50 required)"],
    },
    {
      name: "several problems are all reported, spend limit wins the rule name",
      policy: { spendLimit: 1_000, maxDeliveryDays: 3 },
      rec: { ...cheap, warranty: null },
      cheapest: { ...cheap, warranty: null },
      decision: "review_needed",
      rule: "above_spend_limit",
      reasons: [
        "delivery is 9 days (must be 3 or less)",
        "no warranty provided",
        "SAR 10,000.00 is above the auto-approval limit of SAR 1,000.00 — a manager must approve",
      ],
    },
  ])("$name", ({ policy, rec, cheapest, decision, rule, reasons, explanation }) => {
    const result = run(policy as Partial<ApprovalPolicy>, rec, cheapest);
    expect(result.decision).toBe(decision);
    expect(result.rule).toBe(rule);
    if (reasons) expect(result.reasons).toEqual(reasons);
    if (explanation) expect(result.explanation).toEqual(explanation);
  });

  it("can't decide without a recommended or a cheapest complete quote", () => {
    expect(run({}, null, cheap).decision).toBeNull();
    expect(run({}, cheap, null).decision).toBeNull();
  });

  it("joins reasons into one human sentence for notifications", () => {
    const r = run({ maxDeliveryDays: 7 }, { ...cheap, warranty: null }, { ...cheap, warranty: null });
    expect(r.reason).toBe("cheapest option has issues — delivery is 9 days (must be 7 or less); no warranty provided");
  });

  it("flags a spend-limit hold as needing a manager", () => {
    expect(run({ spendLimit: 5_000 }).requiresManager).toBe(true);
    expect(run({ maxDeliveryDays: 3 }).requiresManager).toBe(false);
  });
});

describe("parsePolicy", () => {
  it("fills defaults", () => {
    expect(parsePolicy({})).toEqual({ ok: true, policy: DEFAULT_POLICY });
  });

  it("accepts a valid policy", () => {
    const p = { enabled: true, maxDeliveryDays: 21, requireWarranty: false, spendLimit: 50_000, minSupplierScore: 60, requireCheapest: false };
    expect(parsePolicy(p)).toEqual({ ok: true, policy: p });
  });

  it.each([
    [{ maxDeliveryDays: 0 }, /delivery/i],
    [{ maxDeliveryDays: 400 }, /delivery/i],
    [{ maxDeliveryDays: 2.5 }, /delivery/i],
    [{ spendLimit: -1 }, /limit/i],
    [{ minSupplierScore: 101 }, /score/i],
  ])("rejects %j", (input, message) => {
    const r = parsePolicy(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });
});
