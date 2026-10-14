import { describe, expect, it } from "vitest";
import {
  computeKpis,
  computeRfqSavings,
  itemSavings,
  monthKey,
  primaryCurrency,
  pendingExtractions,
  reviewQueue,
  savingsSeries,
  spendBySupplier,
  topSavings,
  type MetricsRfq,
} from "@/lib/metrics";

const NOW = new Date("2026-10-14T09:00:00Z");

let seq = 0;
/** RFQ builder: quotes are given as { inviteLabel: [line totals in item order] }. */
function rfq(opts: {
  quotes: Record<string, (number | null)[]>;
  awardedTo?: string;
  decision?: "auto_approved" | "review_needed" | "differs_from_cheapest";
  poSentAt?: string | null;
  createdAt?: string;
  currency?: string;
  statuses?: Record<string, "submitted" | "confirmed" | "needs_review" | "rejected">;
  invitedAt?: string;
  submittedAt?: Record<string, string>;
  declined?: string[];
  pending?: string[];
}): MetricsRfq {
  const id = `rfq-${++seq}`;
  const labels = Object.keys(opts.quotes);
  const itemCount = Math.max(...labels.map((l) => opts.quotes[l].length), 1);
  const items = Array.from({ length: itemCount }, (_, i) => ({ id: `${id}-item-${i}`, name: `Item ${i}`, quantity: 1 }));
  const invitedAt = opts.invitedAt ?? "2026-10-01T08:00:00Z";
  const invites = [
    ...labels.map((label) => ({ id: `${id}-${label}`, label, supplier_id: `sup-${label}`, status: "submitted" as const, invited_at: invitedAt })),
    ...(opts.declined ?? []).map((label) => ({ id: `${id}-${label}`, label, supplier_id: `sup-${label}`, status: "declined" as const, invited_at: invitedAt })),
    ...(opts.pending ?? []).map((label) => ({ id: `${id}-${label}`, label, supplier_id: `sup-${label}`, status: "sent" as const, invited_at: invitedAt })),
  ];
  const quotes = labels.map((label) => ({
    id: `${id}-q-${label}`,
    invite_id: `${id}-${label}`,
    status: opts.statuses?.[label] ?? ("submitted" as const),
    submitted_at: opts.submittedAt?.[label] ?? "2026-10-02T08:00:00Z",
    lines: opts.quotes[label].map((total, i) => ({ item_id: items[i].id, total })),
  }));
  return {
    id,
    title: `RFQ ${seq}`,
    currency: opts.currency ?? "SAR",
    created_at: opts.createdAt ?? "2026-10-01T07:00:00Z",
    items,
    invites,
    quotes,
    award: opts.awardedTo
      ? {
          decision: opts.decision ?? "auto_approved",
          quote_id: `${id}-q-${opts.awardedTo}`,
          po_sent_at: opts.poSentAt === undefined ? "2026-10-03T08:00:00Z" : opts.poSentAt,
          created_at: "2026-10-03T08:00:00Z",
          reason: opts.decision && opts.decision !== "auto_approved" ? "needs a human" : null,
        }
      : null,
  };
}

describe("computeRfqSavings", () => {
  it("is the average of the other complete quotes minus the awarded total", () => {
    const r = rfq({ quotes: { A: [60, 40], B: [70, 50], C: [80, 60] }, awardedTo: "A" });
    // awarded 100; others 120 and 140 → baseline 130
    expect(computeRfqSavings(r)).toMatchObject({
      awardedTotal: 100,
      baseline: 130,
      savings: 30,
      savingsPct: 30 / 130,
      basis: "average_of_other_quotes",
      otherQuoteCount: 2,
      awardedAt: "2026-10-03T08:00:00Z",
    });
  });

  it("ignores incomplete, unreviewed and rejected alternatives", () => {
    const r = rfq({
      quotes: { A: [50, 50], B: [80, 80], C: [10, null], D: [1, 1], E: [2, 2] },
      statuses: { D: "needs_review", E: "rejected" },
      awardedTo: "A",
    });
    expect(computeRfqSavings(r)).toMatchObject({ baseline: 160, savings: 60, otherQuoteCount: 1 });
  });

  it("reports a premium paid as negative savings, never clamped", () => {
    const r = rfq({ quotes: { Cheap: [100], Reliable: [130] }, awardedTo: "Reliable", decision: "differs_from_cheapest" });
    expect(computeRfqSavings(r)).toMatchObject({ savings: -30, savingsPct: -30 / 100 });
  });

  it("has no baseline when the awarded quote was the only complete one", () => {
    const r = rfq({ quotes: { Only: [90], Partial: [null] }, awardedTo: "Only" });
    expect(computeRfqSavings(r)).toMatchObject({ basis: "no_baseline", savings: 0, savingsPct: null, baseline: null, awardedTotal: 90 });
  });

  it("can't measure an award whose quote is incomplete", () => {
    const r = rfq({ quotes: { A: [50, null], B: [60, 60] }, awardedTo: "A" });
    expect(computeRfqSavings(r)).toMatchObject({ basis: "unmeasurable", savings: 0, awardedTotal: null });
  });

  it("returns null until a PO has actually been sent", () => {
    expect(computeRfqSavings(rfq({ quotes: { A: [1], B: [2] } }))).toBeNull();
    expect(computeRfqSavings(rfq({ quotes: { A: [1], B: [2] }, awardedTo: "A", decision: "review_needed", poSentAt: null }))).toBeNull();
  });

  it("coerces Postgres numeric strings and rounds to cents", () => {
    const r = rfq({ quotes: { A: [10.005], B: [20.1] }, awardedTo: "A" });
    r.quotes[0].lines[0].total = "10.005" as unknown as number;
    expect(computeRfqSavings(r)).toMatchObject({ awardedTotal: 10.01, baseline: 20.1, savings: 10.09 });
  });
});

describe("itemSavings", () => {
  it("applies the same formula per line item, over the quotes that priced that item", () => {
    const r = rfq({ quotes: { A: [10, 20], B: [14, null], C: [16, 30] }, awardedTo: "A" });
    // A is incomplete? no: A prices both. B is incomplete overall but still priced item 0.
    expect(itemSavings(r)).toEqual([
      { itemId: r.items[0].id, name: "Item 0", awarded: 10, baseline: 15, savings: 5 },
      { itemId: r.items[1].id, name: "Item 1", awarded: 20, baseline: 30, savings: 10 },
    ]);
  });
});

describe("monthKey", () => {
  it("uses Saudi time (UTC+3) for month boundaries", () => {
    expect(monthKey("2026-09-30T20:59:00Z")).toBe("2026-09");
    expect(monthKey("2026-09-30T21:00:00Z")).toBe("2026-10");
  });
});

describe("primaryCurrency", () => {
  it("is the currency of most awarded RFQs, defaulting to SAR", () => {
    expect(primaryCurrency([])).toBe("SAR");
    const usd = [1, 2, 3].map(() => rfq({ quotes: { A: [1], B: [2] }, awardedTo: "A", currency: "USD" }));
    expect(primaryCurrency([...usd, rfq({ quotes: { A: [1] }, awardedTo: "A" })])).toBe("USD");
  });
});

describe("computeKpis", () => {
  const thisMonth = rfq({ quotes: { A: [100], B: [140], C: [160] }, awardedTo: "A", poSentAt: "2026-10-05T10:00:00Z", createdAt: "2026-10-02T10:00:00Z" });
  const lastMonth = rfq({ quotes: { A: [100], B: [120] }, awardedTo: "A", poSentAt: "2026-09-12T10:00:00Z", createdAt: "2026-09-10T10:00:00Z" });
  const review = rfq({
    quotes: { A: [100], B: [90] },
    awardedTo: "A",
    decision: "differs_from_cheapest",
    poSentAt: null,
    createdAt: "2026-10-06T10:00:00Z",
  });
  const usd = rfq({ quotes: { A: [100], B: [500] }, awardedTo: "A", currency: "USD", poSentAt: "2026-10-07T10:00:00Z" });

  it("compares this month's savings with last month's", () => {
    const k = computeKpis([thisMonth, lastMonth, review, usd], NOW);
    expect(k.currency).toBe("SAR");
    expect(k.savingsThisMonth).toBe(50); // avg(140,160)=150 − 100
    expect(k.savingsLastMonth).toBe(20);
    expect(k.savingsChange).toBeCloseTo(1.5);
    expect(k.excludedOtherCurrency).toBe(1);
  });

  it("counts RFQs created this month vs last month", () => {
    const k = computeKpis([thisMonth, lastMonth, review], NOW);
    expect(k.rfqsCreatedThisMonth).toBe(2);
    expect(k.rfqsCreatedLastMonth).toBe(1);
  });

  it("computes the auto-approval rate over decided RFQs", () => {
    const k = computeKpis([thisMonth, lastMonth, review], NOW);
    expect(k.autoApprovalRate).toBeCloseTo(2 / 3);
    expect(computeKpis([], NOW).autoApprovalRate).toBeNull();
  });

  it("measures sent → all replied only for fully resolved RFQs", () => {
    const resolved = rfq({
      quotes: { A: [1], B: [2] },
      declined: ["C"],
      invitedAt: "2026-10-01T00:00:00Z",
      submittedAt: { A: "2026-10-01T06:00:00Z", B: "2026-10-02T00:00:00Z" },
    });
    const stillWaiting = rfq({ quotes: { A: [1] }, pending: ["B"], invitedAt: "2026-10-01T00:00:00Z" });
    const k = computeKpis([resolved, stillWaiting], NOW);
    expect(k.avgSentToAllRepliedHours).toBe(24);
    expect(k.avgSupplierResponseHours).toBeCloseTo((6 + 24 + 32) / 3);
  });

  it("returns 'no change' instead of dividing by zero", () => {
    const k = computeKpis([thisMonth], NOW);
    expect(k.savingsLastMonth).toBe(0);
    expect(k.savingsChange).toBeNull();
  });
});

describe("savingsSeries", () => {
  it("returns one point per month, oldest first, including empty months", () => {
    const a = rfq({ quotes: { A: [100], B: [200] }, awardedTo: "A", poSentAt: "2026-10-05T10:00:00Z" });
    const b = rfq({ quotes: { A: [100], B: [150] }, awardedTo: "A", poSentAt: "2026-08-05T10:00:00Z" });
    const series = savingsSeries([a, b], NOW, 3);
    expect(series).toEqual([
      { month: "2026-08", savings: 50, spend: 100, awarded: 1 },
      { month: "2026-09", savings: 0, spend: 0, awarded: 0 },
      { month: "2026-10", savings: 100, spend: 100, awarded: 1 },
    ]);
  });
});

describe("spendBySupplier / topSavings / reviewQueue", () => {
  const r1 = rfq({ quotes: { Alpha: [100], Beta: [300] }, awardedTo: "Alpha" });
  const r2 = rfq({ quotes: { Alpha: [50], Beta: [60] }, awardedTo: "Beta" });
  const r3 = rfq({ quotes: { Alpha: [10], Beta: [9] }, awardedTo: "Alpha", decision: "differs_from_cheapest", poSentAt: null });

  it("sums awarded spend per supplier, largest first", () => {
    expect(spendBySupplier([r1, r2, r3])).toEqual([
      { supplierKey: "sup-Alpha", label: "Alpha", spend: 100, awards: 1 },
      { supplierKey: "sup-Beta", label: "Beta", spend: 60, awards: 1 },
    ]);
  });

  it("ranks the RFQs that saved the most", () => {
    const top = topSavings([r1, r2, r3], 5);
    expect(top.map((t) => [t.title, t.savings])).toEqual([[r1.title, 200]]);
  });

  it("never lists a premium paid under biggest savings", () => {
    expect(topSavings([r1, r2, r3], 5).every((t) => t.savings > 0)).toBe(true);
  });

  it("lists awards waiting on a human, oldest first", () => {
    expect(reviewQueue([r1, r2, r3]).map((q) => q.rfqId)).toEqual([r3.id]);
  });
});

describe("pendingExtractions", () => {
  it("lists PDF/email quotes still waiting for the buyer to confirm them, oldest first", () => {
    const r = rfq({
      quotes: { A: [10], B: [12] },
      statuses: { B: "needs_review" },
      submittedAt: { B: "2026-10-03T08:00:00Z" },
    });
    expect(pendingExtractions([r])).toEqual([
      { rfqId: r.id, title: r.title, quoteId: `${r.id}-q-B`, supplierLabel: "B", submittedAt: "2026-10-03T08:00:00Z" },
    ]);
  });
});

describe("computeKpis edge cases", () => {
  it("ignores negative sent → replied durations caused by clock skew", () => {
    const skewed = rfq({ quotes: { A: [1] }, invitedAt: "2026-10-02T00:00:00Z", submittedAt: { A: "2026-10-01T00:00:00Z" } });
    expect(computeKpis([skewed], NOW).avgSentToAllRepliedHours).toBeNull();
  });
});
