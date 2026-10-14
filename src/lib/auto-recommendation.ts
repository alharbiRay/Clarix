import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  generateQuoteRecommendation,
  recommendationContentSchema,
  type RecommendationContent,
  type RecommendationPreferences,
} from "@/lib/gemini";
import {
  buildRecommendationInput,
  type RfqWithComparisonData,
} from "@/lib/recommendation-input";
import { evaluateAutoApproval } from "@/lib/auto-approval";
import { PermanentJobError } from "@/lib/jobs/processor";

const TAG = "[auto-reco]";

export interface AutoRecommendationDeps {
  /** Service-role client: runs for buyer actions, the no-login supplier form, and the webhook alike. */
  supabase: SupabaseClient;
  generate: typeof generateQuoteRecommendation;
  evaluate: typeof evaluateAutoApproval;
}

export type AutoRecommendationResult =
  | { outcome: "not_ready" }
  | { outcome: "manual_recommendation_exists" }
  | { outcome: "no_comparable_quotes" }
  | { outcome: "resumed" }
  | { outcome: "generated"; model: string };

function defaultDeps(): AutoRecommendationDeps {
  return {
    supabase: createAdminClient(),
    generate: generateQuoteRecommendation,
    evaluate: evaluateAutoApproval,
  };
}

/**
 * The `auto_recommendation` job handler (see src/lib/jobs). Enqueued
 * whenever a supplier's quote lands — form submit, manual entry, buyer PDF
 * upload, or an emailed PDF. Once every invited supplier has resolved
 * (submitted or declined), it generates the AI recommendation (using saved
 * rfq_preferences if the buyer set any, defaults otherwise) and hands off to
 * evaluateAutoApproval, which sends the buyer their one notification for
 * this RFQ.
 *
 * Idempotent, so the job runner may run it any number of times:
 * - at most one auto-generated recommendation per RFQ (unique index from
 *   migration 0007); a repeat run, or one that loses a race, "resumes" with
 *   the stored recommendation instead of calling Gemini again;
 * - evaluateAutoApproval gates every side effect on its rfq_awards insert,
 *   so resuming can never send a second PO or notification.
 *
 * Gemini errors propagate — the job runner reschedules with backoff and
 * tells the buyer about quota problems (src/lib/jobs/run.ts).
 */
export async function runAutoRecommendation(
  rfqId: string,
  deps: AutoRecommendationDeps = defaultDeps()
): Promise<AutoRecommendationResult> {
  const { supabase } = deps;

  const { data: suppliers, error: suppliersError } = await supabase
    .from("rfq_suppliers")
    .select("id, status")
    .eq("rfq_id", rfqId);
  if (suppliersError) throw new Error(`failed to load rfq_suppliers: ${suppliersError.message}`);

  const invited = (suppliers ?? []).filter((s) => s.status !== "pending");
  const unresolved = invited.filter((s) => s.status !== "submitted" && s.status !== "declined");
  if (invited.length === 0 || unresolved.length > 0 || !invited.some((s) => s.status === "submitted")) {
    console.log(`${TAG} rfq=${rfqId} not ready (invited=${invited.length}, unresolved=${unresolved.length})`);
    return { outcome: "not_ready" };
  }

  const { data: rfq, error: rfqError } = await supabase
    .from("rfqs")
    .select("*, rfq_items(*), rfq_suppliers(*), quotes(*, quote_items(*))")
    .eq("id", rfqId)
    .maybeSingle();
  if (rfqError) throw new Error(`failed to load RFQ: ${rfqError.message}`);
  if (!rfq) throw new PermanentJobError(`RFQ ${rfqId} not found`);
  const fullRfq = rfq as unknown as RfqWithComparisonData;

  const existing = await loadAutoRecommendation(supabase, rfqId);
  if (existing === "manual") {
    // Preserves the original contract: the auto flow fires once per RFQ,
    // and never after the buyer has started driving it by hand.
    console.log(`${TAG} rfq=${rfqId} skip: buyer already generated a recommendation manually`);
    return { outcome: "manual_recommendation_exists" };
  }
  if (existing) {
    console.log(`${TAG} rfq=${rfqId} auto recommendation exists — resuming approval evaluation`);
    await deps.evaluate(supabase, fullRfq, existing);
    return { outcome: "resumed" };
  }

  const { data: prefsRow } = await supabase
    .from("rfq_preferences")
    .select("*")
    .eq("rfq_id", rfqId)
    .maybeSingle();
  const weights = prefsRow?.weights ?? DEFAULT_RECOMMENDATION_WEIGHTS;
  const preferences: RecommendationPreferences = prefsRow
    ? {
        hasDeadline: prefsRow.has_deadline,
        deadlineDate: prefsRow.deadline_date,
        maxBudget: prefsRow.max_budget === null ? null : Number(prefsRow.max_budget),
      }
    : { hasDeadline: false, deadlineDate: null, maxBudget: null };

  const input = buildRecommendationInput(fullRfq, weights, preferences);
  if (!input) return { outcome: "no_comparable_quotes" };

  console.log(`${TAG} rfq=${rfqId} calling Gemini with ${input.quotes.length} comparable quote(s)`);
  const result = await deps.generate(input);

  const { error: insertError } = await supabase.from("ai_recommendations").insert({
    rfq_id: rfqId,
    content: result.content,
    model: result.model,
    auto_generated: true,
  });
  if (insertError?.code === "23505") {
    const winner = await loadAutoRecommendation(supabase, rfqId);
    if (!winner || winner === "manual") throw new Error("auto recommendation conflict but none found");
    console.log(`${TAG} rfq=${rfqId} lost the race to a concurrent run — resuming with its recommendation`);
    await deps.evaluate(supabase, fullRfq, winner);
    return { outcome: "resumed" };
  }
  if (insertError) throw new Error(`failed to insert recommendation: ${insertError.message}`);

  await deps.evaluate(supabase, fullRfq, result.content);
  return { outcome: "generated", model: result.model };
}

/** The stored auto recommendation, "manual" if only buyer-generated ones exist, or null. */
async function loadAutoRecommendation(
  supabase: SupabaseClient,
  rfqId: string
): Promise<RecommendationContent | "manual" | null> {
  const { data, error } = await supabase
    .from("ai_recommendations")
    .select("content, auto_generated")
    .eq("rfq_id", rfqId);
  if (error) throw new Error(`failed to load recommendations: ${error.message}`);
  const rows = (data ?? []) as { content: unknown; auto_generated: boolean | null }[];
  const auto = rows.find((r) => r.auto_generated);
  if (auto) {
    const parsed = recommendationContentSchema.safeParse(auto.content);
    if (!parsed.success) throw new PermanentJobError("stored auto recommendation is malformed");
    return parsed.data;
  }
  return rows.length > 0 ? "manual" : null;
}
