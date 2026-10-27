"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveApprovalPolicy, updateAutoApprovalSetting } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { MAX_SPEND_LIMIT, parsePolicy, type ApprovalPolicy, type ApprovalRule } from "@/lib/approval/rules";
import { previewPolicy, type PreviewCase } from "@/lib/approval/preview";
import { cn } from "@/lib/utils";

interface Draft {
  maxDeliveryDays: string;
  requireWarranty: boolean;
  requireCheapest: boolean;
  spendLimit: string;
  minSupplierScore: string;
}

const toDraft = (p: ApprovalPolicy): Draft => ({
  maxDeliveryDays: String(p.maxDeliveryDays),
  requireWarranty: p.requireWarranty,
  requireCheapest: p.requireCheapest,
  spendLimit: p.spendLimit === null ? "" : String(p.spendLimit),
  minSupplierScore: p.minSupplierScore === null ? "" : String(p.minSupplierScore),
});

/**
 * Reads what people actually type: Arabic-Indic digits, thousands separators
 * and spaces. Empty means "not set" (null); anything unreadable is NaN, so it
 * shows an error instead of quietly becoming "no limit".
 */
export function parseNumberInput(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[,٬\s]/g, "");
  if (s === "") return null;
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

const HELD_LABEL: Record<ApprovalRule, string> = {
  requirements_not_met: "delivery, warranty, score or an incomplete quote fell short",
  above_spend_limit: "needed a manager (spend limit)",
  recommended_differs_from_cheapest: "the AI picked a pricier supplier",
  ai_pick_unmatched: "the AI's pick couldn't be matched to a quote",
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
  const [enabled, setEnabled] = useState(initial.enabled);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial));
  const [isSaving, startSaving] = useTransition();
  const [isSwitching, startSwitching] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // A limit set in another currency is kept as it is until changed here.
  const limitCurrency = initial.spendLimit !== null && initial.spendLimitCurrency ? initial.spendLimitCurrency : currency;

  function policyFrom(d: Draft, on: boolean) {
    const spendLimit = parseNumberInput(d.spendLimit);
    return parsePolicy(
      {
        enabled: on,
        maxDeliveryDays: parseNumberInput(d.maxDeliveryDays),
        requireWarranty: d.requireWarranty,
        requireCheapest: d.requireCheapest,
        spendLimit,
        spendLimitCurrency: spendLimit === null ? null : limitCurrency,
        minSupplierScore: parseNumberInput(d.minSupplierScore),
      },
      { strict: true }
    );
  }

  const parsed = policyFrom(draft, enabled);
  const savedPolicy = policyFrom(saved, enabled);
  const dirty = !(parsed.ok && savedPolicy.ok && JSON.stringify(parsed.policy) === JSON.stringify(savedPolicy.policy));
  const preview = useMemo(() => {
    const p = policyFrom(draft, enabled);
    return p.ok ? previewPolicy(p.policy, cases) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, enabled, cases]);

  // Field-level errors, shown next to the field that caused them.
  const days = parseNumberInput(draft.maxDeliveryDays);
  const daysError = days === null || !Number.isInteger(days) || days < 1 || days > 365 ? "Whole number of days, 1 to 365." : null;
  const limit = parseNumberInput(draft.spendLimit);
  const limitError =
    limit !== null && (Number.isNaN(limit) || limit > MAX_SPEND_LIMIT) ? "Enter an amount, like 50,000, or leave it empty for no limit." : null;
  const score = parseNumberInput(draft.minSupplierScore);
  const scoreError =
    score !== null && (!Number.isInteger(score) || score < 0 || score > 100) ? "Whole number from 0 to 100, or leave it empty." : null;
  const anyFieldError = Boolean(daysError || limitError || scoreError);

  // The switch is the kill switch: it takes effect immediately, whatever
  // state the other fields are in.
  function toggle() {
    const next = !enabled;
    setEnabled(next);
    startSwitching(async () => {
      const result = await updateAutoApprovalSetting(next);
      if ("error" in result && result.error) {
        setEnabled(!next);
        toast.error(result.error);
      } else {
        toast.success(next ? "Auto-approval turned on" : "Auto-approval turned off");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.ok) return;
    startSaving(async () => {
      const result = await saveApprovalPolicy(parsed.policy);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      setSaved(draft);
      toast.success("Approval rules saved");
    });
  }

  const heldEntries = preview
    ? (Object.entries(preview.byRule) as [ApprovalRule, number][]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    : [];
  const rulesOff = !enabled;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={`${uid}-switch-label`} className="text-sm font-medium text-slate-800">
            Approve automatically
          </p>
          <p id={`${uid}-switch-hint`} className="text-xs text-slate-500">
            When an AI recommendation passes every rule below, Clarix approves it and sends the PO. Anything else
            waits for you. This switch takes effect immediately.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby={`${uid}-switch-label`}
          aria-describedby={`${uid}-switch-hint`}
          disabled={isSwitching}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2 disabled:cursor-wait",
            enabled ? "bg-[#7C6FE0]" : "bg-slate-300"
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-transform motion-reduce:transition-none",
              enabled ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <div className="space-y-5 border-t border-slate-100 pt-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className={cn(rulesOff && "opacity-60")}>
            <label htmlFor={`${uid}-days`} className="text-sm font-medium text-slate-800">
              Delivery within
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={`${uid}-days`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={rulesOff}
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
              <span className="text-sm text-slate-600">{limitCurrency}</span>
              <input
                id={`${uid}-limit`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="No limit"
                value={draft.spendLimit}
                onChange={(e) => set("spendLimit", e.target.value)}
                aria-invalid={Boolean(limitError)}
                aria-describedby={`${uid}-limit-hint`}
                className={cn(inputClass, "w-36")}
              />
            </div>
            <p id={`${uid}-limit-hint`} className={cn("mt-1 text-xs", limitError ? "text-red-700" : "text-slate-500")}>
              {limitError ??
                `Orders above this always need a manager, including ones approved by hand. RFQs in other currencies need a manager too.`}
            </p>
          </div>

          <div className={cn(rulesOff && "opacity-60")}>
            <label htmlFor={`${uid}-score`} className="text-sm font-medium text-slate-800">
              Minimum supplier score <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={`${uid}-score`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                disabled={rulesOff}
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

        <div className={cn("space-y-3", rulesOff && "opacity-60")}>
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
            hint="Turn off to let the AI choose a pricier supplier when it judges them better value. Quotes with unpriced lines are never approved automatically."
          />
        </div>
      </div>

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
              No past RFQs with an automatic AI recommendation yet. This fills in as you compare quotes.
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
        <Button type="submit" size="sm" className="h-9" disabled={!parsed.ok || anyFieldError || !dirty || isSaving}>
          {isSaving ? "Saving…" : "Save rules"}
        </Button>
        {dirty && !isSaving && (
          <button
            type="button"
            onClick={() => setDraft(saved)}
            className="rounded text-sm text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
          >
            Discard changes
          </button>
        )}
      </div>
    </form>
  );
}
