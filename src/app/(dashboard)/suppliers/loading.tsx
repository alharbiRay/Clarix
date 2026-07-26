import { Pulse } from "@/components/ui/skeleton-pulse";

export default function SuppliersLoading() {
  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Pulse className="h-7 w-32" />
          <Pulse className="h-4 w-64" />
        </div>
        <Pulse className="h-9 w-36" />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <Pulse key={i} className="my-1 h-12" />
        ))}
      </div>
    </div>
  );
}
