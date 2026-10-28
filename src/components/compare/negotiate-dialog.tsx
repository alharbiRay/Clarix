"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Loader2, MessageSquareText, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { draftNegotiationReply, sendNegotiationMessage, type DraftSource } from "@/app/(dashboard)/rfqs/negotiation-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { targetRevealsGap, type Position } from "@/lib/negotiation";
import { cn } from "@/lib/utils";

type Language = "ar" | "en";

/** A draft remembers what it was written with, so Send always matches the text. */
interface DraftState {
  subject: string;
  body: string;
  language: Language;
  targetPercent: number | null;
  source: DraftSource;
}

const fieldClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] aria-[invalid=true]:border-red-400";

function parseTarget(raw: string): number | null | "invalid" {
  const s = raw.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[%٪]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : "invalid";
}

/**
 * "Draft negotiation reply" for one supplier on the compare page. The server
 * builds the draft from this supplier's own figures only; the buyer edits it,
 * then sends it (privacy-checked again on the server) or copies it.
 */
export function NegotiateDialog({
  rfqId,
  quoteId,
  supplierLabel,
  defaultLanguage,
  position,
  gapPercent,
  hintPercent,
  isDemo,
}: {
  rfqId: string;
  quoteId: string;
  supplierLabel: string;
  defaultLanguage: Language;
  position: Position;
  /** Exact gap to the best other offer — used only to warn the buyer, never sent. */
  gapPercent: number | null;
  hintPercent: number | null;
  isDemo: boolean;
}) {
  const uid = useId();
  const router = useRouter();
  const subjectRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  // Never pre-filled: a precise percentage lets the supplier estimate the competing price.
  const [target, setTarget] = useState("");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [edited, setEdited] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDrafting, startDrafting] = useTransition();
  const [isSending, startSending] = useTransition();

  const parsedTarget = parseTarget(target);
  const targetError = parsedTarget === "invalid" ? "Whole number from 1 to 50, or leave it empty to ask for their best price." : null;
  const targetNumber = parsedTarget === "invalid" ? null : parsedTarget;
  const revealing = targetRevealsGap(targetNumber, gapPercent);
  const stale = Boolean(draft && (draft.language !== language || draft.targetPercent !== targetNumber));

  // Move focus to the draft when it arrives (the button that had focus is gone).
  useEffect(() => {
    if (draft && !edited) subjectRef.current?.focus();
  }, [draft, edited]);

  function requestDraft() {
    if (targetError) return;
    if (draft && edited && !window.confirm("Replace your edited message with a new draft?")) return;
    setError(null);
    startDrafting(async () => {
      const r = await draftNegotiationReply({ rfqId, quoteId, language, targetPercent: targetNumber });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setDraft({ ...r.draft, language: r.language, targetPercent: r.targetPercent, source: r.source });
      setEdited(false);
      setNotice(r.notice);
    });
  }

  function editDraft(patch: Partial<Pick<DraftState, "subject" | "body">>) {
    if (!draft) return;
    setEdited(true);
    setDraft({ ...draft, ...patch, source: draft.source === "ai" || draft.source === "ai_edited" ? "ai_edited" : "template_edited" });
  }

  function send() {
    if (!draft || stale) return;
    setError(null);
    startSending(async () => {
      const r = await sendNegotiationMessage({
        rfqId,
        quoteId,
        subject: draft.subject,
        body: draft.body,
        language: draft.language,
        targetPercent: draft.targetPercent,
        source: draft.source,
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      toast.success(`Sent to ${supplierLabel}. Their reply will come to your email.`);
      setOpen(false);
      setDraft(null);
      router.refresh();
    });
  }

  async function copy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(`${draft.subject}\n\n${draft.body}`);
      toast.success("Message copied");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  const dir = (draft?.language ?? language) === "ar" ? "rtl" : "ltr";
  const description = {
    higher: "Clarix drafts a polite counter-offer from this supplier's own quote. You can edit it before sending.",
    lowest: "This supplier's offer is the most competitive so far. The draft asks whether they can improve their terms.",
    unknown: "This quote leaves some lines unpriced. The draft asks the supplier to complete it and share their best price.",
  }[position];
  const hint =
    hintPercent === null
      ? "Leave empty to ask for their best price."
      : gapPercent !== null && gapPercent >= 30
        ? "The best other offer is 30% or more lower. Only the percentage you enter is mentioned."
        : hintPercent < 5
          ? "The best other offer is less than 5% lower. Only the percentage you enter is mentioned."
          : `The best other offer is about ${hintPercent}% lower. Only the percentage you enter is mentioned.`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-xs">
          <MessageSquareText size={13} aria-hidden="true" />
          Negotiate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Negotiate with <bdi>{supplierLabel}</bdi>
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
          Other suppliers&apos; names and prices are never shared, and every message is checked before it goes out.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">Language</legend>
            <div className="mt-1 inline-flex rounded-md border border-slate-200 p-0.5">
              {(
                [
                  ["en", "English"],
                  ["ar", "العربية"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={language === value}
                  lang={value}
                  onClick={() => setLanguage(value)}
                  className={cn(
                    "rounded px-3 py-1 text-sm transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]",
                    language === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          {position !== "unknown" && (
            <div>
              <label htmlFor={`${uid}-target`} className="text-sm font-medium text-slate-800">
                Ask for a reduction of <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id={`${uid}-target`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Best price"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  aria-invalid={Boolean(targetError)}
                  aria-describedby={`${uid}-target-hint`}
                  className={cn(fieldClass, "h-9 w-24 tabular-nums")}
                />
                <span className="text-sm text-slate-600">%</span>
              </div>
              <p id={`${uid}-target-hint`} className={cn("mt-1 text-xs", targetError ? "text-red-700" : "text-slate-500")}>
                {targetError ?? hint}
              </p>
              {revealing && !targetError && (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                  This is close to the real gap, so the supplier could work out the competing price. A rounder number is safer.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Kept mounted so screen readers announce what appears in it. */}
        <div aria-live="polite" className="empty:hidden">
          {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{notice}</p>}
        </div>

        {!draft ? (
          <div className="flex justify-end">
            <Button type="button" onClick={requestDraft} disabled={isDrafting || Boolean(targetError)} className="gap-2">
              {isDrafting && <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {isDrafting ? "Drafting…" : "Draft message"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor={`${uid}-subject`} className="text-sm font-medium text-slate-800">
                Subject
              </label>
              <input
                ref={subjectRef}
                id={`${uid}-subject`}
                dir={dir}
                value={draft.subject}
                maxLength={200}
                onChange={(e) => editDraft({ subject: e.target.value })}
                className={cn(fieldClass, "mt-1 h-9")}
              />
            </div>
            <div>
              <label htmlFor={`${uid}-body`} className="text-sm font-medium text-slate-800">
                Message
              </label>
              <textarea
                id={`${uid}-body`}
                dir={dir}
                rows={10}
                maxLength={4000}
                value={draft.body}
                onChange={(e) => editDraft({ body: e.target.value })}
                aria-describedby={`${uid}-body-count`}
                className={cn(fieldClass, "mt-1 py-2 leading-relaxed")}
              />
              <p id={`${uid}-body-count`} className="mt-1 text-end text-xs tabular-nums text-slate-400">
                {draft.body.length} / 4000
              </p>
            </div>
            {stale && (
              <p className="text-xs text-amber-800">You changed the language or target. Redraft to apply it before sending.</p>
            )}
          </div>
        )}

        <div aria-live="assertive" className="empty:hidden">
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        </div>

        {draft && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={requestDraft} disabled={isDrafting || isSending} className="gap-1.5">
              <RotateCcw size={14} aria-hidden="true" />
              {isDrafting ? "Drafting…" : "Redraft"}
            </Button>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isDemo && <span className="text-xs text-slate-500">Sending is turned off in the demo.</span>}
              <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-1.5">
                <Copy size={14} aria-hidden="true" />
                Copy
              </Button>
              <Button type="button" size="sm" onClick={send} disabled={isSending || isDrafting || isDemo || stale} className="gap-1.5">
                {isSending ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
                {isSending ? "Sending…" : "Send"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
