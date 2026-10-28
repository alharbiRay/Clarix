"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { LineInsight } from "@/lib/pricing/history";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isLocale } from "@/i18n/config";

const MINUS = "−";
function signedPct(p: number) {
  const v = Math.round(p * 100);
  return v > 0 ? `+${v}%` : v < 0 ? `${MINUS}${Math.abs(v)}%` : "0%";
}

function Badge({ pct, alert, label }: { pct: number; alert: boolean; label: string }) {
  const up = pct > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1 py-px text-[11px] font-medium tabular",
        !alert && "text-slate-500",
        alert && up && "bg-amber-50 text-amber-800",
        alert && !up && "bg-emerald-50 text-emerald-800"
      )}
    >
      {alert && <Icon size={11} aria-hidden />}
      <bdi dir="ltr">{signedPct(pct)}</bdi> {label}
    </span>
  );
}

/**
 * Per-line price context under a quoted price: change vs this supplier's own
 * last quote for the item, and vs the recent market average. Changes at or
 * above the buyer's threshold are highlighted (amber up, green down). The
 * badges are one button, so the details open for keyboard and touch users too.
 */
export function PriceInsightBadges({ insight, currency }: { insight: LineInsight; currency: string }) {
  const t = useTranslations("priceInsight");
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : "en";
  const { vsSupplierLast, vsMarket } = insight;
  if (!vsSupplierLast && !vsMarket) return null;
  const summary = [
    vsSupplierLast && t("vsTheirLastLong", { pct: signedPct(vsSupplierLast.pct) }),
    vsMarket && t("vsMarketLong", { pct: signedPct(vsMarket.pct) }),
  ]
    .filter(Boolean)
    .join(locale === "ar" ? "، " : ", ");
  return (
    <Popover>
      <PopoverTrigger
        className="mt-1 inline-flex flex-col items-end gap-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
        aria-label={t("aria", { summary })}
      >
        {vsSupplierLast && <Badge pct={vsSupplierLast.pct} alert={insight.supplierAlert} label={t("vsTheirLast")} />}
        {vsMarket && <Badge pct={vsMarket.pct} alert={insight.marketAlert} label={t("vsMarket")} />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-slate-200 bg-white p-3 text-xs text-slate-700">
        <dl className="space-y-2">
          {vsSupplierLast && (
            <div>
              <dt className="font-semibold text-slate-900">{t("theirLast")}</dt>
              <dd>
                {t("onDate", {
                  price: formatMoney(vsSupplierLast.previous.unitPrice, currency, locale),
                  date: formatDate(vsSupplierLast.previous.at, locale),
                })}{" "}
                · <bdi>{vsSupplierLast.previous.rfqTitle}</bdi>
              </dd>
            </div>
          )}
          {vsMarket && (
            <div>
              <dt className="font-semibold text-slate-900">{t("marketAvg")}</dt>
              <dd>{t("across", { price: formatMoney(vsMarket.average, currency, locale), count: vsMarket.samples })}</dd>
            </div>
          )}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
