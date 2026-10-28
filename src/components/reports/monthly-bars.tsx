"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoneyWhole, formatMonthLabel } from "@/lib/metrics/format";

/** Same validated mark color as the dashboard savings chart. */
const ACCENT = "#6D5FD6";
const GRID = "#EEF0F4";

function compact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${Math.round((abs / 1_000_000) * 10) / 10}M`;
  if (abs >= 1_000) return `${sign}${Math.round((abs / 1_000) * 10) / 10}K`;
  return `${sign}${Math.round(abs)}`;
}

interface Point {
  month: string;
  value: number;
}

function ChartTooltip({ active, payload, currency, label }: { active?: boolean; payload?: { payload: Point }[]; currency: string; label: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_4px_16px_-4px_rgb(15_23_42/0.12)]">
      <p className="font-semibold text-slate-900">{formatMonthLabel(p.month, true)}</p>
      <p className="mt-1 text-slate-700">
        {label}: {formatMoneyWhole(p.value, currency)}
      </p>
    </div>
  );
}

/**
 * One measure per chart (spend and savings have different scales — never a
 * dual axis). The data is also in the table below each chart, which is what
 * screen readers get.
 */
export function MonthlyBars({ title, data, currency }: { title: string; data: Point[]; currency: string }) {
  const many = data.length > 12;
  return (
    <div className="break-inside-avoid">
      <p className="text-xs font-semibold text-slate-600" aria-hidden="true">
        {title}
      </p>
      <div className="report-chart mt-2 h-44" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap={many ? "18%" : "28%"}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonthLabel(m)}
              tickLine={false}
              axisLine={false}
              interval={many ? "preserveStartEnd" : 0}
              tick={{ fontSize: 11, fill: "#64748B" }}
            />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "#64748B" }} />
            <ReferenceLine y={0} stroke="#CBD5E1" />
            <Tooltip cursor={{ fill: "rgb(109 95 214 / 0.06)" }} content={<ChartTooltip currency={currency} label={title} />} />
            <Bar dataKey="value" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
