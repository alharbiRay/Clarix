import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
const scheduleAutoRecommendation = vi.fn(async (_rfqId: string, _buyerId: string) => "job-1");
vi.mock("@/lib/jobs/schedule", () => ({
  scheduleAutoRecommendation: (rfqId: string, buyerId: string) => scheduleAutoRecommendation(rfqId, buyerId),
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
        token: "tok",
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
    seed();
  });

  it("saves the quote with computed line totals, marks the invite submitted, and schedules the recommendation", async () => {
    expect(await submitQuote("tok", values)).toEqual({ success: true });
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
    expect(await submitQuote("tok", values)).toEqual({ error: "This RFQ is no longer accepting quotes." });
  });

  it("rejects submissions after the deadline", async () => {
    seed({ deadline: "2000-01-01T00:00:00Z" });
    expect(await submitQuote("tok", values)).toEqual({ error: "The deadline for this RFQ has passed." });
  });

  it("rejects a second submission for the same invitation", async () => {
    seed({}, [{ id: "q-0", supplier_id: "rs-1", status: "submitted" }]);
    expect(await submitQuote("tok", values)).toEqual({ error: "A quote has already been submitted for this invitation." });
  });

  it("rejects line items that belong to another RFQ", async () => {
    const forged = { ...values, items: [{ rfq_item_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", unit_price: 1 }] };
    expect(await submitQuote("tok", forged)).toEqual({ error: "Invalid line item in submission." });
    expect(db.tables.quotes).toHaveLength(0);
  });

  it("rejects negative prices before touching the database", async () => {
    const bad = { ...values, items: [{ rfq_item_id: ITEM_A, unit_price: -5 }] };
    expect(await submitQuote("tok", bad)).toEqual({ error: "Price can't be negative" });
  });

  it("refuses quotes on the shared demo workspace's RFQs", async () => {
    seed({ is_demo: true });
    expect(await submitQuote("tok", values)).toEqual({
      error: "This is a demo RFQ and doesn't accept quotes.",
    });
    expect(db.tables.quotes).toHaveLength(0);
    expect(scheduleAutoRecommendation).not.toHaveBeenCalled();
  });
});
