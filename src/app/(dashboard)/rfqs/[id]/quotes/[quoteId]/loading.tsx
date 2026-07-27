import { Pulse } from "@/components/ui/skeleton-pulse";

export default function QuoteReviewLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Pulse className="h-3 w-16" />
        <Pulse className="h-7 w-64" />
        <Pulse className="h-4 w-48" />
      </div>
      <Pulse className="h-64" />
      <Pulse className="h-40" />
    </div>
  );
}
