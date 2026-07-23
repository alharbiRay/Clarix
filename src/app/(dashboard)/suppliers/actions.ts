"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendRfqInvitationEmail } from "@/lib/email";
import { inboundAddressForToken } from "@/lib/resend";
import type { RfqItem } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Manually pre-adds a trusted supplier profile, independent of any RFQ. */
export async function createSupplier(values: {
  email: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  notes?: string;
}) {
  const email = values.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { error: "Enter a valid email address" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("email", email)
    .maybeSingle();
  if (existing) return { error: "A supplier with this email already exists" };

  const { error } = await supabase.from("suppliers").insert({
    buyer_id: user.id,
    email,
    company_name: values.companyName?.trim() || null,
    contact_name: values.contactName?.trim() || null,
    phone: values.phone?.trim() || null,
    notes: values.notes?.trim() || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/suppliers");
  return { success: true };
}

/** Persists the buyer's private notes on a supplier's detail page. */
export async function updateSupplierNotes(supplierId: string, notes: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("suppliers")
    .update({ notes: notes.trim() || null })
    .eq("id", supplierId);
  if (error) return { error: error.message };

  revalidatePath(`/suppliers/${supplierId}`);
  return { success: true };
}

/**
 * Adds an already-known supplier to an RFQ they haven't been invited to yet.
 * If the RFQ has already been sent, the invitation email goes out
 * immediately (same content/reply-to as sendRfq) — otherwise the new invite
 * sits as 'pending' and goes out next time the buyer clicks "Send invitations".
 */
export async function inviteSupplierToRfq(rfqId: string, supplierId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("id, email, company_name, contact_name")
    .eq("id", supplierId)
    .single();
  if (!supplier) return { error: "Supplier not found" };

  const { data: rfq } = await supabase
    .from("rfqs")
    .select("id, status, title, currency, deadline, rfq_items(*)")
    .eq("id", rfqId)
    .single();
  if (!rfq) return { error: "RFQ not found" };
  if (rfq.status === "closed" || rfq.status === "awarded") {
    return { error: "This RFQ is no longer accepting suppliers" };
  }

  const { data: existingInvite } = await supabase
    .from("rfq_suppliers")
    .select("id")
    .eq("rfq_id", rfqId)
    .eq("email", supplier.email)
    .maybeSingle();
  if (existingInvite) return { error: "This supplier is already on that RFQ" };

  const willSendNow = rfq.status === "sent";
  const now = new Date().toISOString();

  const { data: invite, error: insertError } = await supabase
    .from("rfq_suppliers")
    .insert({
      rfq_id: rfqId,
      email: supplier.email,
      company_name: supplier.company_name,
      contact_name: supplier.contact_name,
      supplier_id: supplier.id,
      status: willSendNow ? "sent" : "pending",
      invited_at: willSendNow ? now : null,
    })
    .select("token")
    .single();
  if (insertError || !invite) {
    return { error: insertError?.message ?? "Failed to add supplier to RFQ" };
  }

  if (willSendNow) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const items = (rfq.rfq_items as RfqItem[])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ name: i.name, quantity: Number(i.quantity), unit: i.unit }));

    try {
      await sendRfqInvitationEmail({
        to: supplier.email,
        companyName: supplier.company_name,
        contactName: supplier.contact_name,
        rfq: { title: rfq.title, currency: rfq.currency, deadline: rfq.deadline },
        items,
        formUrl: `${appUrl}/quote/${invite.token}`,
        replyToAddress: inboundAddressForToken(invite.token),
      });
    } catch (e) {
      revalidatePath(`/rfqs/${rfqId}`);
      revalidatePath("/suppliers");
      return {
        error: `Added, but the invitation email failed to send: ${e instanceof Error ? e.message : "unknown error"}`,
      };
    }
  }

  revalidatePath(`/rfqs/${rfqId}`);
  revalidatePath("/suppliers");
  return { success: true };
}
