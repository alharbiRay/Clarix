import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, decideApproval } from "@/lib/approval/rules";
import { buildPreviewCases, previewPolicy } from "@/lib/approval/preview";
import type { MetricsRfq } from "@/lib/metrics";

function rfq(
  id: string,
  quotes: { id: string; invite: string; total: number | null; days?: number | null; warranty?: string | null }[],
  currency = "SAR"
): MetricsRfq {
  return {
    id,
    title: `RFQ ${id}`,
    currency,
    created_at: "2026-09-01T00:00:00Z",
    items: [{ id: "i1", name: "Cement", quantity: 1 }],
    invites: [
      { id: "a", label: "Al Rashid", supplier_id: "sup-a", email: "a@x.sa", status: "submitted", invited_at: null },
      { id: "b", label: "Gulf Office", supplier_id: "sup-b", email: "b@x.sa", status: "submitted", invited_at: null },
    ],
    quotes: quotes.map((q) => ({
      id: q.id,
      invite_id: q.invite,
      status: "submitted",
      submitted_at: "2026-09-02T00:00:00Z",
      lines: [{ item_id: "i1", total: q.total }],
      delivery_days: q.days === undefined ? 7 : q.days,
      warranty: q.warranty === undefined ? "12 months" : q.warranty,
    })),
    award: null,
  };
}

describe("buildPreviewCases", () => {
  it("carries the AI's pick and every comparable quote, with scores", () => {
    const r = rfq("r1", [
      { id: "qa", invite: "a", total: 100 },
      { id: "qb", invite: "b", total: 120 },
    ]);
    const [c] = buildPreviewCases([r], new Map([["r1", "Gulf Office"]]), new Map([["sup-b", 81]]));
    expect(c.pickLabel).toBe("Gulf Office");
    expect(c.quotes.find((q) => q.quoteId === "qb")).toMatchObject({ total: 120, supplierScore: 81 });
  });

  it("skips RFQs that never had an automatic recommendation", () => {
    const cases = buildPreviewCases([rfq("r1", [{ id: "qa", invite: "a", total: 100 }])], new Map(), new Map());
    expect(cases).toEqual([]);
  });

  it("gives the live engine exactly the same facts (same decision on the same RFQ)", () => {
    const r = rfq("r1", [
      { id: "qa", invite: "a", total: 100 },
      { id: "qb", invite: "b", total: null },
    ]);
    const [c] = buildPreviewCases([r], new Map([["r1", "Gulf Office"]]), new Map());
    const live = decideApproval({ policy: { ...DEFAULT_POLICY, requireCheapest: false }, pickLabel: "Gulf Office", quotes: c.quotes, currency: "SAR" });
    expect(live).toMatchObject({ decision: "review_needed", rule: "requirements_not_met" });
    expect(previewPolicy({ ...DEFAULT_POLICY, requireCheapest: false }, [c])).toEqual({ total: 1, autoApproved: 0, byRule: { requirements_not_met: 1 } });
  });
});

describe("previewPolicy", () => {
  const cases = buildPreviewCases(
    [
      rfq("r1", [{ id: "q1", invite: "a", total: 1_000 }]),
      rfq("r2", [{ id: "q2", invite: "a", total: 50_000 }]),
      rfq("r3", [{ id: "q3", invite: "a", total: 900, days: 30 }]),
    ],
    new Map([["r1", "Al Rashid"], ["r2", "Al Rashid"], ["r3", "Al Rashid"]]),
    new Map()
  );

  it("counts what the policy would have auto-approved, using the same engine", () => {
    expect(previewPolicy(DEFAULT_POLICY, cases)).toMatchObject({ total: 3, autoApproved: 2 });
    expect(previewPolicy({ ...DEFAULT_POLICY, spendLimit: 10_000, spendLimitCurrency: "SAR" }, cases)).toMatchObject({
      total: 3,
      autoApproved: 1,
      byRule: { above_spend_limit: 1, requirements_not_met: 1 },
    });
    expect(previewPolicy({ ...DEFAULT_POLICY, maxDeliveryDays: 30 }, cases).autoApproved).toBe(3);
    expect(previewPolicy({ ...DEFAULT_POLICY, enabled: false }, cases).autoApproved).toBe(0);
  });

  it("an unmatched AI pick is held, not approved on the cheapest's merits", () => {
    const unmatched = buildPreviewCases([rfq("r9", [{ id: "q9", invite: "a", total: 100 }])], new Map([["r9", "Somebody else"]]), new Map());
    expect(previewPolicy(DEFAULT_POLICY, unmatched)).toEqual({ total: 1, autoApproved: 0, byRule: { ai_pick_unmatched: 1 } });
  });

  it("handles no history", () => {
    expect(previewPolicy(DEFAULT_POLICY, [])).toEqual({ total: 0, autoApproved: 0, byRule: {} });
  });
});
