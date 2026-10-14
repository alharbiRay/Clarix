import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/motion";
import { RfqActivity, type ActivityRow } from "@/components/dashboard/rfq-activity";
import { NotificationBanner } from "@/components/dashboard/notification-banner";
import { SavingsPanel } from "@/components/dashboard/savings-panel";
import {
  OpsStrip,
  ReviewQueue,
  SupplierSpendPanel,
  TopSavingsTable,
} from "@/components/dashboard/metric-panels";
import {
  computeKpis,
  pendingExtractions,
  reviewQueue,
  savingsSeries,
  spendBySupplier,
  topSavings,
} from "@/lib/metrics";
import { loadMetricsRfqs } from "@/lib/metrics/load";

interface ActivityRfqRow {
  id: string;
  title: string;
  project: string | null;
  deadline: string | null;
  status: "draft" | "sent" | "closed" | "awarded";
  rfq_suppliers: { id: string }[];
  quotes: { id: string }[];
}

const DAY = 86_400_000;

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Independent reads, all RLS-scoped to this buyer (plus explicit buyer_id).
  const [notificationsResult, metricsRfqs, activityResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, rfq_id, type, message")
      .eq("buyer_id", user.id)
      .is("read_at", null)
      .order("created_at", { ascending: false }),
    loadMetricsRfqs(supabase, user.id),
    supabase
      .from("rfqs")
      .select("id, title, project, deadline, status, rfq_suppliers(id), quotes(id)")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  // A failed read must surface as the error state, not as an empty dashboard.
  if (notificationsResult.error) throw new Error(`notifications: ${notificationsResult.error.message}`);
  if (activityResult.error) throw new Error(`recent RFQs: ${activityResult.error.message}`);

  const now = new Date();
  const kpis = computeKpis(metricsRfqs, now);
  const series = savingsSeries(metricsRfqs, now, 6, kpis.currency);
  const queue = reviewQueue(metricsRfqs);
  const extractions = pendingExtractions(metricsRfqs);
  const spend = spendBySupplier(metricsRfqs, kpis.currency);
  const top = topSavings(metricsRfqs, 5, kpis.currency);
  const hasAwards = metricsRfqs.some((r) => r.award?.po_sent_at);

  const rows: ActivityRow[] = ((activityResult.data ?? []) as unknown as ActivityRfqRow[]).map((r) => {
    const supplierCount = r.rfq_suppliers.length;
    const repliedCount = r.quotes.length;
    return {
      id: r.id,
      code: `RFQ-${r.id.slice(0, 4).toUpperCase()}`,
      title: r.title,
      project: r.project,
      status:
        r.status === "draft"
          ? "draft"
          : r.status === "sent"
            ? supplierCount > 0 && repliedCount >= supplierCount
              ? "ready"
              : "waiting"
            : "closed",
      daysLeft: r.deadline ? Math.ceil((new Date(r.deadline).getTime() - now.getTime()) / DAY) : null,
      repliedCount,
      supplierCount,
    };
  });

  const today = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Riyadh",
  });
  const unread = notificationsResult.data ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">{today} — what your procurement saved, and what needs you.</p>
      </FadeIn>

      {unread.length > 0 && (
        <FadeIn>
          <NotificationBanner notifications={unread} />
        </FadeIn>
      )}

      <FadeIn delay={0.03}>
        <SavingsPanel
          currency={kpis.currency}
          savingsThisMonth={kpis.savingsThisMonth}
          savingsLastMonth={kpis.savingsLastMonth}
          savingsChange={kpis.savingsChange}
          savingsPctThisMonth={kpis.savingsPctThisMonth}
          excludedOtherCurrency={kpis.excludedOtherCurrency}
          series={series}
          hasAwards={hasAwards}
        />
      </FadeIn>

      <FadeIn delay={0.06}>
        <OpsStrip kpis={kpis} />
      </FadeIn>

      <FadeIn delay={0.09} className="grid gap-6 lg:grid-cols-2">
        <ReviewQueue items={queue} extractions={extractions} />
        <SupplierSpendPanel rows={spend} currency={kpis.currency} />
      </FadeIn>

      <FadeIn delay={0.12}>
        <TopSavingsTable rows={top} />
      </FadeIn>

      <RfqActivity rows={rows} />
    </div>
  );
}
