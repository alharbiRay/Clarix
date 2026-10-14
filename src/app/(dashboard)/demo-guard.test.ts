import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { DEMO_READ_ONLY_ERROR } from "@/lib/auth/session";

/**
 * Wiring check: real server actions refuse the demo account before doing
 * any work — in particular before spending Gemini quota.
 */
let db: FakeSupabase & { auth?: unknown };
vi.mock("@/lib/supabase/server", () => ({ createClient: () => db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const extractRfqFromText = vi.fn();
const generateQuoteRecommendation = vi.fn();
vi.mock("@/lib/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gemini")>()),
  extractRfqFromText: (...a: unknown[]) => extractRfqFromText(...a),
  generateQuoteRecommendation: (...a: unknown[]) => generateQuoteRecommendation(...a),
}));

import { autofillRfqFromText, createRfq } from "@/app/(dashboard)/rfqs/actions";
import { generateRecommendation } from "@/app/(dashboard)/rfqs/quote-actions";
import { updateAutoApprovalSetting } from "@/app/(dashboard)/settings/actions";

function signInAs(isDemo: boolean) {
  db = Object.assign(createFakeSupabase({ profiles: [{ id: "u1", is_demo: isDemo, auto_approval_enabled: true }], rfqs: [] }), {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  });
}

describe("server actions in the demo workspace", () => {
  beforeEach(() => {
    extractRfqFromText.mockReset();
    generateQuoteRecommendation.mockReset();
    signInAs(true);
  });

  it("smart paste refuses before calling Gemini", async () => {
    expect(await autofillRfqFromText("10 bags of cement")).toEqual({ error: DEMO_READ_ONLY_ERROR });
    expect(extractRfqFromText).not.toHaveBeenCalled();
  });

  it("AI recommendation refuses before calling Gemini", async () => {
    const weights = { price: 50, delivery: 50, warranty: 50, paymentTerms: 50 };
    const prefs = { hasDeadline: false, deadlineDate: null, maxBudget: null };
    expect(await generateRecommendation("rfq-1", weights, prefs)).toEqual({ error: DEMO_READ_ONLY_ERROR });
    expect(generateQuoteRecommendation).not.toHaveBeenCalled();
  });

  it("creating an RFQ is refused and writes nothing", async () => {
    const result = await createRfq({
      title: "Cement",
      project: "",
      description: "",
      currency: "SAR",
      deadline: "",
      items: [{ name: "Cement", description: "", quantity: 10, unit: "bags" }],
      suppliers: ["s@supplier.example"],
    } as never);
    expect(result).toEqual({ error: DEMO_READ_ONLY_ERROR });
    expect(db.tables.rfqs).toHaveLength(0);
  });

  it("settings are refused", async () => {
    expect(await updateAutoApprovalSetting(false)).toEqual({ error: DEMO_READ_ONLY_ERROR });
    expect(db.tables.profiles[0].auto_approval_enabled).toBe(true);
  });

  it("a normal buyer is not affected by the guard", async () => {
    signInAs(false);
    expect(await updateAutoApprovalSetting(false)).toEqual({ success: true });
  });
});
