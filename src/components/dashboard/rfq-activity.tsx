"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock, Sparkles, PackageCheck, PenLine } from "lucide-react";
import { FadeIn } from "@/components/motion";

export interface ActivityRow {
  id: string;
  code: string;
  title: string;
  project: string | null;
  /** ready = all invited suppliers replied; waiting = sent, replies pending */
  status: "draft" | "ready" | "waiting" | "closed";
  daysLeft: number | null;
  repliedCount: number;
  supplierCount: number;
}

const STATUS_STYLES: Record<
  ActivityRow["status"],
  { label: string; bg: string; text: string; dot: string }
> = {
  ready: {
    label: "Ready to compare",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  waiting: {
    label: "Awaiting quotes",
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  draft: {
    label: "Draft",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
  closed: {
    label: "Closed",
    bg: "bg-slate-100",
    text: "text-slate-600",
    dot: "bg-slate-400",
  },
};

const TABS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Ready" },
  { id: "waiting", label: "Waiting" },
] as const;

export function RfqActivity({ rows }: { rows: ActivityRow[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");

  const filtered = tab === "all" ? rows : rows.filter((r) => r.status === tab);

  return (
    <FadeIn
      delay={0.12}
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <h3 className="text-sm font-semibold">Active RFQs</h3>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate-400">
            {rows.length === 0 ? (
              <>
                No RFQs yet.{" "}
                <Link
                  href="/rfqs/new"
                  className="font-semibold text-slate-900 underline-offset-4 hover:underline"
                >
                  Create your first RFQ
                </Link>{" "}
                to start collecting quotes.
              </>
            ) : (
              "Nothing in this view."
            )}
          </div>
        ) : (
          filtered.map((rfq) => {
            const st = STATUS_STYLES[rfq.status];
            const pct =
              rfq.supplierCount > 0
                ? (rfq.repliedCount / rfq.supplierCount) * 100
                : 0;

            return (
              <div
                key={rfq.id}
                className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center"
              >
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-medium text-slate-400">
                      {rfq.code}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${st.bg} ${st.text}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </span>
                  </div>
                  <Link
                    href={`/rfqs/${rfq.id}`}
                    className="mt-1 block truncate font-semibold hover:underline underline-offset-4"
                  >
                    {rfq.title}
                  </Link>
                  <p className="text-xs text-slate-400">
                    {rfq.project || "No project"}
                  </p>
                </div>

                {/* Supplier progress */}
                <div className="w-full lg:w-48">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-slate-500">
                      {rfq.repliedCount}/{rfq.supplierCount} suppliers replied
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        pct === 100 ? "bg-emerald-500" : "bg-indigo-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Deadline */}
                <div className="flex items-center gap-1.5 text-xs text-slate-500 lg:w-32">
                  {rfq.daysLeft === null ? (
                    <span className="text-slate-400">No deadline</span>
                  ) : (
                    <>
                      <Clock
                        size={13}
                        className={
                          rfq.daysLeft <= 8 ? "text-red-500" : "text-slate-400"
                        }
                      />
                      <span
                        className={
                          rfq.daysLeft <= 8 ? "font-semibold text-red-500" : ""
                        }
                      >
                        {rfq.daysLeft < 0
                          ? "Overdue"
                          : `${rfq.daysLeft} days left`}
                      </span>
                    </>
                  )}
                </div>

                {/* Action */}
                {rfq.status === "ready" ? (
                  <Link
                    href={`/rfqs/${rfq.id}`}
                    className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 lg:w-44"
                  >
                    <Sparkles size={14} /> Compare quotes
                  </Link>
                ) : rfq.status === "draft" ? (
                  <Link
                    href={`/rfqs/${rfq.id}`}
                    className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 lg:w-44"
                  >
                    <PenLine size={14} /> Finish draft
                  </Link>
                ) : (
                  <span className="flex cursor-default items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400 lg:w-44">
                    <PackageCheck size={14} /> Awaiting quotes
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </FadeIn>
  );
}
