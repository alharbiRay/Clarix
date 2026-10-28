"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { animate, useReducedMotion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { isLocale, type Locale } from "@/i18n/config";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChange, formatMoneyWhole, formatMonthLabel, formatPct } from "@/lib/metrics/format";
import type { SeriesPoint } from "@/lib/metrics";
import { cn } from "@/lib/utils";

/** Validated mark color (dataviz validator: lightness, chroma, ≥3:1 on white). */
const ACCENT = "#6D5FD6";
const GRID = "#EEF0F4";

export interface SavingsPanelProps {
  currency: string;
  savingsThisMonth: number;
  savingsLastMonth: number;
  savingsChange: number | null;
  savingsPctThisMonth: number | null;
  excludedOtherCurrency: number;
  series: SeriesPoint[];
  hasAwards: boolean;
}

function CountUp({ value, currency }: { value: number; currency: string }) {
  const reduce = useReducedMotion();
  // Start from 0 on both server and client so the first render matches;
  // the effect then jumps (reduced motion) or animates to the real value.
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <>{formatMoneyWhole(shown, currency)}</>;
}

function compact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${Math.round((abs / 1_000_000) * 10) / 10}M`;
  if (abs >= 1_000) return `${sign}${Math.round((abs / 1_000) * 10) / 10}K`;
  return `${sign}${Math.round(abs)}`;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: SeriesPoint }[];
  currency: string;
}

function ChartTooltip({ active, payload, currency, locale, t }: ChartTooltipProps & { locale: Locale; t: (k: string, v?: Record<string, unknown>) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_4px_16px_-4px_rgb(15_23_42/0.12)]">
      <p className="font-semibold text-slate-900">{formatMonthLabel(p.month, true, locale)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-slate-700">
        <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden />
        {t(p.savings < 0 ? "tooltipPremium" : "tooltipSaved", { amount: formatMoneyWhole(Math.abs(p.savings), currency) })}
      </p>
      <p className="mt-0.5 text-slate-500">
        {t("tooltipPos", { count: p.awarded, amount: formatMoneyWhole(p.spend, currency) })}
      </p>
    </div>
  );
}

export function SavingsPanel(props: SavingsPanelProps) {
  const reduceMotion = useReducedMotion();
  const t = useTranslations("dashboard.savings");
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const { currency, savingsThisMonth, savingsChange, savingsPctThisMonth, series, hasAwards } = props;
  const change = formatChange(savingsChange);
  const up = (savingsChange ?? 0) > 0;
  const down = (savingsChange ?? 0) < 0;
  const lastMonthLabel = formatMonthLabel(series[series.length - 2]?.month ?? "2000-01", false, locale);
  const chartData = series.map((p) => ({ ...p, label: formatMonthLabel(p.month, false, locale) }));

  return (
    <section
      aria-labelledby="savings-heading"
      className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]"
    >
      <div className="flex flex-col justify-between gap-6 p-6 lg:border-e lg:border-slate-100 lg:p-8">
        <div>
          <h2 id="savings-heading" className="text-sm font-medium text-slate-500">
            {t("heading")}
          </h2>
          <p className="mt-2 text-[2.75rem] font-semibold leading-none tracking-tight text-slate-900 sm:text-5xl">
            <CountUp value={savingsThisMonth} currency={currency} />
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {change ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold",
                  up && "bg-emerald-50 text-emerald-700",
                  down && "bg-red-50 text-red-700",
                  !up && !down && "bg-slate-100 text-slate-600"
                )}
              >
                {up ? <ArrowUpRight size={14} aria-hidden /> : down ? <ArrowDownRight size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
                {change}
                <span className="sr-only">{t(up ? "increase" : down ? "decrease" : "noChange")}</span>
              </span>
            ) : hasAwards ? (
              <span className="text-slate-500">{t("noCompare", { month: lastMonthLabel })}</span>
            ) : null}
            {change && <span className="text-slate-500">{t("vs", { month: lastMonthLabel })}</span>}
          </div>
        </div>

        <div className="space-y-1.5 text-sm text-slate-600">
          {savingsPctThisMonth !== null && savingsPctThisMonth >= 0 && (
            <p>{t("belowAvg", { pct: formatPct(savingsPctThisMonth) })}</p>
          )}
          {savingsPctThisMonth !== null && savingsPctThisMonth < 0 && (
            <p>{t("premium", { pct: formatPct(-savingsPctThisMonth) })}</p>
          )}
          <p className="text-xs text-slate-500">
            {t("formula")}
          </p>
          {props.excludedOtherCurrency > 0 && (
            <p className="text-xs text-amber-700">
              {t("excluded", { count: props.excludedOtherCurrency })}
            </p>
          )}
        </div>
      </div>

      <div className="p-6 lg:p-8">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-900">{t("byMonth")}</h3>
          <p className="text-xs text-slate-500">{t("byMonthNote", { currency })}</p>
        </div>

        {hasAwards ? (
          <>
            <div className="mt-4 h-56" aria-hidden dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart accessibilityLayer={false} data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                    dy={6}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748B", fontSize: 12 }}
                    tickFormatter={compact}
                    width={48}
                  />
                  <ReferenceLine y={0} stroke="#CBD5E1" />
                  <Tooltip
                    cursor={{ fill: "rgb(109 95 214 / 0.06)" }}
                    content={<ChartTooltip currency={currency} locale={locale} t={t as never} />}
                  />
                  <Bar dataKey="savings" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reduceMotion} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="sr-only">
              <table>
                <caption>{t("tableCaption", { currency })}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("month")}</th>
                    <th scope="col">{t("savingsCol")}</th>
                    <th scope="col">{t("spend")}</th>
                    <th scope="col">{t("pos")}</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((p) => (
                    <tr key={p.month}>
                      <th scope="row">{formatMonthLabel(p.month, true, locale)}</th>
                      <td>{formatMoneyWhole(p.savings, currency)}</td>
                      <td>{formatMoneyWhole(p.spend, currency)}</td>
                      <td>{p.awarded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="mt-4 flex h-56 flex-col items-start justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6">
            <p className="text-sm font-semibold text-slate-900">{t("emptyTitle")}</p>
            <p className="mt-1 max-w-sm text-sm text-slate-600">
              {t("emptyBody")}
            </p>
            <Link
              href="/rfqs/new"
              className="mt-4 text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
            >
              {t("emptyCta")}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
