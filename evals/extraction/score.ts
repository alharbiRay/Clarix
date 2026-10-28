import type { ExtractionResult } from "@/lib/validations/quote";
import type { EvalFixture } from "./fixtures";

export const FIELDS = ["price", "currency", "deliveryDays", "warranty"] as const;
export type Field = (typeof FIELDS)[number];

/** Arabic-Indic and Persian digits → ASCII. */
export function asciiDigits(s: string) {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * The warranty period in months from free text ("2 years", "18 شهر",
 * "سنتين", "3-year limited"); null when none is stated.
 */
export function warrantyMonths(text: string | null): number | null {
  if (!text) return null;
  const s = asciiDigits(text).toLowerCase();
  if (/\b(none|n\/a|no warranty)\b|لا يوجد|بدون ضمان|^\s*[—-]\s*$/.test(s)) return null;
  if (/سنتين|سنتان/.test(s)) return 24;
  if (/شهرين|شهران/.test(s)) return 2;
  let m = s.match(/(\d+(?:\.\d+)?)\s*-?\s*(years?|yrs?|سنوات|سنة|سنين|عام|أعوام)/);
  if (m) return Math.round(Number(m[1]) * 12);
  m = s.match(/(\d+(?:\.\d+)?)\s*-?\s*(months?|mos?|شهر|شهور|أشهر)/);
  if (m) return Math.round(Number(m[1]));
  if (/سنة واحدة|\bone year\b|\ba year\b|سنة|عام/.test(s)) return 12;
  return null;
}

/** Within half a percent (and a halala), or both null. */
export function samePrice(actual: number | null | undefined, expected: number | null) {
  if (expected === null) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;
  return Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 0.005);
}

export interface CaseScore {
  id: string;
  language: EvalFixture["language"];
  /** Per field: [correct, total]. */
  fields: Record<Field, [number, number]>;
  misses: string[];
  error?: string;
}

export function scoreCase(fixture: EvalFixture, result: ExtractionResult | null, error?: string): CaseScore {
  const fields: Record<Field, [number, number]> = { price: [0, 0], currency: [0, 1], deliveryDays: [0, 1], warranty: [0, 1] };
  const misses: string[] = [];
  const priceIds = Object.keys(fixture.expected.unitPrices);
  fields.price[1] = priceIds.length;
  if (!result) return { id: fixture.id, language: fixture.language, fields, misses: [`error: ${error ?? "no result"}`], error };

  for (const id of priceIds) {
    const want = fixture.expected.unitPrices[id];
    const got = result.items.find((i) => i.rfq_item_id === id)?.unit_price ?? null;
    if (samePrice(got, want)) fields.price[0]++;
    else misses.push(`price ${id}: expected ${want}, got ${got}`);
  }
  const currency = result.currency?.toUpperCase() ?? null;
  if (currency === fixture.expected.currency) fields.currency[0]++;
  else misses.push(`currency: expected ${fixture.expected.currency}, got ${currency}`);
  if (result.delivery_days === fixture.expected.deliveryDays) fields.deliveryDays[0]++;
  else misses.push(`delivery: expected ${fixture.expected.deliveryDays}, got ${result.delivery_days}`);
  const months = warrantyMonths(result.warranty);
  if (months === fixture.expected.warrantyMonths) fields.warranty[0]++;
  else misses.push(`warranty: expected ${fixture.expected.warrantyMonths} months, got ${months} ("${result.warranty}")`);

  return { id: fixture.id, language: fixture.language, fields, misses };
}

export interface Summary {
  cases: number;
  errors: number;
  accuracy: Record<Field, { correct: number; total: number; pct: number }>;
  byLanguage: Record<string, Record<Field, number>>;
}

function pct(c: number, t: number) {
  return t === 0 ? 0 : Math.round((c / t) * 1000) / 10;
}

/**
 * Accuracy over the cases the model actually answered. Cases that errored
 * (quota, network) are counted separately: they say nothing about extraction
 * quality, and an invented answer still counts as a miss.
 */
export function summarize(all: CaseScore[]): Summary {
  const scores = all.filter((s) => !s.error);
  const accuracy = {} as Summary["accuracy"];
  for (const f of FIELDS) {
    const correct = scores.reduce((s, c) => s + c.fields[f][0], 0);
    const total = scores.reduce((s, c) => s + c.fields[f][1], 0);
    accuracy[f] = { correct, total, pct: pct(correct, total) };
  }
  const byLanguage: Summary["byLanguage"] = {};
  for (const lang of [...new Set(scores.map((s) => s.language))]) {
    const group = scores.filter((s) => s.language === lang);
    byLanguage[lang] = Object.fromEntries(
      FIELDS.map((f) => [f, pct(group.reduce((s, c) => s + c.fields[f][0], 0), group.reduce((s, c) => s + c.fields[f][1], 0))])
    ) as Record<Field, number>;
  }
  return { cases: all.length, errors: all.length - scores.length, accuracy, byLanguage };
}
