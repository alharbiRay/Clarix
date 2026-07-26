import { Pulse } from "@/components/ui/skeleton-pulse";

export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Pulse className="h-7 w-32" />
        <Pulse className="h-4 w-64" />
      </div>
      <Pulse className="h-40" />
    </div>
  );
}
