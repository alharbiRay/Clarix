import { describe, expect, it } from "vitest";
import {
  buildNegotiationContext,
  buildNegotiationPrompt,
  detectLanguage,
  findPrivacyLeaks,
  sensitiveTermsFor,
  templateDraft,
  type ComparisonSnapshot,
} from "@/lib/negotiation";

const snapshot: ComparisonSnapshot = {
  rfqTitle: "Cement for Tower B",
  currency: "SAR",
  items: [
    { id: "i1", name: "Portland cement", quantity: 100, unit: "bags" },
    { id: "i2", name: "Rebar 12mm", quantity: 2, unit: "tons" },
  ],
  quotes: [
    {
      id: "q-target",
      inviteId: "s-target",
      status: "submitted",
      deliveryDays: 12,
      warranty: "6 months",
      lines: [
        { itemId: "i1", total: 2_600, unit: 26 },
        { itemId: "i2", total: 5_400, unit: 2_700 },
      ],
    },
    {
      id: "q-rival",
      inviteId: "s-rival",
      status: "confirmed",
      deliveryDays: 7,
      warranty: "12 months",
      lines: [
        { itemId: "i1", total: 2_350, unit: 23.5 },
        { itemId: "i2", total: 5_050, unit: 2_525 },
      ],
    },
    // Pending review: never counts as a competing offer.
    { id: "q-pending", inviteId: "s-pending", status: "needs_review", deliveryDays: 3, warranty: null, lines: [{ itemId: "i1", total: 10, unit: 0.1 }, { itemId: "i2", total: 10, unit: 5 }] },
  ],
  suppliers: [
    { id: "s-target", email: "sales@najd-build.sa", companyName: "Najd Building Supplies", contactName: "Fahad", preferredLanguage: null },
    { id: "s-rival", email: "info@alrashid.sa", companyName: "شركة الراشد للتجارة", contactName: "Omar Al Rashid", preferredLanguage: "ar" },
    { id: "s-pending", email: "x@gulf.sa", companyName: "Gulf Trading", contactName: null, preferredLanguage: null },
  ],
  buyer: { company: "Al Waha Contracting", name: "Sara" },
};

describe("detectLanguage", () => {
  it("reads Arabic script as Arabic, everything else as English", () => {
    expect(detectLanguage("شركة الراشد")).toBe("ar");
    expect(detectLanguage("Najd Building Supplies")).toBe("en");
    expect(detectLanguage(null)).toBe("en");
  });
});

describe("buildNegotiationContext", () => {
  it("summarises the supplier's position without competitor details", () => {
    const ctx = buildNegotiationContext(snapshot, "q-target", { language: "en", targetPercent: null });
    expect(ctx).toMatchObject({
      supplierName: "Najd Building Supplies",
      contactName: "Fahad",
      theirTotal: 8_000,
      lowerOfferExists: true,
      // (8000 - 7400) / 8000 = 7.5% → rounded down to a whole percent
      suggestedPercent: 7,
      fasterDeliveryElsewhere: true,
      language: "en",
    });
    expect(JSON.stringify(ctx)).not.toMatch(/Rashid|الراشد|7400|7,400|2350|5050|Gulf/);
  });

  it("knows when the supplier is already the lowest", () => {
    const ctx = buildNegotiationContext(snapshot, "q-rival", { language: "ar", targetPercent: null });
    expect(ctx).toMatchObject({ lowerOfferExists: false, suggestedPercent: null, fasterDeliveryElsewhere: false });
  });

  it("refuses quotes it can't negotiate", () => {
    expect(buildNegotiationContext(snapshot, "q-pending", { language: "en", targetPercent: null })).toEqual({
      error: "This quote is still pending review.",
    });
    expect(buildNegotiationContext(snapshot, "nope", { language: "en", targetPercent: null })).toEqual({ error: "Quote not found." });
  });

  it("validates the target percentage", () => {
    expect(buildNegotiationContext(snapshot, "q-target", { language: "en", targetPercent: 80 })).toEqual({
      error: "Target reduction must be a whole number from 1 to 50.",
    });
    expect(buildNegotiationContext(snapshot, "q-target", { language: "en", targetPercent: 5 })).toMatchObject({ targetPercent: 5 });
  });
});

describe("buildNegotiationPrompt", () => {
  const ctx = buildNegotiationContext(snapshot, "q-target", { language: "en", targetPercent: 5 });
  if ("error" in ctx) throw new Error("bad fixture");
  const prompt = buildNegotiationPrompt(ctx);

  it("states the privacy rule explicitly", () => {
    expect(prompt).toMatch(/never mention any other supplier/i);
    expect(prompt).toMatch(/never state.*(price|amount)/i);
    expect(prompt).toMatch(/a lower offer/i);
  });

  it("never contains a competitor's name or price — not even in passing", () => {
    for (const term of ["Rashid", "الراشد", "Gulf", "info@alrashid.sa", "7400", "7,400", "2350", "2,350", "5050", "23.5", "2525"]) {
      expect(prompt).not.toContain(term);
    }
  });

  it("includes what the supplier already knows and the buyer's target", () => {
    expect(prompt).toContain("Najd Building Supplies");
    expect(prompt).toContain("SAR 8,000.00");
    expect(prompt).toMatch(/about 5%/);
    expect(prompt).toMatch(/English/);
  });

  it("asks for Arabic when the language is Arabic", () => {
    const ar = buildNegotiationContext(snapshot, "q-target", { language: "ar", targetPercent: null });
    if ("error" in ar) throw new Error("bad fixture");
    expect(buildNegotiationPrompt(ar)).toMatch(/Modern Standard Arabic/);
  });
});

describe("findPrivacyLeaks", () => {
  const terms = sensitiveTermsFor(snapshot, "q-target");

  it("catches competitor names in either script, emails, and exact prices in any format", () => {
    expect(findPrivacyLeaks("Another supplier, Omar Al Rashid, offered less.", terms)).toEqual([expect.stringMatching(/Omar Al Rashid/)]);
    expect(findPrivacyLeaks("عرض شركة الراشد للتجارة أقل", terms)).toHaveLength(1);
    expect(findPrivacyLeaks("We have an offer at SAR 7,400.00", terms)).toEqual([expect.stringMatching(/7,400/)]);
    expect(findPrivacyLeaks("We have an offer at ٧٤٠٠ ريال", terms)).toHaveLength(1);
    expect(findPrivacyLeaks("cement at 23.50 per bag elsewhere", terms)).toHaveLength(1);
  });

  it("lets a clean message through, including the supplier's own figures", () => {
    expect(
      findPrivacyLeaks(
        "Dear Fahad, thank you for your quote of SAR 8,000. We received a lower offer; could you reduce your price by about 5% and deliver in 10 days?",
        terms
      )
    ).toEqual([]);
  });

  it("ignores a quote still pending review (it isn't a real offer, and its tiny numbers would false-alarm)", () => {
    expect(findPrivacyLeaks("Please deliver 10 bags first.", terms)).toEqual([]);
  });
});

describe("templateDraft", () => {
  it("writes a usable fallback in both languages without competitor details", () => {
    for (const language of ["en", "ar"] as const) {
      const ctx = buildNegotiationContext(snapshot, "q-target", { language, targetPercent: 5 });
      if ("error" in ctx) throw new Error("bad fixture");
      const draft = templateDraft(ctx);
      expect(draft.subject.length).toBeGreaterThan(5);
      expect(draft.body).toMatch(language === "ar" ? /٥|5/ : /5%/);
      expect(findPrivacyLeaks(`${draft.subject}\n${draft.body}`, sensitiveTermsFor(snapshot, "q-target"))).toEqual([]);
    }
  });
});
