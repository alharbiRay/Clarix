import type { SupabaseClient } from "@supabase/supabase-js";

export interface EnsureSupplierProfileInput {
  supabase: SupabaseClient;
  buyerId: string;
  rfqSupplierId: string;
  email: string;
  companyName?: string | null;
  contactName?: string | null;
  phone?: string | null;
}

/**
 * Upserts the buyer's persistent supplier profile for this email and links
 * the per-RFQ invite row to it — the auto-save behind the Suppliers page.
 * Called whenever a quote is created (form, manual entry, or PDF/email
 * extraction). Known values are never overwritten with a fresher null.
 *
 * Best-effort: logs and returns null on failure rather than throwing — this
 * runs as a side effect of quote submission and must never block it.
 */
export async function ensureSupplierProfile(
  input: EnsureSupplierProfileInput
): Promise<string | null> {
  const { supabase, buyerId, rfqSupplierId, email, companyName, contactName, phone } = input;

  try {
    const normalizedEmail = email.trim().toLowerCase();

    const { data: existing } = await supabase
      .from("suppliers")
      .select("id, company_name, contact_name, phone")
      .eq("buyer_id", buyerId)
      .eq("email", normalizedEmail)
      .maybeSingle();

    let supplierId: string;
    if (existing) {
      supplierId = existing.id;
      const patch: Record<string, string> = {};
      if (!existing.company_name && companyName) patch.company_name = companyName;
      if (!existing.contact_name && contactName) patch.contact_name = contactName;
      if (!existing.phone && phone) patch.phone = phone;
      if (Object.keys(patch).length > 0) {
        await supabase.from("suppliers").update(patch).eq("id", supplierId);
      }
    } else {
      const { data: created, error } = await supabase
        .from("suppliers")
        .insert({
          buyer_id: buyerId,
          email: normalizedEmail,
          company_name: companyName || null,
          contact_name: contactName || null,
          phone: phone || null,
        })
        .select("id")
        .single();
      if (error || !created) throw error ?? new Error("Failed to create supplier");
      supplierId = created.id;
    }

    await supabase
      .from("rfq_suppliers")
      .update({ supplier_id: supplierId })
      .eq("id", rfqSupplierId)
      .is("supplier_id", null);

    return supplierId;
  } catch (e) {
    console.error("Failed to save supplier profile:", e);
    return null;
  }
}
