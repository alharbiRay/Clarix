import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import { runEvals, updateEvalsDoc } from "./run";
import { samePrice, warrantyMonths } from "./score";

describe("extraction eval fixtures", () => {
  it("has 20+ labeled cases in Arabic and English, each fully labeled", () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(FIXTURES.map((f) => f.language))).toEqual(new Set(["en", "ar", "mixed"]));
    expect(new Set(FIXTURES.map((f) => f.id)).size).toBe(FIXTURES.length);
    for (const f of FIXTURES) {
      expect(Object.keys(f.expected.unitPrices).sort()).toEqual(f.items.map((i) => i.id).sort());
    }
  });
});

describe("scoring", () => {
  it("reads warranty periods in both languages", () => {
    expect(warrantyMonths("2 years")).toBe(24);
    expect(warrantyMonths("3-year limited")).toBe(36);
    expect(warrantyMonths("Warranty: 6 months against defects")).toBe(6);
    expect(warrantyMonths("ضمان سنتين")).toBe(24);
    expect(warrantyMonths("ضمان ١٨ شهر")).toBe(18);
    expect(warrantyMonths("ضمان سنة واحدة")).toBe(12);
    expect(warrantyMonths("الضمان: لا يوجد")).toBeNull();
    expect(warrantyMonths("Warranty: N/A")).toBeNull();
    expect(warrantyMonths(null)).toBeNull();
  });

  it("compares prices within half a percent, and nulls exactly", () => {
    expect(samePrice(999.9, 1000)).toBe(true);
    expect(samePrice(990, 1000)).toBe(false);
    expect(samePrice(null, null)).toBe(true);
    expect(samePrice(0, null)).toBe(false);
  });
});

describe("eval harness", () => {
  it("runs offline with the baseline model and scores every case", async () => {
    // No Gemini key in tests (src/test/setup.ts): a live call would throw.
    const { scores, summary } = await runEvals("baseline");
    expect(summary.cases).toBe(FIXTURES.length);
    expect(summary.errors).toBe(0);
    expect(scores.every((s) => s.fields.currency[1] === 1)).toBe(true);
  });

  it("replaces only its own block in docs/EVALS.md", () => {
    const doc = "# Evals\n\nIntro.\n";
    const once = updateEvalsDoc(doc, "baseline", "v1");
    const twice = updateEvalsDoc(updateEvalsDoc(once, "live", "L"), "baseline", "v2");
    expect(twice).toContain("Intro.");
    expect(twice).toContain("v2");
    expect(twice).not.toContain("v1");
    expect(twice).toContain("L");
  });
});
