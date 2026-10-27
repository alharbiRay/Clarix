import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "@/lib/approval/rules";
import { buildPreviewCases, previewPolicy } from "@/lib/approval/preview";
import type { MetricsRfq } from "@/lib/metrics";

function rfq(id: string, quotes: { id: string; invite: string; total: number | null; days?: number | null; warranty?: string | null }[]): MetricsRfq {
  return {
    id,
    title: `RFQ ${id}`,
    currency: "SAR",
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
  it("pairs the AI's pick with the cheapest complete quote", () => {
    const r = rfq("r1", [
      { id: "qa", invite: "a", total: 100 },
      { id: "qb", invite: "b", total: 120 },
    ]);
    const [c] = buildPreviewCases([r], new Map([["r1", "Gulf Office"]]), new Map([["sup-b", 81]]));
    expect(c.recommended).toMatchObject({ quoteId: "qb", total: 120, supplierScore: 81 });
    expect(c.cheapest).toMatchObject({ quoteId: "qa", total: 100 });
  });

  it("skips RFQs with no AI pick or no complete quote, and falls back to cheapest when the pick can't be matched", () => {
    const complete = rfq("r1", [{ id: "qa", invite: "a", total: 100 }]);
    const incomplete = rfq("r2", [{ id: "qa2", invite: "a", total: null }]);
    const noPick = rfq("r3", [{ id: "qa3", invite: "a", total: 50 }]);
    const cases = buildPreviewCases([complete, incomplete, noPick], new Map([["r1", "Someone else"], ["r2", "Al Rashid"]]), new Map());
    expect(cases.map((c) => c.rfqId)).toEqual(["r1"]);
    expect(cases[0].recommended?.quoteId).toBe("qa");
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
    expect(previewPolicy({ ...DEFAULT_POLICY, spendLimit: 10_000 }, cases)).toMatchObject({
      total: 3,
      autoApproved: 1,
      byRule: { above_spend_limit: 1, requirements_not_met: 1 },
    });
    expect(previewPolicy({ ...DEFAULT_POLICY, maxDeliveryDays: 30 }, cases).autoApproved).toBe(3);
    expect(previewPolicy({ ...DEFAULT_POLICY, enabled: false }, cases).autoApproved).toBe(0);
  });

  it("handles no history", () => {
    expect(previewPolicy(DEFAULT_POLICY, [])).toEqual({ total: 0, autoApproved: 0, byRule: {} });
  });
});
