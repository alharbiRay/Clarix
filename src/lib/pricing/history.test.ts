import { describe, expect, it } from "vitest";
import type { MetricsRfq } from "@/lib/metrics";
import { buildPriceHistory, itemHistory, lineInsight } from "@/lib/pricing/history";

let seq = 0;
function rfq(opts: {
  at: string;
  item?: string;
  unit?: string;
  quantity?: number;
  currency?: string;
  quotes: Record<string, { unit: number | null; status?: "submitted" | "confirmed" | "needs_review" }>;
}): MetricsRfq {
  const id = `r${++seq}`;
  const itemId = `${id}-i`;
  return {
    id,
    title: `RFQ ${id}`,
    currency: opts.currency ?? "SAR",
    created_at: opts.at,
    items: [{ id: itemId, name: opts.item ?? "Portland cement 50kg", quantity: opts.quantity ?? 10, unit: opts.unit ?? "bags" }],
    invites: Object.keys(opts.quotes).map((s) => ({ id: `${id}-${s}`, label: `Supplier ${s}`, supplier_id: s, status: "submitted" as const, invited_at: opts.at })),
    quotes: Object.entries(opts.quotes).map(([s, q]) => ({
      id: `${id}-q-${s}`,
      invite_id: `${id}-${s}`,
      status: q.status ?? ("submitted" as const),
      submitted_at: opts.at,
      lines: [{ item_id: itemId, total: q.unit === null ? null : q.unit * (opts.quantity ?? 10), unit: q.unit }],
    })),
    award: null,
  };
}

const jan = rfq({ at: "2026-01-10T00:00:00Z", quotes: { A: { unit: 17 }, B: { unit: 19 } } });
const mar = rfq({ at: "2026-03-10T00:00:00Z", item: "أسمنت بورتلاندي 50 كجم", unit: "كيس", quotes: { A: { unit: 18 }, C: { unit: 20 } } });
const pending = rfq({ at: "2026-03-20T00:00:00Z", quotes: { D: { unit: 1, status: "needs_review" } } });
const usd = rfq({ at: "2026-03-01T00:00:00Z", currency: "USD", quotes: { A: { unit: 5 } } });
const tons = rfq({ at: "2026-03-05T00:00:00Z", unit: "tons", quotes: { A: { unit: 900 } } });
const history = buildPriceHistory([jan, mar, pending, usd, tons]);

describe("buildPriceHistory", () => {
  it("records a unit price per comparable quote line, keyed by the normalized item", () => {
    const cement = history.filter((p) => p.currency === "SAR" && p.unit === "bag");
    expect(cement.map((p) => [p.supplierKey, p.unitPrice])).toEqual([
      ["A", 17],
      ["B", 19],
      ["A", 18],
      ["C", 20],
    ]);
    expect(new Set(cement.map((p) => p.key)).size).toBe(1); // Arabic and English names match
  });

  it("skips unreviewed extractions and unpriced lines", () => {
    expect(history.some((p) => p.supplierKey === "D")).toBe(false);
  });

  it("derives the unit price from the line total when no unit price was stored", () => {
    const r = rfq({ at: "2026-04-01T00:00:00Z", quantity: 4, quotes: { A: { unit: 25 } } });
    r.quotes[0].lines[0].unit = null;
    expect(buildPriceHistory([r])[0].unitPrice).toBe(25);
  });
});

describe("lineInsight", () => {
  const key = history.find((p) => p.supplierKey === "A" && p.unit === "bag")!.key;
  const current = { key, unit: "bag", currency: "SAR", rfqId: "now", supplierKey: "A", at: "2026-04-01T00:00:00Z" };

  it("compares with this supplier's previous quote for the same item", () => {
    const insight = lineInsight(history, { ...current, unitPrice: 20.16 }, { threshold: 0.1 });
    expect(insight.vsSupplierLast?.previous.unitPrice).toBe(18);
    expect(insight.vsSupplierLast?.pct).toBeCloseTo(0.12);
  });

  it("compares with the market average over the trailing window, excluding this RFQ", () => {
    const insight = lineInsight(history, { ...current, unitPrice: 17.67 }, { threshold: 0.1 });
    // window 180 days back from Apr 1: all four SAR bag points → avg 18.5
    expect(insight.vsMarket?.average).toBeCloseTo(18.5);
    expect(insight.vsMarket?.samples).toBe(4);
    expect(insight.vsMarket?.pct).toBeCloseTo(-0.0449, 3);
  });

  it("raises an alert only when a change crosses the threshold", () => {
    expect(lineInsight(history, { ...current, unitPrice: 20.16 }, { threshold: 0.1 }).alert).toBe(true);
    expect(lineInsight(history, { ...current, unitPrice: 18.5 }, { threshold: 0.1 }).alert).toBe(false);
    expect(lineInsight(history, { ...current, unitPrice: 18.5 }, { threshold: 0.02 }).alert).toBe(true);
  });

  it("never compares across currencies or units", () => {
    const usdInsight = lineInsight(history, { ...current, currency: "USD", unitPrice: 50 }, { threshold: 0.1 });
    expect(usdInsight.vsMarket).toBeNull(); // only one USD point — not a market
    const tonInsight = lineInsight(history, { ...current, unit: "ton", unitPrice: 990 }, { threshold: 0.1 });
    expect(tonInsight.vsSupplierLast?.previous.unitPrice).toBe(900);
  });

  it("ignores points from the same RFQ and from the future", () => {
    const sameRfq = lineInsight(history, { ...current, rfqId: mar.id, unitPrice: 18, at: "2026-03-10T00:00:00Z" }, { threshold: 0.1 });
    expect(sameRfq.vsSupplierLast?.previous.rfqId).toBe(jan.id);
    const early = lineInsight(history, { ...current, at: "2026-01-01T00:00:00Z", unitPrice: 18 }, { threshold: 0.1 });
    expect(early.vsSupplierLast).toBeNull();
    expect(early.vsMarket).toBeNull();
  });
});

describe("itemHistory", () => {
  it("returns an item's points oldest first, for the trend chart", () => {
    const key = history.find((p) => p.unit === "bag")!.key;
    expect(itemHistory(history, key, "bag", "SAR").map((p) => p.unitPrice)).toEqual([17, 19, 18, 20]);
  });
});

describe("lineInsight — thresholds at the boundary", () => {
  it("alerts at exactly the threshold despite floating-point error", () => {
    const hist = buildPriceHistory([rfq({ at: "2026-01-01T00:00:00Z", quotes: { A: { unit: 0.5 } } })]);
    const key = hist[0].key;
    const insight = lineInsight(hist, { key, unit: "bag", currency: "SAR", rfqId: "x", supplierKey: "A", unitPrice: 0.45, at: "2026-02-01T00:00:00Z" }, { threshold: 0.1 });
    expect(insight.vsSupplierLast!.pct).toBeCloseTo(-0.1);
    expect(insight.supplierAlert).toBe(true);
    expect(insight.alert).toBe(true);
  });

  it("flags each comparison separately", () => {
    const key = history.find((p) => p.unit === "bag")!.key;
    const insight = lineInsight(history, { key, unit: "bag", currency: "SAR", rfqId: "now", supplierKey: "A", unitPrice: 20.16, at: "2026-04-01T00:00:00Z" }, { threshold: 0.1 });
    expect(insight.supplierAlert).toBe(true); // +12% vs their 18
    expect(insight.marketAlert).toBe(false); // +8.97% vs 18.5 rounds to 9% — under 10%
  });
});
