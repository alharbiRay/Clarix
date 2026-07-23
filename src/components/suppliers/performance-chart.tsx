"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { FadeIn } from "@/components/motion";

export interface SupplierMonthPoint {
  month: string;
  quotedTotal: number;
  quotes: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");

// Same visual language as the dashboard charts (src/components/dashboard/charts.tsx)
// — indigo gradient area for value, emerald bars for count.
export function SupplierPerformanceChart({
  data,
  currency,
}: {
  data: SupplierMonthPoint[];
  currency: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <FadeIn
        delay={0.04}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
      >
        <div className="mb-5">
          <h3 className="text-sm font-semibold">Quoted value over time</h3>
          <p className="text-xs text-slate-400">Total value of this supplier&apos;s quotes per month</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="supplierQuotedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : `${v}`)}
            />
            <Tooltip
              formatter={(v) => [`${currency} ${fmt(Number(v ?? 0))}`, "Quoted"]}
              contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="quotedTotal"
              stroke="#4F46E5"
              strokeWidth={2}
              fill="url(#supplierQuotedGrad)"
              name="Quoted"
            />
          </AreaChart>
        </ResponsiveContainer>
      </FadeIn>

      <FadeIn delay={0.08} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="text-sm font-semibold">Quotes submitted</h3>
          <p className="text-xs text-slate-400">Per month</p>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#94A3B8" }}
            />
            <Tooltip
              formatter={(v) => [Number(v ?? 0), "Quotes"]}
              contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }}
            />
            <Bar dataKey="quotes" fill="#10B981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </FadeIn>
    </div>
  );
}
