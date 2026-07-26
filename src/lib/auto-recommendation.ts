// v2: wired into all three quote submission paths (form, manual, PDF confirm)
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
import { evaluateAutoApproval } from "@/lib/auto-approval";

const TAG = "[auto-reco]";

/**
 * Fires whenever a supplier's quote lands (form submit, manual entry, or a
 * PDF extraction — now auto-confirmed, see src/lib/quote-intake.ts) — the
 * places rfq_suppliers.status flips to 'submitted'. If every invited
 * supplier has now resolved (submitted or declined) and no recommendation
 * exists yet for this RFQ, generates one automatically (using saved
 * rfq_preferences if the buyer set any, defaults otherwise) and hands off to
 * evaluateAutoApproval, which sends the buyer their one and only
 * notification for this RFQ — "Auto-approved: ... — PO sent" or "Review
 * needed: ...".
 *
 * Runs on the admin client since it's called from buyer-authenticated
 * actions, the token-based (no-login) supplier submission flow, and the
 * inbound-email webhook. Never throws past a logged, best-effort attempt —
 * this is a side effect of a quote submission and must not break that
 * submission.
 *
 * All call sites MUST `await` this (see src/app/(dashboard)/rfqs/quote-actions.ts
 * and the inbound-email webhook) — a fire-and-forget call left running past
 * the point where the caller returns its response is not guaranteed to
 * finish on a serverless runtime, which silently drops this entire flow.
 */
export async function maybeAutoGenerateRecommendation(rfqId: string) {
  console.log(`${TAG} called for rfq=${rfqId}`);
  const supabase = createAdminClient();

  const { data: suppliers, error: suppliersError } = await supabase
    .from("rfq_suppliers")
    .select("id, status")
    .eq("rfq_id", rfqId);
  if (suppliersError) {
    console.error(`${TAG} rfq=${rfqId} failed to load rfq_suppliers:`, suppliersError);
    return;
  }

  const statuses = (suppliers ?? []).map((s) => s.status);
  console.log(`${TAG} rfq=${rfqId} supplier statuses:`, statuses);

  const invited = (suppliers ?? []).filter((s) => s.status !== "pending");
  if (invited.length === 0) {
    console.log(`${TAG} rfq=${rfqId} bail: no invited suppliers yet`);
    return;
  }
  const unresolved = invited.filter(
    (s) => s.status !== "submitted" && s.status !== "declined"
  );
  if (unresolved.length > 0) {
    console.log(
      `${TAG} rfq=${rfqId} bail: ${unresolved.length} supplier(s) still unresolved (sent/viewed):`,
      unresolved.map((s) => s.id)
    );
    return;
  }
  if (!invited.some((s) => s.status === "submitted")) {
    console.log(`${TAG} rfq=${rfqId} bail: no supplier has submitted (all declined)`);
    return;
  }

  const { data: existingRec, error: existingRecError } = await supabase
    .from("ai_recommendations")
    .select("id")
    .eq("rfq_id", rfqId)
    .limit(1)
    .maybeSingle();
  if (existingRecError) {
    console.error(
      `${TAG} rfq=${rfqId} failed to check existing recommendation:`,
      existingRecError
    );
    return;
  }
  if (existingRec) {
    console.log(
      `${TAG} rfq=${rfqId} bail: recommendation already exists (id=${existingRec.id}) — auto-trigger only fires once per RFQ`
    );
    return;
  }

  console.log(`${TAG} rfq=${rfqId} all suppliers resolved, no existing recommendation — proceeding`);

  const { data: rfq, error: rfqError } = await supabase
    .from("rfqs")
    .select("*, rfq_items(*), rfq_suppliers(*), quotes(*, quote_items(*))")
    .eq("id", rfqId)
    .single();
  if (rfqError || !rfq) {
    console.error(`${TAG} rfq=${rfqId} failed to load full RFQ:`, rfqError);
    return;
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

  const input = buildRecommendationInput(
    rfq as unknown as RfqWithComparisonData,
    weights,
    preferences
  );
  if (!input) {
    console.log(
      `${TAG} rfq=${rfqId} bail: buildRecommendationInput returned null (no comparable submitted/confirmed quotes)`
    );
    return;
  }

  console.log(`${TAG} rfq=${rfqId} calling Gemini with ${input.quotes.length} comparable quote(s)`);

  let result;
  try {
    result = await generateQuoteRecommendation(input);
  } catch (e) {
    console.error(`${TAG} rfq=${rfqId} generateQuoteRecommendation threw:`, e);
    return;
  }
  console.log(`${TAG} rfq=${rfqId} Gemini recommendation received (model=${result.model})`);

  const { error: insertError } = await supabase
    .from("ai_recommendations")
    .insert({ rfq_id: rfqId, content: result.content, model: result.model });
  if (insertError) {
    console.error(`${TAG} rfq=${rfqId} failed to insert ai_recommendations:`, insertError);
    return;
  }
  console.log(`${TAG} rfq=${rfqId} ai_recommendations row inserted — calling evaluateAutoApproval`);

  await evaluateAutoApproval(
    supabase,
    rfq as unknown as RfqWithComparisonData,
    result.content
  );
  console.log(`${TAG} rfq=${rfqId} evaluateAutoApproval finished`);
}
