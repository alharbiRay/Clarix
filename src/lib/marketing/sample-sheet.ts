/**
 * The landing page's live comparison sheet: three SAMPLE quotes (labeled as
 * such on the page), ranked the way the product's recommendation weighs
 * price, delivery and warranty, then checked against the visitor's rules the
 * way auto-approval does. Pure so it can be tested; the numbers are synthetic.
 */

export type Priority = "price" | "balanced" | "speed";

export interface SampleQuote {
  id: "rashid" | "eastern" | "najd";
  total: number; // SAR, excluding VAT
  deliveryDays: number;
  warrantyMonths: number; // 0 = none
  score: number; // supplier scorecard, 0–100
}

export const SAMPLE_QUOTES: SampleQuote[] = [
  { id: "eastern", total: 46_900, deliveryDays: 9, warrantyMonths: 0, score: 72 },
  { id: "rashid", total: 48_250, deliveryDays: 5, warrantyMonths: 12, score: 82 },
  { id: "najd", total: 56_900, deliveryDays: 4, warrantyMonths: 18, score: 88 },
];

const WEIGHTS: Record<Priority, { price: number; delivery: number; warranty: number }> = {
  price: { price: 1, delivery: 0, warranty: 0 },
  balanced: { price: 0.65, delivery: 0.25, warranty: 0.1 },
  speed: { price: 0.2, delivery: 0.7, warranty: 0.1 },
};

/** Best first. Ties keep the cheaper quote ahead. */
export function rankQuotes(quotes: SampleQuote[], priority: Priority): SampleQuote[] {
  const minTotal = Math.min(...quotes.map((q) => q.total));
  const minDays = Math.min(...quotes.map((q) => q.deliveryDays));
  const maxWarranty = Math.max(1, ...quotes.map((q) => q.warrantyMonths));
  const w = WEIGHTS[priority];
  const value = (q: SampleQuote) =>
    w.price * (minTotal / q.total) + w.delivery * (minDays / q.deliveryDays) + w.warranty * (q.warrantyMonths / maxWarranty);
  return [...quotes].sort((a, b) => value(b) - value(a) || a.total - b.total);
}

export interface SheetRules {
  maxDeliveryDays: number;
  requireWarranty: boolean;
  spendLimit: number; // SAR, excluding VAT
}

export const DEFAULT_RULES: SheetRules = { maxDeliveryDays: 7, requireWarranty: true, spendLimit: 50_000 };

export type Decision =
  | { status: "approved"; quote: SampleQuote; saving: number }
  | { status: "held"; quote: SampleQuote; reason: "delivery" | "warranty" | "spend" };

/** Auto-approval on the AI's pick: every rule must pass, otherwise it waits (first failing rule is the reason). */
export function decide(ranked: SampleQuote[], rules: SheetRules): Decision {
  const pick = ranked[0];
  if (pick.deliveryDays > rules.maxDeliveryDays) return { status: "held", quote: pick, reason: "delivery" };
  if (rules.requireWarranty && pick.warrantyMonths === 0) return { status: "held", quote: pick, reason: "warranty" };
  if (pick.total > rules.spendLimit) return { status: "held", quote: pick, reason: "spend" };
  const others = ranked.slice(1);
  const average = others.reduce((s, q) => s + q.total, 0) / Math.max(1, others.length);
  return { status: "approved", quote: pick, saving: Math.round(average - pick.total) };
}
