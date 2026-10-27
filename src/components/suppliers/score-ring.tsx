import { scoreTier } from "@/components/suppliers/score-badge";

const RING_COLORS: Record<string, string> = {
  Excellent: "#059669",
  Good: "#6D5FD6",
  Fair: "#D97706",
  Weak: "#DC2626",
  New: "#CBD5E1",
};

/** Circular 0-100 gauge for the supplier detail page. */
export function ScoreRing({ score, size = 120 }: { score: number | null; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tier = scoreTier(score);
  const filled = score === null ? 0 : (score / 100) * c;
  return (
    <div className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF0F4" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={RING_COLORS[tier.label]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        <span className="text-3xl font-semibold leading-none tracking-tight text-slate-900">{score ?? "—"}</span>
        <span className="mt-1 text-xs font-medium text-slate-500">{tier.label}</span>
      </div>
      <span className="sr-only">
        {score === null ? "Not enough history to score this supplier yet." : `Supplier score ${score} out of 100, rated ${tier.label}.`}
      </span>
    </div>
  );
}
