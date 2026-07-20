"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rfqSchema, type RfqFormValues } from "@/lib/validations/rfq";

export async function createRfq(values: RfqFormValues) {
  const parsed = rfqSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { title, project, description, currency, deadline, items, suppliers } =
    parsed.data;

  const { data: rfq, error: rfqError } = await supabase
    .from("rfqs")
    .insert({
      buyer_id: user.id,
      title,
      project: project || null,
      description: description || null,
      currency,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    })
    .select("id")
    .single();

  if (rfqError || !rfq) {
    return { error: rfqError?.message ?? "Failed to create RFQ" };
  }

  const { error: itemsError } = await supabase.from("rfq_items").insert(
    items.map((item, i) => ({
      rfq_id: rfq.id,
      position: i,
      name: item.name,
      description: item.description || null,
      quantity: item.quantity,
      unit: item.unit,
    }))
  );

  if (itemsError) {
    // Roll back the orphaned RFQ so a retry doesn't leave junk behind
    await supabase.from("rfqs").delete().eq("id", rfq.id);
    return { error: itemsError.message };
  }

  const { error: suppliersError } = await supabase.from("rfq_suppliers").insert(
    suppliers.map((email) => ({
      rfq_id: rfq.id,
      email: email.toLowerCase(),
    }))
  );

  if (suppliersError) {
    await supabase.from("rfqs").delete().eq("id", rfq.id);
    return { error: suppliersError.message };
  }

  revalidatePath("/rfqs");
  revalidatePath("/dashboard");
  redirect(`/rfqs/${rfq.id}`);
}

/**
 * Marks the RFQ as sent and invites all pending suppliers.
 *
 * TODO(email): integrate an email provider (e.g. Resend) to deliver the
 * invitation with both submission options (form link + reply-with-PDF).
 * Until then, the detail page exposes copyable quote-form links.
 */
export async function sendRfq(rfqId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const now = new Date().toISOString();

  const { error: supplierError } = await supabase
    .from("rfq_suppliers")
    .update({ status: "sent", invited_at: now })
    .eq("rfq_id", rfqId)
    .eq("status", "pending");

  if (supplierError) return { error: supplierError.message };

  const { error: rfqError } = await supabase
    .from("rfqs")
    .update({ status: "sent" })
    .eq("id", rfqId)
    .eq("status", "draft");

  if (rfqError) return { error: rfqError.message };

  revalidatePath(`/rfqs/${rfqId}`);
  revalidatePath("/rfqs");
  revalidatePath("/dashboard");
  return { success: true };
}
