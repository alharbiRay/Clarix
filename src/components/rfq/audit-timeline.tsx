import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FilePlus2,
  FileSearch,
  Inbox,
  MessageSquare,
  PackageCheck,
  Send,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { describeAuditEvent, type AuditTone } from "@/lib/audit";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale, isLocale, type Locale } from "@/i18n/config";

export interface TimelineEvent {
  id: string;
  event_type: string;
  actor_type: "buyer" | "supplier" | "system";
  payload: unknown;
  created_at: string;
}

const ICONS: Record<string, LucideIcon> = {
  rfq_created: FilePlus2,
  rfq_sent: Send,
  quote_received: Inbox,
  quote_confirmed: CheckCircle2,
  quote_rejected: XCircle,
  quote_deleted: XCircle,
  extraction_completed: FileSearch,
  extraction_failed: AlertTriangle,
  recommendation_generated: Sparkles,
  auto_approval_decided: CheckCircle2,
  award_approved: CheckCircle2,
  po_sent: PackageCheck,
  negotiation_sent: MessageSquare,
  ai_quota_error: Clock,
  job_failed: AlertTriangle,
};

const TONE: Record<AuditTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  positive: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  negative: "bg-red-50 text-red-700",
};

const ZONE = "Asia/Riyadh";
const yearOf = (d: Date) => new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: ZONE }).format(d);

/** "Oct 14, 9:05 AM GMT+3" — the year only when it isn't this year. */
function formatWhen(iso: string, locale: Locale) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
    ...(yearOf(d) !== yearOf(new Date()) ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZone: ZONE,
    timeZoneName: "short",
  }).format(d);
}

/** The RFQ's decision history, oldest first — the story of how it was decided. */
export function AuditTimeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations("audit");
  const raw = useLocale();
  const locale: Locale = isLocale(raw) ? raw : "en";
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">{t("empty")}</p>;
  }

  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:start-[15px] before:top-2 before:w-px before:bg-slate-200">
      {events.map((e) => {
        const d = describeAuditEvent(e, locale);
        // A hold-for-review is an auto_approval_decided event too, but reads as a warning.
        const IconToUse =
          e.event_type === "auto_approval_decided" && d.tone === "warning"
            ? AlertTriangle
            : (ICONS[e.event_type] ?? CheckCircle2);
        return (
          <li key={e.id} className="relative flex gap-3">
            <span
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white",
                TONE[d.tone]
              )}
              aria-hidden
            >
              <IconToUse size={15} />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-medium text-slate-900">
                <bdi>{d.title}</bdi>
              </p>
              {d.detail && (
                <p className="mt-0.5 text-sm text-slate-600">
                  <bdi>{d.detail}</bdi>
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {t(`actor.${e.actor_type}`)} · <time dateTime={e.created_at}>{formatWhen(e.created_at, locale)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
