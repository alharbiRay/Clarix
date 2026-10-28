import { useTranslations } from "next-intl";
import type { RfqStatus } from "@/lib/types";

const STYLES: Record<
  RfqStatus,
  { bg: string; text: string; dot: string }
> = {
  draft: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
  sent: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
  },
  closed: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  awarded: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
};

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  const s = STYLES[status];
  const t = useTranslations("status");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {t(status)}
    </span>
  );
}
