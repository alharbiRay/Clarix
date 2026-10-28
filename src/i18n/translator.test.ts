import { describe, expect, it } from "vitest";
import { supplierLanguage, translatorFor } from "@/i18n/translator";

describe("supplierLanguage", () => {
  it.each([
    [{ preferred: "en", companyName: "شركة الراشد" }, "en"],
    [{ preferred: null, companyName: "شركة الراشد" }, "ar"],
    [{ contactName: "فهد" }, "ar"],
    [{ companyName: "Najd Supplies", buyerLocale: "ar" }, "ar"],
    [{ companyName: "Najd Supplies", buyerLocale: "en" }, "en"],
    [{}, "en"],
  ])("%j → %s", (input, expected) => {
    expect(supplierLanguage(input)).toBe(expected);
  });
});

describe("translatorFor", () => {
  it("translates without a request context", () => {
    expect(translatorFor("ar", "nav")("settings")).toBe("الإعدادات");
    expect(translatorFor("en", "nav")("settings")).toBe("Settings");
  });
});
