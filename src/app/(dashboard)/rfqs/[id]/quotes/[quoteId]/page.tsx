import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QuoteReviewForm, type ReviewItem } from "@/components/quote-review-form";
import { FadeIn } from "@/components/motion";
import { extractionSchema } from "@/lib/validations/quote";
import type { Quote, QuoteItem, RfqItem, RfqSupplier } from "@/lib/types";

export default async function QuoteReviewPage({
  params,
}: {
  params: { id: string; quoteId: string };
}) {
  const supabase = createClient();

  const { data } = await supabase
    .from("quotes")
    .select("*, quote_items(*), rfq_suppliers(*), rfqs(*, rfq_items(*))")
    .eq("id", params.quoteId)
    .eq("rfq_id", params.id)
    .single();

  if (!data) notFound();

  const quote = data as unknown as Quote & {
    quote_items: QuoteItem[];
    rfq_suppliers: RfqSupplier;
    rfqs: { id: string; title: string; currency: string; rfq_items: RfqItem[] };
  };

  // Only PDF quotes in needs_review get the review screen
  if (quote.status !== "needs_review") {
    redirect(`/rfqs/${params.id}`);
  }

  const rfq = quote.rfqs;
  const supplier = quote.rfq_suppliers;
  const supplierLabel = supplier.company_name || supplier.email;

  const quoteItemsByRfqItem = new Map(
    quote.quote_items.map((qi) => [qi.rfq_item_id, qi])
  );
  const items: ReviewItem[] = [...rfq.rfq_items]
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const qi = quoteItemsByRfqItem.get(item.id);
      return {
        rfq_item_id: item.id,
        name: item.name,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        unit_price: qi?.unit_price == null ? null : Number(qi.unit_price),
        notes: qi?.notes ?? null,
      };
    });

  const parsedExtraction = extractionSchema.safeParse(quote.extraction_raw);
  const warnings = parsedExtraction.success ? parsedExtraction.data.warnings : [];
  const confidence = parsedExtraction.success
    ? parsedExtraction.data.confidence
    : null;

  let pdfUrl: string | null = null;
  if (quote.pdf_path) {
    const { data: signed } = await supabase.storage
      .from("quote-pdfs")
      .createSignedUrl(quote.pdf_path, 3600);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <FadeIn className="space-y-1.5">
        <Link
          href={`/rfqs/${params.id}`}
          className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          <ArrowLeft size={13} />
          {rfq.title}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Review extracted quote
        </h1>
        <p className="text-sm text-slate-500">
          PDF quote from {supplierLabel} · extracted by Gemini — confirm to
          include it in the comparison.
        </p>
      </FadeIn>

      <FadeIn delay={0.03}>
        <QuoteReviewForm
          quoteId={quote.id}
          rfqId={params.id}
          currency={rfq.currency}
          supplierLabel={supplierLabel}
          items={items}
          deliveryDays={quote.delivery_days}
          paymentTerms={quote.payment_terms}
          warranty={quote.warranty}
          notes={quote.notes}
          confidence={confidence}
          warnings={warnings}
          pdfUrl={pdfUrl}
        />
      </FadeIn>
    </div>
  );
}
