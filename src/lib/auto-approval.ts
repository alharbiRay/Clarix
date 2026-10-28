import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationContent } from "@/lib/gemini";
import { computeQuoteTotal } from "@/lib/quote-comparison";
import {
  sendAutoApprovalEmail,
  sendPoConfirmationEmail,
  sendReviewNeededEmail,
} from "@/lib/email";
import type { RfqWithComparisonData } from "@/lib/recommendation-input";
import type { Quote, QuoteItem, RfqSupplier } from "@/lib/types";
import { recordAuditEvent } from "@/lib/audit";
import { poEmailContext } from "@/lib/po-email-context";
import { decideApproval, type ApprovalPolicy, type DecisionQuote } from "@/lib/approval/rules";
import { loadApprovalPolicy } from "@/lib/approval/policy";
import { loadMetricsRfqs, rfqIdsForSuppliers } from "@/lib/metrics/load";
import { scoreSupplier, supplierMetrics } from "@/lib/scorecard";

const TAG = "[auto-approval]";

type QuoteWithItems = Quote & { quote_items: QuoteItem[] };

function supplierLabel(s: Pick<RfqSupplier, "company_name" | "email">) {
  return s.company_name || s.email || "Unknown supplier";
}

/**
 * Records the RFQ's single rfq_awards row (rfq_id is its primary key) and
 * reports whether THIS run owns the decision. The insert itself is the
 * idempotency gate: a concurrent or repeated run gets a unique violation
 * and must skip every side effect (status change, notification, PO email).
 * The earlier "does an award exist?" read is only a fast path — it can't
 * prevent the race on its own. Other insert errors throw so the job retries.
 */
async function claimAward(
  supabase: SupabaseClient,
  rfqId: string,
  row: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase.from("rfq_awards").insert(row);
  if (!error) return true;
  if (error.code === "23505") {
    console.log(`${TAG} rfq=${rfqId} award already recorded by a concurrent run — skipping side effects`);
    return false;
  }
  throw new Error(`rfq_awards insert failed for rfq ${rfqId}: ${error.message}`);
}

/**
 * Supplier score for the min-score rule. Only computed when the policy asks
 * for it (it loads the supplier's history). Any failure yields null, which
 * the rule treats as "no score yet" — so it fails safe into review.
 */
async function scoreFor(
  supabase: SupabaseClient,
  buyerId: string,
  invite: RfqSupplier
): Promise<{ score: number | null; failed: boolean }> {
  if (!invite.supplier_id) return { score: null, failed: false };
  try {
    const ref = { id: invite.supplier_id, email: invite.email };
    const ids = await rfqIdsForSuppliers(supabase, [ref]);
    const history = await loadMetricsRfqs(supabase, buyerId, { rfqIds: ids });
    return { score: scoreSupplier(supplierMetrics(history, ref))?.score ?? null, failed: false };
  } catch (e) {
    console.error(`${TAG} supplier score unavailable:`, e);
    return { score: null, failed: true };
  }
}

/**
 * Runs the auto-approval rules right after a recommendation is
 * auto-generated (src/lib/auto-recommendation.ts). Never called from the
 * buyer's manual "Get/Regenerate recommendation" button — that's explicit
 * experimentation and shouldn't risk sending a PO or repeat notifications.
 *
 * The rules themselves are the account's approval policy (migration 0013),
 * applied by the pure engine in src/lib/approval/rules.ts — this function
 * only gathers the facts, records the decision, and performs the side
 * effects. Exactly one buyer notification per RFQ:
 *   "Auto-approved: [supplier] — PO sent"   or   "Review needed: [reason]"
 *
 * Idempotent via the rfq_awards row (one per RFQ): see claimAward. Email
 * failures are logged and swallowed; database failures throw so the
 * auto_recommendation job (src/lib/jobs) retries the evaluation.
 */
export async function evaluateAutoApproval(
  supabase: SupabaseClient,
  rfq: RfqWithComparisonData,
  content: RecommendationContent
) {
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("auto_approval_enabled, email, locale")
      .eq("id", rfq.buyer_id)
      .single();
    if (profileError || !profile) {
      // Don't guess: falling through would record a permanent "auto-approval
      // is turned off" decision. Throw so the job retries.
      throw new Error(`failed to load buyer profile for rfq ${rfq.id}: ${profileError?.message ?? "not found"}`);
    }

    const { data: existingAward, error: existingError } = await supabase
      .from("rfq_awards")
      .select("rfq_id")
      .eq("rfq_id", rfq.id)
      .maybeSingle();
    if (existingError) console.error(`${TAG} rfq=${rfq.id} existing-award check failed (the insert gate still protects):`, existingError);
    if (existingAward) {
      console.log(`${TAG} rfq=${rfq.id} bail: rfq_awards row already exists — idempotency guard`);
      return;
    }

    const policy: ApprovalPolicy = await loadApprovalPolicy(supabase, rfq.buyer_id, profile.auto_approval_enabled);
    const items = rfq.rfq_items;
    const suppliersById = new Map(rfq.rfq_suppliers.map((s) => [s.id, s]));
    const quotesById = new Map(rfq.quotes.map((q) => [q.id, q as QuoteWithItems]));
    const comparable = rfq.quotes.filter(
      (q) => (q.status === "submitted" || q.status === "confirmed") && suppliersById.has(q.supplier_id)
    ) as QuoteWithItems[];
    const pickLabel = content.ranking.find((r) => r.rank === 1)?.supplier ?? null;

    // The facts the rules need. A quote that leaves any line unpriced has no
    // total here, so it can never be approved on a partial amount.
    const decisionQuotes: DecisionQuote[] = comparable.map((q) => {
      const t = computeQuoteTotal(items, q);
      return {
        quoteId: q.id,
        supplier: supplierLabel(suppliersById.get(q.supplier_id)!),
        total: t.missingCount === 0 ? t.total : null,
        deliveryDays: q.delivery_days,
        warranty: q.warranty,
        supplierScore: null,
      };
    });
    if (policy.enabled && policy.minSupplierScore !== null && pickLabel) {
      const pick = decisionQuotes.find((d) => d.supplier === pickLabel);
      const invite = pick ? suppliersById.get(quotesById.get(pick.quoteId)!.supplier_id) : undefined;
      if (pick && invite) {
        const s = await scoreFor(supabase, rfq.buyer_id, invite);
        pick.supplierScore = s.score;
        pick.scoreUnavailable = s.failed;
      }
    }

    const result = decideApproval({ policy, pickLabel, quotes: decisionQuotes, currency: rfq.currency });
    if (!result.decision) {
      console.log(`${TAG} rfq=${rfq.id} bail: ${result.reason}`);
      // Leave a trace so the timeline doesn't show a recommendation followed by silence.
      await recordAuditEvent(
        {
          buyerId: rfq.buyer_id,
          rfqId: rfq.id,
          actor: { type: "system" },
          type: "auto_approval_decided",
          summary: `Auto-approval skipped: ${result.reason}`,
          payload: { decision: "not_evaluated", rule: null, reason: result.reason },
        },
        supabase
      );
      return;
    }

    const recommendedQuote = result.recommendedQuoteId ? (quotesById.get(result.recommendedQuoteId) ?? null) : null;
    const cheapestQuote = result.cheapestQuoteId ? (quotesById.get(result.cheapestQuoteId) ?? null) : null;
    const recommendedInvite = recommendedQuote ? (suppliersById.get(recommendedQuote.supplier_id) ?? null) : null;
    const cheapestInvite = cheapestQuote ? (suppliersById.get(cheapestQuote.supplier_id) ?? null) : null;
    const auto = result.decision === "auto_approved";
    const label = recommendedInvite ? supplierLabel(recommendedInvite) : pickLabel;
    const total = recommendedQuote ? computeQuoteTotal(items, recommendedQuote).total : null;

    const claimed = await claimAward(supabase, rfq.id, {
      rfq_id: rfq.id,
      decision: result.decision,
      // Only the AI's real pick is recorded as "recommended" (never a stand-in).
      recommended_supplier_id: recommendedInvite?.id ?? null,
      recommended_quote_id: recommendedQuote?.id ?? null,
      cheapest_supplier_id: cheapestInvite?.id ?? null,
      cheapest_quote_id: cheapestQuote?.id ?? null,
      reason: result.reason,
      ...(auto ? { po_sent_at: new Date().toISOString() } : {}),
    });
    if (!claimed) return;

    await recordAuditEvent(
      {
        buyerId: rfq.buyer_id,
        rfqId: rfq.id,
        actor: { type: "system" },
        type: "auto_approval_decided",
        summary: auto ? `Auto-approved ${label}: ${result.explanation.join(", ")}` : `Held for review: ${result.reason}`,
        payload: {
          decision: result.decision,
          rule: result.rule,
          supplier: label,
          quoteId: recommendedQuote?.id ?? null,
          explanation: result.explanation,
          reasons: result.reasons,
          reason: result.reason,
          requiresManager: result.requiresManager,
          policy,
        },
      },
      supabase
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const compareUrl = `${appUrl}/rfqs/${rfq.id}/compare`;
    const buyerEmail = profile.email as string | undefined;
    const buyerLanguage = (profile as { locale?: string | null }).locale === "ar" ? ("ar" as const) : ("en" as const);

    if (auto && recommendedQuote && recommendedInvite && label) {
      const { error: rfqUpdateError } = await supabase.from("rfqs").update({ status: "awarded" }).eq("id", rfq.id);
      if (rfqUpdateError) console.error(`${TAG} rfq=${rfq.id} rfqs status update failed:`, rfqUpdateError);

      const { error: notifError } = await supabase.from("notifications").insert({
        buyer_id: rfq.buyer_id,
        rfq_id: rfq.id,
        type: "auto_approved",
        message: `Auto-approved: ${label} — PO sent`,
      });
      if (notifError) console.error(`${TAG} rfq=${rfq.id} notifications insert failed:`, notifError);

      let emailDelivered = false;
      try {
        await sendPoConfirmationEmail({
          to: recommendedInvite.email,
          supplierLabel: label,
          rfqTitle: rfq.title,
          currency: rfq.currency,
          items: items.map((i) => ({ name: i.name, quantity: Number(i.quantity), unit: i.unit })),
          total,
          deliveryDays: recommendedQuote.delivery_days,
          warranty: recommendedQuote.warranty,
          ...(await poEmailContext(supabase, rfq.buyer_id, recommendedInvite)),
        });
        emailDelivered = true;
      } catch (e) {
        console.error("Failed to send PO confirmation email:", e);
      }

      // Recorded after the send so the trail never claims a PO email that failed.
      await recordAuditEvent(
        {
          buyerId: rfq.buyer_id,
          rfqId: rfq.id,
          actor: { type: "system" },
          type: "po_sent",
          summary: emailDelivered ? `PO sent to ${label}` : `PO approved for ${label}, but the email failed`,
          payload: { supplier: label, quoteId: recommendedQuote.id, total, currency: rfq.currency, automatic: true, emailDelivered },
        },
        supabase
      );

      if (buyerEmail) {
        try {
          await sendAutoApprovalEmail({ to: buyerEmail, rfqTitle: rfq.title, supplierLabel: label, compareUrl, language: buyerLanguage });
        } catch (e) {
          console.error("Failed to send auto-approval buyer email:", e);
        }
      }
      return;
    }

    const { error: notifError } = await supabase.from("notifications").insert({
      buyer_id: rfq.buyer_id,
      rfq_id: rfq.id,
      type: result.decision === "differs_from_cheapest" ? "differs_from_cheapest" : "review_needed",
      message: `Review needed: ${result.reason}`,
    });
    if (notifError) console.error(`${TAG} rfq=${rfq.id} notifications insert failed:`, notifError);

    if (buyerEmail) {
      try {
        await sendReviewNeededEmail({ to: buyerEmail, rfqTitle: rfq.title, reason: result.reason ?? "approval required", compareUrl, language: buyerLanguage });
      } catch (e) {
        console.error("Failed to send review-needed buyer email:", e);
      }
    }
  } catch (e) {
    console.error(`${TAG} rfq=${rfq.id} evaluation threw:`, e);
    throw e;
  }
}
