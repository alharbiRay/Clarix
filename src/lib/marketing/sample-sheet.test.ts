import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, SAMPLE_QUOTES, decide, rankQuotes } from "@/lib/marketing/sample-sheet";

const order = (p: Parameters<typeof rankQuotes>[1]) => rankQuotes(SAMPLE_QUOTES, p).map((q) => q.id);

describe("landing comparison sheet", () => {
  it("each priority puts a different supplier first", () => {
    expect(order("price")[0]).toBe("eastern");
    expect(order("balanced")[0]).toBe("rashid");
    expect(order("speed")[0]).toBe("najd");
  });

  it("opens on an auto-approval with a saving against the average of the other quotes", () => {
    const d = decide(rankQuotes(SAMPLE_QUOTES, "balanced"), DEFAULT_RULES);
    expect(d).toMatchObject({ status: "approved", quote: { id: "rashid" } });
    // average(46,900, 56,900) − 48,250
    expect(d.status === "approved" && d.saving).toBe(3650);
  });

  it("holds the pick with the first rule it fails", () => {
    expect(decide(rankQuotes(SAMPLE_QUOTES, "price"), DEFAULT_RULES)).toMatchObject({ status: "held", reason: "delivery" });
    expect(decide(rankQuotes(SAMPLE_QUOTES, "price"), { ...DEFAULT_RULES, maxDeliveryDays: 10 })).toMatchObject({
      status: "held",
      reason: "warranty",
    });
    expect(decide(rankQuotes(SAMPLE_QUOTES, "speed"), DEFAULT_RULES)).toMatchObject({ status: "held", reason: "spend" });
  });

  it("every rule can be relaxed into an approval", () => {
    const relaxed = { maxDeliveryDays: 10, requireWarranty: false, spendLimit: 60_000 };
    for (const p of ["price", "balanced", "speed"] as const) {
      expect(decide(rankQuotes(SAMPLE_QUOTES, p), relaxed).status).toBe("approved");
    }
  });
});
