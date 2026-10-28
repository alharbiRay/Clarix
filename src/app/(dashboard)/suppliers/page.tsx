import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadMetricsRfqs } from "@/lib/metrics/load";
import { scoreSuppliers } from "@/lib/scorecard";
import {
  SCORE_FILTERS,
  parseSupplierListParams,
  sortAndFilterSuppliers,
  type SupplierListParams,
} from "@/lib/scorecard/list";
import { formatDate } from "@/lib/format";
import { formatHours, formatPct } from "@/lib/metrics/format";
import { FadeIn } from "@/components/motion";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { InviteToRfqDialog } from "@/components/suppliers/invite-to-rfq-dialog";
import { ScoreBadge } from "@/components/suppliers/score-badge";
import { cn } from "@/lib/utils";
import type { Supplier } from "@/lib/types";

function hrefFor(current: SupplierListParams, patch: Partial<SupplierListParams>) {
  const next = { ...current, ...patch };
  const q = new URLSearchParams();
  if (next.sort !== "score") q.set("sort", next.sort);
  if (next.min !== null) q.set("min", String(next.min));
  const s = q.toString();
  return s ? `/suppliers?${s}` : "/suppliers";
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      {children}
    </Link>
  );
}

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: { sort?: string; min?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = parseSupplierListParams(searchParams);

  const [{ data: suppliersData, error: suppliersError }, { data: openRfqsData }, rfqs] = await Promise.all([
    supabase.from("suppliers").select("*").eq("buyer_id", user.id),
    supabase
      .from("rfqs")
      .select("id, title, status")
      .eq("buyer_id", user.id)
      .in("status", ["draft", "sent"])
      .order("created_at", { ascending: false }),
    loadMetricsRfqs(supabase, user.id),
  ]);
  if (suppliersError) throw new Error(`suppliers: ${suppliersError.message}`);

  const suppliers = (suppliersData ?? []) as Supplier[];
  const openRfqs = openRfqsData ?? [];
  const scores = scoreSuppliers(rfqs, suppliers.map((s) => ({ id: s.id, email: s.email })));

  const rows = sortAndFilterSuppliers(
    suppliers.map((s) => {
      const { metrics, card } = scores.get(s.id)!;
      return { id: s.id, label: s.company_name || s.email, score: card?.score ?? null, lastActive: metrics.lastActive, supplier: s, metrics };
    }),
    params
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <FadeIn className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Scored 0–100 on price, responsiveness, delivery, warranty and win rate across every RFQ.
          </p>
        </div>
        <AddSupplierDialog />
      </FadeIn>

      <FadeIn delay={0.03} className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <nav aria-label="Sort suppliers" className="flex items-center gap-1">
          <span className="me-1 text-xs font-medium text-slate-500">Sort</span>
          <Chip href={hrefFor(params, { sort: "score" })} active={params.sort === "score"}>Score</Chip>
          <Chip href={hrefFor(params, { sort: "name" })} active={params.sort === "name"}>Name</Chip>
          <Chip href={hrefFor(params, { sort: "recent" })} active={params.sort === "recent"}>Recent</Chip>
        </nav>
        <nav aria-label="Filter by minimum score" className="flex items-center gap-1">
          <span className="me-1 text-xs font-medium text-slate-500">Score</span>
          <Chip href={hrefFor(params, { min: null })} active={params.min === null}>Any</Chip>
          {SCORE_FILTERS.map((m) => (
            <Chip key={m} href={hrefFor(params, { min: m })} active={params.min === m}>
              {m}+
            </Chip>
          ))}
        </nav>
      </FadeIn>

      <FadeIn delay={0.05} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-start text-xs text-slate-500">
                <th scope="col" className="px-6 py-3 font-medium">Supplier</th>
                <th scope="col" className="px-3 py-3 font-medium">Score</th>
                <th scope="col" className="px-3 py-3 font-medium">Quoted</th>
                <th scope="col" className="px-3 py-3 font-medium">Win rate</th>
                <th scope="col" className="px-3 py-3 font-medium">Median reply</th>
                <th scope="col" className="px-3 py-3 font-medium">Price vs lowest</th>
                <th scope="col" className="px-3 py-3 font-medium">Last active</th>
                <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-500">
                    {suppliers.length === 0
                      ? "No suppliers yet. They're saved automatically the first time they quote, or add one above."
                      : `No supplier scores ${params.min}+ yet.`}
                  </td>
                </tr>
              ) : (
                rows.map(({ id, label, score, supplier, metrics }) => (
                  <tr key={id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-6 py-3">
                      <Link href={`/suppliers/${id}`} className="font-semibold text-slate-900 underline-offset-4 hover:underline">
                        <bdi>{label}</bdi>
                      </Link>
                      <p className="text-xs text-slate-500">{supplier.email}</p>
                    </td>
                    <td className="px-3 py-3"><ScoreBadge score={score} /></td>
                    <td className="px-3 py-3 tabular text-slate-700">
                      {metrics.quoted}
                      <span className="text-slate-500"> / {metrics.invited}</span>
                    </td>
                    <td className="px-3 py-3 tabular text-slate-700">{formatPct(metrics.winRate)}</td>
                    <td className="px-3 py-3 tabular text-slate-700">{formatHours(metrics.medianResponseHours)}</td>
                    <td
                      className={cn(
                        "px-3 py-3 tabular font-medium",
                        metrics.avgPriceVsLowest === null
                          ? "text-slate-500"
                          : metrics.avgPriceVsLowest <= 0.03
                            ? "text-emerald-700"
                            : metrics.avgPriceVsLowest >= 0.1
                              ? "text-amber-700"
                              : "text-slate-700"
                      )}
                    >
                      {metrics.avgPriceVsLowest === null ? "—" : `+${formatPct(metrics.avgPriceVsLowest)}`}
                    </td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(metrics.lastActive)}</td>
                    <td className="px-6 py-3 text-end">
                      <InviteToRfqDialog supplierId={id} supplierLabel={label} rfqs={openRfqs} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </FadeIn>
    </div>
  );
}
