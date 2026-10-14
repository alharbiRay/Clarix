import { cn } from "@/lib/utils";

/** Score tiers. Color always travels with the number and a word, never alone. */
export function scoreTier(score: number | null) {
  if (score === null) return { label: "New", className: "bg-slate-100 text-slate-600 ring-slate-200" };
  if (score >= 80) return { label: "Excellent", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
  if (score >= 65) return { label: "Good", className: "bg-indigo-50 text-indigo-800 ring-indigo-200" };
  if (score >= 45) return { label: "Fair", className: "bg-amber-50 text-amber-800 ring-amber-200" };
  return { label: "Weak", className: "bg-red-50 text-red-800 ring-red-200" };
}

export function ScoreBadge({
  score,
  size = "md",
  showLabel = false,
  className,
}: {
  score: number | null;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}) {
  const tier = scoreTier(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-semibold tabular ring-1 ring-inset",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        tier.className,
        className
      )}
      title={score === null ? "Not enough history to score yet" : `Score ${score}/100 · ${tier.label}`}
    >
      {/* aria-label isn't announced on a plain span — use real text for screen readers. */}
      <span className="sr-only">
        {score === null ? "Supplier score: new, not enough history yet" : `Supplier score ${score} out of 100, ${tier.label}`}
      </span>
      <span aria-hidden>{score === null ? "New" : score}</span>
      {showLabel && score !== null && (
        <span aria-hidden className="font-medium opacity-80">
          {tier.label}
        </span>
      )}
    </span>
  );
}
