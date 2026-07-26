import { Pulse } from "@/components/ui/skeleton-pulse";

export default function SupplierDetailLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <Pulse className="h-3 w-20" />
        <div className="mt-1.5 flex items-start justify-between gap-4">
          <div className="space-y-2">
            <Pulse className="h-7 w-64" />
            <Pulse className="h-4 w-56" />
          </div>
          <Pulse className="h-5 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Pulse key={i} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Pulse className="h-56 lg:col-span-2" />
        <Pulse className="h-56" />
      </div>
      <Pulse className="h-64" />
      <Pulse className="h-32" />
    </div>
  );
}
