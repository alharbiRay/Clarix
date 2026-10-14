"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { animate, useReducedMotion } from "framer-motion";
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
  const [shown, setShown] = useState(reduce ? value : 0);
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

function ChartTooltip({ active, payload, currency }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_4px_16px_-4px_rgb(15_23_42/0.12)]">
      <p className="font-semibold text-slate-900">{formatMonthLabel(p.month, true)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-slate-700">
        <span className="h-2 w-2 rounded-full" style={{ background: ACCENT }} aria-hidden />
        {p.savings < 0 ? "Premium paid" : "Saved"} {formatMoneyWhole(Math.abs(p.savings), currency)}
      </p>
      <p className="mt-0.5 text-slate-500">
        {p.awarded} PO{p.awarded === 1 ? "" : "s"} · {formatMoneyWhole(p.spend, currency)} spend
      </p>
    </div>
  );
}

export function SavingsPanel(props: SavingsPanelProps) {
  const reduceMotion = useReducedMotion();
  const { currency, savingsThisMonth, savingsChange, savingsPctThisMonth, series, hasAwards } = props;
  const change = formatChange(savingsChange);
  const up = (savingsChange ?? 0) > 0;
  const down = (savingsChange ?? 0) < 0;
  const lastMonthLabel = formatMonthLabel(series[series.length - 2]?.month ?? "2000-01", false);
  const chartData = series.map((p) => ({ ...p, label: formatMonthLabel(p.month) }));

  return (
    <section
      aria-labelledby="savings-heading"
      className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]"
    >
      <div className="flex flex-col justify-between gap-6 p-6 lg:border-r lg:border-slate-100 lg:p-8">
        <div>
          <h2 id="savings-heading" className="text-sm font-medium text-slate-500">
            Saved this month
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
                <span className="sr-only">{up ? "increase" : down ? "decrease" : "no change"}</span>
              </span>
            ) : hasAwards ? (
              <span className="text-slate-500">No savings recorded in {lastMonthLabel} to compare with</span>
            ) : null}
            {change && <span className="text-slate-500">vs {lastMonthLabel}</span>}
          </div>
        </div>

        <div className="space-y-1.5 text-sm text-slate-600">
          {savingsPctThisMonth !== null && (
            <p>
              <span className="font-semibold text-slate-900">{formatPct(savingsPctThisMonth)}</span> below the
              average competing quote on this month&apos;s purchase orders.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Savings = average of the other complete quotes − the awarded total.
          </p>
          {props.excludedOtherCurrency > 0 && (
            <p className="text-xs text-amber-700">
              {props.excludedOtherCurrency} awarded RFQ{props.excludedOtherCurrency === 1 ? "" : "s"} in other
              currencies {props.excludedOtherCurrency === 1 ? "is" : "are"} not included.
            </p>
          )}
        </div>
      </div>

      <div className="p-6 lg:p-8">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-900">Savings by month</h3>
          <p className="text-xs text-slate-500">{currency} · purchase orders sent</p>
        </div>

        {hasAwards ? (
          <>
            <div className="mt-4 h-56" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
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
                    content={<ChartTooltip currency={currency} />}
                  />
                  <Bar dataKey="savings" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={!reduceMotion} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Savings by month ({currency})</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Savings</th>
                  <th scope="col">Spend</th>
                  <th scope="col">Purchase orders</th>
                </tr>
              </thead>
              <tbody>
                {series.map((p) => (
                  <tr key={p.month}>
                    <th scope="row">{formatMonthLabel(p.month, true)}</th>
                    <td>{formatMoneyWhole(p.savings, currency)}</td>
                    <td>{formatMoneyWhole(p.spend, currency)}</td>
                    <td>{p.awarded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="mt-4 flex h-56 flex-col items-start justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6">
            <p className="text-sm font-semibold text-slate-900">No purchase orders yet</p>
            <p className="mt-1 max-w-sm text-sm text-slate-600">
              Savings start counting when you award your first RFQ — automatically or by approving a
              recommendation.
            </p>
            <Link
              href="/rfqs/new"
              className="mt-4 text-sm font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
            >
              Create an RFQ
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
