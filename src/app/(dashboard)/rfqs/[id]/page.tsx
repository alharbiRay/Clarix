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
import { FadeIn } from "@/components/motion";
import { formatDate, formatMoney } from "@/lib/format";
import type { Quote, QuoteItem, Rfq, RfqAward, RfqItem, RfqSupplier } from "@/lib/types";

const SUPPLIER_STATUS: Record<
  RfqSupplier["status"],
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: {
    label: "Not invited",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
  sent: {
    label: "Invited",
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
  },
  viewed: {
    label: "Viewed",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  submitted: {
    label: "Quote received",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  declined: {
    label: "Declined",
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

  const [{ data }, { data: awardData }] = await Promise.all([
    supabase
      .from("rfqs")
      .select("*, rfq_items(*), rfq_suppliers(*), quotes(*, quote_items(*))")
      .eq("id", params.id)
      .single(),
    supabase.from("rfq_awards").select("*").eq("rfq_id", params.id).maybeSingle(),
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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <FadeIn className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href="/rfqs"
            className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            <ArrowLeft size={13} />
            All RFQs
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-400">
              RFQ-{rfq.id.slice(0, 4).toUpperCase()}
            </span>
            <RfqStatusBadge status={rfq.status} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{rfq.title}</h1>
          <p className="text-sm text-slate-500">
            {rfq.project ? `${rfq.project} · ` : ""}
            Deadline {formatDate(rfq.deadline)} · {rfq.currency}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {comparableCount > 0 && (
            <Button asChild variant="outline" className="gap-2">
              <Link href={`/rfqs/${rfq.id}/compare`}>
                <Scale size={15} />
                Compare quotes
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
              <strong>Auto-approved:</strong> {awardRecommendedLabel} — PO sent{" "}
              {formatDate(award.po_sent_at)}.
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
                <strong>Approved:</strong> {awardRecommendedLabel} — PO sent{" "}
                {formatDate(award.po_sent_at)}.
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
                <strong>Review needed:</strong> {award.reason}.{" "}
                <Link
                  href={`/rfqs/${rfq.id}/compare`}
                  className="underline underline-offset-2"
                >
                  View comparison
                </Link>
              </span>
            </span>
            {awardRecommendedLabel && (
              <ApproveAwardButton
                rfqId={rfq.id}
                supplierLabel={awardRecommendedLabel}
              />
            )}
          </div>
        </FadeIn>
      )}

      {rfq.description && (
        <FadeIn delay={0.02}>
          <Card>
            <CardContent className="pt-6 text-sm leading-relaxed text-slate-600">
              {rfq.description}
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <FadeIn delay={0.05}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Line items ({items.length})
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
                    <TableHead className="text-xs font-semibold text-slate-500">
                      Item
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold text-slate-500">
                      Quantity
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">
                      Unit
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={item.id} className="border-slate-100">
                      <TableCell className="text-slate-400">{i + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium">{item.name}</p>
                        {item.description && (
                          <p className="text-xs text-slate-400">
                            {item.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
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
              Suppliers ({suppliers.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Each supplier has a unique quote-form link. Invitations are
              emailed automatically when the RFQ is sent — copy a link below
              if you need to share one manually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableHead className="text-xs font-semibold text-slate-500">
                      Email
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">
                      Status
                    </TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500">
                      Invited
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold text-slate-500">
                      Quote link
                    </TableHead>
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
                            {st.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {formatDate(supplier.invited_at)}
                        </TableCell>
                        <TableCell className="text-right">
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
                Quotes ({quotes.length})
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Form submissions arrive automatically. PDF quotes are
                extracted and confirmed by AI automatically — no review
                needed.
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
                No quotes yet. Share the quote links above, or upload a PDF a
                supplier emailed you.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-xs font-semibold text-slate-500">
                        Supplier
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">
                        Source
                      </TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">
                        Received
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-500">
                        Total
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-500">
                        Status
                      </TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotes.map((quote) => {
                      const supplier = suppliersById.get(quote.supplier_id);
                      const supplierLabel =
                        supplier?.company_name || supplier?.email || "This supplier";
                      const total = quoteTotal(quote);
                      return (
                        <TableRow key={quote.id} className="border-slate-100">
                          <TableCell className="font-medium">
                            {supplier?.company_name || supplier?.email || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                              {quote.source === "pdf" && <FileText size={12} />}
                              {quote.source === "pdf"
                                ? "PDF upload"
                                : quote.source === "manual"
                                  ? "Manual entry"
                                  : "Form"}
                            </span>
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {formatDate(quote.submitted_at)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {total === null
                              ? "—"
                              : formatMoney(total, rfq.currency)}
                          </TableCell>
                          <TableCell className="text-right">
                            {quote.status === "needs_review" ? (
                              <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1.5 border-amber-200 bg-amber-50 text-xs text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                              >
                                <Link href={`/rfqs/${rfq.id}/quotes/${quote.id}`}>
                                  Review extraction
                                </Link>
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {quote.status === "confirmed"
                                  ? "Confirmed"
                                  : "Submitted"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
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
    </div>
  );
}
