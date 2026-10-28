"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, GripVertical, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { generateRecommendation } from "@/app/(dashboard)/rfqs/quote-actions";
import type { RecommendationPreferences, RecommendationWeights } from "@/lib/gemini";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { isLocale } from "@/i18n/config";

type PriorityKey = keyof RecommendationWeights;

const DEFAULT_ORDER: PriorityKey[] = ["price", "delivery", "warranty", "paymentTerms"];

/** Ranks (top = highest priority) → the same 0-100 weight scale the backend already consumes. */
function orderToWeights(order: PriorityKey[]): RecommendationWeights {
  const n = order.length;
  const weights = {} as RecommendationWeights;
  order.forEach((key, i) => {
    weights[key] = Math.round(((n - 1 - i) / (n - 1)) * 100);
  });
  return weights;
}

function weightsToOrder(weights: RecommendationWeights): PriorityKey[] {
  return [...DEFAULT_ORDER].sort((a, b) => weights[b] - weights[a]);
}

export interface InitialPreferences {
  weights: RecommendationWeights;
  hasDeadline: boolean;
  deadlineDate: string | null;
  maxBudget: number | null;
}

export function GenerateRecommendationButton({
  rfqId,
  hasExisting,
  initialPreferences,
}: {
  rfqId: string;
  hasExisting: boolean;
  initialPreferences?: InitialPreferences | null;
}) {
  const t = useTranslations("recommend");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<PriorityKey[]>(
    initialPreferences ? weightsToOrder(initialPreferences.weights) : DEFAULT_ORDER
  );
  const [hasDeadline, setHasDeadline] = useState(initialPreferences?.hasDeadline ?? false);
  const [deadlineDate, setDeadlineDate] = useState(initialPreferences?.deadlineDate ?? "");
  const [maxBudget, setMaxBudget] = useState(
    initialPreferences?.maxBudget != null ? String(initialPreferences.maxBudget) : ""
  );
  const [draggedKey, setDraggedKey] = useState<PriorityKey | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDrop(targetKey: PriorityKey) {
    if (!draggedKey || draggedKey === targetKey) return;
    setOrder((current) => {
      const next = current.filter((k) => k !== draggedKey);
      const targetIndex = next.indexOf(targetKey);
      next.splice(targetIndex, 0, draggedKey);
      return next;
    });
  }

  /** Keyboard-friendly alternative to dragging. */
  function move(key: PriorityKey, by: -1 | 1) {
    setOrder((current) => {
      const i = current.indexOf(key);
      const j = i + by;
      if (j < 0 || j >= current.length) return current;
      const next = [...current];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function handleGenerate() {
    const preferences: RecommendationPreferences = {
      hasDeadline,
      deadlineDate: hasDeadline && deadlineDate ? deadlineDate : null,
      maxBudget: maxBudget.trim() === "" ? null : Number(maxBudget),
    };

    startTransition(async () => {
      const result = await generateRecommendation(rfqId, orderToWeights(order), preferences, locale);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(t("ready"));
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button variant={hasExisting ? "outline" : "default"} size="sm" className="gap-2">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {hasExisting ? t("regenerate") : t("get")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-1.5 py-1" aria-label={t("priorities")}>
          {order.map((key, i) => (
            <li
              key={key}
              draggable
              onDragStart={() => setDraggedKey(key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(key)}
              onDragEnd={() => setDraggedKey(null)}
              className={`flex cursor-grab items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 active:cursor-grabbing ${
                draggedKey === key ? "opacity-40" : ""
              }`}
            >
              <GripVertical className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{t(`priority.${key}.label`)}</p>
                <p className="text-xs text-slate-500">{t(`priority.${key}.hint`)}</p>
              </div>
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(key, -1)}
                  disabled={i === 0}
                  aria-label={t("moveUp", { item: t(`priority.${key}.label`) })}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(key, 1)}
                  disabled={i === order.length - 1}
                  aria-label={t("moveDown", { item: t(`priority.${key}.label`) })}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <p id="deadline-q" className="text-sm font-medium">
              {t("deadlineQ")}
            </p>
            <div className="flex gap-1.5" role="group" aria-labelledby="deadline-q">
              <Button
                type="button"
                size="sm"
                variant={hasDeadline ? "default" : "outline"}
                aria-pressed={hasDeadline}
                className="h-7 px-3 text-xs"
                onClick={() => setHasDeadline(true)}
              >
                {t("yes")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!hasDeadline ? "default" : "outline"}
                aria-pressed={!hasDeadline}
                className="h-7 px-3 text-xs"
                onClick={() => setHasDeadline(false)}
              >
                {t("no")}
              </Button>
            </div>
          </div>
          {hasDeadline && <DatePicker value={deadlineDate} onChange={setDeadlineDate} placeholder={t("pickDeadline")} />}

          <div className="space-y-1.5">
            <Label htmlFor="max-budget" className="text-sm">
              {t("maxBudget")}
            </Label>
            <Input
              id="max-budget"
              type="number"
              min="0"
              placeholder={t("noLimit")}
              value={maxBudget}
              onChange={(e) => setMaxBudget(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleGenerate} disabled={isPending} className="gap-2">
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("analyzing")}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                {t("generate")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
