"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  generateQuoteRecommendation,
  recommendationPreferencesSchema,
  recommendationWeightsSchema,
  type RecommendationPreferences,
  type RecommendationWeights,
} from "@/lib/gemini";
import {
  buildRecommendationInput,
  type RfqWithComparisonData,
} from "@/lib/recommendation-input";
import { createQuoteFromPdf } from "@/lib/quote-intake";
import { maybeAutoGenerateRecommendation } from "@/lib/auto-recommendation";
import { ensureSupplierProfile } from "@/lib/supplier-profile";
import { quoteSchema, type QuoteFormValues } from "@/lib/validations/quote";
import type { RfqItem } from "@/lib/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Buyer uploads a supplier's PDF quote. The PDF is stored in the private
 * quote-pdfs bucket, run through Gemini extraction, and saved as a
 * 'confirmed' quote automatically — no manual review step, it joins the
 * comparison immediately.
 */
export async function uploadQuotePdf(formData: FormData) {
  const rfqId = formData.get("rfqId");
  const supplierId = formData.get("supplierId");
  const file = formData.get("file");

  if (typeof rfqId !== "string" || typeof supplierId !== "string") {
    return { error: "Invalid request" };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF file to upload" };
  }
  if (file.type !== "application/pdf") {
    return { error: "Only PDF files are supported" };
  }
  if (file.size > MAX_PDF_BYTES) {
    return { error: "PDF is too large (max 10 MB)" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // RLS scopes these to the buyer's own RFQs — a miss means not found or not owned
  const { data: rfq } = await supabase
    .from("rfqs")
    .select("id, currency, rfq_items(*)")
    .eq("id", rfqId)
    .single();
  if (!rfq) return { error: "RFQ not found" };

  const { data: supplier } = await supabase
    .from("rfq_suppliers")
    .select("id, email, company_name, contact_name")
    .eq("id", supplierId)
    .eq("rfq_id", rfqId)
    .single();
  if (!supplier) return { error: "Supplier not found on this RFQ" };

  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await createQuoteFromPdf({
    supabase,
    rfqId,
    buyerId: user.id,
    supplier,
    currency: rfq.currency,
    items: rfq.rfq_items as RfqItem[],
    pdfBuffer: buffer,
    source: "pdf",
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/rfqs/${rfqId}`);
  revalidatePath(`/rfqs/${rfqId}/compare`);
  console.log(`[uploadQuotePdf] rfq=${rfqId} quote=${result.quoteId} confirmed — awaiting maybeAutoGenerateRecommendation`);
  // Must be awaited, not fire-and-forget: on a serverless runtime the
  // function instance can be frozen/torn down the moment this action
  // returns, silently killing an un-awaited background promise before the
  // Gemini call and auto-approval evaluation ever run.
  await maybeAutoGenerateRecommendation(rfqId).catch((e) =>
    console.error(`[uploadQuotePdf] rfq=${rfqId} auto-recommendation failed:`, e)
  );
  return { quoteId: result.quoteId };
}

/**
 * Buyer types in a supplier's quote directly (phone call, email body, etc.)
 * with no PDF involved. Saved as 'submitted' immediately — there's no
 * extraction step to confirm, the buyer just entered the numbers.
 */
export async function addManualQuote(
  rfqId: string,
  supplierId: string,
  values: QuoteFormValues
) {
  const parsed = quoteSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: supplier } = await supabase
    .from("rfq_suppliers")
    .select("id, email, company_name, contact_name")
    .eq("id", supplierId)
    .eq("rfq_id", rfqId)
    .single();
  if (!supplier) return { error: "Supplier not found on this RFQ" };

  const { data: existing } = await supabase
    .from("quotes")
    .select("id")
    .eq("supplier_id", supplierId)
    .neq("status", "rejected")
    .maybeSingle();
  if (existing) {
    return { error: "This supplier already has a quote on record" };
  }

  const { data: rfqItems } = await supabase
    .from("rfq_items")
    .select("id, quantity")
    .eq("rfq_id", rfqId);
  const quantities = new Map(
    (rfqItems ?? []).map((i) => [i.id, Number(i.quantity)])
  );

  const { items, delivery_days, payment_terms, warranty, notes } = parsed.data;
  for (const item of items) {
    if (!quantities.has(item.rfq_item_id)) {
      return { error: "Invalid line item in submission" };
    }
  }

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      rfq_id: rfqId,
      supplier_id: supplierId,
      source: "manual",
      status: "submitted",
      delivery_days: delivery_days ?? null,
      payment_terms: payment_terms || null,
      warranty: warranty || null,
      notes: notes || null,
    })
    .select("id")
    .single();
  if (quoteError || !quote) {
    return { error: quoteError?.message ?? "Failed to save quote" };
  }

  const { error: itemsError } = await supabase.from("quote_items").insert(
    items.map((item) => {
      const qty = quantities.get(item.rfq_item_id)!;
      const unitPrice = item.unit_price ?? null;
      return {
        quote_id: quote.id,
        rfq_item_id: item.rfq_item_id,
        unit_price: unitPrice,
        total_price:
          unitPrice === null ? null : Math.round(unitPrice * qty * 100) / 100,
        notes: item.notes || null,
      };
    })
  );
  if (itemsError) {
    await supabase.from("quotes").delete().eq("id", quote.id);
    return { error: itemsError.message };
  }

  await supabase
    .from("rfq_suppliers")
    .update({ status: "submitted" })
    .eq("id", supplierId);

  await ensureSupplierProfile({
    supabase,
    buyerId: user.id,
    rfqSupplierId: supplierId,
    email: supplier.email,
    companyName: supplier.company_name,
    contactName: supplier.contact_name,
  });

  revalidatePath(`/rfqs/${rfqId}`);
  revalidatePath(`/rfqs/${rfqId}/compare`);
  console.log(`[addManualQuote] rfq=${rfqId} supplier=${supplierId} saved — awaiting maybeAutoGenerateRecommendation`);
  await maybeAutoGenerateRecommendation(rfqId).catch((e) =>
    console.error(`[addManualQuote] rfq=${rfqId} auto-recommendation failed:`, e)
  );
  return { success: true };
}

/**
 * Buyer confirms an extracted PDF quote after reviewing (and possibly
 * correcting) the values. The quote then participates in the comparison.
 */
export async function confirmQuote(quoteId: string, values: QuoteFormValues) {
  const parsed = quoteSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, rfq_id, supplier_id, status")
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found" };
  if (quote.status !== "needs_review") {
    return { error: "This quote has already been reviewed" };
  }

  const { data: rfqItems } = await supabase
    .from("rfq_items")
    .select("id, quantity")
    .eq("rfq_id", quote.rfq_id);
  const quantities = new Map(
    (rfqItems ?? []).map((i) => [i.id, Number(i.quantity)])
  );

  const { items, delivery_days, payment_terms, warranty, notes } = parsed.data;

  for (const item of items) {
    if (!quantities.has(item.rfq_item_id)) {
      return { error: "Invalid line item in submission" };
    }
  }

  const { error: itemsError } = await supabase.from("quote_items").upsert(
    items.map((item) => {
      const unitPrice = item.unit_price ?? null;
      const qty = quantities.get(item.rfq_item_id)!;
      return {
        quote_id: quoteId,
        rfq_item_id: item.rfq_item_id,
        unit_price: unitPrice,
        total_price:
          unitPrice === null ? null : Math.round(unitPrice * qty * 100) / 100,
        notes: item.notes || null,
      };
    }),
    { onConflict: "quote_id,rfq_item_id" }
  );
  if (itemsError) return { error: itemsError.message };

  const { error: quoteError } = await supabase
    .from("quotes")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      delivery_days: delivery_days ?? null,
      payment_terms: payment_terms || null,
      warranty: warranty || null,
      notes: notes || null,
    })
    .eq("id", quoteId);
  if (quoteError) return { error: quoteError.message };

  await supabase
    .from("rfq_suppliers")
    .update({ status: "submitted" })
    .eq("id", quote.supplier_id);

  revalidatePath(`/rfqs/${quote.rfq_id}`);
  revalidatePath(`/rfqs/${quote.rfq_id}/compare`);
  console.log(`[confirmQuote] rfq=${quote.rfq_id} quote=${quoteId} confirmed — awaiting maybeAutoGenerateRecommendation`);
  await maybeAutoGenerateRecommendation(quote.rfq_id).catch((e) =>
    console.error(`[confirmQuote] rfq=${quote.rfq_id} auto-recommendation failed:`, e)
  );
  return { success: true, rfqId: quote.rfq_id };
}

/**
 * Buyer permanently deletes a quote (form, manual, or PDF) from the RFQ
 * detail page. Blocked if the quote is already tied to an award decision
 * (rfq_awards.recommended_quote_id / cheapest_quote_id) — deleting a quote
 * a PO may already have been sent for would corrupt that record. On success,
 * the supplier reverts to 'sent' (or 'pending' if they were never actually
 * invited) so they're selectable again for a fresh manual/PDF entry.
 */
export async function deleteQuote(quoteId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, rfq_id, supplier_id, pdf_path")
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found" };

  // quote.id (not the raw quoteId param) is used in this raw .or() filter
  // string — it's only reached this line because the .eq("id", quoteId)
  // lookup above matched a real uuid column value, so it's safe to
  // interpolate; the unvalidated request param never is.
  const { data: award } = await supabase
    .from("rfq_awards")
    .select("rfq_id")
    .eq("rfq_id", quote.rfq_id)
    .or(`recommended_quote_id.eq.${quote.id},cheapest_quote_id.eq.${quote.id}`)
    .maybeSingle();
  if (award) {
    return {
      error: "This quote is part of an award decision and can't be deleted",
    };
  }

  const { error: deleteError } = await supabase
    .from("quotes")
    .delete()
    .eq("id", quoteId);
  if (deleteError) return { error: deleteError.message };

  if (quote.pdf_path) {
    await supabase.storage.from("quote-pdfs").remove([quote.pdf_path]);
  }

  const { data: supplierRow } = await supabase
    .from("rfq_suppliers")
    .select("invited_at")
    .eq("id", quote.supplier_id)
    .single();
  await supabase
    .from("rfq_suppliers")
    .update({ status: supplierRow?.invited_at ? "sent" : "pending" })
    .eq("id", quote.supplier_id);

  revalidatePath(`/rfqs/${quote.rfq_id}`);
  revalidatePath(`/rfqs/${quote.rfq_id}/compare`);
  return { success: true, rfqId: quote.rfq_id };
}

/** Buyer rejects an extracted PDF quote (bad scan, wrong document, etc.). */
export async function rejectQuote(quoteId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: quote } = await supabase
    .from("quotes")
    .select("id, rfq_id, status")
    .eq("id", quoteId)
    .single();
  if (!quote) return { error: "Quote not found" };
  if (quote.status !== "needs_review") {
    return { error: "This quote has already been reviewed" };
  }

  const { error } = await supabase
    .from("quotes")
    .update({ status: "rejected" })
    .eq("id", quoteId);
  if (error) return { error: error.message };

  revalidatePath(`/rfqs/${quote.rfq_id}`);
  return { success: true, rfqId: quote.rfq_id };
}

/**
 * Generates (or regenerates) the AI recommendation for an RFQ from all
 * comparable quotes. History is kept; the compare page shows the latest.
 * The buyer's priority weights + deadline/budget preferences are persisted
 * to rfq_preferences so the auto-recommendation trigger can reuse them.
 */
export async function generateRecommendation(
  rfqId: string,
  weights: RecommendationWeights,
  preferences: RecommendationPreferences
) {
  const parsedWeights = recommendationWeightsSchema.safeParse(weights);
  if (!parsedWeights.success) {
    return { error: "Invalid priority weights" };
  }
  const parsedPreferences = recommendationPreferencesSchema.safeParse(preferences);
  if (!parsedPreferences.success) {
    return { error: "Invalid preferences" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error: prefsError } = await supabase.from("rfq_preferences").upsert({
    rfq_id: rfqId,
    weights: parsedWeights.data,
    has_deadline: parsedPreferences.data.hasDeadline,
    deadline_date: parsedPreferences.data.deadlineDate,
    max_budget: parsedPreferences.data.maxBudget,
    updated_at: new Date().toISOString(),
  });
  if (prefsError) return { error: prefsError.message };

  const { data: rfq } = await supabase
    .from("rfqs")
    .select(
      "*, rfq_items(*), rfq_suppliers(*), quotes(*, quote_items(*))"
    )
    .eq("id", rfqId)
    .single();
  if (!rfq) return { error: "RFQ not found" };

  const input = buildRecommendationInput(
    rfq as unknown as RfqWithComparisonData,
    parsedWeights.data,
    parsedPreferences.data
  );
  if (!input) {
    return { error: "No comparable quotes yet — collect at least one first" };
  }

  let result;
  try {
    result = await generateQuoteRecommendation(input);
  } catch (e) {
    return {
      error: `Recommendation failed: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  const { error: insertError } = await supabase
    .from("ai_recommendations")
    .insert({ rfq_id: rfqId, content: result.content, model: result.model });
  if (insertError) return { error: insertError.message };

  revalidatePath(`/rfqs/${rfqId}/compare`);
  return { success: true };
}
