"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleAutoRecommendation } from "@/lib/jobs/schedule";
import { ensureSupplierProfile } from "@/lib/supplier-profile";
import { quoteSchema, type QuoteFormValues } from "@/lib/validations/quote";
import { recordAuditEvent } from "@/lib/audit";
import { cookies } from "next/headers";
import { isLocale, QUOTE_LOCALE_COOKIE } from "@/i18n/config";
import { translatorFor } from "@/i18n/translator";

/**
 * Supplier submits a quote via their unique token link. No login — the token
 * is the credential, so everything runs through the service-role client with
 * explicit checks.
 */
export async function submitQuote(token: string, values: QuoteFormValues, language?: string) {
  const locale = isLocale(language) ? language : "en";
  const te = translatorFor(locale, "supplierForm.errors");
  const parsed = quoteSchema.safeParse(values);
  if (!parsed.success) {
    return { error: locale === "en" ? (parsed.error.errors[0]?.message ?? te("invalid")) : te("invalid") };
  }

  const supabase = createAdminClient();

  const { data: supplier } = await supabase
    .from("rfq_suppliers")
    .select(
      "id, rfq_id, status, email, company_name, contact_name, rfqs(id, status, deadline, buyer_id, is_demo, currency)"
    )
    .eq("token", token)
    .single();

  if (!supplier) return { error: te("invalidLink") };

  const rfq = supplier.rfqs as unknown as {
    id: string;
    status: string;
    deadline: string | null;
    buyer_id: string;
    is_demo?: boolean;
    currency?: string;
  };

  // The demo workspace is shared and read-only — nobody gets to post quotes
  // into it, even with a (seed-derived) token.
  if (rfq.is_demo) {
    return { error: te("demo") };
  }

  if (rfq.status !== "sent" && rfq.status !== "draft") {
    return { error: te("closed") };
  }
  if (rfq.deadline && new Date(rfq.deadline).getTime() < Date.now()) {
    return { error: te("deadline") };
  }

  const { data: existing } = await supabase
    .from("quotes")
    .select("id")
    .eq("supplier_id", supplier.id)
    .maybeSingle();

  if (existing) {
    return { error: te("duplicate") };
  }

  // Validate the item ids belong to this RFQ
  const { data: rfqItems } = await supabase
    .from("rfq_items")
    .select("id, quantity")
    .eq("rfq_id", supplier.rfq_id);

  const validItems = new Map((rfqItems ?? []).map((i) => [i.id, i]));
  for (const item of parsed.data.items) {
    if (!validItems.has(item.rfq_item_id)) {
      return { error: te("badItem") };
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
    console.error("[submitQuote] quote insert failed:", quoteError);
    return { error: te("failed") };
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
    console.error("[submitQuote] quote_items insert failed:", itemsError);
    return { error: te("failed") };
  }

  await supabase
    .from("rfq_suppliers")
    .update({ status: "submitted" })
    .eq("id", supplier.id);

  const profileId = await ensureSupplierProfile({
    supabase,
    buyerId: rfq.buyer_id,
    rfqSupplierId: supplier.id,
    email: supplier.email,
    companyName: supplier.company_name,
    contactName: supplier.contact_name,
  });
  // The language they quoted in becomes the default for future emails. One
  // they picked with the page's switcher replaces a saved preference; one we
  // picked for them only fills a gap.
  if (profileId && isLocale(language)) {
    const explicit = cookies().get(QUOTE_LOCALE_COOKIE)?.value === language;
    const update = supabase.from("suppliers").update({ preferred_language: language }).eq("id", profileId);
    const { error: langError } = await (explicit ? update : update.is("preferred_language", null));
    if (langError) console.error("[submitQuote] preferred_language update failed:", langError.message);
  }

  // Recorded as a durable job and run in the background — the supplier no
  // longer waits on a Gemini call (or loses it to a timeout).
  const total = items.reduce((sum, item) => {
    const qty = Number(validItems.get(item.rfq_item_id)!.quantity);
    return item.unit_price === null || item.unit_price === undefined ? sum : sum + Math.round(item.unit_price * qty * 100) / 100;
  }, 0);
  await recordAuditEvent({
    buyerId: rfq.buyer_id,
    rfqId: supplier.rfq_id,
    actor: { type: "supplier", id: supplier.id },
    type: "quote_received",
    summary: `Quote received from ${supplier.company_name || supplier.email} via the supplier form`,
    payload: { source: "form", supplier: supplier.company_name || supplier.email, quoteId: quote.id, total: Math.round(total * 100) / 100, currency: rfq.currency ?? null },
  });

  await scheduleAutoRecommendation(supplier.rfq_id, rfq.buyer_id);

  return { success: true };
}
