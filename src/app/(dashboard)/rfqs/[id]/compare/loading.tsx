function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export default function CompareLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Pulse className="h-3 w-16" />
          <Pulse className="h-7 w-52" />
          <Pulse className="h-4 w-40" />
        </div>
        <Pulse className="h-9 w-40" />
      </div>
      <Pulse className="h-80" />
    </div>
  );
}
