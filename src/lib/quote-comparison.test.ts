import { describe, expect, it } from "vitest";
import { computeQuoteTotal, findCheapestQuote } from "@/lib/quote-comparison";
import { quote, rfqItem } from "@/test/fixtures";

const items = [rfqItem("a"), rfqItem("b")];

describe("computeQuoteTotal", () => {
  it("sums priced lines and rounds to cents", () => {
    const r = computeQuoteTotal(items, quote("q", "s", { a: 10.005, b: 20.1 }));
    expect(r.total).toBe(30.11);
    expect(r.missingCount).toBe(0);
  });

  it("counts unpriced lines as missing and ignores lines for unknown items", () => {
    const r = computeQuoteTotal(items, quote("q", "s", { a: 10, zzz: 999 }));
    expect(r.total).toBe(10);
    expect(r.missingCount).toBe(1);
  });

  it("returns a null total when nothing is priced", () => {
    expect(computeQuoteTotal(items, quote("q", "s", { a: null })).total).toBeNull();
  });

  it("coerces numeric strings from Postgres numeric columns", () => {
    const q = quote("q", "s", {});
    q.quote_items = [
      { id: "1", quote_id: "q", rfq_item_id: "a", unit_price: null, total_price: "12.50" as unknown as number, notes: null },
      { id: "2", quote_id: "q", rfq_item_id: "b", unit_price: null, total_price: "7.5" as unknown as number, notes: null },
    ];
    expect(computeQuoteTotal(items, q).total).toBe(20);
  });
});

describe("findCheapestQuote", () => {
  it("picks the lowest complete quote", () => {
    const cheap = quote("cheap", "s1", { a: 5, b: 5 });
    const pricey = quote("pricey", "s2", { a: 10, b: 10 });
    expect(findCheapestQuote(items, [pricey, cheap])?.id).toBe("cheap");
  });

  it("ignores incomplete quotes even when cheaper", () => {
    const partial = quote("partial", "s1", { a: 1 });
    const full = quote("full", "s2", { a: 10, b: 10 });
    expect(findCheapestQuote(items, [partial, full])?.id).toBe("full");
  });

  it("ignores quotes that are not submitted/confirmed", () => {
    const review = quote("review", "s1", { a: 1, b: 1 }, { status: "needs_review" });
    const rejected = quote("rejected", "s2", { a: 1, b: 1 }, { status: "rejected" });
    const confirmed = quote("confirmed", "s3", { a: 9, b: 9 }, { status: "confirmed" });
    expect(findCheapestQuote(items, [review, rejected, confirmed])?.id).toBe("confirmed");
  });

  it("returns null when nothing is comparable", () => {
    expect(findCheapestQuote(items, [])).toBeNull();
  });
});
