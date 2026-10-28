import type { RawGenerate } from "@/lib/gemini";
import type { ExtractionResult } from "@/lib/validations/quote";
import type { EvalFixture } from "./fixtures";
import { asciiDigits } from "./score";

/**
 * The default "model" for the evals: a deliberately simple rule-based
 * extractor plugged in where Gemini would be. It makes the harness run
 * offline and gives a floor to compare the live model against. It never
 * sees the expected answers.
 */
export function baselineGenerate(fixture: EvalFixture): RawGenerate {
  return async () => ({ text: JSON.stringify(baselineExtract(fixture)) });
}

function numbersIn(line: string): number[] {
  // Numbers not glued to letters ("12mm", "50kg", "6205-2RS" are part of names).
  const out: number[] = [];
  for (const m of line.matchAll(/(?<![\p{L}\d.-])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?![\p{L}\d-])/gu)) {
    out.push(Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`));
  }
  return out;
}

function words(s: string) {
  return s.toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length >= 3);
}

export function baselineExtract(fixture: EvalFixture): ExtractionResult {
  const text = asciiDigits(fixture.text);
  const lines = text.split("\n");

  const currency = /\bAED\b|درهم/i.test(text)
    ? "AED"
    : /\bUSD\b|\$/i.test(text)
      ? "USD"
      : /€|\bEUR\b/i.test(text)
        ? "EUR"
        : /\bSAR\b|ريال|ر\.س/i.test(text)
          ? "SAR"
          : null;

  let delivery: number | null = null;
  const days = text.match(/(\d+)\s*(?:working\s*)?(?:days?|يوم|أيام)/i);
  const weeks = text.match(/(\d+)\s*(?:weeks?|أسابيع)/i);
  if (days) delivery = Number(days[1]);
  else if (weeks) delivery = Number(weeks[1]) * 7;
  else if (/أسبوعين/.test(text)) delivery = 14;

  const warrantyLine = lines.find((l) => /warranty|ضمان/i.test(l)) ?? null;

  const items = fixture.items.map((item) => {
    const want = words(item.name);
    let best: string | null = null;
    let bestScore = 0;
    for (const line of lines) {
      const have = new Set(words(line));
      const score = want.filter((w) => have.has(w)).length;
      if (score > bestScore) {
        best = line;
        bestScore = score;
      }
    }
    const candidates = best ? numbersIn(best).filter((n) => n !== item.quantity) : [];
    const unit = candidates[0] ?? null;
    return { rfq_item_id: item.id, unit_price: unit, total_price: unit === null ? null : unit * item.quantity, notes: null };
  });

  return {
    supplier_name: null,
    currency,
    delivery_days: delivery,
    payment_terms: null,
    warranty: warrantyLine,
    notes: null,
    items,
    confidence: "low",
    warnings: [],
  };
}
