import { Check, Minus } from "lucide-react";
import type { Scorecard } from "@/lib/scorecard";
import { formatMonthLabel } from "@/lib/metrics/format";

/** Weighted breakdown: each component's 0-1 score as a bar, with the points it contributes. */
export function ScoreBreakdown({ card }: { card: Scorecard | null }) {
  if (!card) {
    return (
      <p className="text-sm text-slate-600">
        A score appears after this supplier has quoted at least twice — until then there&apos;s too little
        history to judge fairly.
      </p>
    );
  }
  return (
    <ul className="space-y-3.5">
      {card.components.map((c) => (
        <li key={c.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-slate-800">
              {c.label} <span className="font-normal text-slate-400">· weight {c.weight}</span>
            </span>
            <span className="tabular text-slate-600">
              {c.available ? (
                <>
                  <span className="font-semibold text-slate-900">{Math.round(c.points)}</span> pts
                </>
              ) : (
                <span className="text-slate-400">No data yet</span>
              )}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 rounded-full bg-slate-100"
            role="meter"
            aria-label={`${c.label} score`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={c.available ? Math.round(c.score * 100) : undefined}
            aria-valuetext={c.available ? `${Math.round(c.score * 100)} out of 100` : "no data"}
          >
            {c.available && (
              <div className="h-2 rounded-full bg-[#6D5FD6]" style={{ width: `${Math.max(c.score * 100, 2)}%` }} />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Six-month score trend: a quiet line with the current value labelled at the end. */
export function ScoreTrend({ points }: { points: { month: string; score: number | null }[] }) {
  const w = 240;
  const h = 56;
  const pad = 6;
  const known = points.map((p, i) => ({ ...p, i })).filter((p) => p.score !== null) as { month: string; score: number; i: number }[];
  const x = (i: number) => pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1);
  const y = (s: number) => h - pad - (s / 100) * (h - pad * 2);
  const last = known.at(-1);
  const first = known[0];

  return (
    <figure>
      {known.length < 2 ? (
        <p className="text-sm text-slate-500">Not enough months of history to draw a trend yet.</p>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full max-w-[260px]" aria-hidden>
          <line x1={pad} x2={w - pad} y1={y(50)} y2={y(50)} stroke="#EEF0F4" strokeWidth={1} />
          <polyline
            fill="none"
            stroke="#6D5FD6"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={known.map((p) => `${x(p.i)},${y(p.score)}`).join(" ")}
          />
          {last && <circle cx={x(last.i)} cy={y(last.score)} r={4} fill="#6D5FD6" stroke="#fff" strokeWidth={2} />}
        </svg>
      )}
      {known.length >= 2 && first && last && (
        <figcaption className="mt-1 text-xs text-slate-500">
          {formatMonthLabel(first.month)} {first.score} → {formatMonthLabel(last.month)}{" "}
          <span className="font-semibold text-slate-900">{last.score}</span>
        </figcaption>
      )}
      <table className="sr-only">
        <caption>Score at the end of each month</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.month}>
              <th scope="row">{formatMonthLabel(p.month, true)}</th>
              <td>{p.score ?? "not scored"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function StrengthsWeaknesses({ strengths, weaknesses }: { strengths: string[]; weaknesses: string[] }) {
  if (strengths.length === 0 && weaknesses.length === 0) {
    return <p className="text-sm text-slate-500">Nothing stands out yet — more quotes will sharpen the picture.</p>;
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div>
        <h3 className="text-xs font-semibold text-slate-500">Strengths</h3>
        <ul className="mt-2 space-y-2">
          {strengths.length === 0 && <li className="text-sm text-slate-400">None yet</li>}
          {strengths.map((s) => (
            <li key={s} className="flex gap-2 text-sm text-slate-700">
              <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold text-slate-500">Watch out for</h3>
        <ul className="mt-2 space-y-2">
          {weaknesses.length === 0 && <li className="text-sm text-slate-400">Nothing so far</li>}
          {weaknesses.map((s) => (
            <li key={s} className="flex gap-2 text-sm text-slate-700">
              <Minus size={15} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
