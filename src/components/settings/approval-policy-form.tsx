"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveApprovalPolicy } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { parsePolicy, type ApprovalPolicy, type ApprovalRule } from "@/lib/approval/rules";
import { previewPolicy, type PreviewCase } from "@/lib/approval/preview";
import { cn } from "@/lib/utils";

interface Draft {
  enabled: boolean;
  maxDeliveryDays: string;
  requireWarranty: boolean;
  requireCheapest: boolean;
  spendLimit: string;
  minSupplierScore: string;
}

const toDraft = (p: ApprovalPolicy): Draft => ({
  enabled: p.enabled,
  maxDeliveryDays: String(p.maxDeliveryDays),
  requireWarranty: p.requireWarranty,
  requireCheapest: p.requireCheapest,
  spendLimit: p.spendLimit === null ? "" : String(p.spendLimit),
  minSupplierScore: p.minSupplierScore === null ? "" : String(p.minSupplierScore),
});

const numberOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

function fromDraft(d: Draft) {
  return parsePolicy({
    enabled: d.enabled,
    maxDeliveryDays: Number(d.maxDeliveryDays),
    requireWarranty: d.requireWarranty,
    requireCheapest: d.requireCheapest,
    spendLimit: numberOrNull(d.spendLimit),
    minSupplierScore: numberOrNull(d.minSupplierScore),
  });
}

const HELD_LABEL: Record<ApprovalRule, string> = {
  requirements_not_met: "delivery, warranty or supplier score fell short",
  above_spend_limit: "above the spend limit (manager approval)",
  recommended_differs_from_cheapest: "the AI picked a pricier supplier",
  auto_approval_disabled: "auto-approval is off",
  all_rules_passed: "",
};

const inputClass =
  "h-9 rounded-md border border-slate-200 bg-white px-3 text-sm tabular-nums text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] aria-[invalid=true]:border-red-400 disabled:cursor-not-allowed disabled:bg-slate-50";

function Check({
  id,
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={`${id}-hint`}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-[#7C6FE0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      </div>
    </div>
  );
}

/**
 * The account's auto-approval rules, with a live replay of past RFQs through
 * the same engine the server uses — so "what would this have done?" is
 * answered before saving, not after a PO goes out.
 */
export function ApprovalPolicyForm({
  initial,
  cases,
  currency,
  previewUnavailable = false,
}: {
  initial: ApprovalPolicy;
  cases: PreviewCase[];
  currency: string;
  previewUnavailable?: boolean;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial));
  const [isPending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const parsed = fromDraft(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const preview = useMemo(() => {
    const p = fromDraft(draft);
    return p.ok ? previewPolicy(p.policy, cases) : null;
  }, [draft, cases]);
  const rulesOff = !draft.enabled;

  // Field-level errors, shown next to the field that caused them.
  const days = Number(draft.maxDeliveryDays);
  const daysError = !Number.isInteger(days) || days < 1 || days > 365 ? "Whole number of days, 1 to 365." : null;
  const limit = numberOrNull(draft.spendLimit);
  const limitError = limit !== null && (Number.isNaN(limit) || limit < 0) ? "Enter an amount of 0 or more, or leave it empty." : null;
  const score = numberOrNull(draft.minSupplierScore);
  const scoreError =
    score !== null && (!Number.isInteger(score) || score < 0 || score > 100) ? "Whole number from 0 to 100, or leave it empty." : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.ok) return;
    startTransition(async () => {
      const result = await saveApprovalPolicy(parsed.policy);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setSaved(draft);
      toast.success(parsed.policy.enabled ? "Approval rules saved" : "Auto-approval turned off");
    });
  }

  const heldEntries = preview
    ? (Object.entries(preview.byRule) as [ApprovalRule, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={`${uid}-switch-label`} className="text-sm font-medium text-slate-800">
            Approve automatically
          </p>
          <p id={`${uid}-switch-hint`} className="text-xs text-slate-500">
            When an AI recommendation passes every rule below, Clarix approves it and sends the PO. Anything else
            waits for you.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          aria-labelledby={`${uid}-switch-label`}
          aria-describedby={`${uid}-switch-hint`}
          onClick={() => set("enabled", !draft.enabled)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2",
            draft.enabled ? "bg-[#7C6FE0]" : "bg-slate-300"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-transform motion-reduce:transition-none",
              draft.enabled ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <fieldset disabled={rulesOff} className={cn("space-y-5 border-t border-slate-100 pt-5", rulesOff && "opacity-60")}>
        <legend className="sr-only">Rules a recommendation must pass</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-days`} className="text-sm font-medium text-slate-800">
              Delivery within
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={`${uid}-days`}
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step={1}
                value={draft.maxDeliveryDays}
                onChange={(e) => set("maxDeliveryDays", e.target.value)}
                aria-invalid={Boolean(daysError)}
                aria-describedby={`${uid}-days-hint`}
                className={cn(inputClass, "w-24")}
              />
              <span className="text-sm text-slate-600">days</span>
            </div>
            <p id={`${uid}-days-hint`} className={cn("mt-1 text-xs", daysError ? "text-red-700" : "text-slate-500")}>
              {daysError ?? "Slower or unconfirmed delivery waits for review."}
            </p>
          </div>

          <div>
            <label htmlFor={`${uid}-limit`} className="text-sm font-medium text-slate-800">
              Spend limit <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-slate-600">{currency}</span>
              <input
                id={`${uid}-limit`}
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="No limit"
                value={draft.spendLimit}
                onChange={(e) => set("spendLimit", e.target.value)}
                aria-invalid={Boolean(limitError)}
                aria-describedby={`${uid}-limit-hint`}
                className={cn(inputClass, "w-36")}
              />
            </div>
            <p id={`${uid}-limit-hint`} className={cn("mt-1 text-xs", limitError ? "text-red-700" : "text-slate-500")}>
              {limitError ?? "Orders above this need a manager's approval."}
            </p>
          </div>

          <div>
            <label htmlFor={`${uid}-score`} className="text-sm font-medium text-slate-800">
              Minimum supplier score <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={`${uid}-score`}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                placeholder="None"
                value={draft.minSupplierScore}
                onChange={(e) => set("minSupplierScore", e.target.value)}
                aria-invalid={Boolean(scoreError)}
                aria-describedby={`${uid}-score-hint`}
                className={cn(inputClass, "w-24")}
              />
              <span className="text-sm text-slate-600">/ 100</span>
            </div>
            <p id={`${uid}-score-hint`} className={cn("mt-1 text-xs", scoreError ? "text-red-700" : "text-slate-500")}>
              {scoreError ?? "From the supplier scorecard. Suppliers without a score yet wait for review."}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Check
            id={`${uid}-warranty`}
            checked={draft.requireWarranty}
            onChange={(v) => set("requireWarranty", v)}
            disabled={rulesOff}
            label="Require a warranty"
            hint="Quotes without warranty terms wait for review."
          />
          <Check
            id={`${uid}-cheapest`}
            checked={draft.requireCheapest}
            onChange={(v) => set("requireCheapest", v)}
            disabled={rulesOff}
            label="Only when the AI picks the cheapest complete quote"
            hint="Turn off to let the AI choose a pricier supplier when it judges them better value."
          />
        </div>
      </fieldset>

      <section aria-labelledby={`${uid}-preview`} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <h3 id={`${uid}-preview`} className="text-xs font-semibold text-slate-700">
          On your past RFQs
        </h3>
        <div aria-live="polite" className="mt-1 text-sm text-slate-700">
          {previewUnavailable ? (
            <p className="text-slate-500">The preview couldn&apos;t load right now. Your rules still save normally.</p>
          ) : !preview ? (
            <p className="text-slate-500">Fix the highlighted field to see the preview.</p>
          ) : preview.total === 0 ? (
            <p className="text-slate-500">
              No past RFQs with an AI recommendation yet. This fills in as you compare quotes.
            </p>
          ) : (
            <>
              <p>
                <strong className="font-semibold tabular-nums text-slate-900">{preview.autoApproved}</strong> of{" "}
                <span className="tabular-nums">{preview.total}</span> would have been approved automatically.
              </p>
              {heldEntries.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                  {heldEntries.map(([rule, n]) => (
                    <li key={rule}>
                      <span className="tabular-nums">{n}</span> held: {HELD_LABEL[rule]}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" className="h-9" disabled={!parsed.ok || !dirty || isPending}>
          {isPending ? "Saving…" : "Save rules"}
        </Button>
        {dirty && !isPending && (
          <button
            type="button"
            onClick={() => setDraft(saved)}
            className="text-sm text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] rounded"
          >
            Discard changes
          </button>
        )}
      </div>
    </form>
  );
}
