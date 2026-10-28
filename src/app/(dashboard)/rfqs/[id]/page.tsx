import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RfqStatusBadge } from "@/components/rfq-status-badge";
import {
  CopyLinkButton,
  SendRfqButton,
} from "@/components/rfq-detail-actions";
import { QuoteUploadDialog } from "@/components/quote-upload-dialog";
import { ManualQuoteDialog } from "@/components/manual-quote-dialog";
import { QuoteRowActions } from "@/components/quote-row-actions";
import { ApproveAwardButton } from "@/components/approve-award-button";
import { AuditTimeline, type TimelineEvent } from "@/components/rfq/audit-timeline";
import { FadeIn } from "@/components/motion";
import { formatDate, formatMoney } from "@/lib/format";
import type { Quote, QuoteItem, Rfq, RfqAward, RfqItem, RfqSupplier } from "@/lib/types";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";

// Quote saves record a durable recommendation job and start it in the
// background with waitUntil (src/lib/jobs/schedule.ts), which runs within
// this function's time budget — give it room for a Gemini call.
export const maxDuration = 60;

const SUPPLIER_STATUS: Record<
  RfqSupplier["status"],
  { bg: string; text: string; dot: string }
> = {
  pending: {
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
  sent: {
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
  },
  viewed: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  submitted: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  declined: {
    bg: "bg-red-50",
    text: "text-red-600",
    dot: "bg-red-500",
  },
};

export default async function RfqDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const t = await getTranslations("rfqDetail");
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const [{ data }, { data: awardData }, { data: auditData }] = await Promise.all([
    supabase
      .from("rfqs")
      .select("*, rfq_items(*), rfq_suppliers(*), quotes(*, quote_items(*))")
      .eq("id", params.id)
      .single(),
    supabase.from("rfq_awards").select("*").eq("rfq_id", params.id).maybeSingle(),
    // Decision history (RLS: the buyer's own events only).
    supabase
      .from("audit_events")
      .select("id, event_type, actor_type, payload, created_at")
      .eq("rfq_id", params.id)
      // Newest 200 (so a long trail keeps the award), shown oldest first below.
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200),
  ]);

  if (!data) notFound();

  const rfq = data as Rfq & {
    rfq_items: RfqItem[];
    rfq_suppliers: RfqSupplier[];
    quotes: (Quote & { quote_items: QuoteItem[] })[];
  };
  const items = [...rfq.rfq_items].sort((a, b) => a.position - b.position);
  const suppliers = rfq.rfq_suppliers;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const suppliersById = new Map(suppliers.map((s) => [s.id, s]));
  const award = awardData as RfqAward | null;
  const awardRecommendedSupplier = award?.recommended_supplier_id
    ? suppliersById.get(award.recommended_supplier_id)
    : undefined;
  const awardRecommendedLabel = awardRecommendedSupplier
    ? awardRecommendedSupplier.company_name || awardRecommendedSupplier.email
    : null;
  const quotes = rfq.quotes.filter((q) => q.status !== "rejected");
  const quotedSupplierIds = new Set(quotes.map((q) => q.supplier_id));
  const uploadableSuppliers = suppliers
    .filter((s) => !quotedSupplierIds.has(s.id))
    .map((s) => ({ id: s.id, label: s.company_name || s.email }));
  const comparableCount = quotes.filter(
    (q) => q.status === "submitted" || q.status === "confirmed"
  ).length;

  function quoteTotal(quote: Quote & { quote_items: QuoteItem[] }) {
    const priced = quote.quote_items.filter((qi) => qi.total_price !== null);
    if (priced.length === 0) return null;
    return (
      Math.round(
        priced.reduce((s, qi) => s + Number(qi.total_price), 0) * 100
      ) / 100
    );
  }

  // For the "choose different supplier" picker on the approve button —
  // every submitted/confirmed quote is a valid award target, not just the
  // AI's pick.
  const approvableQuotes = quotes
    .filter((q) => q.status === "submitted" || q.status === "confirmed")
    .map((q) => {
      const supplier = suppliersById.get(q.supplier_id);
      return {
        quoteId: q.id,
        label: supplier?.company_name || supplier?.email || t("unknownSupplier"),
        total: quoteTotal(q),
        deliveryDays: q.delivery_days,
      };
    });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <FadeIn className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href="/rfqs"
            className="-ms-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            <ArrowLeft size={13} className="rtl:rotate-180" aria-hidden="true" />
            {t("back")}
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-400">
              RFQ-{rfq.id.slice(0, 4).toUpperCase()}
            </span>
            <RfqStatusBadge status={rfq.status} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            <bdi>{rfq.title}</bdi>
          </h1>
          <p className="text-sm text-slate-500">
            {rfq.project ? <><bdi>{rfq.project}</bdi>{" · "}</> : null}
            {t("meta", { date: formatDate(rfq.deadline, locale), currency: rfq.currency })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {comparableCount > 0 && (
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/rfqs/${rfq.id}/compare`}>
                <Scale size={15} aria-hidden="true" />
                {t("compare")}
              </Link>
            </Button>
          )}
          {rfq.status === "draft" && <SendRfqButton rfqId={rfq.id} />}
        </div>
      </FadeIn>

      {award && award.decision === "auto_approved" && awardRecommendedLabel && (
        <FadeIn delay={0.01}>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            <span>
              <strong>{t("autoApproved")}</strong> {t("poSent", { supplier: awardRecommendedLabel, date: formatDate(award.po_sent_at, locale) })}
            </span>
          </div>
        </FadeIn>
      )}

      {award &&
        award.decision !== "auto_approved" &&
        award.po_sent_at &&
        awardRecommendedLabel && (
          <FadeIn delay={0.01}>
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
              <span>
                <strong>{t("approved")}</strong> {t("poSent", { supplier: awardRecommendedLabel, date: formatDate(award.po_sent_at, locale) })}
              </span>
            </div>
          </FadeIn>
        )}

      {award && award.decision !== "auto_approved" && !award.po_sent_at && (
        <FadeIn delay={0.01}>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0 text-amber-600" />
              <span>
                <strong>{t("reviewNeeded")}</strong> <span dir="auto">{award.reason}</span>.{" "}
                <Link
                  href={`/rfqs/${rfq.id}/compare`}
                  className="underline underline-offset-2"
                >
                  {t("viewComparison")}
                </Link>
              </span>
            </span>
            {awardRecommendedLabel && (
              <ApproveAwardButton
                recommendedQuoteId={award?.recommended_quote_id ?? null}
                rfqId={rfq.id}
                supplierLabel={awardRecommendedLabel}
                quotes={approvableQuotes}
                currency={rfq.currency}
              />
            )}
          </div>
        </FadeIn>
      )}

      {rfq.description && (
        <FadeIn delay={0.02}>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed text-slate-600" dir="auto">
              {rfq.description}
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={0.05}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t("lineItems", { count: items.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="w-12 text-xs font-semibold text-slate-500">
                      #
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">{t("item")}</TableHead>
                    <TableHead className="text-end text-xs font-semibold text-slate-500">{t("quantity")}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">{t("unit")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={item.id} className="border-slate-100">
                      <TableCell className="text-slate-400">{i + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium">
                          <bdi>{item.name}</bdi>
                        </p>
                        {item.description && (
                          <p className="text-xs text-slate-400">
                            {item.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {item.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.08}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {t("suppliers", { count: suppliers.length })}
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              {t("suppliersHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold text-slate-500">{t("email")}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">{t("status")}</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">{t("invited")}</TableHead>
                    <TableHead className="text-end text-xs font-semibold text-slate-500">{t("quoteLink")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => {
                    const st = SUPPLIER_STATUS[supplier.status];
                    return (
                      <TableRow key={supplier.id} className="border-slate-100">
                        <TableCell className="font-medium">
                          {supplier.email}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${st.dot}`}
                            />
                            {t(`inviteStatus.${supplier.status}`)}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {formatDate(supplier.invited_at, locale)}
                        </TableCell>
                        <TableCell className="text-end">
                          <CopyLinkButton
                            url={`${appUrl}/quote/${supplier.token}`}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.11}>
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div className="space-y-1.5">
              <CardTitle className="text-sm font-semibold">
                {t("quotes", { count: quotes.length })}
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {t("quotesHint")}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <ManualQuoteDialog
                rfqId={rfq.id}
                currency={rfq.currency}
                items={items.map((i) => ({
                  id: i.id,
                  name: i.name,
                  quantity: Number(i.quantity),
                  unit: i.unit,
                }))}
                suppliers={uploadableSuppliers}
              />
              <QuoteUploadDialog rfqId={rfq.id} suppliers={uploadableSuppliers} />
            </div>
          </CardHeader>
          <CardContent>
            {quotes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                {t("noQuotes")}
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-xs font-semibold text-slate-500">{t("supplier")}</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">{t("source")}</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">{t("received")}</TableHead>
                      <TableHead className="text-end text-xs font-semibold text-slate-500">{t("totalExVat")}</TableHead>
                      <TableHead className="text-end text-xs font-semibold text-slate-500">{t("status")}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((quote) => {
                      const supplier = suppliersById.get(quote.supplier_id);
                      const supplierLabel =
                        supplier?.company_name || supplier?.email || t("thisSupplier");
                      const total = quoteTotal(quote);
                      return (
                        <TableRow key={quote.id} className="border-slate-100">
                          <TableCell className="font-medium">
                            <bdi>{supplier?.company_name || supplier?.email || "—"}</bdi>
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                              {quote.source === "pdf" && <FileText size={12} />}
                              {quote.source === "pdf" ? t("sourcePdf") : quote.source === "manual" ? t("sourceManual") : t("sourceForm")}
                            </span>
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {formatDate(quote.submitted_at, locale)}
                          </TableCell>
                          <TableCell className="text-end font-semibold">
                            {total === null
                              ? "—"
                              : formatMoney(total, rfq.currency, locale)}
                          </TableCell>
                          <TableCell className="text-end">
                            {quote.status === "needs_review" ? (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5 border-amber-200 bg-amber-50 text-xs text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                              >
                                <Link href={`/rfqs/${rfq.id}/quotes/${quote.id}`}>
                                  {t("reviewExtraction")}
                                </Link>
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {quote.status === "confirmed" ? t("confirmed") : t("submitted")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            <QuoteRowActions
                              quoteId={quote.id}
                              supplierLabel={supplierLabel}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("history")}</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {t("historyHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuditTimeline events={((auditData ?? []) as TimelineEvent[]).slice().reverse()} />
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
