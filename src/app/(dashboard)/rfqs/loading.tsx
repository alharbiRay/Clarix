function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export default function RfqsLoading() {
  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-7 w-24" />
          <Pulse className="h-4 w-56" />
        </div>
        <Pulse className="h-9 w-28" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <Pulse key={i} className="my-1 h-11" />
        ))}
      </div>
    </div>
  );
}
