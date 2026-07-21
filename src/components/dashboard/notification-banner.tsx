"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Sparkles, X, type LucideIcon } from "lucide-react";
import { markNotificationRead } from "@/app/(dashboard)/dashboard/actions";

export interface DashboardNotification {
  id: string;
  rfq_id: string;
  type: string;
  message: string;
}

const STYLES: Record<
  string,
  { icon: LucideIcon; border: string; bg: string; iconColor: string; text: string }
> = {
  comparison_ready: {
    icon: Sparkles,
    border: "border-indigo-100",
    bg: "bg-indigo-50/60",
    iconColor: "text-indigo-600",
    text: "text-indigo-900",
  },
  auto_approved: {
    icon: CheckCircle2,
    border: "border-emerald-200",
    bg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    text: "text-emerald-900",
  },
  review_needed: {
    icon: AlertTriangle,
    border: "border-amber-200",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
    text: "text-amber-900",
  },
  differs_from_cheapest: {
    icon: AlertTriangle,
    border: "border-amber-200",
    bg: "bg-amber-50",
    iconColor: "text-amber-600",
    text: "text-amber-900",
  },
};

const DEFAULT_STYLE = STYLES.comparison_ready;

export function NotificationBanner({
  notifications,
}: {
  notifications: DashboardNotification[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const visible = notifications.filter((n) => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    setDismissed((prev) => new Set(prev).add(id));
    startTransition(() => {
      markNotificationRead(id);
    });
  }

  return (
    <div className="space-y-2">
      {visible.map((n) => {
        const style = STYLES[n.type] ?? DEFAULT_STYLE;
        const Icon = style.icon;
        return (
          <div
            key={n.id}
            className={`flex items-center justify-between gap-3 rounded-xl border ${style.border} ${style.bg} px-4 py-3 text-sm`}
          >
            <Link
              href={`/rfqs/${n.rfq_id}/compare`}
              className={`flex min-w-0 items-center gap-2 font-medium ${style.text} hover:underline`}
            >
              <Icon size={15} className={`shrink-0 ${style.iconColor}`} />
              <span className="truncate">{n.message}</span>
            </Link>
            <button
              onClick={() => dismiss(n.id)}
              className={`shrink-0 rounded-md p-1 ${style.iconColor} opacity-60 transition-opacity hover:opacity-100`}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
