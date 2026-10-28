import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase } from "@/test/fake-supabase";
import { GeminiOutputError } from "@/lib/gemini-errors";

const extractQuoteFromPdf = vi.fn();
vi.mock("@/lib/gemini", () => ({ extractQuoteFromPdf: (...args: unknown[]) => extractQuoteFromPdf(...args) }));

import { createQuoteFromPdf, looksLikePdf } from "@/lib/quote-intake";

const PDF = Buffer.from("%PDF-1.7\n...");

function input(pdfBuffer: Buffer) {
  return {
    supabase: createFakeSupabase({ quotes: [], audit_events: [] }) as unknown as SupabaseClient,
    rfqId: "rfq-1",
    buyerId: "buyer-1",
    supplier: { id: "rs-1", email: "s@supplier.example", company_name: "Gulf Trading" },
    currency: "SAR",
    items: [],
    pdfBuffer,
    source: "pdf" as const,
  };
}

describe("createQuoteFromPdf", () => {
  it("checks the file's bytes, not its declared type", async () => {
    expect(looksLikePdf(PDF)).toBe(true);
    expect(looksLikePdf(Buffer.from("<html>not a pdf</html>"))).toBe(false);
    expect(await createQuoteFromPdf(input(Buffer.from("MZ\x90\x00 executable")))).toEqual({ error: "This file isn't a valid PDF" });
    expect(extractQuoteFromPdf).not.toHaveBeenCalled();
  });

  it("asks for manual entry when the AI can't produce a usable reading", async () => {
    extractQuoteFromPdf.mockRejectedValueOnce(new GeminiOutputError("still invalid after repair"));
    const result = await createQuoteFromPdf(input(PDF));
    expect(result).toMatchObject({ needsManualEntry: true, error: expect.stringMatching(/Enter the quote manually/) });
  });
});
