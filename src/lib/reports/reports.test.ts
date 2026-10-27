import { describe, expect, it } from "vitest";
import { buildReport, defaultFilters, parseReportFilters } from "@/lib/reports";
import { measuredSavings, spendBySupplier, type MetricsRfq } from "@/lib/metrics";
import { DEMO_SEED, generateDemoDataset } from "@/lib/demo/dataset";
import { demoToMetricsRfqs } from "@/lib/demo/to-metrics";

const NOW = new Date("2026-10-20T09:00:00Z");

function rfq(
  id: string,
  opts: {
    created: string;
    poSent?: string | null;
    decision?: "auto_approved" | "review_needed" | "differs_from_cheapest";
    winner?: "a" | "b";
    totals?: { a: number | null; b: number | null };
    currency?: string;
    itemName?: string;
  }
): MetricsRfq {
  const totals = opts.totals ?? { a: 100, b: 150 };
  const winner = opts.winner ?? "a";
  return {
    id,
    title: `RFQ ${id}`,
    currency: opts.currency ?? "SAR",
    created_at: opts.created,
    status: opts.poSent ? "awarded" : "sent",
    items: [{ id: `${id}-i1`, name: opts.itemName ?? "Portland cement", quantity: 10 }],
    invites: [
      { id: `${id}-a`, label: "Al Rashid", supplier_id: "sup-a", email: "a@x.sa", status: "submitted", invited_at: opts.created },
      { id: `${id}-b`, label: "Gulf Office", supplier_id: "sup-b", email: "b@x.sa", status: "submitted", invited_at: opts.created },
    ],
    quotes: (["a", "b"] as const).map((k) => ({
      id: `${id}-q${k}`,
      invite_id: `${id}-${k}`,
      status: "submitted" as const,
      submitted_at: opts.created,
      lines: [{ item_id: `${id}-i1`, total: totals[k] }],
      delivery_days: 7,
      warranty: "12 months",
    })),
    award:
      opts.decision || opts.poSent
        ? {
            decision: opts.decision ?? "auto_approved",
            quote_id: `${id}-q${winner}`,
            po_sent_at: opts.poSent ?? null,
            created_at: opts.poSent ?? opts.created,
            reason: null,
          }
        : null,
  };
}

const data = [
  rfq("r1", { created: "2026-08-02T08:00:00Z", poSent: "2026-08-05T08:00:00Z", decision: "auto_approved" }),
  rfq("r2", { created: "2026-09-10T08:00:00Z", poSent: "2026-09-12T08:00:00Z", decision: "differs_from_cheapest", winner: "b", itemName: "Packing tape 48mm" }),
  rfq("r3", { created: "2026-10-01T08:00:00Z", decision: "review_needed" }),
  rfq("r4", { created: "2026-03-01T08:00:00Z", poSent: "2026-03-03T08:00:00Z" }), // outside the default range
  rfq("r5", { created: "2026-10-03T08:00:00Z", poSent: "2026-10-04T08:00:00Z", currency: "USD" }),
];

describe("parseReportFilters", () => {
  it("defaults to the last six months, through today (Saudi time)", () => {
    expect(defaultFilters(NOW)).toEqual({ from: "2026-05-01", to: "2026-10-20", supplier: null });
    expect(parseReportFilters({}, NOW)).toEqual(defaultFilters(NOW));
  });

  it("accepts real dates, swaps a reversed range, and ignores nonsense", () => {
    expect(parseReportFilters({ from: "2026-09-01", to: "2026-08-01", supplier: "sup-a" }, NOW)).toEqual({
      from: "2026-08-01",
      to: "2026-09-01",
      supplier: "sup-a",
    });
    expect(parseReportFilters({ from: "2026-02-30", to: "yesterday" }, NOW)).toEqual(defaultFilters(NOW));
  });

  it("caps the range at 36 months", () => {
    expect(parseReportFilters({ from: "2010-01-01", to: "2026-10-20" }, NOW).from).toBe("2023-10-20");
  });
});

describe("buildReport", () => {
  const report = buildReport(data, defaultFilters(NOW), NOW);

  it("sums spend and savings for awards in range, in the primary currency only", () => {
    // r1: won by a at 100 vs other 150 → saves 50. r2: won by b at 150 vs other 100 → "saves" -50.
    expect(report.currency).toBe("SAR");
    expect(report.totals).toMatchObject({ spend: 250, savings: 0, measuredBaseline: 250, awards: 2 });
    expect(report.excludedOtherCurrency).toBe(1);
  });

  it("has a point for every month in range, including empty ones", () => {
    expect(report.months.map((m) => m.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(report.months.find((m) => m.month === "2026-08")).toMatchObject({ spend: 100, savings: 50, awarded: 1 });
  });

  it("measures the auto-approval rate over decisions made in range", () => {
    // r1 auto, r2 differs, r3 review, r5 auto (other currency, still a decision) → 2 of 4.
    expect(report.autoApproval).toEqual({ decided: 4, automatic: 2, rate: 0.5 });
  });

  it("groups awarded spend by derived category", () => {
    expect(report.categories).toEqual([
      expect.objectContaining({ category: "packaging", spend: 150, lines: 1 }),
      expect.objectContaining({ category: "construction", spend: 100, lines: 1 }),
    ]);
    expect(report.categories.reduce((a, c) => a + c.share, 0)).toBeCloseTo(1);
  });

  it("compares suppliers: quotes, wins, spend, savings delivered", () => {
    expect(report.suppliers).toEqual([
      expect.objectContaining({ key: "sup-b", label: "Gulf Office", wins: 1, spend: 150, savings: -50 }),
      expect.objectContaining({ key: "sup-a", label: "Al Rashid", wins: 1, spend: 100, savings: 50 }),
    ]);
    expect(report.suppliers[0].quoted).toBeGreaterThan(0);
  });

  it("lists each award, newest first, with its categories", () => {
    expect(report.awards.map((a) => a.rfqId)).toEqual(["r2", "r1"]);
    expect(report.awards[1]).toMatchObject({ supplier: "Al Rashid", total: 100, baseline: 150, savings: 50, automatic: true, categories: ["Construction materials"] });
  });

  it("filters everything to one supplier", () => {
    const one = buildReport(data, { ...defaultFilters(NOW), supplier: "sup-a" }, NOW);
    expect(one.totals).toMatchObject({ spend: 100, savings: 50, awards: 1 });
    expect(one.suppliers.map((s) => s.key)).toEqual(["sup-a"]);
    expect(one.categories.map((c) => c.category)).toEqual(["construction"]);
    // Still offers every supplier in range to switch to.
    expect(one.supplierOptions.map((o) => o.key).sort()).toEqual(["sup-a", "sup-b"]);
  });

  it("respects a narrow date range", () => {
    const sept = buildReport(data, { from: "2026-09-01", to: "2026-09-30", supplier: null }, NOW);
    expect(sept.awards.map((a) => a.rfqId)).toEqual(["r2"]);
    expect(sept.months.map((m) => m.month)).toEqual(["2026-09"]);
  });
});

describe("buildReport on the demo dataset", () => {
  it("agrees with the dashboard's own metrics (no second set of numbers)", () => {
    const now = new Date("2026-10-14T09:00:00Z");
    const rfqs = demoToMetricsRfqs(generateDemoDataset({ seed: DEMO_SEED, now, buyerId: "demo" }));
    const wide = buildReport(rfqs, { from: "2020-01-01", to: "2026-12-31", supplier: null }, now);
    const currency = wide.currency;
    const all = measuredSavings(rfqs, currency);
    expect(wide.totals.spend).toBeCloseTo(all.reduce((a, s) => a + (s.awardedTotal ?? 0), 0), 2);
    const bySupplier = spendBySupplier(rfqs, currency);
    for (const s of bySupplier) {
      const row = wide.suppliers.find((r) => r.key === s.supplierKey);
      if (row) expect(row.spend).toBeCloseTo(s.spend, 2);
    }
    expect(wide.categories.reduce((a, c) => a + c.spend, 0)).toBeCloseTo(wide.totals.spend, 2);
    expect(wide.categories.find((c) => c.category === "other")).toBeUndefined();
  });
});
