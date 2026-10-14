import { Eye } from "lucide-react";
import { exitDemoToSignup } from "@/app/demo/actions";

/** Sits above the top bar for the shared demo account; every write is refused server-side anyway. */
export function DemoBanner() {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-indigo-100 bg-[#7C6FE0]/[0.08] px-8 py-2.5 text-sm text-indigo-950"
    >
      <p className="flex items-center gap-2">
        <Eye size={15} aria-hidden className="shrink-0 text-[#5B4FC4]" />
        <span>
          <strong className="font-semibold">Demo workspace.</strong> Sample data, read-only — explore freely, nothing is saved.
        </span>
      </p>
      <form action={exitDemoToSignup}>
        <button
          type="submit"
          className="rounded-md px-2 py-1 font-semibold text-[#4B3FB4] underline decoration-[#7C6FE0]/40 underline-offset-4 transition-colors hover:decoration-[#4B3FB4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
        >
          Create your own workspace
        </button>
      </form>
    </div>
  );
}
