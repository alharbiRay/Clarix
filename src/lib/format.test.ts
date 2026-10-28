import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, vatOn } from "@/lib/format";
import { translatorFor } from "@/i18n/translator";

describe("formatMoney", () => {
  it("prints the currency code and Western digits in both languages", () => {
    expect(formatMoney(14547.5, "SAR", "en")).toBe("SAR\u00a014,547.50");
    expect(formatMoney(14547.5, "SAR", "ar")).toBe("SAR\u00a014,547.50");
  });
});

describe("formatDate", () => {
  it("uses the month name in Arabic and Riyadh time", () => {
    // 22:30 UTC is already the next day in Riyadh.
    expect(formatDate("2026-10-22T22:30:00Z", "ar")).toBe("23 أكتوبر 2026");
    expect(formatDate("2026-10-22T22:30:00Z", "en")).toBe("Oct 23, 2026");
    expect(formatDate(null)).toBe("—");
  });
});

describe("vatOn", () => {
  it("rounds to halalas", () => {
    expect(vatOn(100.33, 0.15)).toBe(15.05);
  });
});

describe("Arabic plurals in counted phrases", () => {
  it("counts invitations and points with the right noun form", () => {
    const s = translatorFor("ar", "scorecard");
    expect(s("quotesOn", { quoted: 3, invited: 5 })).toBe("قدّم عروضًا في 3 من 5 دعوات");
    expect(s("quotesOn", { quoted: 15, invited: 15 })).toBe("قدّم عروضًا في 15 من 15 دعوة");
  });
});
