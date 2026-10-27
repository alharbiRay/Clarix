import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";

let db: FakeSupabase;
vi.mock("@/lib/supabase/server", () => ({ createClient: () => db }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendPoConfirmationEmail: vi.fn(async () => {}),
  sendRfqInvitationEmail: vi.fn(async () => {}),
}));

import * as email from "@/lib/email";
import { approveAward } from "@/app/(dashboard)/rfqs/actions";

const ITEM = "item-1";
function seed() {
  db = Object.assign(
    createFakeSupabase({
      profiles: [{ id: "buyer-1", is_demo: false }],
      rfqs: [{ id: "rfq-1", title: "Cement", currency: "SAR", buyer_id: "buyer-1", status: "sent", rfq_items: [{ id: ITEM, rfq_id: "rfq-1", position: 0, name: "Cement", quantity: 1, unit: "bags" }] }],
      rfq_awards: [{ rfq_id: "rfq-1", decision: "differs_from_cheapest", recommended_quote_id: "q-ai", recommended_supplier_id: "rs-ai", po_sent_at: null }],
      quotes: [
        { id: "q-ai", rfq_id: "rfq-1", supplier_id: "rs-ai", status: "submitted", delivery_days: 5, warranty: "24 months", quote_items: [{ rfq_item_id: ITEM, total_price: 130 }] },
        { id: "q-cheap", rfq_id: "rfq-1", supplier_id: "rs-cheap", status: "submitted", delivery_days: 9, warranty: null, quote_items: [{ rfq_item_id: ITEM, total_price: 100 }] },
      ],
      rfq_suppliers: [
        { id: "rs-ai", email: "ai@s.example", company_name: "Gulf Office Supplies" },
        { id: "rs-cheap", email: "cheap@s.example", company_name: "Red Sea Packaging Co." },
      ],
      notifications: [],
      audit_events: [],
    }),
    { auth: { getUser: async () => ({ data: { user: { id: "buyer-1" } }, error: null }) } }
  );
}

describe("approveAward", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed();
  });

  it("approving the AI's pick records the approval and the PO", async () => {
    expect(await approveAward("rfq-1")).toEqual({ success: true, rfqId: "rfq-1" });
    expect(email.sendPoConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(db.tables.audit_events.map((e) => e.event_type)).toEqual(["award_approved", "po_sent"]);
    expect(db.tables.audit_events[0]).toMatchObject({
      actor_type: "buyer",
      actor_id: "buyer-1",
      payload: expect.objectContaining({ supplier: "Gulf Office Supplies", override: false }),
    });
  });

  it("records a failed PO email as such", async () => {
    vi.mocked(email.sendPoConfirmationEmail).mockRejectedValueOnce(new Error("resend down"));
    expect(await approveAward("rfq-1")).toEqual({ success: true, rfqId: "rfq-1" });
    expect(db.tables.audit_events[1]).toMatchObject({ event_type: "po_sent", payload: expect.objectContaining({ emailDelivered: false }) });
  });

  it("with auto-approval off, choosing someone other than the AI's latest pick still needs a reason", async () => {
    db.tables.rfq_awards[0] = { rfq_id: "rfq-1", decision: "review_needed", recommended_quote_id: null, recommended_supplier_id: null, po_sent_at: null };
    db.tables.ai_recommendations = [
      { id: "rec-1", rfq_id: "rfq-1", created_at: "2026-01-02T00:00:00Z", content: { ranking: [{ supplier: "Gulf Office Supplies", rank: 1 }] } },
    ];
    expect(await approveAward("rfq-1", "q-cheap")).toEqual({
      error: "Say why you're choosing a different supplier than the AI recommended.",
    });
    expect(await approveAward("rfq-1", "q-cheap", "Faster to site")).toEqual({ success: true, rfqId: "rfq-1" });
    expect(db.tables.audit_events[0].payload).toMatchObject({ override: true, aiPick: "Gulf Office Supplies", reason: "Faster to site" });
  });

  it("with auto-approval off, approving the AI's own pick needs no reason", async () => {
    db.tables.rfq_awards[0] = { rfq_id: "rfq-1", decision: "review_needed", recommended_quote_id: null, recommended_supplier_id: null, po_sent_at: null };
    db.tables.ai_recommendations = [
      { id: "rec-1", rfq_id: "rfq-1", created_at: "2026-01-02T00:00:00Z", content: { ranking: [{ supplier: "Gulf Office Supplies", rank: 1 }] } },
    ];
    expect(await approveAward("rfq-1", "q-ai")).toEqual({ success: true, rfqId: "rfq-1" });
    expect(db.tables.audit_events[0].payload).toMatchObject({ override: false });
  });

  it("above the spend limit, only a manager can approve", async () => {
    db.tables.approval_policies = [
      { buyer_id: "buyer-1", enabled: true, max_delivery_days: 14, require_warranty: true, spend_limit: 100, min_supplier_score: null, require_cheapest: true },
    ];
    db.tables.profiles[0].role = "buyer";
    expect(await approveAward("rfq-1")).toEqual({ error: expect.stringMatching(/above the SAR\s100\.00 approval limit — a manager must approve it/) });
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
    expect(db.tables.rfq_awards[0].po_sent_at).toBeNull();

    db.tables.profiles[0].role = "manager";
    expect(await approveAward("rfq-1")).toEqual({ success: true, rfqId: "rfq-1" });
    expect(db.tables.audit_events[0].payload).toMatchObject({ aboveSpendLimit: true });
  });

  it("an override must say why", async () => {
    expect(await approveAward("rfq-1", "q-cheap")).toEqual({
      error: "Say why you're choosing a different supplier than the AI recommended.",
    });
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
  });

  it("an override with a reason records who was chosen, over whom, and why", async () => {
    expect(await approveAward("rfq-1", "q-cheap", "Price matters more on this order")).toMatchObject({ success: true });
    expect(db.tables.audit_events[0].payload).toMatchObject({
      supplier: "Red Sea Packaging Co.",
      override: true,
      aiPick: "Gulf Office Supplies",
      reason: "Price matters more on this order",
    });
  });

  it("choosing the AI's own pick through the picker isn't an override", async () => {
    expect(await approveAward("rfq-1", "q-ai")).toMatchObject({ success: true });
    expect(db.tables.audit_events[0].payload).toMatchObject({ override: false });
  });
});
