import type { SupabaseClient } from "@supabase/supabase-js";
import { extractQuoteFromPdf } from "@/lib/gemini";
import type { RfqItem } from "@/lib/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export interface QuoteIntakeInput {
  supabase: SupabaseClient;
  rfqId: string;
  supplier: { id: string; email: string; company_name: string | null };
  currency: string;
  items: RfqItem[];
  pdfBuffer: Buffer;
  source: "pdf" | "email";
  sourceEmailId?: string;
}

/**
 * Extracts a supplier PDF quote with Gemini, stores the PDF, and inserts the
 * resulting quote + quote_items in 'needs_review' status. Shared by the
 * buyer-side PDF upload action and the Resend inbound-email webhook — the
 * only difference between those two entry points is where the PDF bytes and
 * the supabase client (RLS-scoped vs. service-role) come from.
 */
export async function createQuoteFromPdf(input: QuoteIntakeInput) {
  const { supabase, rfqId, supplier, currency, items, pdfBuffer, source, sourceEmailId } = input;

  if (pdfBuffer.length === 0) {
    return { error: "The PDF attachment was empty" };
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    return { error: "PDF is too large (max 10 MB)" };
  }

  const { data: existing } = await supabase
    .from("quotes")
    .select("id")
    .eq("supplier_id", supplier.id)
    .neq("status", "rejected")
    .maybeSingle();
  if (existing) {
    return { error: "This supplier already has a quote on record" };
  }

  const sortedItems = items.slice().sort((a, b) => a.position - b.position);

  let extraction;
  try {
    extraction = await extractQuoteFromPdf({
      pdfBase64: pdfBuffer.toString("base64"),
      currency,
      supplier: { email: supplier.email, company_name: supplier.company_name },
      items: sortedItems.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        quantity: Number(i.quantity),
        unit: i.unit,
      })),
    });
  } catch (e) {
    return {
      error: `Extraction failed: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  const pdfPath = `${rfqId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("quote-pdfs")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf" });
  if (uploadError) {
    return { error: `Failed to store PDF: ${uploadError.message}` };
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      rfq_id: rfqId,
      supplier_id: supplier.id,
      source,
      status: "needs_review",
      pdf_path: pdfPath,
      extraction_raw: extraction,
      delivery_days: extraction.delivery_days,
      payment_terms: extraction.payment_terms,
      warranty: extraction.warranty,
      notes: extraction.notes,
      source_email_id: sourceEmailId ?? null,
    })
    .select("id")
    .single();

  if (quoteError || !quote) {
    await supabase.storage.from("quote-pdfs").remove([pdfPath]);
    return { error: quoteError?.message ?? "Failed to save quote" };
  }

  const validIds = new Set(sortedItems.map((i) => i.id));
  const quoteItems = extraction.items
    .filter((item) => validIds.has(item.rfq_item_id))
    .map((item) => ({
      quote_id: quote.id,
      rfq_item_id: item.rfq_item_id,
      unit_price: item.unit_price,
      total_price: item.total_price,
      notes: item.notes,
    }));

  if (quoteItems.length > 0) {
    const { error: itemsError } = await supabase
      .from("quote_items")
      .insert(quoteItems);
    if (itemsError) {
      await supabase.from("quotes").delete().eq("id", quote.id);
      await supabase.storage.from("quote-pdfs").remove([pdfPath]);
      return { error: itemsError.message };
    }
  }

  return { quoteId: quote.id as string };
}
