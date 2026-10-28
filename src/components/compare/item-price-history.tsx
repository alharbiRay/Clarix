"use client";

import { LineChart } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate, formatMoney } from "@/lib/format";
import { useLocale, useTranslations } from "next-intl";
import { isLocale } from "@/i18n/config";

export interface HistoryPoint {
  at: string;
  unitPrice: number;
  supplierLabel: string;
  rfqTitle: string;
  current: boolean;
}

const W = 248;
const H = 88;
const PAD = 8;

/**
 * A small time-scaled dot plot of every quoted unit price for one item. Dots
 * only — joining quotes from different suppliers with a line would imply a
 * series that doesn't exist.
 */
function PriceDots({ points }: { points: HistoryPoint[] }) {
  const times = points.map((p) => Date.parse(p.at));
  const prices = points.map((p) => p.unitPrice);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const lo = Math.min(...prices) * 0.97;
  const hi = Math.max(...prices) * 1.03;
  const x = (t: number) => (t1 === t0 ? W / 2 : PAD + ((t - t0) / (t1 - t0)) * (W - PAD * 2));
  const y = (v: number) => (hi === lo ? H / 2 : H - PAD - ((v - lo) / (hi - lo)) * (H - PAD * 2));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[88px] w-full" aria-hidden style={{ direction: "ltr" }}>
      <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#E2E8F0" strokeWidth={1} />
      <text x={W - PAD} y={y(Math.max(...prices)) - 6} textAnchor="end" fontSize={9} fill="#64748B">
        {Math.max(...prices).toFixed(2)}
      </text>
      <text x={W - PAD} y={Math.min(H - 2, y(Math.min(...prices)) + 12)} textAnchor="end" fontSize={9} fill="#64748B">
        {Math.min(...prices).toFixed(2)}
      </text>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(Date.parse(p.at))}
          cy={y(p.unitPrice)}
          r={p.current ? 5 : 4}
          fill={p.current ? "#0F172A" : "#6D5FD6"}
          stroke="#fff"
          strokeWidth={2}
        />
      ))}
    </svg>
  );
}

export function ItemPriceHistory({
  itemName,
  unit,
  currency,
  points,
}: {
  itemName: string;
  unit: string;
  currency: string;
  points: HistoryPoint[];
}) {
  const t = useTranslations("priceHistory");
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : "en";
  const pastCount = points.filter((p) => !p.current).length;
  if (pastCount === 0) return null;
  const recent = [...points].reverse().slice(0, 6);
  return (
    <Popover>
      <PopoverTrigger
        className="mt-1 inline-flex items-center gap-1 rounded text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
        aria-label={t("aria", { item: itemName, count: pastCount })}
      >
        <LineChart size={11} aria-hidden /> {t("trigger", { count: pastCount })}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border-slate-200 bg-white p-4 text-slate-900">
        <p className="text-sm font-semibold">
          <bdi>{itemName}</bdi>
        </p>
        <p className="text-xs text-slate-500">
          {t("legend", { unit, currency })}
        </p>
        <div className="mt-2">
          <PriceDots points={points} />
        </div>
        <table className="mt-2 w-full text-xs">
          <caption className="sr-only">{t("caption", { item: itemName })}</caption>
          <tbody className="divide-y divide-slate-100">
            {recent.map((p, i) => (
              <tr key={i} className={p.current ? "font-semibold" : undefined}>
                <td className="py-1 pe-2 text-slate-500">{formatDate(p.at, locale)}</td>
                <td className="max-w-[120px] truncate py-1 pe-2">
                  <bdi>{p.supplierLabel}</bdi>
                </td>
                <td className="py-1 text-end tabular">{formatMoney(p.unitPrice, currency, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PopoverContent>
    </Popover>
  );
}
