"use client";

import {
  FileText,
  Inbox,
  AlertTriangle,
  Users,
  ArrowUpRight,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { Stagger, StaggerItem } from "@/components/motion";

const ICONS: Record<string, LucideIcon> = {
  rfqs: FileText,
  quotes: Inbox,
  review: AlertTriangle,
  suppliers: Users,
};

export interface StatCard {
  key: keyof typeof ICONS;
  label: string;
  value: string;
  delta: string | null;
}

export function StatCards({ stats }: { stats: StatCard[] }) {
  return (
    <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => {
        const Icon = ICONS[s.key];
        return (
          <StaggerItem
            key={s.key}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <Icon size={18} className="text-slate-600" />
              </div>
              {s.delta ? (
                <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                  <ArrowUpRight size={13} />
                  {s.delta}
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-xs font-medium text-slate-400">
                  <Minus size={13} />
                  no change
                </span>
              )}
            </div>
            <p className="mt-4 text-2xl font-bold tracking-tight">{s.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{s.label}</p>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
