/**
 * Decision audit log (migration 0011). Server code records events with the
 * service role — buyers can read their trail but never write it. Recording
 * is best-effort: a failed audit write is logged loudly but never breaks the
 * quote/approval flow it describes (supabase-js has no cross-call
 * transactions, and losing a PO over an audit row would be worse).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { translatorFor } from "@/i18n/translator";
import type { Locale } from "@/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditEventType =
  | "rfq_created"
  | "rfq_sent"
  | "quote_received"
  | "quote_confirmed"
  | "quote_rejected"
  | "quote_deleted"
  | "extraction_completed"
  | "extraction_failed"
  | "recommendation_generated"
  | "auto_approval_decided"
  | "award_approved"
  | "po_sent"
  | "negotiation_sent"
  | "ai_quota_error"
  | "job_failed";

export interface AuditEventInput {
  buyerId: string;
  rfqId: string | null;
  actor: { type: "buyer" | "supplier" | "system"; id?: string | null };
  type: AuditEventType;
  /** One line, stored for quick listing; the UI re-derives richer text from the payload. */
  summary: string;
  payload?: Record<string, unknown>;
}

export async function recordAuditEvent(event: AuditEventInput, client?: SupabaseClient): Promise<boolean> {
  try {
    const supabase = client ?? createAdminClient();
    const { error } = await supabase.from("audit_events").insert({
      buyer_id: event.buyerId,
      rfq_id: event.rfqId,
      actor_type: event.actor.type,
      actor_id: event.actor.id ?? null,
      event_type: event.type,
      summary: event.summary.slice(0, 500),
      payload: event.payload ?? {},
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error(
      JSON.stringify({ event: "audit.write_failed", type: event.type, rfqId: event.rfqId, error: e instanceof Error ? e.message : String(e) })
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Human-readable descriptions (pure)
// ---------------------------------------------------------------------------

export type AuditTone = "neutral" | "positive" | "warning" | "negative";

export interface AuditDescription {
  title: string;
  detail: string | null;
  tone: AuditTone;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function sentence(s: string | null): string | null {
  if (!s) return null;
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?؟]$/.test(t) ? t : `${t}.`;
}
function money(total: unknown, currency: unknown) {
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  const cur = str(currency) ?? "SAR";
  return `${cur} ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function humanize(type: string) {
  const s = type.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Plain-language title and detail for one event, in the viewer's language.
 * Free text stored in the payload (AI warnings, approval reasons, override
 * reasons) is shown as recorded.
 */
export function describeAuditEvent(e: { event_type: string; payload: unknown }, locale: Locale = "en"): AuditDescription {
  const t = translatorFor(locale, "audit");
  const p = (e.payload && typeof e.payload === "object" ? e.payload : {}) as Record<string, unknown>;
  const supplier = str(p.supplier);

  switch (e.event_type) {
    case "rfq_created":
      return { title: t("rfqCreated"), detail: typeof p.items === "number" ? t("lineItems", { count: p.items }) : null, tone: "neutral" };
    case "rfq_sent": {
      const n = typeof p.invited === "number" ? p.invited : null;
      const failures = typeof p.emailFailures === "number" && p.emailFailures > 0 ? p.emailFailures : 0;
      return {
        title: n !== null ? t("sentTo", { count: n }) : t("rfqSent"),
        detail: failures ? t("emailFailures", { count: failures }) : null,
        tone: failures ? "warning" : "neutral",
      };
    }
    case "quote_received": {
      const source = str(p.source);
      const how = source && ["form", "manual", "pdf", "email"].includes(source) ? t(`source.${source}`) : "";
      const total = money(p.total, p.currency);
      return {
        title: `${supplier ? t("quoteReceivedFrom", { supplier }) : t("quoteReceived")}${how ? ` ${how}` : ""}`,
        detail: total ? t("inTotal", { total }) : null,
        tone: "neutral",
      };
    }
    case "quote_confirmed":
      return { title: supplier ? t("confirmedOf", { supplier }) : t("confirmed"), detail: null, tone: "neutral" };
    case "quote_rejected":
      return { title: supplier ? t("rejectedOf", { supplier }) : t("rejected"), detail: sentence(str(p.reason)), tone: "warning" };
    case "quote_deleted":
      return { title: supplier ? t("deletedOf", { supplier }) : t("deleted"), detail: null, tone: "warning" };
    case "extraction_completed": {
      const confidence = str(p.confidence);
      const level = confidence && ["high", "medium", "low"].includes(confidence) ? t(`confidenceLevel.${confidence}`) : confidence;
      const warnings = Array.isArray(p.warnings) ? p.warnings.filter((w): w is string => typeof w === "string") : [];
      return {
        title: `${supplier ? t("aiReadOf", { supplier }) : t("aiRead")}${level ? t("confidence", { level }) : ""}`,
        detail: warnings.length ? t("check", { warnings: warnings.join("; ") }) : null,
        tone: warnings.length || confidence === "low" ? "warning" : "neutral",
      };
    }
    case "extraction_failed":
      return {
        title: supplier ? t("extractionFailedOf", { supplier }) : t("extractionFailed"),
        detail: t("extractionFailedDetail"),
        tone: "negative",
      };
    case "recommendation_generated": {
      const pick = str(p.recommended);
      return {
        title: p.mode === "manual" ? t("recYou") : t("recClarix"),
        detail: pick ? t("recommended", { supplier: pick }) : null,
        tone: "neutral",
      };
    }
    case "auto_approval_decided": {
      const explanation = Array.isArray(p.explanation) ? p.explanation.filter((x): x is string => typeof x === "string") : [];
      if (p.decision === "not_evaluated") {
        return { title: t("skipped"), detail: sentence(str(p.reason)), tone: "neutral" };
      }
      if (p.decision === "auto_approved") {
        return {
          title: supplier ? t("autoApprovedOf", { supplier }) : t("autoApproved"),
          detail: explanation.length ? sentence(explanation.join(", ")) : null,
          tone: "positive",
        };
      }
      return { title: t("held"), detail: sentence(str(p.reason) ?? explanation.join(", ")), tone: "warning" };
    }
    case "award_approved": {
      const aiPick = str(p.aiPick);
      const reason = str(p.reason);
      return {
        title:
          p.override && aiPick
            ? t("approvedInstead", { supplier: supplier ?? t("aSupplier"), aiPick })
            : t("approved", { supplier: supplier ?? t("theRecommendation") }),
        detail: reason ? t("reason", { reason: sentence(reason) ?? reason }) : null,
        tone: "positive",
      };
    }
    case "po_sent": {
      const total = money(p.total, p.currency);
      if (p.emailDelivered === false) {
        return {
          title: t("poFailed", { supplier: supplier ?? t("theSupplier") }),
          detail: `${total ? `${total}. ` : ""}${t("poFailedDetail")}`,
          tone: "warning",
        };
      }
      return {
        title: supplier ? t("poSentTo", { supplier }) : t("poSent"),
        detail: total ? (p.automatic ? t("poAuto", { total }) : t("poManual", { total })) : null,
        tone: "positive",
      };
    }
    case "negotiation_sent": {
      const pct = typeof p.targetPercent === "number" ? p.targetPercent : null;
      const lang = p.language === "ar" ? t("langAr") : p.language === "en" ? t("langEn") : null;
      const parts = [pct !== null ? t("askedPct", { pct }) : t("askedBest"), lang ? t("inLanguage", { language: lang }) : null];
      return {
        title: supplier ? t("negotiationTo", { supplier }) : t("negotiation"),
        detail: `${parts.filter(Boolean).join(" ")}${t("sentenceEnd")}`,
        tone: "neutral",
      };
    }
    case "ai_quota_error":
      return { title: t("quota"), detail: t("quotaDetail"), tone: "warning" };
    case "job_failed":
      if (p.jobType === "inbound_email_quote") return { title: t("jobEmail"), detail: t("jobEmailDetail"), tone: "negative" };
      if (p.jobType === "auto_recommendation") return { title: t("jobRec"), detail: t("jobRecDetail"), tone: "negative" };
      return { title: t("jobOther"), detail: null, tone: "negative" };
    default:
      return { title: humanize(e.event_type), detail: null, tone: "neutral" };
  }
}

