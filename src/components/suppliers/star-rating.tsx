import { Star, StarHalf } from "lucide-react";

export function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) {
    return <span className="text-xs text-slate-400">Not yet rated</span>;
  }
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {Array.from({ length: 5 }).map((_, i) => {
          if (i < full) {
            return <Star key={i} size={14} className="fill-amber-400 text-amber-400" />;
          }
          if (i === full && half) {
            return <StarHalf key={i} size={14} className="fill-amber-400 text-amber-400" />;
          }
          return <Star key={i} size={14} className="text-slate-200" />;
        })}
      </div>
      <span className="text-xs font-medium text-slate-500">{rating.toFixed(1)}</span>
    </div>
  );
}
