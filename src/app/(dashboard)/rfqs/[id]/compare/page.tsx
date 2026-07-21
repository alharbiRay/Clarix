import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  PenLine,
  Sparkles,
  Trophy,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/motion";
import {
  GenerateRecommendationButton,
  type InitialPreferences,
} from "@/components/generate-recommendation-button";
import { ManualQuoteDialog } from "@/components/manual-quote-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  describeWeights,
  recommendationContentSchema,
} from "@/lib/gemini";
import { computeQuoteTotal, findCheapestQuote } from "@/lib/quote-comparison";
import type { RfqAward } from "@/lib/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Quote, QuoteItem, Rfq, RfqItem, RfqSupplier } from "@/lib/types";

interface QuoteColumn {
  quote: Quote & { quote_items: QuoteItem[] };
  supplier: RfqSupplier;
  label: string;
  itemPrices: Map<string, { unit: number | null; total: number | null; notes: string | null }>;
  total: number | null;
  missingCount: number;
  pending: boolean;
}

export default async function ComparePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data } = await supabase
    .from("rfqs")
    .select("*, rfq_items(*), rfq_suppliers(*), quotes(*, quote_items(*))")
    .eq("id", params.id)
    .single();

  if (!data) notFound();

  const rfq = data as unknown as Rfq & {
    rfq_items: RfqItem[];
    rfq_suppliers: RfqSupplier[];
    quotes: (Quote & { quote_items: QuoteItem[] })[];
  };

  const items = [...rfq.rfq_items].sort((a, b) => a.position - b.position);
  const suppliersById = new Map(rfq.rfq_suppliers.map((s) => [s.id, s]));

  const pendingReview = rfq.quotes.filter((q) => q.status === "needs_review");
  const comparable = rfq.quotes.filter(
    (q) => q.status === "submitted" || q.status === "confirmed"
  );

  function buildColumn(
    quote: Quote & { quote_items: QuoteItem[] },
    pending: boolean
  ): QuoteColumn {
    const supplier = suppliersById.get(quote.supplier_id)!;
    const itemPrices = new Map(
      quote.quote_items.map((qi) => [
        qi.rfq_item_id,
        {
          unit: qi.unit_price == null ? null : Number(qi.unit_price),
          total: qi.total_price == null ? null : Number(qi.total_price),
          notes: qi.notes,
        },
      ])
    );
    const priced = items
      .map((i) => itemPrices.get(i.id)?.total ?? null)
      .filter((t): t is number => t !== null);
    return {
      quote,
      supplier,
      label: supplier.company_name || supplier.email,
      itemPrices,
      total:
        priced.length === 0
          ? null
          : Math.round(priced.reduce((s, t) => s + t, 0) * 100) / 100,
      missingCount: items.length - priced.length,
      pending,
    };
  }

  // Confirmed/submitted quotes first (sorted by price), pending PDF
  // extractions trail at the end — they show up as soon as they arrive, but
  // aren't ranked against verified numbers yet.
  const columns: QuoteColumn[] = [
    ...comparable
      .map((q) => buildColumn(q, false))
      .sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity)),
    ...pendingReview.map((q) => buildColumn(q, true)),
  ];

  const confirmedColumns = columns.filter((c) => !c.pending);

  // Lowest line total per item, and lowest complete quote total — computed
  // only from confirmed/submitted quotes so an unreviewed AI extraction can't
  // win a "best price" badge before a human has checked it.
  const bestPerItem = new Map<string, number>();
  for (const item of items) {
    const totals = confirmedColumns
      .map((c) => c.itemPrices.get(item.id)?.total ?? null)
      .filter((t): t is number => t !== null);
    if (totals.length > 0) bestPerItem.set(item.id, Math.min(...totals));
  }
  const cheapestQuote = findCheapestQuote(items, comparable);
  const bestTotal = cheapestQuote
    ? (confirmedColumns.find((c) => c.quote.id === cheapestQuote.id)?.total ?? null)
    : null;

  const quotedSupplierIds = new Set(
    [...comparable, ...pendingReview].map((q) => q.supplier_id)
  );
  const addableSuppliers = rfq.rfq_suppliers
    .filter((s) => !quotedSupplierIds.has(s.id))
    .map((s) => ({ id: s.id, label: s.company_name || s.email }));

  const { data: latestRec } = await supabase
    .from("ai_recommendations")
    .select("*")
    .eq("rfq_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recommendation = latestRec
    ? recommendationContentSchema.safeParse(latestRec.content)
    : null;

  const usedPreferences = recommendation?.success
    ? recommendation.data.preferences
    : undefined;
  const preferencesLineParts: string[] = [];
  if (usedPreferences?.hasDeadline && usedPreferences.deadlineDate) {
    preferencesLineParts.push(`Delivery needed by ${formatDate(usedPreferences.deadlineDate)}`);
  }
  if (usedPreferences?.maxBudget !== undefined && usedPreferences?.maxBudget !== null) {
    preferencesLineParts.push(
      `Max budget ${formatMoney(usedPreferences.maxBudget, rfq.currency)}`
    );
  }
  const preferencesLine = preferencesLineParts.join(" · ");

  const { data: prefsRow } = await supabase
    .from("rfq_preferences")
    .select("*")
    .eq("rfq_id", params.id)
    .maybeSingle();

  const initialPreferences: InitialPreferences | null = prefsRow
    ? {
        weights: prefsRow.weights ?? DEFAULT_RECOMMENDATION_WEIGHTS,
        hasDeadline: prefsRow.has_deadline,
        deadlineDate: prefsRow.deadline_date,
        maxBudget: prefsRow.max_budget === null ? null : Number(prefsRow.max_budget),
      }
    : null;

  const { data: award } = (await supabase
    .from("rfq_awards")
    .select("*")
    .eq("rfq_id", params.id)
    .maybeSingle()) as { data: RfqAward | null };

  const quotesById = new Map(rfq.quotes.map((q) => [q.id, q]));

  function awardSide(supplierId: string | null, quoteId: string | null) {
    const supplier = supplierId ? suppliersById.get(supplierId) : undefined;
    const quote = quoteId ? quotesById.get(quoteId) : undefined;
    if (!supplier || !quote) return null;
    return {
      label: supplier.company_name || supplier.email,
      total: computeQuoteTotal(items, quote).total,
      deliveryDays: quote.delivery_days,
      warranty: quote.warranty,
    };
  }

  const awardRecommended = award
    ? awardSide(award.recommended_supplier_id, award.recommended_quote_id)
    : null;
  const awardCheapest = award
    ? awardSide(award.cheapest_supplier_id, award.cheapest_quote_id)
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FadeIn className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href={`/rfqs/${params.id}`}
            className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            <ArrowLeft size={13} />
            {rfq.title}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Compare quotes</h1>
          <p className="text-sm text-slate-500">
            {columns.length} quote{columns.length === 1 ? "" : "s"} ·{" "}
            {rfq.currency} · deadline {formatDate(rfq.deadline)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ManualQuoteDialog
            rfqId={params.id}
            currency={rfq.currency}
            items={items.map((i) => ({
              id: i.id,
              name: i.name,
              quantity: Number(i.quantity),
              unit: i.unit,
            }))}
            suppliers={addableSuppliers}
          />
          {confirmedColumns.length > 0 && (
            <GenerateRecommendationButton
              rfqId={params.id}
              hasExisting={Boolean(recommendation?.success)}
              initialPreferences={initialPreferences}
            />
          )}
        </div>
      </FadeIn>

      {award && award.decision === "auto_approved" && awardRecommended && (
        <FadeIn>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            <span>
              <strong>Auto-approved:</strong> {awardRecommended.label} — PO sent{" "}
              {formatDate(award.po_sent_at)}. Cheapest complete quote, delivery
              within 14 days, and a warranty on file.
            </span>
          </div>
        </FadeIn>
      )}

      {award && award.decision === "review_needed" && (
        <FadeIn>
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={15} className="shrink-0 text-amber-600" />
            <span>
              <strong>Review needed:</strong> the cheapest option has issues —{" "}
              {award.reason}. Approval required before awarding.
            </span>
          </div>
        </FadeIn>
      )}

      {award &&
        award.decision === "differs_from_cheapest" &&
        awardRecommended &&
        awardCheapest && (
          <FadeIn>
            <Card className="border-amber-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                  <AlertTriangle size={15} className="text-amber-600" />
                  Recommendation differs from cheapest — approval required
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  {award.reason}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                    Recommended
                  </p>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {awardRecommended.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {awardRecommended.total === null
                      ? "—"
                      : formatMoney(awardRecommended.total, rfq.currency)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Delivery:{" "}
                    {awardRecommended.deliveryDays === null
                      ? "—"
                      : `${awardRecommended.deliveryDays} days`}{" "}
                    · Warranty: {awardRecommended.warranty || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Cheapest
                  </p>
                  <p className="mt-1 text-base font-bold text-slate-900">
                    {awardCheapest.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {awardCheapest.total === null
                      ? "—"
                      : formatMoney(awardCheapest.total, rfq.currency)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Delivery:{" "}
                    {awardCheapest.deliveryDays === null
                      ? "—"
                      : `${awardCheapest.deliveryDays} days`}{" "}
                    · Warranty: {awardCheapest.warranty || "—"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </FadeIn>
        )}

      {pendingReview.length > 0 && (
        <FadeIn>
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={15} className="shrink-0 text-amber-600" />
            <span>
              {pendingReview.length} PDF quote
              {pendingReview.length === 1 ? "" : "s"} extracted and shown below,
              awaiting your review —{" "}
              <Link
                href={`/rfqs/${params.id}/quotes/${pendingReview[0].id}`}
                className="font-medium underline underline-offset-2"
              >
                review now
              </Link>{" "}
              to confirm {pendingReview.length === 1 ? "it" : "them"} and count{" "}
              {pendingReview.length === 1 ? "it" : "them"} toward the best-price
              ranking.
            </span>
          </div>
        </FadeIn>
      )}

      {columns.length === 0 ? (
        <FadeIn>
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              No quotes yet. Quotes appear here as soon as a supplier submits
              the form, you upload a PDF, or you add one manually.
            </CardContent>
          </Card>
        </FadeIn>
      ) : (
        <FadeIn delay={0.03}>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Side-by-side comparison
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Line totals per supplier. Green marks the lowest price for each
                row; the trophy marks the lowest complete quote.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold text-slate-500">
                        Item
                      </th>
                      {columns.map((col) => (
                        <th
                          key={col.quote.id}
                          className={`px-4 py-3 text-right text-xs font-semibold text-slate-600 ${
                            col.pending ? "bg-amber-50/60" : ""
                          }`}
                        >
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="max-w-[160px] truncate">
                              {col.label}
                            </span>
                            <span className="inline-flex items-center gap-1 font-normal text-slate-400">
                              {col.quote.source === "pdf" && <FileText size={11} />}
                              {col.quote.source === "manual" && <PenLine size={11} />}
                              {col.pending ? (
                                <Link
                                  href={`/rfqs/${params.id}/quotes/${col.quote.id}`}
                                  className="inline-flex items-center gap-1 font-medium text-amber-600 underline underline-offset-2"
                                >
                                  <Clock size={11} />
                                  Pending review
                                </Link>
                              ) : col.quote.source === "pdf" ? (
                                "PDF (confirmed)"
                              ) : col.quote.source === "manual" ? (
                                "Manual entry"
                              ) : (
                                "Form"
                              )}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-4 py-3">
                          <p className="font-medium">
                            <span className="mr-2 text-xs text-slate-400">
                              {i + 1}.
                            </span>
                            {item.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {Number(item.quantity)} {item.unit}
                          </p>
                        </td>
                        {columns.map((col) => {
                          const cell = col.itemPrices.get(item.id);
                          const lineTotal = cell?.total ?? null;
                          const isBest =
                            !col.pending &&
                            lineTotal !== null &&
                            bestPerItem.get(item.id) === lineTotal;
                          return (
                            <td
                              key={col.quote.id}
                              className={`px-4 py-3 text-right align-top ${
                                isBest
                                  ? "bg-emerald-50/70"
                                  : col.pending
                                    ? "bg-amber-50/30"
                                    : ""
                              }`}
                            >
                              {lineTotal === null ? (
                                <span className="text-slate-300">—</span>
                              ) : (
                                <>
                                  <p
                                    className={`font-semibold ${
                                      isBest ? "text-emerald-700" : ""
                                    }`}
                                  >
                                    {formatMoney(lineTotal, rfq.currency)}
                                  </p>
                                  {cell?.unit !== null &&
                                    cell?.unit !== undefined && (
                                      <p className="text-xs text-slate-400">
                                        {formatMoney(cell.unit, rfq.currency)} /{" "}
                                        {item.unit}
                                      </p>
                                    )}
                                  {cell?.notes && (
                                    <p className="mt-0.5 max-w-[180px] text-xs text-slate-400">
                                      {cell.notes}
                                    </p>
                                  )}
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    <tr className="border-b border-slate-100 bg-slate-50/60">
                      <td className="px-4 py-3 text-sm font-semibold">Total</td>
                      {columns.map((col) => {
                        const isBest =
                          !col.pending &&
                          col.total !== null &&
                          col.missingCount === 0 &&
                          col.total === bestTotal;
                        return (
                          <td
                            key={col.quote.id}
                            className={`px-4 py-3 text-right ${
                              isBest
                                ? "bg-emerald-50"
                                : col.pending
                                  ? "bg-amber-50/30"
                                  : ""
                            }`}
                          >
                            <p
                              className={`inline-flex items-center gap-1.5 text-base font-bold tracking-tight ${
                                isBest ? "text-emerald-700" : ""
                              }`}
                            >
                              {isBest && <Trophy size={14} />}
                              {col.total === null
                                ? "—"
                                : formatMoney(col.total, rfq.currency)}
                            </p>
                            {col.missingCount > 0 && (
                              <p className="text-xs font-normal text-amber-600">
                                {col.missingCount} item
                                {col.missingCount === 1 ? "" : "s"} unpriced
                              </p>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {(
                      [
                        {
                          label: "Delivery",
                          render: (c: QuoteColumn) =>
                            c.quote.delivery_days === null
                              ? null
                              : `${c.quote.delivery_days} days`,
                        },
                        {
                          label: "Payment terms",
                          render: (c: QuoteColumn) => c.quote.payment_terms,
                        },
                        {
                          label: "Warranty",
                          render: (c: QuoteColumn) => c.quote.warranty,
                        },
                        {
                          label: "Notes",
                          render: (c: QuoteColumn) => c.quote.notes,
                        },
                      ] as const
                    ).map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-slate-100 last:border-0"
                      >
                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">
                          {row.label}
                        </td>
                        {columns.map((col) => (
                          <td
                            key={col.quote.id}
                            className="px-4 py-3 text-right text-xs text-slate-600"
                          >
                            {row.render(col) ?? (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {recommendation?.success && (
        <FadeIn delay={0.06}>
          <Card className="border-indigo-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600">
                  <Sparkles size={13} className="text-white" />
                </span>
                AI recommendation
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Generated {formatDate(latestRec!.created_at)} ·{" "}
                {latestRec!.model} · advisory only — verify before awarding.
              </CardDescription>
              {recommendation.data.weights && (
                <p className="text-xs text-slate-400">
                  Priorities used: {describeWeights(recommendation.data.weights)}
                </p>
              )}
              {preferencesLine && (
                <p className="text-xs text-slate-400">{preferencesLine}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              <p className="rounded-xl bg-indigo-50/60 p-4 text-sm font-medium leading-relaxed text-indigo-950">
                {recommendation.data.recommendation}
              </p>

              <p className="text-sm leading-relaxed text-slate-600">
                {recommendation.data.reasoning}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {[...recommendation.data.ranking]
                  .sort((a, b) => a.rank - b.rank)
                  .map((entry) => (
                    <div
                      key={`${entry.rank}-${entry.supplier}`}
                      className="rounded-xl border border-slate-100 p-4"
                    >
                      <p className="flex items-center gap-2 font-semibold">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                            entry.rank === 1
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {entry.rank}
                        </span>
                        {entry.supplier}
                      </p>
                      {entry.strengths.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-emerald-700">
                          {entry.strengths.map((s, i) => (
                            <li key={i}>+ {s}</li>
                          ))}
                        </ul>
                      )}
                      {entry.weaknesses.length > 0 && (
                        <ul className="mt-1.5 space-y-1 text-xs text-red-500">
                          {entry.weaknesses.map((w, i) => (
                            <li key={i}>− {w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
              </div>

              {recommendation.data.risks.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                    <AlertTriangle size={13} />
                    Verify before awarding
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-800">
                    {recommendation.data.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </FadeIn>
      )}
    </div>
  );
}
