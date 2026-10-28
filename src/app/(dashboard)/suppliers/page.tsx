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
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";

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
  const t = await getTranslations("suppliers");
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
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
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("subtitle")}
          </p>
        </div>
        <AddSupplierDialog />
      </FadeIn>

      <FadeIn delay={0.03} className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <nav aria-label={t("sortLabel")} className="flex items-center gap-1">
          <span className="me-1 text-xs font-medium text-slate-500">{t("sort")}</span>
          <Chip href={hrefFor(params, { sort: "score" })} active={params.sort === "score"}>{t("sortScore")}</Chip>
          <Chip href={hrefFor(params, { sort: "name" })} active={params.sort === "name"}>{t("sortName")}</Chip>
          <Chip href={hrefFor(params, { sort: "recent" })} active={params.sort === "recent"}>{t("sortRecent")}</Chip>
        </nav>
        <nav aria-label={t("filterLabel")} className="flex items-center gap-1">
          <span className="me-1 text-xs font-medium text-slate-500">{t("score")}</span>
          <Chip href={hrefFor(params, { min: null })} active={params.min === null}>{t("any")}</Chip>
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
                <th scope="col" className="px-6 py-3 font-medium">{t("colSupplier")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("score")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("colQuoted")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("colWinRate")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("colMedianReply")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("colPriceVsLowest")}</th>
                <th scope="col" className="px-3 py-3 font-medium">{t("colLastActive")}</th>
                <th scope="col" className="px-6 py-3"><span className="sr-only">{t("colActions")}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-sm text-slate-500">
                    {suppliers.length === 0
                      ? t("empty")
                      : t("noneAbove", { min: params.min ?? 0 })}
                  </td>
                </tr>
              ) : (
                rows.map(({ id, label, score, supplier, metrics }) => (
                  <tr key={id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-6 py-3">
                      <Link href={`/suppliers/${id}`} className="font-semibold text-slate-900 underline-offset-4 hover:underline">
                        <bdi>{label}</bdi>
                      </Link>
                      <p className="text-xs text-slate-500" dir="ltr">{supplier.email}</p>
                    </td>
                    <td className="px-3 py-3"><ScoreBadge score={score} /></td>
                    <td className="px-3 py-3 tabular text-slate-700">
                      {metrics.quoted}
                      <span className="text-slate-500"> / {metrics.invited}</span>
                    </td>
                    <td className="px-3 py-3 tabular text-slate-700">{formatPct(metrics.winRate)}</td>
                    <td className="px-3 py-3 tabular text-slate-700">{formatHours(metrics.medianResponseHours, locale)}</td>
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
                    <td className="px-3 py-3 text-slate-500">{formatDate(metrics.lastActive, locale)}</td>
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
