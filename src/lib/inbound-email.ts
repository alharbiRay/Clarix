import type { SupabaseClient } from "@supabase/supabase-js";
import { getResendClient } from "@/lib/resend";
import { createQuoteFromPdf, looksLikePdf, type QuoteIntakeInput, type QuoteIntakeResult } from "@/lib/quote-intake";
import { PermanentJobError, type Job } from "@/lib/jobs/processor";
import type { RfqItem } from "@/lib/types";

export const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB — same cap as buyer uploads

export interface InboundAttachment {
  filename?: string | null;
  content_type: string;
  size?: number | null;
  download_url: string;
}

export interface InboundEmailDeps {
  listAttachments(emailId: string): Promise<InboundAttachment[]>;
  download(url: string): Promise<Buffer>;
  createQuote(input: QuoteIntakeInput): Promise<QuoteIntakeResult>;
}

export type InboundEmailResult =
  | { outcome: "created"; quoteId: string }
  | { outcome: "rfq_closed" | "already_processed" | "supplier_has_quote" | "no_pdf" | "unknown_supplier" | "demo_rfq" };

function defaultDeps(): InboundEmailDeps {
  return {
    async listAttachments(emailId) {
      const { data, error } = await getResendClient().emails.receiving.attachments.list({ emailId });
      if (error) throw new Error(`Failed to list inbound attachments: ${error.message}`);
      return (data?.data ?? []) as InboundAttachment[];
    },
    async download(url) {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Attachment download failed (${res.status})`);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > MAX_PDF_BYTES) throw new PermanentJobError("PDF is too large (max 10 MB)");
      return Buffer.from(await res.arrayBuffer());
    },
    createQuote: createQuoteFromPdf,
  };
}


/**
 * The `inbound_email_quote` job handler. The Resend webhook only verifies,
 * matches the token and enqueues; this does the slow part (attachment
 * download + Gemini extraction) with retries. Every check is repeated here
 * because the world may have changed between webhook and job run, and the
 * source_email_id check makes repeated runs harmless.
 */
export async function processInboundEmailQuote(
  supabase: SupabaseClient,
  job: Job,
  deps: InboundEmailDeps = defaultDeps()
): Promise<InboundEmailResult> {
  const emailId = job.payload.emailId;
  const rfqSupplierId = job.payload.rfqSupplierId;
  if (typeof emailId !== "string" || typeof rfqSupplierId !== "string") {
    throw new PermanentJobError("inbound_email_quote job payload is missing emailId/rfqSupplierId");
  }

  const { data: supplier, error: supplierError } = await supabase
    .from("rfq_suppliers")
    .select("id, rfq_id, email, company_name, contact_name, rfqs(status, deadline, currency, title, buyer_id, is_demo, rfq_items(*))")
    .eq("id", rfqSupplierId)
    .maybeSingle();
  if (supplierError) throw new Error(`Failed to load supplier: ${supplierError.message}`);
  if (!supplier) return { outcome: "unknown_supplier" };

  const rfq = supplier.rfqs as unknown as {
    status: string;
    deadline: string | null;
    currency: string;
    title: string;
    buyer_id: string;
    is_demo?: boolean;
    rfq_items: RfqItem[];
  };
  if (rfq.is_demo) return { outcome: "demo_rfq" };
  const received = typeof job.payload.receivedAt === "string" ? Date.parse(job.payload.receivedAt) : NaN;
  const arrivedAt = Number.isNaN(received) ? Date.now() : received;
  if ((rfq.status !== "sent" && rfq.status !== "draft") || (rfq.deadline && new Date(rfq.deadline).getTime() < arrivedAt)) {
    return { outcome: "rfq_closed" };
  }

  const { data: byEmail } = await supabase.from("quotes").select("id").eq("source_email_id", emailId).maybeSingle();
  if (byEmail) return { outcome: "already_processed" };

  const { data: active } = await supabase
    .from("quotes")
    .select("id")
    .eq("supplier_id", supplier.id)
    .neq("status", "rejected")
    .maybeSingle();
  if (active) return { outcome: "supplier_has_quote" };

  const attachments = await deps.listAttachments(emailId);
  const pdf = attachments.find(
    (a) => a.content_type === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
  );
  if (!pdf) return { outcome: "no_pdf" };
  if (typeof pdf.size === "number" && pdf.size > MAX_PDF_BYTES) {
    throw new PermanentJobError("PDF is too large (max 10 MB)");
  }

  const pdfBuffer = await deps.download(pdf.download_url);
  if (pdfBuffer.length > MAX_PDF_BYTES) throw new PermanentJobError("PDF is too large (max 10 MB)");
  if (!looksLikePdf(pdfBuffer)) throw new PermanentJobError("Attachment is not a valid PDF");

  const result = await deps.createQuote({
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
    sourceEmailId: emailId,
  });

  if ("error" in result && result.error) {
    // Hand the original Gemini error to the processor so a quota problem is
    // classified as such (longer backoff + buyer notification).
    if (result.quotaExceeded && result.cause) throw result.cause;
    // An unreadable PDF reads the same on every attempt: give up now, and the
    // give-up hook tells the buyer to enter it manually.
    if (result.needsManualEntry) throw new PermanentJobError(result.error);
    throw new Error(result.error);
  }
  return { outcome: "created", quoteId: (result as { quoteId: string }).quoteId };
}
