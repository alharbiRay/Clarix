import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { MAX_PDF_BYTES, processInboundEmailQuote, type InboundEmailDeps } from "@/lib/inbound-email";
import { PermanentJobError, type Job } from "@/lib/jobs/processor";

const PDF = Buffer.from("%PDF-1.7\n...fake pdf body...");

const job: Job = {
  id: "job-1",
  type: "inbound_email_quote",
  buyer_id: "buyer-1",
  rfq_id: "rfq-1",
  payload: { emailId: "email-1", rfqSupplierId: "rs-1" },
  attempts: 1,
  max_attempts: 3,
};

function setup(
  overrides: { rfqStatus?: string; deadline?: string | null; quotes?: Record<string, unknown>[]; isDemo?: boolean } = {}
) {
  const db = createFakeSupabase({
    rfq_suppliers: [
      {
        id: "rs-1",
        rfq_id: "rfq-1",
        email: "s@supplier.sa",
        company_name: "Al Noor",
        contact_name: null,
        rfqs: {
          status: overrides.rfqStatus ?? "sent",
          deadline: overrides.deadline ?? null,
          currency: "SAR",
          title: "Cement",
          buyer_id: "buyer-1",
          is_demo: overrides.isDemo ?? false,
          rfq_items: [],
        },
      },
    ],
    quotes: overrides.quotes ?? [],
  });
  const deps: InboundEmailDeps = {
    listAttachments: vi.fn(async () => [
      { filename: "quote.pdf", content_type: "application/pdf", size: PDF.length, download_url: "https://files/quote.pdf" },
    ]),
    download: vi.fn(async () => PDF),
    createQuote: vi.fn(async () => ({ quoteId: "q-1" })),
  };
  return { db, deps };
}

describe("processInboundEmailQuote", () => {
  it("extracts the PDF into a quote tagged with the email id", async () => {
    const { db, deps } = setup();
    expect(await processInboundEmailQuote(db as never, job, deps)).toEqual({ outcome: "created", quoteId: "q-1" });
    expect(deps.createQuote).toHaveBeenCalledWith(
      expect.objectContaining({ rfqId: "rfq-1", buyerId: "buyer-1", source: "email", sourceEmailId: "email-1", pdfBuffer: PDF })
    );
  });

  it("ignores email replies to demo-workspace RFQs", async () => {
    const { db, deps } = setup({ isDemo: true });
    expect((await processInboundEmailQuote(db as never, job, deps)).outcome).toBe("demo_rfq");
    expect(deps.listAttachments).not.toHaveBeenCalled();
  });

  it("skips RFQs that stopped accepting quotes", async () => {
    const { db, deps } = setup({ rfqStatus: "awarded" });
    expect((await processInboundEmailQuote(db as never, job, deps)).outcome).toBe("rfq_closed");
    const late = setup({ deadline: "2000-01-01T00:00:00Z" });
    expect((await processInboundEmailQuote(late.db as never, job, late.deps)).outcome).toBe("rfq_closed");
    expect(deps.createQuote).not.toHaveBeenCalled();
  });

  it("judges the deadline by when the email arrived, not when a delayed retry runs", async () => {
    const { db, deps } = setup({ deadline: "2026-05-01T12:00:00.000Z" });
    const onTime = { ...job, payload: { ...job.payload, receivedAt: "2026-05-01T08:00:00.000Z" } };
    expect((await processInboundEmailQuote(db as never, onTime, deps)).outcome).toBe("created");
    const late = { ...job, payload: { ...job.payload, receivedAt: "2026-05-01T13:00:00.000Z" } };
    expect((await processInboundEmailQuote(db as never, late, deps)).outcome).toBe("rfq_closed");
  });

  it("is idempotent on the email id (webhook retries, job retries)", async () => {
    const { db, deps } = setup({ quotes: [{ id: "q-0", supplier_id: "other", source_email_id: "email-1", status: "confirmed" }] });
    expect((await processInboundEmailQuote(db as never, job, deps)).outcome).toBe("already_processed");
  });

  it("skips suppliers that already have an active quote", async () => {
    const { db, deps } = setup({ quotes: [{ id: "q-0", supplier_id: "rs-1", source_email_id: null, status: "submitted" }] });
    expect((await processInboundEmailQuote(db as never, job, deps)).outcome).toBe("supplier_has_quote");
  });

  it("does nothing when the reply has no PDF", async () => {
    const { db, deps } = setup();
    deps.listAttachments = vi.fn(async () => [{ filename: "logo.png", content_type: "image/png", size: 10, download_url: "x" }]);
    expect((await processInboundEmailQuote(db as never, job, deps)).outcome).toBe("no_pdf");
  });

  it("rejects oversized attachments before downloading them", async () => {
    const { db, deps } = setup();
    deps.listAttachments = vi.fn(async () => [
      { filename: "huge.pdf", content_type: "application/pdf", size: MAX_PDF_BYTES + 1, download_url: "x" },
    ]);
    await expect(processInboundEmailQuote(db as never, job, deps)).rejects.toBeInstanceOf(PermanentJobError);
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("rejects files that claim to be PDFs but are not", async () => {
    const { db, deps } = setup();
    deps.download = vi.fn(async () => Buffer.from("MZ\x90\x00 definitely an exe"));
    await expect(processInboundEmailQuote(db as never, job, deps)).rejects.toThrow(/not a valid PDF/);
  });

  it("rethrows the original Gemini error on quota failures so the job backs off as 'quota'", async () => {
    const { db, deps } = setup();
    const quota = new Error('{"error":{"status":"RESOURCE_EXHAUSTED","message":"PerDay"}}');
    deps.createQuote = vi.fn(async () => ({ error: "Extraction failed", quotaExceeded: true, cause: quota }));
    await expect(processInboundEmailQuote(db as never, job, deps)).rejects.toBe(quota);
  });

  it("fails permanently when the job payload is malformed", async () => {
    const { db, deps } = setup();
    await expect(processInboundEmailQuote(db as never, { ...job, payload: {} }, deps)).rejects.toBeInstanceOf(PermanentJobError);
  });
});
