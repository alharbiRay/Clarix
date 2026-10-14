import { TrendingDown, TrendingUp } from "lucide-react";
import type { LineInsight } from "@/lib/pricing/history";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const MINUS = "−";
function signedPct(p: number) {
  const v = Math.round(p * 100);
  return v > 0 ? `+${v}%` : v < 0 ? `${MINUS}${Math.abs(v)}%` : "0%";
}

function Badge({ pct, threshold, label, detail }: { pct: number; threshold: number; label: string; detail: string }) {
  const alert = Math.abs(pct) >= threshold;
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      title={detail}
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-px text-[11px] font-medium tabular",
        !alert && "text-slate-500",
        alert && up && "bg-amber-50 text-amber-800",
        alert && !up && "bg-emerald-50 text-emerald-800"
      )}
    >
      {alert && <Icon size={11} aria-hidden />}
      {signedPct(pct)} {label}
      <span className="sr-only">. {detail}</span>
    </span>
  );
}

/**
 * Per-line price context under a quoted price: change vs this supplier's own
 * last quote for the item, and vs the recent market average. Changes at or
 * above the buyer's threshold are highlighted (amber up, green down).
 */
export function PriceInsightBadges({
  insight,
  threshold,
  currency,
}: {
  insight: LineInsight;
  threshold: number;
  currency: string;
}) {
  const { vsSupplierLast, vsMarket } = insight;
  if (!vsSupplierLast && !vsMarket) return null;
  return (
    <span className="mt-1 flex flex-col items-end gap-0.5">
      {vsSupplierLast && (
        <Badge
          pct={vsSupplierLast.pct}
          threshold={threshold}
          label="vs their last"
          detail={`Their last price was ${formatMoney(vsSupplierLast.previous.unitPrice, currency)} on ${formatDate(vsSupplierLast.previous.at)} (${vsSupplierLast.previous.rfqTitle})`}
        />
      )}
      {vsMarket && (
        <Badge
          pct={vsMarket.pct}
          threshold={threshold}
          label="vs market"
          detail={`Average of ${vsMarket.samples} quotes in the last 180 days: ${formatMoney(vsMarket.average, currency)}`}
        />
      )}
    </span>
  );
}
