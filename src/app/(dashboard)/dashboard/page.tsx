import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/motion";
import { StatCards, type StatCard } from "@/components/dashboard/stat-cards";
import {
  DashboardCharts,
  type MonthPoint,
} from "@/components/dashboard/charts";
import {
  RfqActivity,
  type ActivityRow,
} from "@/components/dashboard/rfq-activity";

interface RfqRow {
  id: string;
  title: string;
  project: string | null;
  currency: string;
  deadline: string | null;
  status: "draft" | "sent" | "closed" | "awarded";
  created_at: string;
  rfq_suppliers: { id: string; created_at: string }[];
  quotes: {
    id: string;
    status: string;
    submitted_at: string;
    quote_items: { total_price: number | null }[];
  }[];
}

const DAY = 86_400_000;

function weeklyDelta(count: number) {
  return count > 0 ? `+${count} this week` : null;
}

export default async function DashboardPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("rfqs")
    .select(
      "id,title,project,currency,deadline,status,created_at," +
        "rfq_suppliers(id,created_at)," +
        "quotes(id,status,submitted_at,quote_items(total_price))"
    )
    .order("created_at", { ascending: false });

  const rfqs = (data ?? []) as unknown as RfqRow[];
  const now = Date.now();
  const weekAgo = now - 7 * DAY;

  const allQuotes = rfqs.flatMap((r) => r.quotes);
  const allSuppliers = rfqs.flatMap((r) => r.rfq_suppliers);
  const activeRfqs = rfqs.filter(
    (r) => r.status === "draft" || r.status === "sent"
  );
  const needsReview = allQuotes.filter((q) => q.status === "needs_review");

  const stats: StatCard[] = [
    {
      key: "rfqs",
      label: "Active RFQs",
      value: String(activeRfqs.length),
      delta: weeklyDelta(
        rfqs.filter((r) => new Date(r.created_at).getTime() > weekAgo).length
      ),
    },
    {
      key: "quotes",
      label: "Quotes received",
      value: String(allQuotes.length),
      delta: weeklyDelta(
        allQuotes.filter((q) => new Date(q.submitted_at).getTime() > weekAgo)
          .length
      ),
    },
    {
      key: "review",
      label: "Awaiting your review",
      value: String(needsReview.length),
      delta: weeklyDelta(
        needsReview.filter(
          (q) => new Date(q.submitted_at).getTime() > weekAgo
        ).length
      ),
    },
    {
      key: "suppliers",
      label: "Suppliers invited",
      value: String(allSuppliers.length),
      delta: weeklyDelta(
        allSuppliers.filter(
          (s) => new Date(s.created_at).getTime() > weekAgo
        ).length
      ),
    },
  ];

  // Last 7 calendar months of quote activity
  const months: MonthPoint[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    const inMonth = allQuotes.filter((q) => {
      const t = new Date(q.submitted_at);
      return (
        t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth()
      );
    });
    months.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      quoted: inMonth.reduce(
        (sum, q) =>
          sum +
          q.quote_items.reduce((s, item) => s + (item.total_price ?? 0), 0),
        0
      ),
      quotes: inMonth.length,
    });
  }

  const rows: ActivityRow[] = rfqs.slice(0, 6).map((r) => {
    const supplierCount = r.rfq_suppliers.length;
    const repliedCount = r.quotes.length;
    const status: ActivityRow["status"] =
      r.status === "draft"
        ? "draft"
        : r.status === "sent"
          ? supplierCount > 0 && repliedCount >= supplierCount
            ? "ready"
            : "waiting"
          : "closed";
    return {
      id: r.id,
      code: `RFQ-${r.id.slice(0, 4).toUpperCase()}`,
      title: r.title,
      project: r.project,
      status,
      daysLeft: r.deadline
        ? Math.ceil((new Date(r.deadline).getTime() - now) / DAY)
        : null,
      repliedCount,
      supplierCount,
    };
  });

  const currency = rfqs[0]?.currency ?? "USD";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-7">
      <FadeIn>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {today} — here&apos;s your procurement overview.
        </p>
      </FadeIn>

      <StatCards stats={stats} />
      <DashboardCharts data={months} currency={currency} />
      <RfqActivity rows={rows} />
    </div>
  );
}
