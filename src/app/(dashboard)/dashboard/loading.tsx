import { Pulse } from "@/components/ui/skeleton-pulse";

/** Mirrors the dashboard layout so nothing jumps when data arrives. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="space-y-2">
        <Pulse className="h-7 w-40" />
        <Pulse className="h-4 w-80" />
      </div>
      <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 lg:grid-cols-[5fr_8fr] lg:p-8">
        <div className="space-y-4">
          <Pulse className="h-4 w-32" />
          <Pulse className="h-12 w-56" />
          <Pulse className="h-5 w-40" />
        </div>
        <Pulse className="h-56" />
      </div>
      <Pulse className="h-28" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Pulse className="h-64" />
        <Pulse className="h-64" />
      </div>
      <Pulse className="h-56" />
    </div>
  );
}
