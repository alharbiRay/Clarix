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
