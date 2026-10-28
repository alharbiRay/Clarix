import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
const scheduleAutoRecommendation = vi.fn(async (_rfqId: string, _buyerId: string) => "job-1");
vi.mock("@/lib/jobs/schedule", () => ({
  scheduleAutoRecommendation: (rfqId: string, buyerId: string) => scheduleAutoRecommendation(rfqId, buyerId),
}));

const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef";
let quoteCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: () => ({ get: (name: string) => (name === "CLARIX_QUOTE_LOCALE" && quoteCookie ? { value: quoteCookie } : undefined) }),
  headers: () => new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
}));

import { submitQuote } from "@/app/quote/[token]/actions";

const ITEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ITEM_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function seed(rfq: Record<string, unknown> = {}, quotes: Record<string, unknown>[] = []) {
  db = createFakeSupabase({
    rfq_suppliers: [
      {
        id: "rs-1",
        rfq_id: "rfq-1",
        token: TOKEN,
        status: "sent",
        email: "s@supplier.example",
        company_name: "Al Noor",
        contact_name: null,
        rfqs: { id: "rfq-1", status: "sent", deadline: null, buyer_id: "buyer-1", is_demo: false, currency: "SAR", ...rfq },
      },
    ],
    rfq_items: [
      { id: ITEM_A, rfq_id: "rfq-1", quantity: 10 },
      { id: ITEM_B, rfq_id: "rfq-1", quantity: 3 },
    ],
    quotes,
    quote_items: [],
    suppliers: [],
  });
  db.rpcHandlers.consume_public_rate_limit = () => true;
}

const values = {
  items: [
    { rfq_item_id: ITEM_A, unit_price: 12.5, notes: "" },
    { rfq_item_id: ITEM_B, unit_price: null, notes: "out of stock" },
  ],
  delivery_days: 7,
  payment_terms: "Net 30",
  warranty: "12 months",
  notes: "",
};

describe("submitQuote (supplier form)", () => {
  beforeEach(() => {
    scheduleAutoRecommendation.mockClear();
    quoteCookie = undefined;
    seed();
  });

  it("saves the quote with computed line totals, marks the invite submitted, and schedules the recommendation", async () => {
    expect(await submitQuote(TOKEN, values)).toEqual({ success: true });
    expect(db.tables.quotes).toEqual([
      expect.objectContaining({ rfq_id: "rfq-1", supplier_id: "rs-1", source: "form", status: "submitted", delivery_days: 7, warranty: "12 months" }),
    ]);
    expect(db.tables.quote_items).toEqual([
      expect.objectContaining({ rfq_item_id: ITEM_A, unit_price: 12.5, total_price: 125 }),
      expect.objectContaining({ rfq_item_id: ITEM_B, unit_price: null, total_price: null, notes: "out of stock" }),
    ]);
    expect(db.tables.rfq_suppliers[0].status).toBe("submitted");
    expect(scheduleAutoRecommendation).toHaveBeenCalledWith("rfq-1", "buyer-1");
    expect(db.tables.audit_events).toEqual([
      expect.objectContaining({ event_type: "quote_received", actor_type: "supplier", buyer_id: "buyer-1", rfq_id: "rfq-1", payload: expect.objectContaining({ source: "form", supplier: "Al Noor", total: 125, currency: "SAR" }) }),
    ]);
  });

  it("rejects an unknown token", async () => {
    expect(await submitQuote("nope", values)).toEqual({ error: "This quote link is invalid." });
  });

  it("rejects RFQs that are no longer open", async () => {
    seed({ status: "awarded" });
    expect(await submitQuote(TOKEN, values)).toEqual({ error: "This RFQ is no longer accepting quotes." });
  });

  it("rejects submissions after the deadline", async () => {
    seed({ deadline: "2000-01-01T00:00:00Z" });
    expect(await submitQuote(TOKEN, values)).toEqual({ error: "The deadline for this RFQ has passed." });
  });

  it("rejects a second submission for the same invitation", async () => {
    seed({}, [{ id: "q-0", supplier_id: "rs-1", status: "submitted" }]);
    expect(await submitQuote(TOKEN, values)).toEqual({ error: "A quote has already been submitted for this invitation." });
  });

  it("rejects line items that belong to another RFQ", async () => {
    const forged = { ...values, items: [{ rfq_item_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", unit_price: 1 }] };
    expect(await submitQuote(TOKEN, forged)).toEqual({ error: "Invalid line item in submission." });
    expect(db.tables.quotes).toHaveLength(0);
  });

  it("rejects negative prices before touching the database", async () => {
    const bad = { ...values, items: [{ rfq_item_id: ITEM_A, unit_price: -5 }] };
    expect(await submitQuote(TOKEN, bad)).toEqual({ error: "Price can't be negative" });
  });

  it("refuses quotes on the shared demo workspace's RFQs", async () => {
    seed({ is_demo: true });
    expect(await submitQuote(TOKEN, values)).toEqual({
      error: "This is a demo RFQ and doesn't accept quotes.",
    });
    expect(db.tables.quotes).toHaveLength(0);
    expect(scheduleAutoRecommendation).not.toHaveBeenCalled();
  });

  describe("supplier language", () => {
    const savedSupplier = (lang: string | null) => ({
      id: "sup-1", buyer_id: "buyer-1", email: "s@supplier.example", company_name: "Al Noor", contact_name: null, preferred_language: lang,
    });

    it("saves the language they quoted in when none is saved", async () => {
      expect(await submitQuote(TOKEN, values, "ar")).toEqual({ success: true });
      expect(db.tables.suppliers).toEqual([expect.objectContaining({ preferred_language: "ar" })]);
    });

    it("keeps a saved preference when the page picked the language for them", async () => {
      db.tables.suppliers.push(savedSupplier("en"));
      expect(await submitQuote(TOKEN, values, "ar")).toEqual({ success: true });
      expect(db.tables.suppliers[0].preferred_language).toBe("en");
    });

    it("replaces a saved preference when they switched language on the page", async () => {
      db.tables.suppliers.push(savedSupplier("en"));
      quoteCookie = "ar";
      expect(await submitQuote(TOKEN, values, "ar")).toEqual({ success: true });
      expect(db.tables.suppliers[0].preferred_language).toBe("ar");
    });

    it("answers in the supplier's language", async () => {
      seed({ status: "awarded" });
      expect(await submitQuote(TOKEN, values, "ar")).toEqual({ error: expect.stringMatching(/[؀-ۿ]/) });
    });
  });

  describe("rate limits", () => {
    it("refuses once this connection or link is over its limit, before touching the quote", async () => {
      const calls: Record<string, unknown>[] = [];
      db.rpcHandlers.consume_public_rate_limit = (args) => {
        calls.push(args);
        return args.p_action !== "quote_submit_ip";
      };
      expect(await submitQuote(TOKEN, values)).toEqual({ error: expect.stringMatching(/Too many attempts/) });
      expect(db.tables.quotes).toEqual([]);
      // Hashed keys only: the raw IP never reaches the database.
      expect(JSON.stringify(calls)).not.toContain("203.0.113.7");
      expect(calls[0]).toMatchObject({ p_action: "quote_submit_ip", p_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    });

    it("still accepts the quote if the rate-limit check itself fails", async () => {
      db.rpcHandlers.consume_public_rate_limit = () => { throw new Error("db down"); };
      expect(await submitQuote(TOKEN, values)).toEqual({ success: true });
    });

    it("rejects malformed links without a database lookup", async () => {
      expect(await submitQuote("../../etc", values)).toEqual({ error: "This quote link is invalid." });
    });
  });
});
