import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { DemoEntry } from "@/components/demo/demo-entry";

export const metadata: Metadata = {
  title: "Live demo — Clarix",
  description:
    "Walk through six months of RFQs, supplier quotes, AI recommendations and auto-approved purchase orders. No signup.",
};

const TOUR = [
  {
    title: "25 RFQs, in Arabic and English",
    body: "Construction supplies, office equipment, packaging and spare parts — drafts, open requests, and decisions already made.",
  },
  {
    title: "Seven suppliers with real habits",
    body: "The fast, cheap one. The reliable one that always quotes a long warranty. The one that never quotes a warranty at all.",
  },
  {
    title: "Decisions with reasons",
    body: "Purchase orders that went out automatically, and the ones Clarix held back for a human — with the AI's reasoning in numbers.",
  },
];

export default function DemoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md">
        <Link href="/login" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-slate-900">Clarix</span>
        </Link>

        <h1 className="mt-10 text-balance text-3xl font-bold tracking-tight text-slate-900">
          Walk through six months of procurement at Al&nbsp;Waha Contracting.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          A complete sample workspace: every quote compared, every purchase order
          explained. Click anything — nothing you do here is saved.
        </p>

        <ol className="mt-8 space-y-5 border-l border-slate-200 pl-5">
          {TOUR.map((stop) => (
            <li key={stop.title} className="relative">
              <span
                aria-hidden
                className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-[#7C6FE0] ring-4 ring-slate-50"
              />
              <p className="text-sm font-semibold text-slate-900">{stop.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{stop.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <DemoEntry prominent />
          <p className="mt-4 text-center text-sm text-slate-500">
            Ready for your own?{" "}
            <Link
              href="/login?tab=signup"
              className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
            >
              Create a free account
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
