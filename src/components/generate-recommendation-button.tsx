"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateRecommendation } from "@/app/(dashboard)/rfqs/quote-actions";
import {
  DEFAULT_RECOMMENDATION_WEIGHTS,
  type RecommendationWeights,
} from "@/lib/gemini";
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
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const PRIORITIES: {
  key: keyof RecommendationWeights;
  label: string;
  hint: string;
}[] = [
  { key: "price", label: "Price", hint: "Lowest total cost" },
  { key: "delivery", label: "Delivery speed", hint: "Shortest lead time" },
  { key: "warranty", label: "Warranty", hint: "Longest / best coverage" },
  { key: "paymentTerms", label: "Payment terms", hint: "Most favorable terms" },
];

function weightLabel(v: number) {
  if (v === 0) return "Not important";
  if (v < 30) return "Low";
  if (v < 70) return "Medium";
  return "High";
}

export function GenerateRecommendationButton({
  rfqId,
  hasExisting,
}: {
  rfqId: string;
  hasExisting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [weights, setWeights] = useState<RecommendationWeights>(
    DEFAULT_RECOMMENDATION_WEIGHTS
  );
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateRecommendation(rfqId, weights);
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
            Set how much each factor should weigh in the recommendation. The
            AI will lean toward suppliers that score well on what you rate
            highest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {PRIORITIES.map((p) => (
            <div key={p.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor={`weight-${p.key}`} className="text-sm">
                  {p.label}
                </Label>
                <span className="text-xs font-medium text-slate-500">
                  {weightLabel(weights[p.key])}
                </span>
              </div>
              <Slider
                id={`weight-${p.key}`}
                value={weights[p.key]}
                onValueChange={(v) =>
                  setWeights((w) => ({ ...w, [p.key]: v }))
                }
              />
              <p className="text-xs text-slate-400">{p.hint}</p>
            </div>
          ))}
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
