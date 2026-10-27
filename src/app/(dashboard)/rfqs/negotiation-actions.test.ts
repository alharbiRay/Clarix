import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createClient: () => db }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const generateNegotiationDraft = vi.fn();
vi.mock("@/lib/gemini", () => ({ generateNegotiationDraft: (...a: unknown[]) => generateNegotiationDraft(...a) }));
vi.mock("@/lib/email", () => ({ sendNegotiationEmail: vi.fn(async () => {}) }));

import * as email from "@/lib/email";
import { draftNegotiationReply, sendNegotiationMessage } from "@/app/(dashboard)/rfqs/negotiation-actions";
import { DEMO_READ_ONLY_ERROR } from "@/lib/auth/session";

const quota = () => new Error(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }));

let allowed = true;
let consumed: string[] = [];
function seed({ isDemo = false, poSent = false } = {}) {
  allowed = true;
  db = Object.assign(
    createFakeSupabase({
      profiles: [{ id: "buyer-1", is_demo: isDemo, email: "sara@alwaha.sa", company: "Al Waha Contracting", full_name: "Sara" }],
      rfqs: [
        {
          id: "rfq-1",
          buyer_id: "buyer-1",
          title: "Cement",
          currency: "SAR",
          rfq_items: [{ id: "i1", name: "Cement", quantity: 100, unit: "bags", position: 0 }],
          rfq_suppliers: [
            { id: "s1", email: "sales@najd.sa", company_name: "Najd Supplies", contact_name: "Fahad", supplier_id: "sup-1", suppliers: { preferred_language: null } },
            { id: "s2", email: "info@alrashid.sa", company_name: "Al Rashid Trading", contact_name: null, supplier_id: "sup-2", suppliers: null },
          ],
          quotes: [
            { id: "q1", supplier_id: "s1", status: "submitted", delivery_days: 10, warranty: "6 months", quote_items: [{ rfq_item_id: "i1", total_price: 8000, unit_price: 80 }] },
            { id: "q2", supplier_id: "s2", status: "confirmed", delivery_days: 7, warranty: "12 months", quote_items: [{ rfq_item_id: "i1", total_price: 7400, unit_price: 74 }] },
          ],
        },
      ],
      rfq_awards: poSent ? [{ rfq_id: "rfq-1", po_sent_at: "2026-10-01T00:00:00Z" }] : [],
      suppliers: [{ id: "sup-1", buyer_id: "buyer-1", email: "sales@najd.sa", preferred_language: null }],
      audit_events: [],
    }),
    { auth: { getUser: async () => ({ data: { user: { id: "buyer-1" } }, error: null }) } }
  );
  consumed = [];
  db.rpcHandlers.consume_rate_limit = (args) => {
    consumed.push(args.p_action as string);
    return allowed;
  };
}

describe("draftNegotiationReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed();
  });

  it("asks the AI with a prompt that carries no competitor details", async () => {
    generateNegotiationDraft.mockResolvedValueOnce({ subject: "Your quotation", body: "Dear Fahad, we received a lower offer. Could you reduce by about 5%?" });
    const r = await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "en", targetPercent: 5 });
    expect(r).toMatchObject({ source: "ai", language: "en", draft: { subject: "Your quotation" } });
    const prompt = generateNegotiationDraft.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/Rashid|7,?400|74\b/);
  });

  it("replaces an AI draft that leaks a competitor with a safe template", async () => {
    generateNegotiationDraft.mockResolvedValueOnce({ subject: "Offer", body: "Al Rashid Trading offered SAR 7,400 — please match it." });
    const r = await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "en", targetPercent: null });
    expect(r).toMatchObject({ source: "template", notice: expect.stringMatching(/privacy check/) });
    if ("draft" in r) expect(r.draft.body).not.toMatch(/Rashid|7,400/);
  });

  it("falls back to a template when the AI quota is exhausted", async () => {
    generateNegotiationDraft.mockRejectedValueOnce(quota());
    const r = await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "ar", targetPercent: 5 });
    expect(r).toMatchObject({ source: "template", language: "ar", notice: expect.stringMatching(/busy/) });
  });

  it("is rate-limited", async () => {
    allowed = false;
    expect(await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "en", targetPercent: null })).toEqual({
      error: expect.stringMatching(/limit/),
    });
    expect(generateNegotiationDraft).not.toHaveBeenCalled();
  });

  it("in the demo, drafts from the template without calling the AI", async () => {
    seed({ isDemo: true });
    const r = await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "en", targetPercent: 5 });
    expect(r).toMatchObject({ source: "template", demo: true });
    expect(generateNegotiationDraft).not.toHaveBeenCalled();
  });

  it("doesn't charge the limit for a request that can't be drafted", async () => {
    expect(await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "nope", language: "en", targetPercent: null })).toEqual({ error: "Quote not found." });
    expect(await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "en", targetPercent: 90 })).toEqual({
      error: expect.stringMatching(/1 to 50/),
    });
    expect(consumed).toEqual([]);
  });

  it("returns the target it drafted with, so Send matches the text", async () => {
    generateNegotiationDraft.mockResolvedValueOnce({ subject: "Line
Break", body: "Dear Fahad, could you reduce by about 5%? Thanks." });
    const r = await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "en", targetPercent: 5 });
    expect(r).toMatchObject({ targetPercent: 5, draft: { subject: "Line Break" } });
  });

  it("refuses once a PO has been sent", async () => {
    seed({ poSent: true });
    expect(await draftNegotiationReply({ rfqId: "rfq-1", quoteId: "q1", language: "en", targetPercent: null })).toEqual({
      error: "A PO has already been sent for this RFQ.",
    });
  });
});

describe("sendNegotiationMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed();
  });
  const clean = {
    rfqId: "rfq-1",
    quoteId: "q1",
    subject: "Your quotation for Cement",
    body: "Dear Fahad, we received a lower offer. Could you reduce your price by about 5%?",
    language: "en" as const,
    targetPercent: 5,
    source: "ai" as const,
  };

  it("sends to the supplier with replies going to the buyer, logs it, and remembers the language", async () => {
    expect(await sendNegotiationMessage(clean)).toEqual({ success: true });
    expect(email.sendNegotiationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "sales@najd.sa", replyTo: "sara@alwaha.sa", subject: clean.subject, language: "en" })
    );
    expect(db.tables.audit_events).toEqual([
      expect.objectContaining({
        event_type: "negotiation_sent",
        actor_type: "buyer",
        payload: expect.objectContaining({ supplier: "Najd Supplies", targetPercent: 5, language: "en", source: "ai" }),
      }),
    ]);
    expect(db.tables.suppliers[0].preferred_language).toBe("en");
  });

  it("refuses a message that names another supplier or their price — even one the buyer typed", async () => {
    const r = await sendNegotiationMessage({ ...clean, body: "Al Rashid Trading quoted 7,400. Can you beat it?" });
    expect(r).toEqual({ error: expect.stringMatching(/Al Rashid Trading.*7,400|7,400.*Al Rashid Trading/) });
    expect(email.sendNegotiationEmail).not.toHaveBeenCalled();
    expect(db.tables.audit_events).toHaveLength(0);
  });

  it("doesn't charge the send limit for a message it refuses", async () => {
    await sendNegotiationMessage({ ...clean, body: "Al Rashid Trading quoted 7,400. Can you beat it?" });
    await sendNegotiationMessage({ ...clean, body: "hi" });
    expect(consumed).toEqual([]);
    await sendNegotiationMessage(clean);
    expect(consumed).toEqual(["negotiation_send"]);
  });

  it("validates the target and the source before anything else", async () => {
    expect(await sendNegotiationMessage({ ...clean, targetPercent: 60 })).toEqual({ error: expect.stringMatching(/1 to 50/) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await sendNegotiationMessage({ ...clean, source: "made_up" as any })).toEqual({ error: "Unknown draft source." });
    expect(email.sendNegotiationEmail).not.toHaveBeenCalled();
  });

  it("validates the message", async () => {
    expect(await sendNegotiationMessage({ ...clean, body: "hi" })).toEqual({ error: expect.stringMatching(/too short/) });
    expect(await sendNegotiationMessage({ ...clean, subject: " " })).toEqual({ error: expect.stringMatching(/subject/i) });
  });

  it("reports a failed email without logging it as sent", async () => {
    vi.mocked(email.sendNegotiationEmail).mockRejectedValueOnce(new Error("resend down"));
    expect(await sendNegotiationMessage(clean)).toEqual({ error: expect.stringMatching(/couldn't send/i) });
    expect(db.tables.audit_events).toHaveLength(0);
  });

  it("is refused in the demo and rate-limited otherwise", async () => {
    seed({ isDemo: true });
    expect(await sendNegotiationMessage(clean)).toEqual({ error: DEMO_READ_ONLY_ERROR });
    seed();
    allowed = false;
    expect(await sendNegotiationMessage(clean)).toEqual({ error: expect.stringMatching(/limit/) });
    expect(email.sendNegotiationEmail).not.toHaveBeenCalled();
  });
});
