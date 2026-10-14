import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/resend";
import { scheduleJob } from "@/lib/jobs/schedule";
import { JOB_TYPES } from "@/lib/jobs/enqueue";

export const runtime = "nodejs";
// The extraction itself runs in the background job started below (via
// waitUntil); this budget covers it when it runs inline on this instance.
export const maxDuration = 60;

const INBOUND_TOKEN_RE = /^quotes\+([a-f0-9]+)@/i;

function receivedAt(event: unknown): string {
  const e = event as { created_at?: unknown; data?: { created_at?: unknown } };
  const candidate = e.data?.created_at ?? e.created_at;
  return typeof candidate === "string" && !Number.isNaN(Date.parse(candidate))
    ? new Date(candidate).toISOString()
    : new Date().toISOString();
}

/**
 * Resend inbound webhook — fires when a supplier replies to their invitation
 * email with a PDF quote attached.
 *
 * Only the fast, cheap work happens in the request: verify the svix
 * signature, match the per-supplier token in the recipient address, and
 * record an `inbound_email_quote` job. The slow part (attachment download +
 * Gemini extraction, src/lib/inbound-email.ts) runs as that job, with
 * retries and quota backoff, so a Gemini outage no longer loses the quote.
 * The job's dedupe key and the source_email_id check make webhook retries
 * harmless. If the job can't be recorded we return 500 so Resend retries.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let event;
  try {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error("RESEND_WEBHOOK_SECRET is not set");

    event = getResendClient().webhooks.verify({
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
  const token = matchedTo?.match(INBOUND_TOKEN_RE)?.[1]?.toLowerCase();
  if (!token) {
    return NextResponse.json({ ok: true }); // not addressed to one of our tokens
  }

  const supabase = createAdminClient();
  const { data: supplier, error: lookupError } = await supabase
    .from("rfq_suppliers")
    .select("id, rfq_id, rfqs(buyer_id)")
    .eq("token", token)
    .maybeSingle();
  if (lookupError) {
    // A transient DB error must not look like "unknown token" — answer 500
    // so Resend retries the delivery instead of the quote being dropped.
    console.error(JSON.stringify({ event: "webhook.token_lookup_failed", error: lookupError.message }));
    return NextResponse.json({ error: "Temporary failure" }, { status: 500 });
  }
  if (!supplier) {
    return NextResponse.json({ ok: true }); // unknown token, nothing to do
  }
  const buyerId = (supplier.rfqs as unknown as { buyer_id: string }).buyer_id;

  const jobId = await scheduleJob({
    type: JOB_TYPES.inboundEmailQuote,
    buyerId,
    rfqId: supplier.rfq_id,
    // receivedAt: the RFQ deadline is judged against arrival time, not
    // against whenever a (possibly quota-delayed) retry happens to run.
    payload: { emailId: data.email_id, rfqSupplierId: supplier.id, receivedAt: receivedAt(event) },
    dedupeKey: `inbound_email:${data.email_id}`,
    maxAttempts: 3,
  });
  if (!jobId) {
    return NextResponse.json({ error: "Could not record the quote for processing" }, { status: 500 });
  }

  console.log(JSON.stringify({ event: "webhook.inbound_email_enqueued", rfqId: supplier.rfq_id, jobId }));
  return NextResponse.json({ ok: true, jobId });
}
