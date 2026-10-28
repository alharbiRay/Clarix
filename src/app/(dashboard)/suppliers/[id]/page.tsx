import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadMetricsRfqs, rfqIdsForSuppliers } from "@/lib/metrics/load";
import { describeSupplier, scoreSupplier, scoreTrend, supplierMetrics } from "@/lib/scorecard";
import { formatHours, formatMonthLabel, formatPct } from "@/lib/metrics/format";
import { ScoreRing } from "@/components/suppliers/score-ring";
import { ScoreBreakdown, ScoreTrend, StrengthsWeaknesses } from "@/components/suppliers/scorecard-panels";
import { computeQuoteTotal } from "@/lib/quote-comparison";
import { formatDate, formatMoney } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import {
  SupplierPerformanceChart,
  type SupplierMonthPoint,
} from "@/components/suppliers/performance-chart";
import { SupplierNotes } from "@/components/suppliers/supplier-notes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Quote, QuoteItem, RfqItem, Supplier } from "@/lib/types";

interface RfqSupplierRow {
  id: string;
  rfq_id: string;
  rfqs: { id: string; title: string; currency: string; rfq_items: RfqItem[] } | null;
  quotes: (Quote & { quote_items: QuoteItem[] })[];
}

export default async function SupplierDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data } = await supabase.from("suppliers").select("*").eq("id", params.id).eq("buyer_id", user.id).maybeSingle();
  if (!data) notFound();
  const supplier = data as Supplier;

  // Both only depend on supplier.id, not on each other — fetch concurrently.
  const [rfqs, { data: rfqSuppliersData }] = await Promise.all([
    rfqIdsForSuppliers(supabase, [{ id: supplier.id, email: supplier.email }]).then((ids) =>
      loadMetricsRfqs(supabase, user.id, { rfqIds: ids })
    ),
    supabase
      .from("rfq_suppliers")
      .select("id, rfq_id, rfqs(id, title, currency, rfq_items(*)), quotes(*, quote_items(*))")
      .eq("supplier_id", supplier.id),
  ]);

  const rfqSuppliers = (rfqSuppliersData ?? []) as unknown as RfqSupplierRow[];

  const historyRows = rfqSuppliers
    .flatMap((rs) =>
      rs.quotes.map((quote) => ({
        rfq: rs.rfqs,
        quote,
        total: rs.rfqs ? computeQuoteTotal(rs.rfqs.rfq_items, quote).total : null,
      }))
    )
    .sort(
      (a, b) => new Date(b.quote.submitted_at).getTime() - new Date(a.quote.submitted_at).getTime()
    );

  const currency = historyRows[0]?.rfq?.currency ?? "SAR";

  // Last 7 calendar months, same bucketing as the dashboard chart
  const monthLocale = await getLocale().then((l) => (isLocale(l) ? l : "en"));
  const months: SupplierMonthPoint[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    const inMonth = historyRows.filter((r) => {
      const t = new Date(r.quote.submitted_at);
      return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
    });
    months.push({
      month: formatMonthLabel(`${d.getFullYear()}-${d.getMonth() + 1}`, false, monthLocale),
      quotedTotal: inMonth.reduce((sum, r) => sum + (r.total ?? 0), 0),
      quotes: inMonth.length,
    });
  }

    const t = await getTranslations("suppliers");
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const label = supplier.company_name || supplier.email;
  const ref = { id: supplier.id, email: supplier.email };
  const metrics = supplierMetrics(rfqs, ref);
  const card = scoreSupplier(metrics);
  const trend = scoreTrend(rfqs, ref, new Date(), 6);
  const { strengths, weaknesses } = describeSupplier(metrics, card, locale);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <FadeIn>
        <Link
          href="/suppliers"
          className="-ms-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          <ArrowLeft size={13} className="rtl:rotate-180" aria-hidden="true" />
          {t("back")}
        </Link>
        <div className="mt-1.5 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">
              <bdi>{label}</bdi>
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} aria-hidden="true" /> <span dir="ltr">{supplier.email}</span>
              </span>
              {supplier.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={13} aria-hidden="true" /> <span dir="ltr">{supplier.phone}</span>
                </span>
              )}
              {supplier.contact_name && <span>{t("contact", { name: supplier.contact_name })}</span>}
            </div>
          </div>
        </div>
      </FadeIn>

      <FadeIn delay={0.03}>
        <section
          aria-labelledby="scorecard-heading"
          className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] lg:p-8"
        >
          <div className="flex flex-row items-center gap-5 lg:flex-col lg:items-start">
            <h2 id="scorecard-heading" className="sr-only">{t("scorecardHeading")}</h2>
            <ScoreRing score={card?.score ?? null} />
            <div>
              <p className="text-xs font-medium text-slate-500">{t("lastSix")}</p>
              <div className="mt-1">
                <ScoreTrend points={trend} />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t("howBuilt")}</h3>
            <div className="mt-4">
              <ScoreBreakdown card={card} />
            </div>
          </div>

          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {[
                { label: t("colQuoted"), value: t("quotedOf", { quoted: metrics.quoted, invited: metrics.invited }) },
                { label: t("colWinRate"), value: formatPct(metrics.winRate) },
                { label: t("colMedianReply"), value: formatHours(metrics.medianResponseHours, locale) },
                {
                  label: t("colPriceVsLowest"),
                  value: metrics.avgPriceVsLowest === null ? "—" : `+${formatPct(metrics.avgPriceVsLowest)}`,
                },
                { label: t("warrantyOffered"), value: formatPct(metrics.warrantyRate) },
                {
                  label: t("deliveryVsTypical"),
                  value:
                    metrics.deliveryVsTypicalDays === null
                      ? "—"
                      : t("daysSigned", { sign: metrics.deliveryVsTypicalDays > 0 ? "+" : metrics.deliveryVsTypicalDays < 0 ? "−" : "", days: Math.abs(Math.round(metrics.deliveryVsTypicalDays * 10) / 10) }),
                },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="text-xs text-slate-500">{s.label}</dt>
                  <dd className="mt-0.5 font-semibold tabular text-slate-900">{s.value}</dd>
                </div>
              ))}
            </dl>
            <StrengthsWeaknesses strengths={strengths} weaknesses={weaknesses} />
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.05}>
        <SupplierPerformanceChart data={months} currency={currency} />
      </FadeIn>

      <FadeIn delay={0.07}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t("history", { count: historyRows.length })}
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t("historyHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                {t("noQuotes")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-xs font-semibold text-slate-500">{t("rfq")}</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">
                        {t("submitted")}
                      </TableHead>
                      <TableHead className="text-end text-xs font-semibold text-slate-500">
                        {t("totalExVat")}
                      </TableHead>
                      <TableHead className="text-end text-xs font-semibold text-slate-500">
                        {t("status")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.map(({ rfq, quote, total }) => (
                      <TableRow key={quote.id} className="border-slate-100">
                        <TableCell className="font-medium">
                          {rfq ? (
                            <Link
                              href={`/rfqs/${rfq.id}/compare`}
                              className="hover:underline underline-offset-4"
                            >
                              <bdi>{rfq.title}</bdi>
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {formatDate(quote.submitted_at, locale)}
                        </TableCell>
                        <TableCell className="text-end font-semibold">
                          {total === null || !rfq ? "—" : formatMoney(total, rfq.currency, locale)}
                        </TableCell>
                        <TableCell className="text-end">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
                            {t(`quoteStatus.${quote.status}`)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.09}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("notes")}</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t("notesHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupplierNotes supplierId={supplier.id} initialNotes={supplier.notes} />
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
