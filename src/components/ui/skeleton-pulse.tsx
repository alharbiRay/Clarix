/** Shared building block for route loading.tsx skeletons — a shaped, pulsing placeholder block. */
export function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}
