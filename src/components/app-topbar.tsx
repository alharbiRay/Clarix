"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Bell, Plus } from "lucide-react";

export function AppTopbar() {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/80 px-8 py-4 backdrop-blur">
      <form
        className="relative w-80"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          router.push(q ? `/rfqs?q=${encodeURIComponent(String(q))}` : "/rfqs");
        }}
      >
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          name="q"
          placeholder="Search RFQs, suppliers..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none transition-colors focus:border-slate-400 focus:bg-white"
        />
      </form>
      <div className="flex items-center gap-3">
        <button
          className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title="Notifications"
        >
          <Bell size={18} />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <Link
          href="/rfqs/new"
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
        >
          <Plus size={16} /> New RFQ
        </Link>
      </div>
    </header>
  );
}
