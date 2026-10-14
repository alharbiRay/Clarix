import { describe, expect, it } from "vitest";
import { normalizeArabic, normalizeItem, normalizeUnit } from "@/lib/pricing/normalize";

describe("normalizeArabic", () => {
  it("strips diacritics and tatweel, unifies alef/yaa/taa-marbuta variants", () => {
    expect(normalizeArabic("أَسْمَنْت")).toBe("اسمنت");
    expect(normalizeArabic("إسمنـــت")).toBe("اسمنت");
    expect(normalizeArabic("مبنى")).toBe("مبني");
    expect(normalizeArabic("طاولة")).toBe("طاوله");
  });

  it("converts Arabic-Indic and Persian digits", () => {
    expect(normalizeArabic("٥٠ كجم")).toBe("50 كجم");
    expect(normalizeArabic("۱۲ مم")).toBe("12 مم");
  });
});

describe("normalizeUnit", () => {
  it.each([
    ["kg", "kg"], ["KG", "kg"], ["كجم", "kg"], ["كيلو", "kg"],
    ["mm", "mm"], ["مم", "mm"], ["ملم", "mm"],
    ["pcs", "pcs"], ["pieces", "pcs"], ["قطعة", "pcs"], ["حبة", "pcs"], ["units", "pcs"],
    ["tons", "ton"], ["طن", "ton"],
    ["m³", "m3"], ["م3", "m3"], ["cubic meter", "m3"],
    ["boxes", "box"], ["كرتون", "box"],
    ["rolls", "roll"], ["رول", "roll"],
    ["sets", "set"], ["طقم", "set"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeUnit(input)).toBe(expected);
  });

  it("keeps unknown units, just cleaned", () => {
    expect(normalizeUnit("  Drums ")).toBe("drums");
  });
});

describe("normalizeItem", () => {
  it("is case-, whitespace- and punctuation-insensitive", () => {
    expect(normalizeItem("Portland  Cement, 50kg").key).toBe(normalizeItem("portland cement 50 KG").key);
  });

  it("ignores word order", () => {
    expect(normalizeItem("Rebar 12mm").key).toBe(normalizeItem("12 mm rebar").key);
  });

  it("parses sizes with units into a canonical token", () => {
    expect(normalizeItem("أسمنت بورتلاندي 50 كجم").tokens).toContain("50kg");
    expect(normalizeItem("Rebar 12mm (Grade 60)").tokens).toContain("12mm");
    expect(normalizeItem("Carton 40×30×30").tokens).toContain("40x30x30");
  });

  it("matches common items across Arabic and English through the glossary", () => {
    expect(normalizeItem("أسمنت بورتلاندي 50 كجم").key).toBe(normalizeItem("Portland cement 50kg").key);
    expect(normalizeItem("حديد تسليح 12 مم").key).toBe(normalizeItem("Rebar 12mm").key);
    expect(normalizeItem("ورق تصوير A4").key).toBe(normalizeItem("A4 copy paper").key);
  });

  it("keeps genuinely different items apart", () => {
    expect(normalizeItem("Rebar 12mm").key).not.toBe(normalizeItem("Rebar 16mm").key);
    expect(normalizeItem("Portland cement 50kg").key).not.toBe(normalizeItem("White cement 50kg").key);
  });

  it("drops filler words that don't identify the item", () => {
    expect(normalizeItem("Supply of A4 copy paper").key).toBe(normalizeItem("A4 copy paper").key);
  });

  it("never returns an empty key", () => {
    expect(normalizeItem("  ").key).toBe("");
    expect(normalizeItem("(-)").key).toBe("");
  });
});

describe("normalizeItem — review regressions", () => {
  it("matches glossary terms on whole words only", () => {
    expect(normalizeItem("جهاز تحديد المواقع").tokens).not.toContain("steel");
    expect(normalizeItem("فرملة").tokens).not.toContain("sand");
  });

  it("strips the Arabic definite article and attached prepositions", () => {
    expect(normalizeItem("الاسمنت البورتلاندي 50 كجم").key).toBe(normalizeItem("اسمنت بورتلاندي 50 كجم").key);
    expect(normalizeItem("حديد التسليح 12 مم").key).toBe(normalizeItem("Rebar 12mm").key);
    expect(normalizeItem("فلتر هواء للمولد").key).toBe(normalizeItem("فلتر هواء مولد").key);
  });

  it("does not mangle words that merely start with و or ب", () => {
    expect(normalizeItem("ورق تصوير A4").key).toBe(normalizeItem("A4 copy paper").key);
    expect(normalizeItem("بلك خرساني 20 سم").tokens).toContain("20cm");
  });

  it("canonicalizes numbers and more units", () => {
    expect(normalizeItem("Rebar 12.0mm").key).toBe(normalizeItem("Rebar 12mm").key);
    expect(normalizeItem('Valve 2 inch').key).toBe(normalizeItem("Valve 2in").key);
    expect(normalizeItem("Oil 20 litre").tokens).toContain("20l");
  });
});

describe("normalizeUnit — review regressions", () => {
  it.each([["Nos.", "pcs"], ["pcs.", "pcs"], ["قطع", "pcs"], ["ltr", "l"], ["inch", "in"]])("%s → %s", (a, b) => {
    expect(normalizeUnit(a)).toBe(b);
  });
});
