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

export interface MonthPoint {
  month: string;
  quoted: number;
  quotes: number;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function DashboardCharts({
  data,
  currency,
}: {
  data: MonthPoint[];
  currency: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <FadeIn
        delay={0.04}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Quoted Value</h3>
            <p className="text-xs text-slate-400">
              Total value of quotes received per month
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
            Last 7 months
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="quotedGrad" x1="0" y1="0" x2="0" y2="1">
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
              dataKey="quoted"
              stroke="#4F46E5"
              strokeWidth={2}
              fill="url(#quotedGrad)"
              name="Quoted"
            />
          </AreaChart>
        </ResponsiveContainer>
      </FadeIn>

      <FadeIn
        delay={0.08}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-5">
          <h3 className="text-sm font-semibold">Quotes Received</h3>
          <p className="text-xs text-slate-400">Supplier responses per month</p>
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
