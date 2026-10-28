import { describe, expect, it } from "vitest";
import {
  buildNegotiationContext,
  buildNegotiationPrompt,
  buyerHint,
  cleanSubject,
  detectLanguage,
  findPrivacyLeaks,
  sensitiveTermsFor,
  targetRevealsGap,
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

const terms = sensitiveTermsFor(snapshot, "q-target");

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
    expect(ctx).toMatchObject({ supplierName: "Najd Building Supplies", contactName: "Fahad", theirTotal: 8_000, position: "higher", fasterDeliveryElsewhere: true });
    expect(JSON.stringify(ctx)).not.toMatch(/Rashid|الراشد|7400|7,400|2350|5050|Gulf|\b7\b/);
  });

  it("knows when the supplier is competitive, and when their own quote is incomplete", () => {
    expect(buildNegotiationContext(snapshot, "q-rival", { language: "ar", targetPercent: null })).toMatchObject({ position: "lowest" });
    const partial: ComparisonSnapshot = {
      ...snapshot,
      quotes: snapshot.quotes.map((q) => (q.id === "q-target" ? { ...q, lines: q.lines.slice(0, 1) } : q)),
    };
    expect(buildNegotiationContext(partial, "q-target", { language: "en", targetPercent: null })).toMatchObject({ position: "unknown", theirTotal: null });
  });

  it("refuses quotes it can't negotiate", () => {
    expect(buildNegotiationContext(snapshot, "q-pending", { language: "en", targetPercent: null })).toEqual({ error: "This quote is still pending review." });
    const rejected = { ...snapshot, quotes: snapshot.quotes.map((q) => (q.id === "q-target" ? { ...q, status: "rejected" } : q)) };
    expect(buildNegotiationContext(rejected, "q-target", { language: "en", targetPercent: null })).toEqual({ error: "This quote was rejected." });
    expect(buildNegotiationContext(snapshot, "nope", { language: "en", targetPercent: null })).toEqual({ error: "Quote not found." });
  });

  it("validates the target percentage", () => {
    expect(buildNegotiationContext(snapshot, "q-target", { language: "en", targetPercent: 80 })).toEqual({
      error: "Target reduction must be a whole number from 1 to 50.",
    });
    expect(buildNegotiationContext(snapshot, "q-target", { language: "en", targetPercent: 5 })).toMatchObject({ targetPercent: 5 });
  });
});

describe("buyerHint (shown to the buyer, never sent)", () => {
  it("rounds the gap down to a 5% step for display, and keeps the exact gap for the warning", () => {
    // (8000 − 7400) / 8000 = 7.5% → exact 7, shown as "about 5%".
    expect(buyerHint(snapshot, "q-target")).toEqual({ position: "higher", gapPercent: 7, hintPercent: 5 });
    expect(buyerHint(snapshot, "q-rival")).toEqual({ position: "lowest", gapPercent: null, hintPercent: null });
  });

  it("warns when a target would let the supplier work out the competing price", () => {
    expect(targetRevealsGap(7, 7)).toBe(true);
    expect(targetRevealsGap(5, 7)).toBe(true);
    expect(targetRevealsGap(3, 7)).toBe(false);
    expect(targetRevealsGap(null, 7)).toBe(false);
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

  it("asks for Arabic when the language is Arabic, and never claims a lower offer for an incomplete quote", () => {
    const ar = buildNegotiationContext(snapshot, "q-target", { language: "ar", targetPercent: null });
    if ("error" in ar) throw new Error("bad fixture");
    expect(buildNegotiationPrompt(ar)).toMatch(/Modern Standard Arabic/);
    expect(buildNegotiationPrompt({ ...ar, position: "unknown" })).toMatch(/complete the missing prices/);
  });
});

describe("findPrivacyLeaks", () => {
  it("catches competitor names in either script, emails, and exact prices in any format", () => {
    expect(findPrivacyLeaks("Another supplier, Omar Al Rashid, offered less.", terms)).toEqual([expect.stringMatching(/Omar Al Rashid/)]);
    expect(findPrivacyLeaks("عرض شركة الراشد للتجارة أقل", terms)).toHaveLength(1);
    expect(findPrivacyLeaks("الراشد قدّم سعرًا أفضل", terms)).toHaveLength(1); // core name without "شركة … للتجارة"
    expect(findPrivacyLeaks("ask info@alrashid.sa", terms)).toHaveLength(1);
    expect(findPrivacyLeaks("We have an offer at SAR 7,400.00", terms)).toEqual([expect.stringMatching(/7,400/)]);
    expect(findPrivacyLeaks("We have an offer at ٧٤٠٠ ريال", terms)).toHaveLength(1);
    expect(findPrivacyLeaks("an offer of 7 400 SAR", terms)).toHaveLength(1);
    expect(findPrivacyLeaks("an offer of 7.4k", terms)).toHaveLength(1);
    expect(findPrivacyLeaks("cement at 23.50 per bag elsewhere", terms)).toHaveLength(1);
  });

  it("lets a clean message through, including the supplier's own figures", () => {
    expect(
      findPrivacyLeaks(
        "Dear Fahad, thank you for your quote of SAR 8,000 for 100 bags. We received a lower offer; could you reduce your price by about 5% and deliver in 10 days?",
        terms
      )
    ).toEqual([]);
  });

  it("ignores a quote still pending review (it isn't a real offer, and its tiny numbers would false-alarm)", () => {
    expect(findPrivacyLeaks("Please deliver 10 bags first.", terms)).toEqual([]);
  });

  describe("does not block ordinary messages (review regressions)", () => {
    const withNames = (suppliers: ComparisonSnapshot["suppliers"], extra: Partial<ComparisonSnapshot> = {}) =>
      sensitiveTermsFor({ ...snapshot, ...extra, suppliers: [snapshot.suppliers[0], ...suppliers] }, "q-target");

    it("a competitor contact called علي doesn't block the word على", () => {
      const t = withNames([{ id: "s-rival", email: "a@x.sa", companyName: "Gulf Co", contactName: "علي", preferredLanguage: null }]);
      expect(findPrivacyLeaks("نشكركم على عرضكم", t)).toEqual([]);
    });

    it("short names never match inside other words", () => {
      const t = withNames([{ id: "s-rival", email: "a@x.sa", companyName: "Sam Ali Trading", contactName: "Ali Sam", preferredLanguage: null }]);
      expect(findPrivacyLeaks("Same quality as before.", t)).toEqual([]);
    });

    it("a first name shared with the target or the buyer isn't blocked", () => {
      const t = withNames(
        [{ id: "s-rival", email: "m@x.sa", companyName: "Other Co", contactName: "Mohammed Al Otaibi", preferredLanguage: null }],
        { buyer: { company: "Al Waha", name: "Mohammed Al Harbi" } }
      );
      expect(findPrivacyLeaks("Dear Mohammed,\n…\nBest regards,\nMohammed Al Harbi", t)).toEqual([]);
      expect(findPrivacyLeaks("Mohammed Al Otaibi offered less", t)).toHaveLength(1);
    });

    it("generic email domains and item words don't become forbidden", () => {
      const t = withNames([
        { id: "s-rival", email: "x@mail.example.com", companyName: "Delta Co", contactName: null, preferredLanguage: null },
        { id: "s-two", email: "y@cable.sa", companyName: "Tamimi Est", contactName: null, preferredLanguage: null },
      ]);
      expect(findPrivacyLeaks("Please reply by email about the cable order.", t)).toEqual([]);
    });

    it("percentages, days and quantities equal to a competitor's small unit price aren't prices", () => {
      const t = sensitiveTermsFor(
        {
          ...snapshot,
          quotes: snapshot.quotes.map((q) => (q.id === "q-rival" ? { ...q, lines: [{ itemId: "i1", total: 2_350, unit: 10 }, { itemId: "i2", total: 30, unit: 15 }] } : q)),
        },
        "q-target"
      );
      expect(findPrivacyLeaks("Could you reduce by about 10% and deliver within 30 days? We need 15 pallets.", t)).toEqual([]);
      expect(findPrivacyLeaks("They offered SAR 10 per bag", t)).toHaveLength(1);
    });

    it("the safe templates always pass the check", () => {
      for (const language of ["en", "ar"] as const) {
        for (const targetPercent of [null, 5, 10]) {
          const ctx = buildNegotiationContext(snapshot, "q-target", { language, targetPercent });
          if ("error" in ctx) throw new Error("bad fixture");
          const d = templateDraft(ctx);
          expect(findPrivacyLeaks(`${d.subject}\n${d.body}`, terms)).toEqual([]);
        }
      }
    });
  });
});

describe("templateDraft", () => {
  it("writes a usable fallback in both languages without competitor details", () => {
    for (const language of ["en", "ar"] as const) {
      const ctx = buildNegotiationContext(snapshot, "q-target", { language, targetPercent: 5 });
      if ("error" in ctx) throw new Error("bad fixture");
      const draft = templateDraft(ctx);
      expect(draft.subject.length).toBeGreaterThan(5);
      expect(draft.body).toMatch(/5%/);
    }
  });

  it("asks an incomplete quote to finish pricing instead of claiming it's competitive", () => {
    const ctx = buildNegotiationContext(snapshot, "q-target", { language: "en", targetPercent: null });
    if ("error" in ctx) throw new Error("bad fixture");
    expect(templateDraft({ ...ctx, position: "unknown" }).body).toMatch(/not priced yet/);
  });
});

describe("cleanSubject", () => {
  it("strips line breaks and tabs", () => {
    expect(cleanSubject("Hello\r\nBcc: x@y.z\tthere")).toBe("Hello Bcc: x@y.z there");
  });
});
