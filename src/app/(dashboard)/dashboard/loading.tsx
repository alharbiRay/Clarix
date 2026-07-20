function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Pulse className="h-7 w-40" />
        <Pulse className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-28" />
        ))}
      </div>
      <Pulse className="h-72" />
      <Pulse className="h-64" />
    </div>
  );
}
