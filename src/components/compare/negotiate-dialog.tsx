"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, MessageSquareText, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { draftNegotiationReply, sendNegotiationMessage } from "@/app/(dashboard)/rfqs/negotiation-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Language = "ar" | "en";

const fieldClass =
  "w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] aria-[invalid=true]:border-red-400";

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
  suggestedPercent,
  lowerOfferExists,
  isDemo,
}: {
  rfqId: string;
  quoteId: string;
  supplierLabel: string;
  defaultLanguage: Language;
  suggestedPercent: number | null;
  lowerOfferExists: boolean;
  isDemo: boolean;
}) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [target, setTarget] = useState(suggestedPercent === null ? "" : String(suggestedPercent));
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [source, setSource] = useState<"ai" | "template" | "manual">("ai");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDrafting, startDrafting] = useTransition();
  const [isSending, startSending] = useTransition();

  const targetNumber = target.trim() === "" ? null : Number(target.trim());
  const targetError =
    targetNumber !== null && (!Number.isInteger(targetNumber) || targetNumber < 1 || targetNumber > 50)
      ? "Whole number from 1 to 50, or leave it empty to ask for their best price."
      : null;

  function requestDraft() {
    if (targetError) return;
    setError(null);
    startDrafting(async () => {
      const r = await draftNegotiationReply({ rfqId, quoteId, language, targetPercent: targetNumber });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setDraft(r.draft);
      setSource(r.source);
      setNotice(r.notice);
    });
  }

  function send() {
    if (!draft) return;
    setError(null);
    startSending(async () => {
      const r = await sendNegotiationMessage({ rfqId, quoteId, ...draft, language, targetPercent: targetNumber, source });
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

  const dir = language === "ar" ? "rtl" : "ltr";

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
          <DialogDescription>
            {lowerOfferExists
              ? "Clarix drafts a polite counter-offer from this supplier's own quote. You can edit it before sending."
              : "This supplier is already the lowest. The draft asks whether they can improve their terms."}
          </DialogDescription>
        </DialogHeader>

        <p className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
          Other suppliers&apos; names and prices are never shared. The message says only that a lower offer exists.
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
              {targetError ??
                (suggestedPercent !== null
                  ? `The best other offer is about ${suggestedPercent}% lower. Only the percentage you enter is mentioned.`
                  : "Leave empty to ask for their best price.")}
            </p>
          </div>
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
            {notice && (
              <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {notice}
              </p>
            )}
            <div>
              <label htmlFor={`${uid}-subject`} className="text-sm font-medium text-slate-800">
                Subject
              </label>
              <input
                id={`${uid}-subject`}
                dir={dir}
                value={draft.subject}
                maxLength={200}
                onChange={(e) => {
                  setDraft({ ...draft, subject: e.target.value });
                  if (source !== "manual") setSource("manual");
                }}
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
                onChange={(e) => {
                  setDraft({ ...draft, body: e.target.value });
                  if (source !== "manual") setSource("manual");
                }}
                aria-describedby={`${uid}-body-count`}
                className={cn(fieldClass, "mt-1 py-2 leading-relaxed")}
              />
              <p id={`${uid}-body-count`} className="mt-1 text-right text-xs tabular-nums text-slate-400">
                {draft.body.length} / 4000
              </p>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {draft && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={requestDraft} disabled={isDrafting || isSending} className="gap-1.5">
              <RotateCcw size={14} aria-hidden="true" />
              {isDrafting ? "Drafting…" : "Redraft"}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-1.5">
                <Copy size={14} aria-hidden="true" />
                Copy
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={send}
                disabled={isSending || isDemo}
                title={isDemo ? "Sending is turned off in the demo" : undefined}
                className="gap-1.5"
              >
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
