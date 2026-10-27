import { describe, expect, it } from "vitest";
import { DEMO_SEED, generateDemoDataset } from "@/lib/demo/dataset";
import { demoToMetricsRfqs } from "@/lib/demo/to-metrics";
import { describeSupplier, scoreSuppliers } from "@/lib/scorecard";

const NOW = new Date("2026-10-14T09:00:00Z");
const data = generateDemoDataset({ seed: DEMO_SEED, now: NOW, buyerId: "b" });
const rfqs = demoToMetricsRfqs(data);
const scores = scoreSuppliers(rfqs, data.suppliers.map((s) => s.id));
const byName = (name: string) => scores.get(data.suppliers.find((s) => s.company_name === name)!.id)!;

describe("demo supplier personas through the scorecard", () => {
  it("scores every supplier with enough history", () => {
    expect([...scores.values()].filter((s) => s.card !== null).length).toBeGreaterThanOrEqual(5);
  });

  it("calls out the warranty-shy packaging supplier", () => {
    const red = byName("Red Sea Packaging Co.");
    expect(describeSupplier(red.metrics, red.card).weaknesses.join(" ")).toMatch(/warranty/i);
  });

  it("calls out the slow spare-parts supplier", () => {
    const najd = byName("مؤسسة نجد لقطع الغيار");
    const text = describeSupplier(najd.metrics, najd.card).weaknesses.join(" ");
    expect(text).toMatch(/slow|slower/i);
  });

  it("ranks the fast, cheap supplier first", () => {
    const ranked = [...scores.entries()]
      .filter(([, s]) => s.card)
      .sort((a, b) => b[1].card!.score - a[1].card!.score);
    expect(data.suppliers.find((s) => s.id === ranked[0][0])!.company_name).toBe("Al Rashid Building Materials");
  });
});
