"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { markNotificationRead } from "@/app/(dashboard)/dashboard/actions";
import { approveAward } from "@/app/(dashboard)/rfqs/actions";
import { Button } from "@/components/ui/button";

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

// These are the two notification types evaluateAutoApproval sends when a
// recommendation needed manual review — an "Approve & Send PO" action
// belongs on both. auto_approved/comparison_ready are FYI-only.
const APPROVABLE_TYPES = new Set(["review_needed", "differs_from_cheapest"]);

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
    startTransition(async () => {
      const result = await markNotificationRead(id);
      if (result?.error) {
        setDismissed((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.error("Couldn't dismiss that notification — try again.");
      }
    });
  }

  return (
    <div className="space-y-2">
      {visible.map((n) => (
        <NotificationRow
          key={n.id}
          notification={n}
          onDismiss={() => dismiss(n.id)}
        />
      ))}
    </div>
  );
}

function NotificationRow({
  notification: n,
  onDismiss,
}: {
  notification: DashboardNotification;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const [isApproving, startApproveTransition] = useTransition();
  const style = STYLES[n.type] ?? DEFAULT_STYLE;
  const Icon = style.icon;
  const approvable = APPROVABLE_TYPES.has(n.type);

  function handleApprove() {
    startApproveTransition(async () => {
      const result = await approveAward(n.rfq_id);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Approved — PO sent.");
        onDismiss();
        router.refresh();
      }
    });
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border ${style.border} ${style.bg} px-4 py-3 text-sm`}
    >
      <Link
        href={`/rfqs/${n.rfq_id}/compare`}
        className={`flex min-w-0 items-center gap-2 font-medium ${style.text} hover:underline`}
      >
        <Icon size={15} className={`shrink-0 ${style.iconColor}`} />
        <span className="truncate">{n.message}</span>
      </Link>
      <div className="flex shrink-0 items-center gap-2">
        {approvable && (
          <Button
            size="sm"
            disabled={isApproving}
            onClick={handleApprove}
            className="h-7 gap-1.5 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
          >
            {isApproving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            Approve
          </Button>
        )}
        <button
          onClick={onDismiss}
          className={`rounded-md p-1 ${style.iconColor} opacity-60 transition-opacity hover:opacity-100`}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
