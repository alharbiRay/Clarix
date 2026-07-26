import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationContent } from "@/lib/gemini";
import { computeQuoteTotal, findCheapestQuote } from "@/lib/quote-comparison";
import {
  sendAutoApprovalEmail,
  sendPoConfirmationEmail,
  sendReviewNeededEmail,
} from "@/lib/email";
import { formatMoney } from "@/lib/format";
import type { RfqWithComparisonData } from "@/lib/recommendation-input";
import type { Quote, QuoteItem, RfqSupplier } from "@/lib/types";

const MAX_DELIVERY_DAYS = 14;

function supplierLabel(s: Pick<RfqSupplier, "company_name" | "email">) {
  return s.company_name || s.email || "Unknown supplier";
}

/**
 * Runs the auto-approval rules engine right after a recommendation is
 * auto-generated (src/lib/auto-recommendation.ts). Never called from the
 * buyer's manual "Get/Regenerate recommendation" button — that's explicit
 * experimentation and shouldn't risk sending a PO or repeat notifications.
 *
 * This is the buyer's ONE notification for the RFQ — nothing else in the
 * auto-generate pipeline notifies them. Exactly one of two messages lands:
 *   "Auto-approved: [supplier] — PO sent"
 *   "Review needed: [reason]"
 *
 * Rule 1: recommended === cheapest, delivery <=14 days, has a warranty
 *   → auto-award, email the supplier a PO confirmation, notify the buyer.
 * Rule 2: recommended === cheapest but fails delivery/warranty
 *   → "Review needed", no PO sent.
 * Rule 3: recommended !== cheapest
 *   → "Review needed" with the price difference, no PO sent.
 * Disabled: profiles.auto_approval_enabled is off
 *   → "Review needed" — comparison is ready, but nothing is auto-sent.
 *
 * Idempotent via the rfq_awards row (one per RFQ). Never throws — this is a
 * best-effort side effect of recommendation generation.
 */
export async function evaluateAutoApproval(
  supabase: SupabaseClient,
  rfq: RfqWithComparisonData,
  content: RecommendationContent
) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("auto_approval_enabled, email")
      .eq("id", rfq.buyer_id)
      .single();

    const { data: existingAward } = await supabase
      .from("rfq_awards")
      .select("rfq_id")
      .eq("rfq_id", rfq.id)
      .maybeSingle();
    if (existingAward) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const compareUrl = `${appUrl}/rfqs/${rfq.id}/compare`;
    const buyerEmail = profile?.email as string | undefined;

    if (!profile?.auto_approval_enabled) {
      const reason = "auto-approval is turned off — review and approve manually";
      await supabase.from("rfq_awards").insert({
        rfq_id: rfq.id,
        decision: "review_needed",
        recommended_supplier_id: null,
        recommended_quote_id: null,
        cheapest_supplier_id: null,
        cheapest_quote_id: null,
        reason,
      });
      await supabase.from("notifications").insert({
        buyer_id: rfq.buyer_id,
        rfq_id: rfq.id,
        type: "review_needed",
        message: `Review needed: ${reason}`,
      });
      if (buyerEmail) {
        try {
          await sendReviewNeededEmail({
            to: buyerEmail,
            rfqTitle: rfq.title,
            reason,
            compareUrl,
          });
        } catch (e) {
          console.error("Failed to send review-needed buyer email:", e);
        }
      }
      return;
    }

    const items = rfq.rfq_items;
    const cheapestQuote = findCheapestQuote(items, rfq.quotes);
    if (!cheapestQuote) return;

    const topRank = content.ranking.find((r) => r.rank === 1);
    if (!topRank) return;

    const suppliersById = new Map(rfq.rfq_suppliers.map((s) => [s.id, s]));
    const labelToQuote = new Map<string, Quote & { quote_items: QuoteItem[] }>();
    for (const q of rfq.quotes) {
      if (q.status !== "submitted" && q.status !== "confirmed") continue;
      const supplier = suppliersById.get(q.supplier_id);
      if (!supplier) continue;
      labelToQuote.set(supplierLabel(supplier), q);
    }

    const recommendedQuote = labelToQuote.get(topRank.supplier);
    if (!recommendedQuote) {
      console.error(
        `Auto-approval: could not match recommended supplier "${topRank.supplier}" to a quote for RFQ ${rfq.id}`
      );
      return;
    }

    const cheapestSupplier = suppliersById.get(cheapestQuote.supplier_id)!;
    const recommendedSupplier = suppliersById.get(recommendedQuote.supplier_id)!;

    if (recommendedQuote.id === cheapestQuote.id) {
      const deliveryOk =
        recommendedQuote.delivery_days !== null &&
        recommendedQuote.delivery_days <= MAX_DELIVERY_DAYS;
      const warrantyOk = Boolean(recommendedQuote.warranty && recommendedQuote.warranty.trim());

      if (deliveryOk && warrantyOk) {
        // Rule 1: auto-approve
        const label = supplierLabel(recommendedSupplier);
        const total = computeQuoteTotal(items, recommendedQuote).total;

        await supabase.from("rfq_awards").insert({
          rfq_id: rfq.id,
          decision: "auto_approved",
          recommended_supplier_id: recommendedSupplier.id,
          recommended_quote_id: recommendedQuote.id,
          cheapest_supplier_id: cheapestSupplier.id,
          cheapest_quote_id: cheapestQuote.id,
          reason: null,
          po_sent_at: new Date().toISOString(),
        });
        await supabase.from("rfqs").update({ status: "awarded" }).eq("id", rfq.id);
        await supabase.from("notifications").insert({
          buyer_id: rfq.buyer_id,
          rfq_id: rfq.id,
          type: "auto_approved",
          message: `Auto-approved: ${label} — PO sent`,
        });

        try {
          await sendPoConfirmationEmail({
            to: recommendedSupplier.email,
            supplierLabel: label,
            rfqTitle: rfq.title,
            currency: rfq.currency,
            items: items.map((i) => ({
              name: i.name,
              quantity: Number(i.quantity),
              unit: i.unit,
            })),
            total,
            deliveryDays: recommendedQuote.delivery_days,
            warranty: recommendedQuote.warranty,
          });
        } catch (e) {
          console.error("Failed to send PO confirmation email:", e);
        }

        if (buyerEmail) {
          try {
            await sendAutoApprovalEmail({
              to: buyerEmail,
              rfqTitle: rfq.title,
              supplierLabel: label,
              compareUrl,
            });
          } catch (e) {
            console.error("Failed to send auto-approval buyer email:", e);
          }
        }
      } else {
        // Rule 2: cheapest === recommended, but fails delivery/warranty
        const reasons: string[] = [];
        if (!deliveryOk) {
          reasons.push(
            recommendedQuote.delivery_days === null
              ? "delivery time not confirmed"
              : `delivery is ${recommendedQuote.delivery_days} days (must be ${MAX_DELIVERY_DAYS} or less)`
          );
        }
        if (!warrantyOk) reasons.push("no warranty provided");
        const reason = `cheapest option has issues — ${reasons.join("; ")}`;

        await supabase.from("rfq_awards").insert({
          rfq_id: rfq.id,
          decision: "review_needed",
          recommended_supplier_id: recommendedSupplier.id,
          recommended_quote_id: recommendedQuote.id,
          cheapest_supplier_id: cheapestSupplier.id,
          cheapest_quote_id: cheapestQuote.id,
          reason,
        });
        await supabase.from("notifications").insert({
          buyer_id: rfq.buyer_id,
          rfq_id: rfq.id,
          type: "review_needed",
          message: `Review needed: ${reason}`,
        });

        if (buyerEmail) {
          try {
            await sendReviewNeededEmail({
              to: buyerEmail,
              rfqTitle: rfq.title,
              reason,
              compareUrl,
            });
          } catch (e) {
            console.error("Failed to send review-needed buyer email:", e);
          }
        }
      }
    } else {
      // Rule 3: recommended supplier differs from the cheapest — always manual
      const cheapestTotal = computeQuoteTotal(items, cheapestQuote).total;
      const recommendedTotal = computeQuoteTotal(items, recommendedQuote).total;
      const diff =
        cheapestTotal !== null && recommendedTotal !== null
          ? recommendedTotal - cheapestTotal
          : null;
      const reason =
        diff !== null
          ? `recommended supplier is ${formatMoney(diff, rfq.currency)} more than the cheapest quote`
          : "recommended supplier differs from the cheapest and needs approval";

      await supabase.from("rfq_awards").insert({
        rfq_id: rfq.id,
        decision: "differs_from_cheapest",
        recommended_supplier_id: recommendedSupplier.id,
        recommended_quote_id: recommendedQuote.id,
        cheapest_supplier_id: cheapestSupplier.id,
        cheapest_quote_id: cheapestQuote.id,
        reason,
      });
      await supabase.from("notifications").insert({
        buyer_id: rfq.buyer_id,
        rfq_id: rfq.id,
        type: "differs_from_cheapest",
        message: `Review needed: ${reason}`,
      });

      if (buyerEmail) {
        try {
          await sendReviewNeededEmail({
            to: buyerEmail,
            rfqTitle: rfq.title,
            reason,
            compareUrl,
          });
        } catch (e) {
          console.error("Failed to send differs-from-cheapest buyer email:", e);
        }
      }
    }
  } catch (e) {
    console.error("Auto-approval evaluation failed:", e);
  }
}
