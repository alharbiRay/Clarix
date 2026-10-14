/**
 * Decision audit log (migration 0011). Server code records events with the
 * service role — buyers can read their trail but never write it. Recording
 * is best-effort: a failed audit write is logged loudly but never breaks the
 * quote/approval flow it describes (supabase-js has no cross-call
 * transactions, and losing a PO over an audit row would be worse).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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

const SOURCE_LABEL: Record<string, string> = {
  form: "via the supplier form",
  manual: "entered manually",
  pdf: "as an uploaded PDF",
  email: "by email (PDF)",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function sentence(s: string | null): string | null {
  if (!s) return null;
  const t = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?]$/.test(t) ? t : `${t}.`;
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

export function describeAuditEvent(e: { event_type: string; payload: unknown }): AuditDescription {
  const p = (e.payload && typeof e.payload === "object" ? e.payload : {}) as Record<string, unknown>;
  const supplier = str(p.supplier);

  switch (e.event_type) {
    case "rfq_created":
      return { title: "RFQ created", detail: typeof p.items === "number" ? `${p.items} line item${p.items === 1 ? "" : "s"}.` : null, tone: "neutral" };
    case "rfq_sent": {
      const n = typeof p.invited === "number" ? p.invited : null;
      const failures = typeof p.emailFailures === "number" && p.emailFailures > 0 ? p.emailFailures : 0;
      return {
        title: n !== null ? `Sent to ${n} supplier${n === 1 ? "" : "s"}` : "RFQ sent",
        detail: failures ? `${failures} invitation email${failures === 1 ? "" : "s"} could not be delivered.` : null,
        tone: failures ? "warning" : "neutral",
      };
    }
    case "quote_received": {
      const how = SOURCE_LABEL[str(p.source) ?? ""] ?? "";
      const total = money(p.total, p.currency);
      return {
        title: `Quote received${supplier ? ` from ${supplier}` : ""}${how ? ` ${how}` : ""}`,
        detail: total ? `${total} in total.` : null,
        tone: "neutral",
      };
    }
    case "quote_confirmed":
      return { title: `Confirmed ${supplier ? `${supplier}'s` : "the"} extracted quote`, detail: null, tone: "neutral" };
    case "quote_rejected":
      return { title: `Rejected ${supplier ? `${supplier}'s` : "a"} quote`, detail: sentence(str(p.reason)), tone: "warning" };
    case "quote_deleted":
      return { title: `Deleted ${supplier ? `${supplier}'s` : "a"} quote`, detail: null, tone: "warning" };
    case "extraction_completed": {
      const confidence = str(p.confidence);
      const warnings = Array.isArray(p.warnings) ? p.warnings.filter((w): w is string => typeof w === "string") : [];
      return {
        title: `AI read ${supplier ? `${supplier}'s` : "the"} PDF${confidence ? ` (${confidence} confidence)` : ""}`,
        detail: warnings.length ? `Check: ${warnings.join("; ")}.` : null,
        tone: warnings.length || confidence === "low" ? "warning" : "neutral",
      };
    }
    case "extraction_failed":
      return {
        title: `Couldn't read ${supplier ? `${supplier}'s` : "a"} PDF automatically`,
        detail: sentence(str(p.reason)),
        tone: "negative",
      };
    case "recommendation_generated": {
      const pick = str(p.recommended);
      return {
        title: `${p.mode === "manual" ? "You generated" : "Clarix generated"} an AI recommendation`,
        detail: pick ? `Recommended ${pick}.` : null,
        tone: "neutral",
      };
    }
    case "auto_approval_decided": {
      const explanation = Array.isArray(p.explanation) ? p.explanation.filter((x): x is string => typeof x === "string") : [];
      if (p.decision === "auto_approved") {
        return {
          title: `Auto-approved${supplier ? `: ${supplier}` : ""}`,
          detail: explanation.length ? sentence(explanation.join(", ")) : null,
          tone: "positive",
        };
      }
      return { title: "Held for your review", detail: sentence(str(p.reason) ?? explanation.join(", ")), tone: "warning" };
    }
    case "award_approved": {
      const aiPick = str(p.aiPick);
      const reason = str(p.reason);
      return {
        title: p.override && aiPick ? `Approved ${supplier ?? "a supplier"} instead of the AI's pick (${aiPick})` : `Approved ${supplier ?? "the recommendation"}`,
        detail: reason ? `Reason: ${sentence(reason)}` : null,
        tone: "positive",
      };
    }
    case "po_sent": {
      const total = money(p.total, p.currency);
      return {
        title: `Purchase order sent${supplier ? ` to ${supplier}` : ""}`,
        detail: total ? `${total}${p.automatic ? ", sent automatically" : ""}.` : null,
        tone: "positive",
      };
    }
    case "negotiation_sent":
      return { title: `Negotiation message sent${supplier ? ` to ${supplier}` : ""}`, detail: null, tone: "neutral" };
    case "ai_quota_error":
      return {
        title: "AI service rate-limited",
        detail: "Clarix retried automatically.",
        tone: "warning",
      };
    case "job_failed":
      return { title: "Automatic processing gave up", detail: sentence(str(p.error)), tone: "negative" };
    default:
      return { title: humanize(e.event_type), detail: null, tone: "neutral" };
  }
}
