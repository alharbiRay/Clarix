/**
 * Price history per normalized item, derived from the same snapshot as the
 * dashboard (no extra table): every comparable quote line becomes a point.
 * Insights compare a quote line with the supplier's own previous price and
 * with the recent market average for the same item, unit and currency.
 */
import type { MetricsRfq } from "@/lib/metrics";
import { normalizeItem, normalizeUnit } from "@/lib/pricing/normalize";

const DAY = 86_400_000;
export const DEFAULT_PRICE_ALERT_THRESHOLD = 0.1;
export const MARKET_WINDOW_DAYS = 180;
/** Fewer points than this isn't a "market". */
export const MIN_MARKET_SAMPLES = 2;

export interface PricePoint {
  key: string;
  itemName: string;
  unit: string;
  currency: string;
  rfqId: string;
  rfqTitle: string;
  quoteId: string;
  supplierKey: string;
  supplierLabel: string;
  unitPrice: number;
  at: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildPriceHistory(rfqs: MetricsRfq[]): PricePoint[] {
  const points: PricePoint[] = [];
  for (const rfq of rfqs) {
    for (const quote of rfq.quotes) {
      if (quote.status !== "submitted" && quote.status !== "confirmed") continue;
      const invite = rfq.invites.find((i) => i.id === quote.invite_id);
      for (const line of quote.lines) {
        const item = rfq.items.find((i) => i.id === line.item_id);
        if (!item) continue;
        const unitPrice =
          line.unit !== null && line.unit !== undefined
            ? Number(line.unit)
            : line.total !== null && item.quantity > 0
              ? Number(line.total) / item.quantity
              : null;
        if (unitPrice === null || !Number.isFinite(unitPrice)) continue;
        const { key } = normalizeItem(item.name);
        if (!key) continue;
        points.push({
          key,
          itemName: item.name,
          unit: normalizeUnit(item.unit ?? "pcs"),
          currency: rfq.currency,
          rfqId: rfq.id,
          rfqTitle: rfq.title,
          quoteId: quote.id,
          supplierKey: invite?.supplier_id ?? invite?.label ?? quote.invite_id,
          supplierLabel: invite?.label ?? "Unknown supplier",
          unitPrice: round2(unitPrice),
          at: quote.submitted_at,
        });
      }
    }
  }
  return points.sort((a, b) => a.at.localeCompare(b.at));
}

const sameSeries = (p: PricePoint, key: string, unit: string, currency: string) =>
  p.key === key && p.unit === unit && p.currency === currency;

export function itemHistory(history: PricePoint[], key: string, unit: string, currency: string): PricePoint[] {
  return history.filter((p) => sameSeries(p, key, unit, currency));
}

export interface LineInsight {
  vsSupplierLast: { pct: number; previous: PricePoint } | null;
  vsMarket: { pct: number; average: number; samples: number } | null;
  /** True when either change crosses the buyer's alert threshold. */
  alert: boolean;
}

export interface LineContext {
  key: string;
  unit: string;
  currency: string;
  rfqId: string;
  supplierKey: string;
  unitPrice: number;
  at: string;
}

export function lineInsight(
  history: PricePoint[],
  line: LineContext,
  { threshold = DEFAULT_PRICE_ALERT_THRESHOLD, windowDays = MARKET_WINDOW_DAYS }: { threshold?: number; windowDays?: number } = {}
): LineInsight {
  const prior = history.filter(
    (p) => sameSeries(p, line.key, line.unit, line.currency) && p.rfqId !== line.rfqId && p.at < line.at
  );

  const previous = prior.filter((p) => p.supplierKey === line.supplierKey).at(-1) ?? null;
  const vsSupplierLast =
    previous && previous.unitPrice > 0 ? { pct: (line.unitPrice - previous.unitPrice) / previous.unitPrice, previous } : null;

  const windowStart = new Date(new Date(line.at).getTime() - windowDays * DAY).toISOString();
  const market = prior.filter((p) => p.at >= windowStart);
  const average = market.length ? market.reduce((s, p) => s + p.unitPrice, 0) / market.length : 0;
  const vsMarket =
    market.length >= MIN_MARKET_SAMPLES && average > 0
      ? { pct: (line.unitPrice - average) / average, average: round2(average), samples: market.length }
      : null;

  const alert =
    (vsSupplierLast !== null && Math.abs(vsSupplierLast.pct) >= threshold) ||
    (vsMarket !== null && Math.abs(vsMarket.pct) >= threshold);

  return { vsSupplierLast, vsMarket, alert };
}
