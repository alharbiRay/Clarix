import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "@/test/fake-supabase";
import { quote, rfqItem, supplier } from "@/test/fixtures";
import { runAutoRecommendation, type AutoRecommendationDeps } from "@/lib/auto-recommendation";
import { PermanentJobError } from "@/lib/jobs/processor";
import type { RecommendationContent } from "@/lib/gemini";

const CONTENT: RecommendationContent = {
  recommendation: "Supplier s1",
  reasoning: "cheapest",
  ranking: [{ supplier: "Supplier s1", rank: 1, strengths: [], weaknesses: [] }],
  risks: [],
};

function rfqRow(statuses: string[]) {
  const suppliers = statuses.map((status, i) => supplier(`s${i + 1}`, { status: status as never }));
  return {
    id: "rfq-1",
    buyer_id: "buyer-1",
    title: "Cement",
    project: null,
    description: null,
    currency: "SAR",
    deadline: null,
    status: "sent",
    rfq_items: [rfqItem("a")],
    rfq_suppliers: suppliers,
    quotes: suppliers.filter((s) => s.status === "submitted").map((s, i) => quote(`q${i}`, s.id, { a: 100 + i })),
  };
}

function setup(statuses: string[], recommendations: Record<string, unknown>[] = []) {
  const row = rfqRow(statuses);
  const db = createFakeSupabase(
    {
      rfqs: [row],
      rfq_suppliers: row.rfq_suppliers.map((s) => ({ id: s.id, rfq_id: "rfq-1", status: s.status })),
      ai_recommendations: recommendations,
      rfq_preferences: [],
      audit_events: [],
    },
    { ai_recommendations: { unique: [["rfq_id"]], uniqueWhere: (r) => r.auto_generated === true } }
  );
  const deps: AutoRecommendationDeps = {
    supabase: db as never,
    generate: vi.fn(async () => ({ content: CONTENT, model: "gemini-test" })),
    evaluate: vi.fn(async () => {}),
  };
  return { db, deps };
}

describe("runAutoRecommendation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("waits while any invited supplier is still unresolved", async () => {
    const { deps } = setup(["submitted", "sent"]);
    expect(await runAutoRecommendation("rfq-1", deps)).toEqual({ outcome: "not_ready" });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("waits when nobody has been invited yet, or everyone declined", async () => {
    expect((await runAutoRecommendation("rfq-1", setup(["pending"]).deps)).outcome).toBe("not_ready");
    expect((await runAutoRecommendation("rfq-1", setup(["declined", "declined"]).deps)).outcome).toBe("not_ready");
  });

  it("generates once every invited supplier resolved, stores it as auto-generated, and evaluates approval", async () => {
    const { db, deps } = setup(["submitted", "declined", "pending"]);
    const result = await runAutoRecommendation("rfq-1", deps);
    expect(result).toEqual({ outcome: "generated", model: "gemini-test" });
    expect(db.tables.ai_recommendations).toEqual([
      expect.objectContaining({ rfq_id: "rfq-1", auto_generated: true, model: "gemini-test" }),
    ]);
    expect(deps.evaluate).toHaveBeenCalledWith(db, expect.objectContaining({ id: "rfq-1" }), CONTENT);
    expect(db.tables.audit_events).toEqual([
      expect.objectContaining({ event_type: "recommendation_generated", payload: expect.objectContaining({ mode: "auto", recommended: "Supplier s1", model: "gemini-test" }) }),
    ]);
  });

  it("is idempotent: a second run reuses the stored recommendation instead of calling Gemini again", async () => {
    const { db, deps } = setup(["submitted"], [
      { rfq_id: "rfq-1", auto_generated: true, content: CONTENT, model: "gemini-test" },
    ]);
    expect(await runAutoRecommendation("rfq-1", deps)).toEqual({ outcome: "resumed" });
    expect(deps.generate).not.toHaveBeenCalled();
    expect(deps.evaluate).toHaveBeenCalledTimes(1); // award insert inside evaluate is itself idempotent
    expect(db.tables.ai_recommendations).toHaveLength(1);
  });

  it("losing a race to a concurrent run (unique violation) resumes with the winner's recommendation", async () => {
    const { db, deps } = setup(["submitted"]);
    deps.generate = vi.fn(async () => {
      // the other worker lands its insert while we're waiting on Gemini
      db.tables.ai_recommendations.push({ rfq_id: "rfq-1", auto_generated: true, content: CONTENT, model: "winner" });
      return { content: { ...CONTENT, reasoning: "loser" }, model: "loser" };
    });
    expect(await runAutoRecommendation("rfq-1", deps)).toEqual({ outcome: "resumed" });
    expect(db.tables.ai_recommendations).toHaveLength(1);
    expect(deps.evaluate).toHaveBeenCalledWith(db, expect.anything(), CONTENT);
  });

  it("keeps the old behaviour of not auto-running once the buyer generated one manually", async () => {
    const { deps } = setup(["submitted"], [{ rfq_id: "rfq-1", auto_generated: false, content: CONTENT, model: "m" }]);
    expect(await runAutoRecommendation("rfq-1", deps)).toEqual({ outcome: "manual_recommendation_exists" });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it("lets Gemini failures propagate so the job runner can retry them", async () => {
    const { deps } = setup(["submitted"]);
    deps.generate = vi.fn(async () => {
      throw new Error("RESOURCE_EXHAUSTED");
    });
    await expect(runAutoRecommendation("rfq-1", deps)).rejects.toThrow("RESOURCE_EXHAUSTED");
    expect(deps.evaluate).not.toHaveBeenCalled();
  });

  it("fails permanently when the RFQ no longer exists", async () => {
    const { db, deps } = setup(["submitted"]);
    db.tables.rfqs = [];
    await expect(runAutoRecommendation("rfq-1", deps)).rejects.toBeInstanceOf(PermanentJobError);
  });
});
