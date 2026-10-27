import { describe, expect, it } from "vitest";
import { buildRecommendationInput } from "@/lib/recommendation-input";
import { DEFAULT_RECOMMENDATION_WEIGHTS } from "@/lib/gemini";
import { quote, rfqItem, supplier } from "@/test/fixtures";
import type { RfqWithComparisonData } from "@/lib/recommendation-input";

function rfq(quotes: RfqWithComparisonData["quotes"]): RfqWithComparisonData {
  return {
    id: "rfq-1",
    buyer_id: "buyer",
    title: "Cement",
    project: null,
    description: null,
    currency: "SAR",
    deadline: null,
    status: "sent",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    rfq_items: [rfqItem("b", { position: 1, name: "Rebar" }), rfqItem("a", { position: 0, name: "Cement" })],
    rfq_suppliers: [supplier("s1", { company_name: "Al Noor" }), supplier("s2", { company_name: null })],
    quotes,
  };
}

describe("buildRecommendationInput", () => {
  it("returns null when there are no comparable quotes", () => {
    const r = rfq([quote("q", "s1", { a: 1 }, { status: "needs_review" })]);
    expect(buildRecommendationInput(r, DEFAULT_RECOMMENDATION_WEIGHTS)).toBeNull();
  });

  it("orders items by position and labels suppliers by company, falling back to email", () => {
    const r = rfq([quote("q1", "s1", { a: 10, b: 5 }), quote("q2", "s2", { a: 12 })]);
    const input = buildRecommendationInput(r, DEFAULT_RECOMMENDATION_WEIGHTS)!;
    expect(input.items.map((i) => i.name)).toEqual(["Cement", "Rebar"]);
    expect(input.quotes.map((q) => q.supplier)).toEqual(["Al Noor", "s2@supplier.test"]);
    expect(input.quotes[0].total).toBe(15);
    expect(input.quotes[1].total).toBe(12);
  });
});
