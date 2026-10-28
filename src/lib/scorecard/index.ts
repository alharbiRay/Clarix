/**
 * Supplier scorecard: per-supplier performance metrics and a documented,
 * tested composite score (0-100). Pure functions over the same snapshot the
 * savings dashboard uses (src/lib/metrics), keyed by the persistent supplier
 * profile (suppliers.id = rfq_suppliers.supplier_id). Definitions and the
 * formula are in docs/METRICS.md ("Supplier scorecard").
 */
import { translatorFor } from "@/i18n/translator";
import type { Locale } from "@/i18n/config";
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
  /** Quotes on RFQs that have been decided (PO sent, or RFQ closed/awarded). */
  decidedQuotes: number;
  /** awarded / decidedQuotes — open RFQs don't count as losses. */
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
const ts = (iso: string) => Date.parse(iso);

/** A supplier profile: id plus email, so invites not yet linked to the profile still count. */
export type SupplierRef = string | { id: string; email?: string | null };

function refOf(supplier: SupplierRef) {
  return typeof supplier === "string" ? { id: supplier, email: null } : { id: supplier.id, email: supplier.email ?? null };
}

/**
 * Invites are linked to the persistent profile only once the supplier quotes
 * (ensureSupplierProfile), so an ignored or declined invitation usually has
 * supplier_id = null — match those by email.
 */
function isTheirs(invite: MetricsRfq["invites"][number], id: string, email: string | null) {
  if (invite.supplier_id) return invite.supplier_id === id;
  return Boolean(email && invite.email && invite.email.trim().toLowerCase() === email.trim().toLowerCase());
}

/** Still accepting quotes: an unanswered invitation here isn't a non-response (yet). */
function isOpen(rfq: MetricsRfq, now: number) {
  if (rfq.status !== "draft" && rfq.status !== "sent") return false;
  return !rfq.deadline || ts(rfq.deadline) > now;
}

/** The buyer has made a decision on this RFQ. */
function isDecided(rfq: MetricsRfq) {
  return Boolean(rfq.award?.po_sent_at) || rfq.status === "awarded" || rfq.status === "closed";
}

export function supplierMetrics(rfqs: MetricsRfq[], supplier: SupplierRef, now: Date = new Date()): SupplierMetrics {
  const { id: supplierId, email } = refOf(supplier);
  const nowMs = now.getTime();
  let invited = 0;
  let quoted = 0;
  let declined = 0;
  let awarded = 0;
  let decidedQuotes = 0;
  let withWarranty = 0;
  const responseHours: number[] = [];
  const priceGaps: number[] = [];
  const deliveryDiffs: number[] = [];
  let atOrFaster = 0;
  let deliverySamples = 0;
  let lastQuote: string | null = null;
  let lastInvite: string | null = null;
  const later = (a: string | null, b: string | null) => (b && (!a || ts(b) > ts(a)) ? b : a);

  for (const rfq of rfqs) {
    const invites = rfq.invites.filter((i) => isTheirs(i, supplierId, email) && i.status !== "pending");
    for (const invite of invites) {
      const mine = rfq.quotes.find((q) => q.invite_id === invite.id && isComparable(q));
      lastInvite = later(lastInvite, invite.invited_at);
      // An unanswered invitation on an RFQ that is still open isn't a miss yet.
      if (!mine && invite.status !== "declined" && isOpen(rfq, nowMs)) continue;

      invited++;
      if (invite.status === "declined") declined++;
      if (!mine) continue;

      quoted++;
      lastQuote = later(lastQuote, mine.submitted_at);
      if (hasWarranty(mine.warranty)) withWarranty++;
      if (invite.invited_at) {
        const h = (new Date(mine.submitted_at).getTime() - new Date(invite.invited_at).getTime()) / HOUR;
        if (h >= 0) responseHours.push(h);
      }
      if (isDecided(rfq)) {
        decidedQuotes++;
        if (rfq.award?.po_sent_at && rfq.award.quote_id === mine.id) awarded++;
      }

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
    decidedQuotes,
    winRate: decidedQuotes ? awarded / decidedQuotes : null,
    avgPriceVsLowest: mean(priceGaps),
    priceSamples: priceGaps.length,
    deliveryVsTypicalDays: mean(deliveryDiffs),
    fasterThanTypicalRate: deliverySamples ? atOrFaster / deliverySamples : null,
    warrantyRate: quoted ? withWarranty / quoted : null,
    // The supplier's own last quote; if they never quoted, when we last invited them.
    lastActive: lastQuote ?? lastInvite,
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

/**
 * Whole-number points that add up exactly to the rounded total (largest
 * remainder), so the visible breakdown always matches the score.
 */
export function allocatePoints(raw: number[]): number[] {
  const target = Math.round(raw.reduce((s, x) => s + x, 0));
  const floors = raw.map(Math.floor);
  let remaining = target - floors.reduce((s, x) => s + x, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floors[i] += 1;
    remaining -= 1;
  }
  return floors;
}

export interface ScoreComponent {
  key: ScoreComponentKey;
  label: string;
  weight: number;
  available: boolean;
  /** 0-1 */
  score: number;
  /** Whole-number contribution to the 0-100 total (they sum to the score). */
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

  const rawPoints = keys.map((k) => (raw[k] === null ? 0 : ((raw[k] as number) * SCORE_WEIGHTS[k] * 100) / availableWeight));
  const points = allocatePoints(rawPoints);
  const components = keys.map((k, i) => ({
    key: k,
    label: LABELS[k],
    weight: SCORE_WEIGHTS[k],
    available: raw[k] !== null,
    score: raw[k] ?? 0,
    points: points[i],
  }));
  return { score: points.reduce((s, p) => s + p, 0), components };
}

// ---------------------------------------------------------------------------
// Plain-language strengths and weaknesses
// ---------------------------------------------------------------------------

const pct = (v: number) => `${Math.round(v * 100)}%`;
function duration(hours: number, locale: Locale) {
  if (locale === "ar") return hours < 48 ? `${Math.round(hours)} س` : `${Math.round((hours / 24) * 10) / 10} يوم`;
  return hours < 48 ? `${Math.round(hours)} h` : `${Math.round((hours / 24) * 10) / 10} days`;
}

/** Plain-language strengths and weaknesses, in the viewer's language. */
export function describeSupplier(m: SupplierMetrics, _card: Scorecard | null, locale: Locale = "en") {
  const t = translatorFor(locale, "scorecard");
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (m.avgPriceVsLowest !== null) {
    if (m.avgPriceVsLowest <= 0.005) strengths.push(t("cheapest"));
    else if (m.avgPriceVsLowest <= 0.03) strengths.push(t("closeToCheapest", { pct: pct(m.avgPriceVsLowest) }));
    else if (m.avgPriceVsLowest >= 0.1) weaknesses.push(t("aboveLowest", { pct: pct(m.avgPriceVsLowest) }));
  }

  if (m.responseRate !== null && m.invited >= 2) {
    if (m.responseRate >= 0.9) strengths.push(t("quotesOn", { quoted: m.quoted, invited: m.invited }));
    else if (m.responseRate < 0.6) weaknesses.push(t("quotesOnOnly", { quoted: m.quoted, invited: m.invited }));
  }

  if (m.medianResponseHours !== null) {
    if (m.medianResponseHours <= 12) strengths.push(t("repliesFast", { duration: duration(m.medianResponseHours, locale) }));
    else if (m.medianResponseHours > 48) weaknesses.push(t("repliesSlow", { duration: duration(m.medianResponseHours, locale) }));
  }

  if (m.fasterThanTypicalRate !== null) {
    if (m.fasterThanTypicalRate >= 0.75) strengths.push(t("fastDelivery", { pct: pct(m.fasterThanTypicalRate) }));
    else if (m.fasterThanTypicalRate <= 0.4 && (m.deliveryVsTypicalDays ?? 0) > 0)
      weaknesses.push(t("slowDelivery", { days: Math.round(m.deliveryVsTypicalDays! * 10) / 10 }));
  }

  if (m.warrantyRate !== null) {
    if (m.warrantyRate >= 0.9) strengths.push(t("warranty", { pct: pct(m.warrantyRate) }));
    else if (m.warrantyRate <= 0.5) weaknesses.push(t("warrantyOnly", { pct: pct(m.warrantyRate) }));
  }

  if (m.winRate !== null) {
    if (m.winRate >= 0.4 && m.awarded >= 2) strengths.push(t("wins", { pct: pct(m.winRate) }));
    else if (m.awarded === 0 && m.decidedQuotes >= 4) weaknesses.push(t("noWins", { count: m.decidedQuotes }));
  }

  return { strengths, weaknesses };
}

// ---------------------------------------------------------------------------
// Trend: the score as it stood at the end of each month
// ---------------------------------------------------------------------------

/** What was known about an RFQ at `cutoff` (an instant, compared numerically). */
function asOf(rfq: MetricsRfq, cutoff: number): MetricsRfq | null {
  if (ts(rfq.created_at) > cutoff) return null;
  const quotes = rfq.quotes.filter((q) => ts(q.submitted_at) <= cutoff);
  const quotedInvites = new Set(quotes.map((q) => q.invite_id));
  const award = rfq.award?.po_sent_at && ts(rfq.award.po_sent_at) <= cutoff ? rfq.award : null;
  return {
    ...rfq,
    // Undecided at the cutoff → treat as still open (the RFQ's real status is "now").
    status: award ? "awarded" : rfq.status === "awarded" || rfq.status === "closed" ? "sent" : rfq.status,
    invites: rfq.invites
      .filter((i) => !i.invited_at || ts(i.invited_at) <= cutoff)
      .map((i) => (i.status === "submitted" && !quotedInvites.has(i.id) ? { ...i, status: "sent" as const } : i)),
    quotes,
    award,
  };
}

export function scoreTrend(rfqs: MetricsRfq[], supplier: SupplierRef, now: Date, months = 6) {
  return Array.from({ length: months }, (_, i) => {
    const month = monthBefore(now, months - 1 - i);
    const cutoff = monthEnd(month);
    const snapshot = rfqs.map((r) => asOf(r, cutoff.getTime())).filter((r): r is MetricsRfq => r !== null);
    return { month, score: scoreSupplier(supplierMetrics(snapshot, supplier, cutoff))?.score ?? null };
  });
}

/** Scores for many suppliers at once (list page, comparison badges). Keyed by supplier id. */
export function scoreSuppliers(rfqs: MetricsRfq[], suppliers: SupplierRef[], now: Date = new Date()) {
  const out = new Map<string, { metrics: SupplierMetrics; card: Scorecard | null }>();
  for (const s of suppliers) {
    const metrics = supplierMetrics(rfqs, s, now);
    out.set(refOf(s).id, { metrics, card: scoreSupplier(metrics) });
  }
  return out;
}
