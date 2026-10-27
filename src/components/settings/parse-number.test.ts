import { describe, expect, it } from "vitest";
import { parseNumberInput } from "@/components/settings/approval-policy-form";

describe("parseNumberInput", () => {
  it.each([
    ["", null],
    ["  ", null],
    ["50000", 50000],
    ["50,000", 50000],
    ["50 000.50", 50000.5],
    ["٥٠٬٠٠٠", 50000],
    ["١٤", 14],
    ["۱۴", 14],
    ["12٫5", 12.5],
  ])("%j → %s", (raw, expected) => {
    expect(parseNumberInput(raw)).toBe(expected);
  });

  it.each(["1e3", "abc", "-5", "5-", "1.2.3", "Infinity"])("%j is unreadable, not 'no limit'", (raw) => {
    expect(parseNumberInput(raw)).toBeNaN();
  });
});
