import { describe, expect, it } from "vitest";
import { dirOf, intlLocale, isLocale, localeFromAcceptLanguage } from "@/i18n/config";

describe("locale helpers", () => {
  it.each([
    [null, "en"],
    ["", "en"],
    ["ar-SA,ar;q=0.9,en;q=0.8", "ar"],
    ["en-US,en;q=0.9,ar;q=0.8", "en"],
    ["fr-FR,ar;q=0.5", "ar"],
    ["de-DE", "en"],
    ["en;q=0.3,ar;q=0.7", "ar"],
  ])("Accept-Language %j → %s", (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });

  it("knows direction and Intl tags", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(intlLocale("ar")).toMatch(/^ar-SA/);
    expect(new Intl.NumberFormat(intlLocale("ar")).format(1234.5)).toMatch(/1[,٬]234/);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });
});
