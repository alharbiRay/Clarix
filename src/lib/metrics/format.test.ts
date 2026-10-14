import { describe, expect, it } from "vitest";
import { formatChange, formatHours, formatMonthLabel, formatMoneyWhole, formatPct } from "@/lib/metrics/format";

describe("metric formatting", () => {
  it("formats durations in hours or days", () => {
    expect(formatHours(null)).toBe("—");
    expect(formatHours(0.4)).toBe("< 1 h");
    expect(formatHours(6.25)).toBe("6.3 h");
    expect(formatHours(31)).toBe("31 h");
    expect(formatHours(60)).toBe("2.5 days");
  });

  it("formats signed changes and percentages", () => {
    expect(formatChange(null)).toBeNull();
    expect(formatChange(1.5)).toBe("+150%");
    expect(formatChange(-0.123)).toBe("−12%");
    expect(formatChange(0)).toBe("0%");
    expect(formatPct(0.1834)).toBe("18%");
    expect(formatPct(-0.05)).toBe("−5%");
    expect(formatPct(null)).toBe("—");
  });

  it("formats money without decimals for headline figures", () => {
    expect(formatMoneyWhole(12340.67, "SAR")).toBe("SAR 12,341");
    expect(formatMoneyWhole(-500, "SAR")).toBe("−SAR 500");
    expect(formatMoneyWhole(-0.4, "SAR")).toBe("SAR 0");
  });

  it("labels months briefly", () => {
    expect(formatMonthLabel("2026-10")).toBe("Oct");
    expect(formatMonthLabel("2026-01", true)).toBe("Jan 2026");
  });
});
