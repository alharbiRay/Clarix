"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { isLocale } from "@/i18n/config";
import { approveAward } from "@/app/(dashboard)/rfqs/actions";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ApprovableQuote {
  quoteId: string;
  label: string;
  total: number | null;
  deliveryDays: number | null;
}

// Keys into approve.reasons; the chosen text (in the buyer's language) is what's recorded.
const OVERRIDE_REASONS = ["warranty", "delivery", "preferred", "quality", "payment"] as const;

export function ApproveAwardButton({
  rfqId,
  supplierLabel,
  recommendedQuoteId,
  quotes,
  currency,
  size = "sm",
  className,
}: {
  rfqId: string;
  /** The AI's pick; choosing anything else is an override that needs a reason. */
  recommendedQuoteId?: string | null;
  /** Label for the AI-recommended supplier — what the default button approves. */
  supplierLabel: string;
  /** All submitted/confirmed quotes for this RFQ, for the "choose different supplier" picker. */
  quotes: ApprovableQuote[];
  currency: string;
  size?: "sm" | "default";
  className?: string;
}) {
    const router = useRouter();
  const t = useTranslations("approve");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [reasonChoice, setReasonChoice] = useState<string>("");
  const [reasonText, setReasonText] = useState("");

  function approve(quoteId: string | undefined, label: string, reason?: string) {
    startTransition(async () => {
      const result = await approveAward(rfqId, quoteId, reason);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(t("approved", { supplier: label }));
        setPickerOpen(false);
        router.refresh();
      }
    });
  }

  const selected = quotes.find((q) => q.quoteId === selectedQuoteId);
  const otherChoices = quotes.length > 1;
  const isOverride = Boolean(selected && recommendedQuoteId && selected.quoteId !== recommendedQuoteId);
  const reason = reasonChoice === "other" ? reasonText.trim() : reasonChoice;
  const canApproveSelection = Boolean(selected) && (!isOverride || reason.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size={size}
        onClick={() => approve(undefined, supplierLabel)}
        disabled={isPending}
        className={cn(
          "gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700",
          className
        )}
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {t("approveSend")}
      </Button>

      {otherChoices && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size={size}
              variant="outline"
              disabled={isPending}
              className="gap-1 text-xs text-slate-600"
            >
              {t("chooseDifferent")}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 space-y-3" align="start">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-600">
                {t("awardDifferent")}
              </p>
              <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                <SelectTrigger className="h-9 text-sm" aria-label={t("awardDifferent")}>
                  <SelectValue placeholder={t("chooseSupplier")} />
                </SelectTrigger>
                <SelectContent>
                  {quotes.map((q) => (
                    <SelectItem key={q.quoteId} value={q.quoteId}>
                      <bdi>{q.label}</bdi> — {q.total === null ? "—" : formatMoney(q.total, currency, locale)} ·{" "}
                      {q.deliveryDays === null ? t("deliveryUnknown") : t("deliveryDays", { days: q.deliveryDays })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isOverride && (
              <div className="space-y-1.5">
                <label htmlFor="override-reason" className="text-xs font-medium text-slate-600">
                  {t("why")}
                </label>
                <select
                  id="override-reason"
                  value={reasonChoice}
                  onChange={(e) => setReasonChoice(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
                >
                  <option value="">{t("chooseReason")}</option>
                  {OVERRIDE_REASONS.map((r) => (
                    <option key={r} value={t(`reasons.${r}`)}>
                      {t(`reasons.${r}`)}
                    </option>
                  ))}
                  <option value="other">{t("other")}</option>
                </select>
                {reasonChoice === "other" && (
                  <input
                    aria-label={t("reasonLabel")}
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    maxLength={300}
                    placeholder={t("reasonPlaceholder")}
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
                  />
                )}
                <p className="text-xs text-slate-500">{t("savedToHistory")}</p>
              </div>
            )}
            <Button
              size="sm"
              className="w-full gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={!canApproveSelection || isPending}
              onClick={() => selected && approve(selected.quoteId, selected.label, isOverride ? reason : undefined)}
            >
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {selected ? t("approveSendTo", { supplier: selected.label }) : t("approveSend")}
            </Button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
