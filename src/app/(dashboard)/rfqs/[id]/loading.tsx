function Pulse({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-100 ${className}`} />;
}

export default function RfqDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Pulse className="h-3 w-16" />
          <Pulse className="h-7 w-64" />
          <Pulse className="h-4 w-48" />
        </div>
        <Pulse className="h-9 w-32" />
      </div>
      <Pulse className="h-48" />
      <Pulse className="h-40" />
      <Pulse className="h-56" />
    </div>
  );
}
