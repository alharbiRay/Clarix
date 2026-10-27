"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DEMO_READ_ONLY_ERROR, requireWritableUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { generateNegotiationDraft } from "@/lib/gemini";
import { isGeminiRateLimited } from "@/lib/gemini-errors";
import { sendNegotiationEmail } from "@/lib/email";
import {
  buildNegotiationContext,
  buildNegotiationPrompt,
  detectLanguage,
  findPrivacyLeaks,
  sensitiveTermsFor,
  templateDraft,
  type ComparisonSnapshot,
  type Draft,
  type Language,
} from "@/lib/negotiation";
import { NEGOTIATION_RFQ_SELECT, snapshotFromRows } from "@/lib/negotiation/snapshot";

/** Per account, per hour. Drafts spend Gemini quota; sends are outgoing email. */
const DRAFT_LIMIT = 20;
const SEND_LIMIT = 20;
const WINDOW_SECONDS = 3600;
const MAX_SUBJECT = 200;
const MIN_BODY = 20;
const MAX_BODY = 4000;

export type DraftResult =
  | {
      draft: Draft;
      language: Language;
      source: "ai" | "template";
      notice: string | null;
      demo?: boolean;
    }
  | { error: string };

async function consume(supabase: SupabaseClient, action: string, limit: number) {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_action: action,
    p_limit: limit,
    p_window_seconds: WINDOW_SECONDS,
  });
  // Fail closed: these actions cost money.
  if (error) return { error: "Couldn't check your usage limit. Try again in a moment." };
  if (data === false) return { error: `You've reached the limit of ${limit} per hour. Try again later, or write the message yourself.` };
  return { ok: true as const };
}

async function loadSnapshot(
  supabase: SupabaseClient,
  rfqId: string,
  buyerId: string
): Promise<{ snapshot: ComparisonSnapshot; buyerEmail: string | null } | { error: string }> {
  const [{ data: rfq }, { data: profile }, { data: award }] = await Promise.all([
    supabase.from("rfqs").select(NEGOTIATION_RFQ_SELECT).eq("id", rfqId).eq("buyer_id", buyerId).maybeSingle(),
    supabase.from("profiles").select("email, company, full_name").eq("id", buyerId).maybeSingle(),
    supabase.from("rfq_awards").select("po_sent_at").eq("rfq_id", rfqId).maybeSingle(),
  ]);
  if (!rfq) return { error: "RFQ not found." };
  if (award?.po_sent_at) return { error: "A PO has already been sent for this RFQ." };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshot: snapshotFromRows(rfq as any, profile as { company: string | null; full_name: string | null } | null),
    buyerEmail: (profile?.email as string | undefined) ?? null,
  };
}

function defaultLanguage(snapshot: ComparisonSnapshot, quoteId: string): Language {
  const quote = snapshot.quotes.find((q) => q.id === quoteId);
  const s = snapshot.suppliers.find((x) => x.id === quote?.inviteId);
  return s?.preferredLanguage ?? detectLanguage(`${s?.companyName ?? ""} ${s?.contactName ?? ""}`);
}

/**
 * Drafts a counter-message to one supplier. Never fails just because the AI
 * did: on a quota error, an unreadable answer, or a draft that mentions
 * another supplier, the buyer gets a safe template to edit instead.
 */
export async function draftNegotiationReply(input: {
  rfqId: string;
  quoteId: string;
  language?: Language | null;
  targetPercent: number | null;
}): Promise<DraftResult> {
  const supabase = createClient();
  const auth = await requireWritableUser(supabase);
  const demo = "error" in auth && auth.error === DEMO_READ_ONLY_ERROR;
  if ("error" in auth && !demo) return { error: auth.error };

  let buyerId: string;
  if ("user" in auth) {
    buyerId = auth.user.id;
  } else {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return { error: "Not authenticated" };
    buyerId = data.user.id;
  }

  if (!demo) {
    const limit = await consume(supabase, "negotiation_draft", DRAFT_LIMIT);
    if ("error" in limit) return { error: limit.error! };
  }

  const loaded = await loadSnapshot(supabase, input.rfqId, buyerId);
  if ("error" in loaded) return { error: loaded.error };
  const language = input.language === "ar" || input.language === "en" ? input.language : defaultLanguage(loaded.snapshot, input.quoteId);
  const ctx = buildNegotiationContext(loaded.snapshot, input.quoteId, { language, targetPercent: input.targetPercent });
  if ("error" in ctx) return { error: ctx.error };

  // The demo is a shared session: show the flow without spending AI quota.
  if (demo) {
    return { draft: templateDraft(ctx), language, source: "template", notice: "In the demo, drafts come from a template and sending is turned off.", demo: true };
  }

  try {
    const draft = await generateNegotiationDraft(buildNegotiationPrompt(ctx));
    const leaks = findPrivacyLeaks(`${draft.subject}\n${draft.body}`, sensitiveTermsFor(loaded.snapshot, input.quoteId));
    if (leaks.length > 0) {
      console.warn(JSON.stringify({ event: "negotiation.draft_leak_blocked", rfqId: input.rfqId, count: leaks.length }));
      return {
        draft: templateDraft(ctx),
        language,
        source: "template",
        notice: "The AI draft mentioned details about other suppliers, so Clarix replaced it with a safe template.",
      };
    }
    return { draft, language, source: "ai", notice: null };
  } catch (e) {
    const busy = isGeminiRateLimited(e);
    console.error(JSON.stringify({ event: "negotiation.draft_failed", rfqId: input.rfqId, quota: busy, error: String(e).slice(0, 300) }));
    return {
      draft: templateDraft(ctx),
      language,
      source: "template",
      notice: busy
        ? "The AI is busy right now (usage limit reached). Here's a template to start from."
        : "The AI couldn't write a draft this time. Here's a template to start from.",
    };
  }
}

/** Sends the (possibly edited) message to the supplier, after the privacy check. */
export async function sendNegotiationMessage(input: {
  rfqId: string;
  quoteId: string;
  subject: string;
  body: string;
  language: Language;
  targetPercent: number | null;
  source: "ai" | "template" | "manual";
}): Promise<{ success: true } | { error: string }> {
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  if (!subject) return { error: "Add a subject line." };
  if (subject.length > MAX_SUBJECT) return { error: `Keep the subject under ${MAX_SUBJECT} characters.` };
  if (body.length < MIN_BODY) return { error: "The message is too short to send." };
  if (body.length > MAX_BODY) return { error: `Keep the message under ${MAX_BODY} characters.` };
  if (input.language !== "ar" && input.language !== "en") return { error: "Choose a language." };

  const supabase = createClient();
  const auth = await requireWritableUser(supabase);
  if ("error" in auth) return { error: auth.error };

  const limit = await consume(supabase, "negotiation_send", SEND_LIMIT);
  if ("error" in limit) return { error: limit.error! };

  const loaded = await loadSnapshot(supabase, input.rfqId, auth.user.id);
  if ("error" in loaded) return { error: loaded.error };
  const { snapshot } = loaded;
  const quote = snapshot.quotes.find((q) => q.id === input.quoteId);
  const supplier = snapshot.suppliers.find((s) => s.id === quote?.inviteId);
  if (!quote || !supplier) return { error: "Quote not found." };
  if (quote.status !== "submitted" && quote.status !== "confirmed") return { error: "This quote is still pending review." };

  const leaks = findPrivacyLeaks(`${subject}\n${body}`, sensitiveTermsFor(snapshot, input.quoteId));
  if (leaks.length > 0) {
    return { error: `This message ${leaks.join(" and ")}. Remove it before sending — suppliers never see each other's details.` };
  }

  try {
    await sendNegotiationEmail({ to: supplier.email, replyTo: loaded.buyerEmail, subject, body, language: input.language });
  } catch (e) {
    console.error(`[negotiation] rfq=${input.rfqId} send failed:`, e);
    return { error: "Couldn't send the email. Try again, or copy the message and send it yourself." };
  }

  const label = supplier.companyName || supplier.email;
  await recordAuditEvent({
    buyerId: auth.user.id,
    rfqId: input.rfqId,
    actor: { type: "buyer", id: auth.user.id },
    type: "negotiation_sent",
    summary: `Negotiation message sent to ${label}`,
    payload: {
      supplier: label,
      quoteId: input.quoteId,
      language: input.language,
      targetPercent: input.targetPercent,
      source: input.source,
      subject,
      emailDelivered: true,
    },
  });

  // Remember the language for next time (best-effort).
  if (supplier.supplierId) {
    await supabase.from("suppliers").update({ preferred_language: input.language }).eq("id", supplier.supplierId);
  }

  return { success: true };
}
