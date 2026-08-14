import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend";
import { createQuoteFromPdf } from "@/lib/quote-intake";
import { maybeAutoGenerateRecommendation } from "@/lib/auto-recommendation";
import type { RfqItem } from "@/lib/types";

// Gemini extraction can take a few seconds — give the function room.
export const runtime = "nodejs";
export const maxDuration = 60;

const INBOUND_TOKEN_RE = /^quotes\+([a-f0-9]+)@/i;

/**
 * Resend inbound webhook — fires when a supplier replies to their invitation
 * email with a PDF quote attached. Verifies the request, matches the unique
 * per-supplier token embedded in the recipient address, downloads any PDF
 * attachment, and runs it through the same extraction pipeline the buyer's
 * manual PDF upload uses (src/lib/quote-intake.ts).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let event;
  try {
    const resend = getResendClient();
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("RESEND_WEBHOOK_SECRET is not set");

    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch (e) {
    console.error("Resend webhook signature verification failed:", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true });
  }

  const data = event.data;
  const matchedTo = data.to.find((addr) => INBOUND_TOKEN_RE.test(addr));
  const token = matchedTo?.match(INBOUND_TOKEN_RE)?.[1];
  if (!token) {
    return NextResponse.json({ ok: true }); // not addressed to one of our tokens
  }

  const supabase = createAdminClient();

  const { data: supplier } = await supabase
    .from("rfq_suppliers")
    .select(
      "id, rfq_id, email, company_name, contact_name, rfqs(status, deadline, currency, title, buyer_id, rfq_items(*))"
    )
    .eq("token", token)
    .single();
  if (!supplier) {
    return NextResponse.json({ ok: true }); // unknown token, nothing to do
  }

  const rfq = supplier.rfqs as unknown as {
    status: string;
    deadline: string | null;
    currency: string;
    title: string;
    buyer_id: string;
    rfq_items: RfqItem[];
  };

  if (rfq.status !== "sent" && rfq.status !== "draft") {
    return NextResponse.json({ ok: true }); // no longer accepting quotes
  }
  if (rfq.deadline && new Date(rfq.deadline).getTime() < Date.now()) {
    return NextResponse.json({ ok: true }); // deadline passed
  }

  const { data: existingByEmail } = await supabase
    .from("quotes")
    .select("id")
    .eq("source_email_id", data.email_id)
    .maybeSingle();
  if (existingByEmail) {
    return NextResponse.json({ ok: true }); // already processed (webhook retry)
  }

  const { data: existingForSupplier } = await supabase
    .from("quotes")
    .select("id")
    .eq("supplier_id", supplier.id)
    .neq("status", "rejected")
    .maybeSingle();
  if (existingForSupplier) {
    return NextResponse.json({ ok: true }); // supplier already has a quote on record
  }

  const resend = getResendClient();
  const { data: attachmentList, error: attachmentListError } =
    await resend.emails.receiving.attachments.list({ emailId: data.email_id });
  if (attachmentListError) {
    console.error("Failed to list inbound attachments:", attachmentListError);
    return NextResponse.json({ error: attachmentListError.message }, { status: 502 });
  }

  const pdfAttachment = attachmentList?.data.find(
    (a) => a.content_type === "application/pdf"
  );
  if (!pdfAttachment) {
    return NextResponse.json({ ok: true }); // reply had no PDF — nothing to extract
  }

  const pdfResponse = await fetch(pdfAttachment.download_url);
  if (!pdfResponse.ok) {
    return NextResponse.json({ error: "Failed to download attachment" }, { status: 502 });
  }
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

  const result = await createQuoteFromPdf({
    supabase,
    rfqId: supplier.rfq_id,
    buyerId: rfq.buyer_id,
    supplier: {
      id: supplier.id,
      email: supplier.email,
      company_name: supplier.company_name,
      contact_name: supplier.contact_name,
    },
    currency: rfq.currency,
    items: rfq.rfq_items,
    pdfBuffer,
    source: "email",
    sourceEmailId: data.email_id,
  });

  if (result.error) {
    console.error("Failed to create quote from inbound email:", result.error);
    const message = result.quotaExceeded
      ? `A supplier's emailed quote for ${rfq.title} couldn't be processed — the Gemini API quota/rate limit was hit. Ask them to resend, or enter it manually.`
      : `A supplier's emailed quote for ${rfq.title} couldn't be processed automatically: ${result.error}`;
    await supabase.from("notifications").insert({
      buyer_id: rfq.buyer_id,
      rfq_id: supplier.rfq_id,
      type: "review_needed",
      message,
    });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Extraction is auto-confirmed (src/lib/quote-intake.ts) — no per-quote
  // "please review" email. The buyer hears from us once, at the end, via
  // maybeAutoGenerateRecommendation's auto-approval evaluation.
  //
  // Must be awaited: this route already declares maxDuration=60 to give it
  // room, but an un-awaited call here would race the NextResponse below and
  // could be torn down before the Gemini call and auto-approval evaluation
  // finish.
  console.log(`[webhook] rfq=${supplier.rfq_id} quote=${result.quoteId} confirmed from inbound email — awaiting maybeAutoGenerateRecommendation`);
  await maybeAutoGenerateRecommendation(supplier.rfq_id).catch((e) =>
    console.error(`[webhook] rfq=${supplier.rfq_id} auto-recommendation failed:`, e)
  );

  return NextResponse.json({ ok: true, quoteId: result.quoteId });
}
