import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { quote, rfqItem, supplier } from "@/test/fixtures";
import type { RecommendationContent } from "@/lib/gemini";
import type { RfqWithComparisonData } from "@/lib/recommendation-input";

vi.mock("@/lib/email", () => ({
  sendPoConfirmationEmail: vi.fn(async () => {}),
  sendAutoApprovalEmail: vi.fn(async () => {}),
  sendReviewNeededEmail: vi.fn(async () => {}),
}));

import * as email from "@/lib/email";
import { evaluateAutoApproval } from "@/lib/auto-approval";

const rfq: RfqWithComparisonData = {
  id: "rfq-1",
  buyer_id: "buyer-1",
  title: "Cement",
  project: null,
  description: null,
  currency: "SAR",
  deadline: null,
  status: "sent",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  rfq_items: [rfqItem("a")],
  rfq_suppliers: [supplier("s1"), supplier("s2")],
  quotes: [quote("q1", "s1", { a: 100 }), quote("q2", "s2", { a: 150 })],
};

const content: RecommendationContent = {
  recommendation: "Go with Supplier s1",
  reasoning: "Cheapest",
  ranking: [
    { supplier: "Supplier s1", rank: 1, strengths: [], weaknesses: [] },
    { supplier: "Supplier s2", rank: 2, strengths: [], weaknesses: [] },
  ],
  risks: [],
};

function seed(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeSupabase(
    {
      profiles: [{ id: "buyer-1", email: "buyer@test.sa", auto_approval_enabled: true }],
      rfqs: [{ id: "rfq-1", status: "sent" }],
      rfq_awards: [],
      notifications: [],
      audit_events: [],
      ...extra,
    },
    { rfq_awards: { unique: [["rfq_id"]] } }
  );
}

/** Simulates the race: this run's existence check reads before the other run's insert lands. */
function withStaleAwardReads(db: FakeSupabase) {
  const realFrom = db.from.bind(db);
  db.from = (table: string) => {
    const qb = realFrom(table);
    if (table === "rfq_awards") {
      (qb as unknown as { maybeSingle: () => PromiseLike<unknown> }).maybeSingle = () =>
        Promise.resolve({ data: null, error: null });
    }
    return qb;
  };
  return db;
}

const asClient = (db: FakeSupabase) => db as unknown as SupabaseClient;

describe("evaluateAutoApproval", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Rule 1: auto-approves the cheapest recommended quote, awards the RFQ and sends one PO", async () => {
    const db = seed();
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(db.tables.rfq_awards).toEqual([expect.objectContaining({ rfq_id: "rfq-1", decision: "auto_approved" })]);
    expect(db.tables.rfqs[0].status).toBe("awarded");
    expect(email.sendPoConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(db.tables.notifications).toHaveLength(1);
  });

  it("records why it auto-approved, and the PO, in the audit trail", async () => {
    const db = seed();
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(db.tables.audit_events.map((e) => e.event_type)).toEqual(["auto_approval_decided", "po_sent"]);
    expect(db.tables.audit_events[0]).toMatchObject({
      buyer_id: "buyer-1",
      rfq_id: "rfq-1",
      actor_type: "system",
      payload: expect.objectContaining({
        decision: "auto_approved",
        rule: "all_rules_passed",
        supplier: "Supplier s1",
        explanation: ["cheapest complete quote", "delivery 7 days (limit 14)", "12 months warranty"],
        policy: expect.objectContaining({ maxDeliveryDays: 14, requireWarranty: true }),
      }),
    });
    expect(db.tables.audit_events[1].payload).toMatchObject({ supplier: "Supplier s1", total: 100, automatic: true, emailDelivered: true });
  });

  it("records that the PO email failed instead of claiming it was sent", async () => {
    vi.mocked(email.sendPoConfirmationEmail).mockRejectedValueOnce(new Error("resend down"));
    const db = seed();
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(db.tables.audit_events[1]).toMatchObject({ event_type: "po_sent", payload: expect.objectContaining({ emailDelivered: false }) });
  });

  it("holds for review (instead of going silent) when the AI's pick doesn't match any quote", async () => {
    const db = seed();
    const unknown: RecommendationContent = { ...content, ranking: [{ supplier: "Nobody", rank: 1, strengths: [], weaknesses: [] }] };
    await evaluateAutoApproval(asClient(db), rfq, unknown);
    // The AI's pick is unknown, so nothing is recorded as "recommended" (no stand-in).
    expect(db.tables.rfq_awards).toEqual([
      expect.objectContaining({ decision: "review_needed", recommended_quote_id: null, cheapest_quote_id: "q1" }),
    ]);
    expect(db.tables.audit_events[0].payload).toMatchObject({ rule: "ai_pick_unmatched" });
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
    expect(db.tables.notifications).toEqual([expect.objectContaining({ type: "review_needed", message: expect.stringMatching(/Nobody/) })]);
  });

  it("leaves a trace when no quote is complete enough to decide on", async () => {
    const db = seed();
    const incomplete = { ...rfq, quotes: [quote("q1", "s1", {})] };
    await evaluateAutoApproval(asClient(db), incomplete as RfqWithComparisonData, content);
    expect(db.tables.rfq_awards).toHaveLength(0);
    expect(db.tables.audit_events).toEqual([
      expect.objectContaining({ event_type: "auto_approval_decided", payload: expect.objectContaining({ decision: "not_evaluated" }) }),
    ]);
  });

  it("follows the account's approval policy: above the spend limit it holds for a manager", async () => {
    const db = seed({
      approval_policies: [{ buyer_id: "buyer-1", enabled: true, max_delivery_days: 14, require_warranty: true, spend_limit: "50", min_supplier_score: null, require_cheapest: true }],
    });
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(db.tables.rfq_awards).toEqual([expect.objectContaining({ decision: "review_needed" })]);
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
    expect(db.tables.audit_events[0].payload).toMatchObject({ rule: "above_spend_limit", requiresManager: true });
    expect(db.tables.notifications[0].message).toMatch(/SAR 100.00 is above the auto-approval limit of SAR 50.00/);
  });

  it("policy can allow a pricier AI pick", async () => {
    const db = seed({
      approval_policies: [{ buyer_id: "buyer-1", enabled: true, max_delivery_days: 14, require_warranty: true, spend_limit: null, min_supplier_score: null, require_cheapest: false }],
    });
    const pricier: RecommendationContent = { ...content, ranking: [{ supplier: "Supplier s2", rank: 1, strengths: [], weaknesses: [] }] };
    await evaluateAutoApproval(asClient(db), rfq, pricier);
    expect(db.tables.rfq_awards).toEqual([expect.objectContaining({ decision: "auto_approved", recommended_quote_id: "q2" })]);
    expect(email.sendPoConfirmationEmail).toHaveBeenCalledTimes(1);
  });

  it("never auto-approves an incomplete quote, even with 'cheapest only' off (no PO on a partial total)", async () => {
    const db = seed({
      approval_policies: [{ buyer_id: "buyer-1", enabled: true, max_delivery_days: 14, require_warranty: true, spend_limit: null, min_supplier_score: null, require_cheapest: false }],
    });
    const twoItems = {
      ...rfq,
      rfq_items: [rfqItem("a"), rfqItem("b")],
      quotes: [quote("q1", "s1", { a: 100, b: 100 }), quote("q2", "s2", { a: 50 })],
    } as RfqWithComparisonData;
    const pickPartial: RecommendationContent = { ...content, ranking: [{ supplier: "Supplier s2", rank: 1, strengths: [], weaknesses: [] }] };
    await evaluateAutoApproval(asClient(db), twoItems, pickPartial);
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
    expect(db.tables.rfq_awards).toEqual([expect.objectContaining({ decision: "review_needed", recommended_quote_id: "q2" })]);
    expect(db.tables.notifications[0].message).toMatch(/hasn't priced every line/);
  });

  it("a minimum supplier score fails safe: no score yet means review", async () => {
    const db = seed({
      approval_policies: [{ buyer_id: "buyer-1", enabled: true, max_delivery_days: 14, require_warranty: true, spend_limit: null, min_supplier_score: 60, require_cheapest: true }],
    });
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(db.tables.rfq_awards).toEqual([expect.objectContaining({ decision: "review_needed" })]);
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
  });

  it("an account without a policy row keeps honouring the old on/off toggle", async () => {
    const db = seed({ profiles: [{ id: "buyer-1", email: "buyer@test.sa", auto_approval_enabled: false }] });
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(db.tables.rfq_awards).toEqual([expect.objectContaining({ decision: "review_needed" })]);
    expect(db.tables.audit_events[0].payload).toMatchObject({ rule: "auto_approval_disabled" });
  });

  it("records the reason when it holds an RFQ for review", async () => {
    const db = seed();
    const pricier: RecommendationContent = { ...content, ranking: [{ supplier: "Supplier s2", rank: 1, strengths: [], weaknesses: [] }] };
    await evaluateAutoApproval(asClient(db), rfq, pricier);
    expect(db.tables.audit_events).toEqual([
      expect.objectContaining({ event_type: "auto_approval_decided", payload: expect.objectContaining({ decision: "differs_from_cheapest", rule: "recommended_differs_from_cheapest" }) }),
    ]);
  });

  it("throws (so the job retries) instead of recording a decision when the buyer profile can't be loaded", async () => {
    const db = seed({ profiles: [] });
    await expect(evaluateAutoApproval(asClient(db), rfq, content)).rejects.toThrow(/profile/);
    expect(db.tables.rfq_awards).toHaveLength(0);
    expect(email.sendReviewNeededEmail).not.toHaveBeenCalled();
  });

  it("does nothing when the RFQ already has an award", async () => {
    const db = seed({ rfq_awards: [{ rfq_id: "rfq-1", decision: "review_needed" }] });
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
    expect(db.tables.notifications).toHaveLength(0);
  });

  it("losing a concurrent race (award insert conflicts) sends no PO, no notification, no status change", async () => {
    const db = withStaleAwardReads(seed({ rfq_awards: [{ rfq_id: "rfq-1", decision: "auto_approved" }] }));
    await evaluateAutoApproval(asClient(db), rfq, content);
    expect(email.sendPoConfirmationEmail).not.toHaveBeenCalled();
    expect(email.sendAutoApprovalEmail).not.toHaveBeenCalled();
    expect(db.tables.notifications).toHaveLength(0);
    expect(db.tables.rfqs[0].status).toBe("sent");
    expect(db.tables.audit_events).toHaveLength(0);
  });

  it("losing the race on the review-needed path sends no buyer email either", async () => {
    const db = withStaleAwardReads(seed({ rfq_awards: [{ rfq_id: "rfq-1", decision: "review_needed" }] }));
    const pricier: RecommendationContent = {
      ...content,
      ranking: [{ supplier: "Supplier s2", rank: 1, strengths: [], weaknesses: [] }],
    };
    await evaluateAutoApproval(asClient(db), rfq, pricier);
    expect(email.sendReviewNeededEmail).not.toHaveBeenCalled();
    expect(db.tables.notifications).toHaveLength(0);
  });
});
