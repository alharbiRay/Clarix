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
import { quoteSchema, type QuoteFormValues } from "@/lib/validations/quote";
import type { RfqItem } from "@/lib/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Buyer uploads a supplier's PDF quote. The PDF is stored in the private
 * quote-pdfs bucket, run through Gemini extraction, and saved as a quote in
 * 'needs_review' status. The buyer confirms it on the review screen before it
 * joins the comparison.
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
    .select("id, email, company_name")
    .eq("id", supplierId)
    .eq("rfq_id", rfqId)
    .single();
  if (!supplier) return { error: "Supplier not found on this RFQ" };

  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await createQuoteFromPdf({
    supabase,
    rfqId,
    supplier,
    currency: rfq.currency,
    items: rfq.rfq_items as RfqItem[],
    pdfBuffer: buffer,
    source: "pdf",
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/rfqs/${rfqId}`);
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
    .select("id")
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

  revalidatePath(`/rfqs/${rfqId}`);
  revalidatePath(`/rfqs/${rfqId}/compare`);
  maybeAutoGenerateRecommendation(rfqId).catch((e) =>
    console.error("Auto-recommendation failed:", e)
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
  maybeAutoGenerateRecommendation(quote.rfq_id).catch((e) =>
    console.error("Auto-recommendation failed:", e)
  );
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
