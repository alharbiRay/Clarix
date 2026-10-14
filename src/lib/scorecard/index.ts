/**
 * Supplier scorecard: per-supplier performance metrics and a documented,
 * tested composite score (0-100). Pure functions over the same snapshot the
 * savings dashboard uses (src/lib/metrics), keyed by the persistent supplier
 * profile (suppliers.id = rfq_suppliers.supplier_id). Definitions and the
 * formula are in docs/METRICS.md ("Supplier scorecard").
 */
import { completeTotal, monthBefore, monthEnd, type MetricsRfq } from "@/lib/metrics";

const HOUR = 3_600_000;

export interface SupplierMetrics {
  /** Invitations actually sent (status other than pending). */
  invited: number;
  quoted: number;
  declined: number;
  /** quoted / invited. */
  responseRate: number | null;
  medianResponseHours: number | null;
  /** RFQs whose purchase order went to this supplier. */
  awarded: number;
  /** awarded / quoted. */
  winRate: number | null;
  /** Mean of (my total − lowest complete total) / lowest, over RFQs with competition. 0 = always cheapest. */
  avgPriceVsLowest: number | null;
  priceSamples: number;
  /** Mean of (my promised days − the RFQ's median promised days). Negative = faster than typical. */
  deliveryVsTypicalDays: number | null;
  /** Share of quotes promising delivery at or faster than the RFQ's median. */
  fasterThanTypicalRate: number | null;
  warrantyRate: number | null;
  lastActive: string | null;
}

const isComparable = (q: MetricsRfq["quotes"][number]) => q.status === "submitted" || q.status === "confirmed";
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
const hasWarranty = (w: string | null | undefined) => Boolean(w && w.trim());

export function supplierMetrics(rfqs: MetricsRfq[], supplierId: string): SupplierMetrics {
  let invited = 0;
  let quoted = 0;
  let declined = 0;
  let awarded = 0;
  let withWarranty = 0;
  const responseHours: number[] = [];
  const priceGaps: number[] = [];
  const deliveryDiffs: number[] = [];
  let atOrFaster = 0;
  let deliverySamples = 0;
  let lastActive: string | null = null;
  const touch = (iso: string | null) => {
    if (iso && (!lastActive || iso > lastActive)) lastActive = iso;
  };

  for (const rfq of rfqs) {
    const invites = rfq.invites.filter((i) => i.supplier_id === supplierId && i.status !== "pending");
    for (const invite of invites) {
      invited++;
      touch(invite.invited_at);
      if (invite.status === "declined") declined++;
      const mine = rfq.quotes.find((q) => q.invite_id === invite.id && isComparable(q));
      if (!mine) continue;

      quoted++;
      touch(mine.submitted_at);
      if (hasWarranty(mine.warranty)) withWarranty++;
      if (invite.invited_at) {
        const h = (new Date(mine.submitted_at).getTime() - new Date(invite.invited_at).getTime()) / HOUR;
        if (h >= 0) responseHours.push(h);
      }
      if (rfq.award?.po_sent_at && rfq.award.quote_id === mine.id) awarded++;

      const comparable = rfq.quotes.filter(isComparable);
      const myTotal = completeTotal(rfq, mine);
      const totals = comparable.map((q) => completeTotal(rfq, q)).filter((t): t is number => t !== null);
      if (myTotal !== null && totals.length >= 2) {
        const lowest = Math.min(...totals);
        if (lowest > 0) priceGaps.push((myTotal - lowest) / lowest);
      }

      const days = comparable.map((q) => q.delivery_days).filter((d): d is number => typeof d === "number");
      if (typeof mine.delivery_days === "number" && days.length >= 2) {
        const typical = median(days)!;
        deliverySamples++;
        deliveryDiffs.push(mine.delivery_days - typical);
        if (mine.delivery_days <= typical) atOrFaster++;
      }
    }
  }

  return {
    invited,
    quoted,
    declined,
    responseRate: invited ? quoted / invited : null,
    medianResponseHours: median(responseHours),
    awarded,
    winRate: quoted ? awarded / quoted : null,
    avgPriceVsLowest: mean(priceGaps),
    priceSamples: priceGaps.length,
    deliveryVsTypicalDays: mean(deliveryDiffs),
    fasterThanTypicalRate: deliverySamples ? atOrFaster / deliverySamples : null,
    warrantyRate: quoted ? withWarranty / quoted : null,
    lastActive,
  };
}

// ---------------------------------------------------------------------------
// Composite score
// ---------------------------------------------------------------------------

export const SCORE_WEIGHTS = { price: 30, responsiveness: 20, delivery: 20, warranty: 15, winRate: 15 } as const;
export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS;

/** Below this many quotes the score is withheld ("not enough history"). */
export const MIN_QUOTES_FOR_SCORE = 2;
/** Price gap that scores zero: 25% above the lowest quote. */
export const PRICE_GAP_FOR_ZERO = 0.25;
/** Median response time that scores zero on speed: 5 days. */
export const RESPONSE_HOURS_FOR_ZERO = 120;
/** Win rate that earns full marks (winning half the time is excellent with 3+ bidders). */
export const WIN_RATE_FOR_FULL = 0.5;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export interface ScoreComponent {
  key: ScoreComponentKey;
  label: string;
  weight: number;
  available: boolean;
  /** 0-1 */
  score: number;
  /** Contribution to the 0-100 total after renormalization. */
  points: number;
}

export interface Scorecard {
  score: number;
  components: ScoreComponent[];
}

const LABELS: Record<ScoreComponentKey, string> = {
  price: "Price",
  responsiveness: "Responsiveness",
  delivery: "Delivery",
  warranty: "Warranty",
  winRate: "Win rate",
};

/** Composite 0-100. Null when there is too little history to judge fairly. */
export function scoreSupplier(m: SupplierMetrics): Scorecard | null {
  if (m.quoted < MIN_QUOTES_FOR_SCORE) return null;

  const raw: Record<ScoreComponentKey, number | null> = {
    price: m.avgPriceVsLowest === null ? null : clamp01(1 - m.avgPriceVsLowest / PRICE_GAP_FOR_ZERO),
    responsiveness:
      m.responseRate === null
        ? null
        : m.medianResponseHours === null
          ? m.responseRate
          : m.responseRate * 0.6 + clamp01(1 - m.medianResponseHours / RESPONSE_HOURS_FOR_ZERO) * 0.4,
    delivery: m.fasterThanTypicalRate,
    warranty: m.warrantyRate,
    winRate: m.winRate === null ? null : clamp01(m.winRate / WIN_RATE_FOR_FULL),
  };

  const keys = Object.keys(SCORE_WEIGHTS) as ScoreComponentKey[];
  const availableWeight = keys.reduce((s, k) => s + (raw[k] === null ? 0 : SCORE_WEIGHTS[k]), 0);
  if (availableWeight === 0) return null;

  const components = keys.map((k) => {
    const available = raw[k] !== null;
    const score = raw[k] ?? 0;
    return {
      key: k,
      label: LABELS[k],
      weight: SCORE_WEIGHTS[k],
      available,
      score,
      points: available ? (score * SCORE_WEIGHTS[k] * 100) / availableWeight : 0,
    };
  });
  return { score: Math.round(components.reduce((s, c) => s + c.points, 0)), components };
}

// ---------------------------------------------------------------------------
// Plain-language strengths and weaknesses
// ---------------------------------------------------------------------------

const pct = (v: number) => `${Math.round(v * 100)}%`;
function duration(hours: number) {
  return hours < 48 ? `${Math.round(hours)} h` : `${Math.round((hours / 24) * 10) / 10} days`;
}

export function describeSupplier(m: SupplierMetrics, _card: Scorecard | null) {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (m.avgPriceVsLowest !== null) {
    if (m.avgPriceVsLowest <= 0.005) strengths.push("Consistently the cheapest complete quote");
    else if (m.avgPriceVsLowest <= 0.03)
      strengths.push(`Usually close to the cheapest: ${pct(m.avgPriceVsLowest)} above the lowest quote on average`);
    else if (m.avgPriceVsLowest >= 0.1)
      weaknesses.push(`Typically ${pct(m.avgPriceVsLowest)} above the lowest quote`);
  }

  if (m.responseRate !== null && m.invited >= 2) {
    if (m.responseRate >= 0.9) strengths.push(`Quotes on ${m.quoted} of ${m.invited} invitations`);
    else if (m.responseRate < 0.6) weaknesses.push(`Quotes on only ${m.quoted} of ${m.invited} invitations`);
  }

  if (m.medianResponseHours !== null) {
    if (m.medianResponseHours <= 12) strengths.push(`Replies fast: median ${duration(m.medianResponseHours)}`);
    else if (m.medianResponseHours > 48) weaknesses.push(`Slow to reply: median ${duration(m.medianResponseHours)}`);
  }

  if (m.fasterThanTypicalRate !== null) {
    if (m.fasterThanTypicalRate >= 0.75)
      strengths.push(`Delivers at or faster than typical on ${pct(m.fasterThanTypicalRate)} of quotes`);
    else if (m.fasterThanTypicalRate <= 0.4 && (m.deliveryVsTypicalDays ?? 0) > 0)
      weaknesses.push(
        `Usually slower than typical delivery (${Math.round(m.deliveryVsTypicalDays! * 10) / 10} days over the median)`
      );
  }

  if (m.warrantyRate !== null) {
    if (m.warrantyRate >= 0.9) strengths.push(`Offers a warranty on ${pct(m.warrantyRate)} of quotes`);
    else if (m.warrantyRate <= 0.5) weaknesses.push(`Warranty on ${pct(m.warrantyRate)} of quotes only`);
  }

  if (m.winRate !== null) {
    if (m.winRate >= 0.4 && m.awarded >= 2) strengths.push(`Wins ${pct(m.winRate)} of the RFQs it quotes on`);
    else if (m.awarded === 0 && m.quoted >= 4) weaknesses.push(`Hasn't won any of its ${m.quoted} quotes`);
  }

  return { strengths, weaknesses };
}

// ---------------------------------------------------------------------------
// Trend: the score as it stood at the end of each month
// ---------------------------------------------------------------------------

/** What was known about an RFQ at `cutoff`. */
function asOf(rfq: MetricsRfq, cutoff: string): MetricsRfq | null {
  if (rfq.created_at > cutoff) return null;
  const quotes = rfq.quotes.filter((q) => q.submitted_at <= cutoff);
  const quotedInvites = new Set(quotes.map((q) => q.invite_id));
  return {
    ...rfq,
    invites: rfq.invites
      .filter((i) => !i.invited_at || i.invited_at <= cutoff)
      .map((i) => (i.status === "submitted" && !quotedInvites.has(i.id) ? { ...i, status: "sent" as const } : i)),
    quotes,
    award: rfq.award?.po_sent_at && rfq.award.po_sent_at <= cutoff ? rfq.award : null,
  };
}

export function scoreTrend(rfqs: MetricsRfq[], supplierId: string, now: Date, months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const month = monthBefore(now, months - 1 - i);
    const cutoff = monthEnd(month).toISOString();
    const snapshot = rfqs.map((r) => asOf(r, cutoff)).filter((r): r is MetricsRfq => r !== null);
    return { month, score: scoreSupplier(supplierMetrics(snapshot, supplierId))?.score ?? null };
  });
}

/** Scores for many suppliers at once (list page, comparison badges). */
export function scoreSuppliers(rfqs: MetricsRfq[], supplierIds: string[]) {
  const out = new Map<string, { metrics: SupplierMetrics; card: Scorecard | null }>();
  for (const id of supplierIds) {
    const metrics = supplierMetrics(rfqs, id);
    out.set(id, { metrics, card: scoreSupplier(metrics) });
  }
  return out;
}
