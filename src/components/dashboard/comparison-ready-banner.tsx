"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { markNotificationRead } from "@/app/(dashboard)/dashboard/actions";

export interface ComparisonReadyNotification {
  id: string;
  rfq_id: string;
  message: string;
}

export function ComparisonReadyBanner({
  notifications,
}: {
  notifications: ComparisonReadyNotification[];
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
      {visible.map((n) => (
        <div
          key={n.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm"
        >
          <Link
            href={`/rfqs/${n.rfq_id}/compare`}
            className="flex min-w-0 items-center gap-2 font-medium text-indigo-900 hover:underline"
          >
            <Sparkles size={15} className="shrink-0 text-indigo-600" />
            <span className="truncate">{n.message}</span>
          </Link>
          <button
            onClick={() => dismiss(n.id)}
            className="shrink-0 rounded-md p-1 text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
