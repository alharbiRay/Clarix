import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  generateQuoteRecommendation,
  type RecommendationPreferences,
} from "@/lib/gemini";
import {
  buildRecommendationInput,
  type RfqWithComparisonData,
} from "@/lib/recommendation-input";
import { sendComparisonReadyEmail } from "@/lib/email";
import { evaluateAutoApproval } from "@/lib/auto-approval";

/**
 * Fires whenever a supplier's quote lands (form submit, manual entry, or a
 * buyer confirming a PDF extraction) — the three places rfq_suppliers.status
 * flips to 'submitted'. If every invited supplier has now resolved
 * (submitted or declined) and no recommendation exists yet for this RFQ,
 * generates one automatically (using saved rfq_preferences if the buyer set
 * any, defaults otherwise), notifies the buyer in-app, and emails them.
 *
 * Runs on the admin client since it's called from both buyer-authenticated
 * actions and the token-based (no-login) supplier submission flow. Never
 * throws past a logged, best-effort attempt — this is a side effect of a
 * quote submission and must not break that submission.
 */
export async function maybeAutoGenerateRecommendation(rfqId: string) {
  const supabase = createAdminClient();

  const { data: suppliers } = await supabase
    .from("rfq_suppliers")
    .select("id, status")
    .eq("rfq_id", rfqId);

  const invited = (suppliers ?? []).filter((s) => s.status !== "pending");
  if (invited.length === 0) return;
  if (invited.some((s) => s.status !== "submitted" && s.status !== "declined"))
    return;
  if (!invited.some((s) => s.status === "submitted")) return;

  const { data: existingRec } = await supabase
    .from("ai_recommendations")
    .select("id")
    .eq("rfq_id", rfqId)
    .limit(1)
    .maybeSingle();
  if (existingRec) return; // auto-trigger only fires once per RFQ

  const { data: rfq } = await supabase
    .from("rfqs")
    .select("*, rfq_items(*), rfq_suppliers(*), quotes(*, quote_items(*))")
    .eq("id", rfqId)
    .single();
  if (!rfq) return;

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

  const input = buildRecommendationInput(
    rfq as unknown as RfqWithComparisonData,
    weights,
    preferences
  );
  if (!input) return;

  const result = await generateQuoteRecommendation(input);

  const { error: insertError } = await supabase
    .from("ai_recommendations")
    .insert({ rfq_id: rfqId, content: result.content, model: result.model });
  if (insertError) return;

  await evaluateAutoApproval(
    supabase,
    rfq as unknown as RfqWithComparisonData,
    result.content
  );

  await supabase.from("notifications").insert({
    buyer_id: rfq.buyer_id,
    rfq_id: rfqId,
    type: "comparison_ready",
    message: `Your comparison for ${rfq.title} is ready`,
  });

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", rfq.buyer_id)
      .single();
    if (profile?.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      await sendComparisonReadyEmail({
        to: profile.email,
        rfqTitle: rfq.title,
        compareUrl: `${appUrl}/rfqs/${rfqId}/compare`,
      });
    }
  } catch (e) {
    console.error("Failed to send comparison-ready email:", e);
  }
}
