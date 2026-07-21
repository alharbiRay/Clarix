"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rfqSchema, type RfqFormValues } from "@/lib/validations/rfq";
import { sendRfqInvitationEmail } from "@/lib/email";
import { inboundAddressForToken } from "@/lib/resend";
import type { RfqItem, RfqSupplier } from "@/lib/types";

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
 * Marks the RFQ as sent, invites all pending suppliers, and emails each of
 * them an invitation (form link + reply-with-PDF option) via Resend.
 */
export async function sendRfq(rfqId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const now = new Date().toISOString();

  const { data: invitedSuppliers, error: supplierError } = await supabase
    .from("rfq_suppliers")
    .update({ status: "sent", invited_at: now })
    .eq("rfq_id", rfqId)
    .eq("status", "pending")
    .select("*");

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

  const suppliers = (invitedSuppliers ?? []) as RfqSupplier[];
  let emailFailures: string[] = [];

  if (suppliers.length > 0) {
    const { data: rfq } = await supabase
      .from("rfqs")
      .select("title, currency, deadline, rfq_items(*)")
      .eq("id", rfqId)
      .single();

    if (rfq) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const items = (rfq.rfq_items as RfqItem[])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((i) => ({ name: i.name, quantity: Number(i.quantity), unit: i.unit }));

      const results = await Promise.allSettled(
        suppliers.map((supplier) =>
          sendRfqInvitationEmail({
            to: supplier.email,
            companyName: supplier.company_name,
            contactName: supplier.contact_name,
            rfq: { title: rfq.title, currency: rfq.currency, deadline: rfq.deadline },
            items,
            formUrl: `${appUrl}/quote/${supplier.token}`,
            replyToAddress: inboundAddressForToken(supplier.token),
          })
        )
      );

      emailFailures = suppliers
        .filter((_, i) => results[i].status === "rejected")
        .map((s) => s.email);
    }
  }

  return { success: true, emailFailures };
}
