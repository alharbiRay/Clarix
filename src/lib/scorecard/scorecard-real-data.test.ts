import { describe, expect, it } from "vitest";
import type { MetricsRfq } from "@/lib/metrics";
import { allocatePoints, scoreSupplier, scoreTrend, supplierMetrics } from "@/lib/scorecard";
import { parseSupplierListParams } from "@/lib/scorecard/list";

const NOW = new Date("2026-10-14T00:00:00Z");
const SUP = { id: "sup-a", email: "a@supplier.example" };

/**
 * Real data shape: invites created from the New RFQ form carry the email but
 * no supplier_id until a quote arrives (ensureSupplierProfile links them then).
 */
function rfq(opts: {
  id: string;
  status?: "draft" | "sent" | "closed" | "awarded";
  deadline?: string | null;
  inviteStatus: "sent" | "viewed" | "submitted" | "declined";
  linked: boolean;
  awardedToA?: boolean;
  poSent?: boolean;
  invitedAt?: string;
  submittedAt?: string;
}): MetricsRfq {
  const invite = {
    id: `${opts.id}-inv`,
    label: "Supplier A",
    email: "A@Supplier.example",
    supplier_id: opts.linked ? SUP.id : null,
    status: opts.inviteStatus,
    invited_at: opts.invitedAt ?? "2026-09-01T00:00:00Z",
  };
  const quotes =
    opts.inviteStatus === "submitted"
      ? [
          {
            id: `${opts.id}-q`,
            invite_id: invite.id,
            status: "submitted" as const,
            submitted_at: opts.submittedAt ?? "2026-09-02T00:00:00Z",
            lines: [{ item_id: `${opts.id}-i`, total: 100 }],
          },
        ]
      : [];
  return {
    id: opts.id,
    title: opts.id,
    currency: "SAR",
    created_at: "2026-09-01T00:00:00Z",
    status: opts.status ?? "awarded",
    deadline: opts.deadline === undefined ? "2026-09-10T00:00:00Z" : opts.deadline,
    items: [{ id: `${opts.id}-i`, name: "x", quantity: 1 }],
    invites: [invite],
    quotes,
    award: opts.awardedToA
      ? { decision: "auto_approved", quote_id: `${opts.id}-q`, po_sent_at: opts.poSent === false ? null : "2026-09-05T00:00:00Z", created_at: "2026-09-05T00:00:00Z", reason: null }
      : opts.status === "awarded" || opts.status === undefined
        ? { decision: "auto_approved", quote_id: "someone-else", po_sent_at: "2026-09-05T00:00:00Z", created_at: "2026-09-05T00:00:00Z", reason: null }
        : null,
  };
}

describe("supplierMetrics on real (partially linked) data", () => {
  it("counts invitations that were never linked to the supplier profile, matched by email", () => {
    const rfqs = [
      rfq({ id: "r1", inviteStatus: "submitted", linked: true, awardedToA: true }),
      rfq({ id: "r2", inviteStatus: "sent", linked: false }), // ignored, deadline passed
      rfq({ id: "r3", inviteStatus: "declined", linked: false }),
    ];
    const m = supplierMetrics(rfqs, SUP, NOW);
    expect(m).toMatchObject({ invited: 3, quoted: 1, declined: 1 });
    expect(m.responseRate).toBeCloseTo(1 / 3);
  });

  it("doesn't count an invitation that is still open (deadline not passed, no reply yet)", () => {
    const rfqs = [
      rfq({ id: "r1", inviteStatus: "submitted", linked: true }),
      rfq({ id: "r2", status: "sent", deadline: "2026-10-20T00:00:00Z", inviteStatus: "viewed", linked: false }),
    ];
    expect(supplierMetrics(rfqs, SUP, NOW)).toMatchObject({ invited: 1, quoted: 1, responseRate: 1 });
  });

  it("computes win rate over decided RFQs only", () => {
    const rfqs = [
      rfq({ id: "r1", inviteStatus: "submitted", linked: true, awardedToA: true }),
      rfq({ id: "r2", inviteStatus: "submitted", linked: true }), // lost
      rfq({ id: "r3", status: "sent", deadline: "2026-10-20T00:00:00Z", inviteStatus: "submitted", linked: true }), // still open
      rfq({ id: "r4", status: "sent", deadline: "2026-10-20T00:00:00Z", inviteStatus: "submitted", linked: true, awardedToA: true, poSent: false }), // pending approval
    ];
    const m = supplierMetrics(rfqs, SUP, NOW);
    expect(m.quoted).toBe(4);
    expect(m.awarded).toBe(1);
    expect(m.decidedQuotes).toBe(2);
    expect(m.winRate).toBe(0.5);
  });

  it("reports last activity as the supplier's own last quote, falling back to the last invitation", () => {
    const quoted = [rfq({ id: "r1", inviteStatus: "submitted", linked: true, invitedAt: "2026-09-20T00:00:00Z", submittedAt: "2026-09-21T00:00:00Z" }), rfq({ id: "r2", inviteStatus: "sent", linked: false, invitedAt: "2026-10-01T00:00:00Z" })];
    expect(supplierMetrics(quoted, SUP, NOW).lastActive).toBe("2026-09-21T00:00:00Z");
    const never = [rfq({ id: "r3", inviteStatus: "sent", linked: false, invitedAt: "2026-10-01T00:00:00Z" })];
    expect(supplierMetrics(never, SUP, NOW).lastActive).toBe("2026-10-01T00:00:00Z");
  });

  it("compares timestamps as instants, not strings (any UTC offset)", () => {
    // 23:30 at +03:00 on June 30 is still June in Riyadh (20:30Z), but as a string it sorts after
    // the June cutoff "2026-06-30T20:59:59.999Z" — a string comparison would drop this quote.
    const r = rfq({ id: "r1", inviteStatus: "submitted", linked: true, invitedAt: "2026-06-30T21:00:00+03:00", submittedAt: "2026-06-30T23:30:00+03:00" });
    r.created_at = "2026-06-30T22:00:00+03:00";
    const r2 = rfq({ id: "r2", inviteStatus: "submitted", linked: true, invitedAt: "2026-06-29T00:00:00Z", submittedAt: "2026-06-29T05:00:00Z" });
    r2.created_at = "2026-06-28T00:00:00Z";
    const trend = scoreTrend([r, r2], SUP, new Date("2026-07-15T00:00:00Z"), 2);
    // Both quotes were submitted by the end of June (Riyadh time) → June already has 2 quotes.
    expect(trend[0].score).not.toBeNull();
  });
});

describe("allocatePoints", () => {
  it("rounds component points so they always add up to the displayed total", () => {
    expect(allocatePoints([33.4, 33.3, 33.3])).toEqual([34, 33, 33]);
    expect(allocatePoints([10.5, 20.5, 30.5, 8.5])).toEqual([11, 21, 30, 8]);
    const raw = [26.7, 16.2, 9.4, 3.1, 4.6];
    expect(allocatePoints(raw).reduce((a, b) => a + b, 0)).toBe(Math.round(raw.reduce((a, b) => a + b, 0)));
  });

  it("is used by scoreSupplier so the breakdown matches the score", () => {
    const card = scoreSupplier({
      invited: 9, quoted: 7, declined: 1, responseRate: 7 / 9, medianResponseHours: 33,
      awarded: 2, decidedQuotes: 6, winRate: 2 / 6, avgPriceVsLowest: 0.037, priceSamples: 6,
      deliveryVsTypicalDays: 1.2, fasterThanTypicalRate: 0.43, warrantyRate: 0.21, lastActive: null,
    })!;
    expect(card.components.reduce((s, c) => s + c.points, 0)).toBe(card.score);
  });
});

describe("parseSupplierListParams", () => {
  it("treats an empty ?min= as no filter", () => {
    expect(parseSupplierListParams({ min: "" })).toEqual({ sort: "score", min: null });
  });
});
