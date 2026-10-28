import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type ScoreTier = "new" | "excellent" | "good" | "fair" | "weak";

/** Score tiers. Color always travels with the number and a word, never alone. */
export function scoreTier(score: number | null): { key: ScoreTier; className: string } {
  if (score === null) return { key: "new", className: "bg-slate-100 text-slate-600 ring-slate-200" };
  if (score >= 80) return { key: "excellent", className: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
  if (score >= 65) return { key: "good", className: "bg-indigo-50 text-indigo-800 ring-indigo-200" };
  if (score >= 45) return { key: "fair", className: "bg-amber-50 text-amber-800 ring-amber-200" };
  return { key: "weak", className: "bg-red-50 text-red-800 ring-red-200" };
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
  const t = useTranslations("score");
  const tier = scoreTier(score);
  const label = t(`tier.${tier.key}`);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-semibold tabular ring-1 ring-inset",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        tier.className,
        className
      )}
      title={score === null ? t("newTitle") : t("title", { score, label })}
    >
      {/* aria-label isn't announced on a plain span — use real text for screen readers. */}
      <span className="sr-only">{score === null ? t("newSr") : t("sr", { score, label })}</span>
      <span aria-hidden>{score === null ? label : score}</span>
      {showLabel && score !== null && (
        <span aria-hidden className="font-medium opacity-80">
          {label}
        </span>
      )}
    </span>
  );
}
