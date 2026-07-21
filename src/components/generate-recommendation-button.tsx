"use client";

import { useState, useTransition } from "react";
import { GripVertical, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";

type PriorityKey = keyof RecommendationWeights;

const PRIORITY_LABELS: Record<PriorityKey, { label: string; hint: string }> = {
  price: { label: "Price", hint: "Lowest total cost" },
  delivery: { label: "Delivery speed", hint: "Shortest lead time" },
  warranty: { label: "Warranty", hint: "Longest / best coverage" },
  paymentTerms: { label: "Payment terms", hint: "Most favorable terms" },
};

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

  function handleGenerate() {
    const preferences: RecommendationPreferences = {
      hasDeadline,
      deadlineDate: hasDeadline && deadlineDate ? deadlineDate : null,
      maxBudget: maxBudget.trim() === "" ? null : Number(maxBudget),
    };

    startTransition(async () => {
      const result = await generateRecommendation(rfqId, orderToWeights(order), preferences);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Recommendation ready.");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button
          variant={hasExisting ? "outline" : "default"}
          size="sm"
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {hasExisting ? "Regenerate recommendation" : "Get AI recommendation"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>What matters most to you?</DialogTitle>
          <DialogDescription>
            Drag to rank your priorities, top = most important. The AI will
            lean toward suppliers that score well on what you rank highest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 py-1">
          {order.map((key, i) => (
            <div
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
              <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">
                  {PRIORITY_LABELS[key].label}
                </p>
                <p className="text-xs text-slate-400">{PRIORITY_LABELS[key].hint}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Do you have a delivery deadline?</Label>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={hasDeadline ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => setHasDeadline(true)}
              >
                Yes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!hasDeadline ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => setHasDeadline(false)}
              >
                No
              </Button>
            </div>
          </div>
          {hasDeadline && (
            <Input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="max-budget" className="text-sm">
              Maximum budget (optional)
            </Label>
            <Input
              id="max-budget"
              type="number"
              min="0"
              placeholder="No limit"
              value={maxBudget}
              onChange={(e) => setMaxBudget(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleGenerate} disabled={isPending} className="gap-2">
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing quotes…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate recommendation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
