import Link from "next/link";
import { Plus, SearchX } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ilikeAnyFilter } from "@/lib/postgrest";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RfqStatusBadge } from "@/components/rfq-status-badge";
import { FadeIn } from "@/components/motion";
import { formatDate } from "@/lib/format";
import type { Rfq } from "@/lib/types";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";

export default async function RfqsPage({
  searchParams,
}: {
  searchParams: { q?: string | string[] };
}) {
  const supabase = createClient();
  const t = await getTranslations("rfqs");
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : undefined;

  let query = supabase
    .from("rfqs")
    .select("*, rfq_items(count), rfq_suppliers(count), quotes(count)")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(ilikeAnyFilter(["title", "project"], q));
  }

  const { data } = await query;

  const rfqs = (data ?? []) as (Rfq & {
    rfq_items: { count: number }[];
    rfq_suppliers: { count: number }[];
    quotes: { count: number }[];
  })[];

  return (
    <div className="space-y-7">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {q ? t("results", { q, count: rfqs.length }) : t("subtitle")}
          </p>
        </div>
        <Link
          href="/rfqs/new"
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <Plus size={16} aria-hidden="true" /> {t("newRfq")}
        </Link>
      </FadeIn>

      <FadeIn
        delay={0.03}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {(["colTitle", "colProject", "colItems", "colSuppliers", "colQuotes", "colDeadline", "colStatus"] as const).map(
                (h) => (
                  <TableHead
                    key={h}
                    className="px-6 text-xs font-semibold text-slate-500"
                  >
                    {t(h)}
                  </TableHead>
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rfqs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-36 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    {q && <SearchX size={20} />}
                    <span className="text-sm">
                      {q ? t("noMatch") : t("empty")}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rfqs.map((rfq) => (
                <TableRow key={rfq.id} className="border-slate-100">
                  <TableCell className="px-6 font-semibold">
                    <Link
                      href={`/rfqs/${rfq.id}`}
                      className="hover:underline underline-offset-4"
                    >
                      <bdi>{rfq.title}</bdi>
                    </Link>
                  </TableCell>
                  <TableCell className="px-6 text-slate-500">
                    {rfq.project ? <bdi>{rfq.project}</bdi> : "—"}
                  </TableCell>
                  <TableCell className="px-6">
                    {rfq.rfq_items[0]?.count ?? 0}
                  </TableCell>
                  <TableCell className="px-6">
                    {rfq.rfq_suppliers[0]?.count ?? 0}
                  </TableCell>
                  <TableCell className="px-6">
                    {rfq.quotes[0]?.count ?? 0}
                  </TableCell>
                  <TableCell className="px-6 text-slate-500">
                    {formatDate(rfq.deadline, locale)}
                  </TableCell>
                  <TableCell className="px-6">
                    <RfqStatusBadge status={rfq.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </FadeIn>
    </div>
  );
}
