import { describe, expect, it } from "vitest";
import type { MetricsRfq } from "@/lib/metrics";
import {
  MIN_QUOTES_FOR_SCORE,
  SCORE_WEIGHTS,
  describeSupplier,
  scoreSupplier,
  scoreTrend,
  supplierMetrics,
  type SupplierMetrics,
} from "@/lib/scorecard";

let seq = 0;
interface QuoteSpec {
  total: number | null;
  days?: number | null;
  warranty?: string | null;
  submittedHoursAfterInvite?: number;
}
/** One-item RFQ; quotes keyed by persistent supplier id. */
function rfq(opts: {
  quotes: Record<string, QuoteSpec>;
  declined?: string[];
  pending?: string[];
  awardedTo?: string;
  poSent?: boolean;
  invitedAt?: string;
}): MetricsRfq {
  const id = `r${++seq}`;
  const invitedAt = opts.invitedAt ?? "2026-09-01T00:00:00Z";
  const itemId = `${id}-i`;
  const inv = (sup: string, status: MetricsRfq["invites"][number]["status"]) => ({
    id: `${id}-${sup}`,
    label: `Label ${sup}`,
    supplier_id: sup,
    status,
    invited_at: status === "pending" ? null : invitedAt,
  });
  return {
    id,
    title: `RFQ ${id}`,
    currency: "SAR",
    created_at: invitedAt,
    items: [{ id: itemId, name: "Thing", quantity: 1 }],
    invites: [
      ...Object.keys(opts.quotes).map((s) => inv(s, "submitted")),
      ...(opts.declined ?? []).map((s) => inv(s, "declined")),
      ...(opts.pending ?? []).map((s) => inv(s, "sent")),
    ],
    quotes: Object.entries(opts.quotes).map(([s, q]) => ({
      id: `${id}-q-${s}`,
      invite_id: `${id}-${s}`,
      status: "submitted" as const,
      submitted_at: new Date(new Date(invitedAt).getTime() + (q.submittedHoursAfterInvite ?? 24) * 3_600_000).toISOString(),
      delivery_days: q.days === undefined ? 7 : q.days,
      warranty: q.warranty === undefined ? "12 months" : q.warranty,
      lines: [{ item_id: itemId, total: q.total }],
    })),
    award: opts.awardedTo
      ? {
          decision: "auto_approved" as const,
          quote_id: `${id}-q-${opts.awardedTo}`,
          // PO goes out two days after the invitation, on each RFQ's own timeline.
          po_sent_at: opts.poSent === false ? null : new Date(new Date(invitedAt).getTime() + 48 * 3_600_000).toISOString(),
          created_at: new Date(new Date(invitedAt).getTime() + 48 * 3_600_000).toISOString(),
          reason: null,
        }
      : null,
  };
}

describe("supplierMetrics", () => {
  const history = [
    rfq({ quotes: { A: { total: 100, days: 5, submittedHoursAfterInvite: 4 }, B: { total: 120, days: 10 } }, awardedTo: "A" }),
    rfq({ quotes: { A: { total: 110, days: 9, warranty: null, submittedHoursAfterInvite: 10 }, B: { total: 100, days: 9 }, C: { total: 105, days: 20 } }, awardedTo: "B" }),
    rfq({ quotes: { B: { total: 50 } }, declined: ["A"] }),
    rfq({ quotes: { B: { total: 50 } }, pending: ["A"] }),
  ];

  it("counts invitations, quotes and declines", () => {
    const m = supplierMetrics(history, "A");
    expect(m).toMatchObject({ invited: 4, quoted: 2, declined: 1, responseRate: 0.5 });
  });

  it("takes the median response time in hours", () => {
    expect(supplierMetrics(history, "A").medianResponseHours).toBe(7);
  });

  it("counts wins from purchase orders actually sent (manual approvals included)", () => {
    const m = supplierMetrics(history, "A");
    expect(m).toMatchObject({ awarded: 1, winRate: 0.5 });
    const unsent = [rfq({ quotes: { A: { total: 1 }, B: { total: 2 } }, awardedTo: "A", poSent: false })];
    expect(supplierMetrics(unsent, "A")).toMatchObject({ awarded: 0, winRate: 0 });
  });

  it("measures price vs the lowest complete quote, only where there was competition", () => {
    // RFQ1: A is lowest → 0; RFQ2: A 110 vs lowest 100 → +10%
    expect(supplierMetrics(history, "A").avgPriceVsLowest).toBeCloseTo(0.05);
    expect(supplierMetrics(history, "A").priceSamples).toBe(2);
  });

  it("compares promised delivery with the RFQ's typical (median) delivery", () => {
    // RFQ1: days 5 vs median(5,10)=7.5 → faster; RFQ2: 9 vs median(9,9,20)=9 → at typical
    const m = supplierMetrics(history, "A");
    expect(m.fasterThanTypicalRate).toBe(1);
    expect(m.deliveryVsTypicalDays).toBeCloseTo((-2.5 + 0) / 2);
  });

  it("tracks how often a warranty is offered", () => {
    expect(supplierMetrics(history, "A").warrantyRate).toBe(0.5);
  });

  it("returns nulls rather than zeros when there is no evidence", () => {
    const m = supplierMetrics([], "ghost");
    expect(m).toMatchObject({ invited: 0, quoted: 0, responseRate: null, medianResponseHours: null, winRate: null, avgPriceVsLowest: null, warrantyRate: null });
  });
});

describe("scoreSupplier", () => {
  const base: SupplierMetrics = {
    invited: 10, quoted: 10, declined: 0, responseRate: 1, medianResponseHours: 0,
    awarded: 5, winRate: 0.5, avgPriceVsLowest: 0, priceSamples: 10,
    deliveryVsTypicalDays: -1, fasterThanTypicalRate: 1, warrantyRate: 1, lastActive: null,
  };

  it("weights sum to 100", () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("gives a perfect supplier 100 with a visible breakdown", () => {
    const card = scoreSupplier(base)!;
    expect(card.score).toBe(100);
    expect(card.components.map((c) => c.key)).toEqual(["price", "responsiveness", "delivery", "warranty", "winRate"]);
    expect(card.components.reduce((s, c) => s + c.points, 0)).toBeCloseTo(100);
  });

  it("scores each component on a documented scale", () => {
    const card = scoreSupplier({ ...base, avgPriceVsLowest: 0.125, medianResponseHours: 60, responseRate: 0.5, warrantyRate: 0.4, winRate: 0.25, fasterThanTypicalRate: 0.5 })!;
    const byKey = Object.fromEntries(card.components.map((c) => [c.key, c.score]));
    expect(byKey.price).toBeCloseTo(0.5); // 12.5% above lowest of a 25% range
    expect(byKey.responsiveness).toBeCloseTo(0.5 * 0.6 + 0.5 * 0.4);
    expect(byKey.delivery).toBeCloseTo(0.5);
    expect(byKey.warranty).toBeCloseTo(0.4);
    expect(byKey.winRate).toBeCloseTo(0.5);
    expect(card.score).toBe(Math.round(30 * 0.5 + 20 * 0.5 + 20 * 0.5 + 15 * 0.4 + 15 * 0.5));
  });

  it("clamps out-of-range inputs", () => {
    const card = scoreSupplier({ ...base, avgPriceVsLowest: 0.9, medianResponseHours: 500 })!;
    const byKey = Object.fromEntries(card.components.map((c) => [c.key, c.score]));
    expect(byKey.price).toBe(0);
    expect(byKey.responsiveness).toBeCloseTo(0.6);
  });

  it("renormalizes over the components that have data", () => {
    const card = scoreSupplier({ ...base, avgPriceVsLowest: null, priceSamples: 0 })!;
    expect(card.components.find((c) => c.key === "price")?.available).toBe(false);
    expect(card.score).toBe(100);
  });

  it(`withholds a score below ${MIN_QUOTES_FOR_SCORE} quotes`, () => {
    expect(scoreSupplier({ ...base, quoted: 1 })).toBeNull();
  });
});

describe("describeSupplier", () => {
  it("turns strong and weak components into plain language", () => {
    const m: SupplierMetrics = {
      invited: 6, quoted: 5, declined: 1, responseRate: 5 / 6, medianResponseHours: 80,
      awarded: 2, winRate: 0.4, avgPriceVsLowest: 0.02, priceSamples: 5,
      deliveryVsTypicalDays: 4, fasterThanTypicalRate: 0.2, warrantyRate: 0.2, lastActive: null,
    };
    const { strengths, weaknesses } = describeSupplier(m, scoreSupplier(m)!);
    expect(strengths.join(" ")).toMatch(/2% above the lowest/);
    expect(weaknesses.join(" ")).toMatch(/warranty on 20%/i);
    expect(weaknesses.join(" ")).toMatch(/3\.3 days/);
    expect(weaknesses.join(" ")).toMatch(/slower than typical/i);
  });
});

describe("scoreTrend", () => {
  it("scores the supplier's history as it stood at the end of each month", () => {
    const old = rfq({ quotes: { A: { total: 100 }, B: { total: 120 } }, awardedTo: "A", invitedAt: "2026-06-05T00:00:00Z" });
    const later = rfq({ quotes: { A: { total: 150 }, B: { total: 100 } }, awardedTo: "B", invitedAt: "2026-08-05T00:00:00Z" });
    const trend = scoreTrend([old, later], "A", new Date("2026-09-15T00:00:00Z"), 4);
    expect(trend.map((p) => p.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(trend[0].score).toBeNull(); // one quote — not enough evidence yet
    expect(trend[2].score).not.toBeNull();
    expect(trend[3].score).toBe(trend[2].score);
  });
});
