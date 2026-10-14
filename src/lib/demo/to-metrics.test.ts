import { describe, expect, it } from "vitest";
import { DEMO_SEED, generateDemoDataset } from "@/lib/demo/dataset";
import { demoToMetricsRfqs } from "@/lib/demo/to-metrics";
import { computeKpis, reviewQueue, savingsSeries, spendBySupplier, topSavings } from "@/lib/metrics";

const NOW = new Date("2026-10-14T09:00:00Z");
const rfqs = demoToMetricsRfqs(generateDemoDataset({ seed: DEMO_SEED, now: NOW, buyerId: "b" }));

describe("demo dataset through the metrics module", () => {
  it("tells a coherent savings story", () => {
    const k = computeKpis(rfqs, NOW);
    expect(k.currency).toBe("SAR");
    expect(k.autoApprovalRate).toBeGreaterThan(0.3);
    expect(k.autoApprovalRate).toBeLessThan(0.95);
    expect(k.avgSupplierResponseHours).toBeGreaterThan(1);
    const series = savingsSeries(rfqs, NOW, 6);
    expect(series.filter((p) => p.savings > 0).length).toBeGreaterThanOrEqual(3);
    expect(series.reduce((s, p) => s + p.savings, 0)).toBeGreaterThan(0);
  });

  it("fills the review queue, supplier spend and top savings", () => {
    expect(reviewQueue(rfqs)).toHaveLength(4);
    expect(spendBySupplier(rfqs).length).toBeGreaterThanOrEqual(3);
    expect(topSavings(rfqs, 5)).toHaveLength(5);
    expect(topSavings(rfqs, 5)[0].savings).toBeGreaterThan(0);
  });
});
