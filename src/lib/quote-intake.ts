import type { SupabaseClient } from "@supabase/supabase-js";
import { extractQuoteFromPdf } from "@/lib/gemini";
import { isGeminiOutputError, isGeminiRateLimited } from "@/lib/gemini-errors";
import { ensureSupplierProfile } from "@/lib/supplier-profile";
import { recordAuditEvent } from "@/lib/audit";
import type { RfqItem } from "@/lib/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/** Magic bytes, not the uploader-controlled content type, decide whether this is a PDF. */
export function looksLikePdf(buf: Buffer) {
  return buf.subarray(0, 5).toString("latin1") === "%PDF-";
}

export interface QuoteIntakeInput {
  supabase: SupabaseClient;
  rfqId: string;
  buyerId: string;
  supplier: {
    id: string;
    email: string;
    company_name: string | null;
    contact_name?: string | null;
  };
  currency: string;
  items: RfqItem[];
  pdfBuffer: Buffer;
  source: "pdf" | "email";
  sourceEmailId?: string;
}

/**
 * Extracts a supplier PDF quote with Gemini, stores the PDF, and inserts the
 * resulting quote + quote_items already 'confirmed' — no manual buyer review
 * step. Shared by the buyer-side PDF upload action and the Resend
 * inbound-email webhook — the only difference between those two entry points
 * is where the PDF bytes and the supabase client (RLS-scoped vs.
 * service-role) come from.
 */
export type QuoteIntakeResult =
  | { quoteId: string; error?: undefined }
  | {
      error: string;
      /** Gemini rejected the call with a 429 (quota or rate limit) — retrying later can succeed. */
      quotaExceeded?: boolean;
      /** The AI couldn't produce a usable reading, even after a repair attempt: enter the quote by hand. */
      needsManualEntry?: boolean;
      /** The original error, so the job runner can classify it. */
      cause?: unknown;
    };

export async function createQuoteFromPdf(input: QuoteIntakeInput): Promise<QuoteIntakeResult> {
  const { supabase, rfqId, buyerId, supplier, currency, items, pdfBuffer, source, sourceEmailId } =
    input;

  if (pdfBuffer.length === 0) {
    return { error: "The PDF attachment was empty" };
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    return { error: "PDF is too large (max 10 MB)" };
  }
  if (!looksLikePdf(pdfBuffer)) {
    return { error: "This file isn't a valid PDF" };
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
    const quotaExceeded = isGeminiRateLimited(e);
    const needsManualEntry = isGeminiOutputError(e);
    // Quota problems are recorded once by the job hooks (ai_quota_error).
    // Emailed PDFs run in a retrying job: recording here would repeat the
    // event on every attempt, so that path is recorded once, as job_failed,
    // when the job gives up.
    if (!quotaExceeded && source !== "email") {
      await recordAuditEvent({
        buyerId,
        rfqId,
        actor: { type: "buyer", id: buyerId },
        type: "extraction_failed",
        summary: `Couldn't read ${supplier.company_name || supplier.email}'s PDF`,
        // No raw error text: the trail is buyer-visible and errors carry internals.
        payload: { supplier: supplier.company_name || supplier.email, source },
      });
    }
    return {
      error: needsManualEntry
        ? "The AI couldn't read this PDF reliably. Enter the quote manually."
        : `Extraction failed: ${e instanceof Error ? e.message : "unknown error"}`,
      quotaExceeded,
      needsManualEntry,
      cause: e,
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
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
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

  const { error: supplierStatusError } = await supabase
    .from("rfq_suppliers")
    .update({ status: "submitted" })
    .eq("id", supplier.id);
  if (supplierStatusError) {
    console.error(
      `[createQuoteFromPdf] rfq=${rfqId} supplier=${supplier.id} failed to flip status to submitted:`,
      supplierStatusError
    );
  } else {
    console.log(`[createQuoteFromPdf] rfq=${rfqId} supplier=${supplier.id} status set to submitted`);
  }

  // extraction.supplier_name is the one place a company name actually gets
  // "extracted from a PDF" today — nothing else in the app ever writes it.
  await ensureSupplierProfile({
    supabase,
    buyerId,
    rfqSupplierId: supplier.id,
    email: supplier.email,
    companyName: supplier.company_name || extraction.supplier_name,
    contactName: supplier.contact_name,
  });

  const label = supplier.company_name || extraction.supplier_name || supplier.email;
  const actor = source === "email" ? ({ type: "supplier", id: supplier.id } as const) : ({ type: "buyer", id: buyerId } as const);
  const total = quoteItems.every((qi) => qi.total_price !== null) && quoteItems.length === sortedItems.length
    ? Math.round(quoteItems.reduce((s, qi) => s + (qi.total_price ?? 0), 0) * 100) / 100
    : null;
  await recordAuditEvent({
    buyerId,
    rfqId,
    actor,
    type: "quote_received",
    summary: `Quote received from ${label} ${source === "email" ? "by email" : "as an uploaded PDF"}`,
    payload: { source, supplier: label, quoteId: quote.id, total, currency },
  });
  await recordAuditEvent({
    buyerId,
    rfqId,
    actor: { type: "system" },
    type: "extraction_completed",
    summary: `AI read ${label}'s PDF (${extraction.confidence} confidence)`,
    payload: { supplier: label, quoteId: quote.id, confidence: extraction.confidence, warnings: extraction.warnings, pricedLines: quoteItems.filter((qi) => qi.total_price !== null).length, lines: sortedItems.length },
  });

  return { quoteId: quote.id as string };
}
