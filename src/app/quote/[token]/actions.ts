"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { maybeAutoGenerateRecommendation } from "@/lib/auto-recommendation";
import { ensureSupplierProfile } from "@/lib/supplier-profile";
import { quoteSchema, type QuoteFormValues } from "@/lib/validations/quote";

/**
 * Supplier submits a quote via their unique token link. No login — the token
 * is the credential, so everything runs through the service-role client with
 * explicit checks.
 */
export async function submitQuote(token: string, values: QuoteFormValues) {
  const parsed = quoteSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createAdminClient();

  const { data: supplier } = await supabase
    .from("rfq_suppliers")
    .select(
      "id, rfq_id, status, email, company_name, contact_name, rfqs(id, status, deadline, buyer_id)"
    )
    .eq("token", token)
    .single();

  if (!supplier) return { error: "This quote link is invalid." };

  const rfq = supplier.rfqs as unknown as {
    id: string;
    status: string;
    deadline: string | null;
    buyer_id: string;
  };

  if (rfq.status !== "sent" && rfq.status !== "draft") {
    return { error: "This RFQ is no longer accepting quotes." };
  }
  if (rfq.deadline && new Date(rfq.deadline).getTime() < Date.now()) {
    return { error: "The deadline for this RFQ has passed." };
  }

  const { data: existing } = await supabase
    .from("quotes")
    .select("id")
    .eq("supplier_id", supplier.id)
    .maybeSingle();

  if (existing) {
    return { error: "A quote has already been submitted for this invitation." };
  }

  // Validate the item ids belong to this RFQ
  const { data: rfqItems } = await supabase
    .from("rfq_items")
    .select("id, quantity")
    .eq("rfq_id", supplier.rfq_id);

  const validItems = new Map((rfqItems ?? []).map((i) => [i.id, i]));
  for (const item of parsed.data.items) {
    if (!validItems.has(item.rfq_item_id)) {
      return { error: "Invalid line item in submission." };
    }
  }

  const { items, delivery_days, payment_terms, warranty, notes } = parsed.data;

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      rfq_id: supplier.rfq_id,
      supplier_id: supplier.id,
      source: "form",
      status: "submitted",
      delivery_days: delivery_days ?? null,
      payment_terms: payment_terms || null,
      warranty: warranty || null,
      notes: notes || null,
    })
    .select("id")
    .single();

  if (quoteError || !quote) {
    return { error: quoteError?.message ?? "Failed to submit quote" };
  }

  const { error: itemsError } = await supabase.from("quote_items").insert(
    items.map((item) => {
      const rfqItem = validItems.get(item.rfq_item_id)!;
      const unitPrice = item.unit_price ?? null;
      return {
        quote_id: quote.id,
        rfq_item_id: item.rfq_item_id,
        unit_price: unitPrice,
        total_price:
          unitPrice === null
            ? null
            : Math.round(unitPrice * Number(rfqItem.quantity) * 100) / 100,
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
    .eq("id", supplier.id);

  await ensureSupplierProfile({
    supabase,
    buyerId: rfq.buyer_id,
    rfqSupplierId: supplier.id,
    email: supplier.email,
    companyName: supplier.company_name,
    contactName: supplier.contact_name,
  });

  maybeAutoGenerateRecommendation(supplier.rfq_id).catch((e) =>
    console.error("Auto-recommendation failed:", e)
  );

  return { success: true };
}
