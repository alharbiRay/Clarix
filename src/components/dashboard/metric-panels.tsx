import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, FileText } from "lucide-react";
import { formatHours, formatMoneyWhole, formatPct } from "@/lib/metrics/format";
import type { Kpis, PendingExtraction, ReviewItem, RfqSavings, SupplierSpend } from "@/lib/metrics";
import { formatDate } from "@/lib/format";

/** One bordered strip, hairline-divided — the operational vitals at a glance. */
export function OpsStrip({ kpis }: { kpis: Kpis }) {
  const delta = kpis.rfqsCreatedThisMonth - kpis.rfqsCreatedLastMonth;
  const cells = [
    {
      label: "RFQs created this month",
      value: String(kpis.rfqsCreatedThisMonth),
      context:
        delta === 0
          ? kpis.rfqsCreatedLastMonth === 0
            ? "None last month either"
            : "Same as last month"
          : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs last month`,
    },
    {
      label: "Auto-approval rate",
      value: formatPct(kpis.autoApprovalRate),
      context: "Decisions in the last 90 days",
    },
    {
      label: "Sent → all replied",
      value: formatHours(kpis.avgSentToAllRepliedHours),
      context: "Average per RFQ",
    },
    {
      label: "Supplier response time",
      value: formatHours(kpis.avgSupplierResponseHours),
      context: "Average per quote",
    },
  ];
  return (
    <section aria-label="Operations" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-4">
      {cells.map((c, i) => (
        <div
          key={c.label}
          className={[
            "p-5",
            i % 2 === 1 ? "border-s border-slate-100" : "",
            i >= 2 ? "border-t border-slate-100 lg:border-t-0" : "",
            i === 2 ? "lg:border-s" : "",
          ].join(" ")}
        >
          <p className="text-xs font-medium text-slate-500">{c.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{c.value}</p>
          <p className="mt-1 text-xs text-slate-500">{c.context}</p>
        </div>
      ))}
    </section>
  );
}

function PanelHeader({ id, title, aside }: { id: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 px-6 py-4">
      <h2 id={id} className="text-sm font-semibold text-slate-900">{title}</h2>
      {aside}
    </div>
  );
}

const ROW_LINK =
  "group flex items-start gap-3 px-6 py-4 transition-colors hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7C6FE0]";

export function ReviewQueue({ items, extractions = [] }: { items: ReviewItem[]; extractions?: PendingExtraction[] }) {
  const total = items.length + extractions.length;
  return (
    <section aria-labelledby="review-heading" className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <h2 id="review-heading" className="text-sm font-semibold text-slate-900">
          Needs your review
        </h2>
        {total > 0 && (
          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 tabular">
            {total} waiting
          </span>
        )}
      </div>
      {total === 0 ? (
        <div className="flex flex-1 items-center gap-3 px-6 py-8 text-sm text-slate-600">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-600" aria-hidden />
          Nothing is waiting on you. Every quote is confirmed and every recommendation is decided.
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {extractions.slice(0, 3).map((x) => (
            <li key={x.quoteId}>
              <Link href={`/rfqs/${x.rfqId}/quotes/${x.quoteId}`} className={ROW_LINK}>
                <FileText size={16} className="mt-0.5 shrink-0 text-indigo-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900"><bdi>{x.title}</bdi></p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Confirm the AI-extracted quote from <bdi>{x.supplierLabel}</bdi> so it counts in the comparison
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Received {formatDate(x.submittedAt)}</p>
                </div>
                <ArrowRight size={15} className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 group-hover:text-slate-500 motion-reduce:transition-none" aria-hidden />
              </Link>
            </li>
          ))}
          {items.slice(0, 5).map((item) => (
            <li key={item.rfqId}>
              <Link href={`/rfqs/${item.rfqId}/compare`} className={ROW_LINK}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900"><bdi>{item.title}</bdi></p>
                  <p className="mt-0.5 text-xs text-slate-600 first-letter:uppercase">{item.reason ?? "Approval required"}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.recommendedLabel && (
                      <>
                        AI pick: <bdi>{item.recommendedLabel}</bdi>
                        {item.recommendedTotal !== null && ` · ${formatMoneyWhole(item.recommendedTotal, item.currency)}`}
                        {" · "}
                      </>
                    )}
                    Waiting since {formatDate(item.createdAt)}
                  </p>
                </div>
                <ArrowRight
                  size={15}
                  className="mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 group-hover:text-slate-500 motion-reduce:transition-none"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Magnitude bars in HTML: label, bar, value at the tip. Single hue. */
export function SupplierSpendPanel({ rows, currency }: { rows: SupplierSpend[]; currency: string }) {
  const top = rows.slice(0, 6);
  const max = Math.max(...top.map((r) => r.spend), 1);
  return (
    <section aria-labelledby="spend-heading" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <PanelHeader id="spend-heading" title="Spend by supplier" aside={<span className="text-xs text-slate-500">{currency} · all time</span>} />
      {top.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-600">Spend appears here once purchase orders go out.</p>
      ) : (
        <ul className="space-y-4 px-6 py-5">
          {top.map((r) => (
            <li key={r.supplierKey}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium text-slate-800"><bdi>{r.label}</bdi></span>
                <span className="shrink-0 tabular text-slate-900">{formatMoneyWhole(r.spend, currency)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-[#6D5FD6]"
                    style={{ width: `${Math.max((r.spend / max) * 100, 2)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-end text-xs text-slate-500 tabular">
                  {r.awards} PO{r.awards === 1 ? "" : "s"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TopSavingsTable({ rows }: { rows: RfqSavings[] }) {
  return (
    <section aria-labelledby="top-savings-heading" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 px-6 py-4">
        <h2 id="top-savings-heading" className="text-sm font-semibold text-slate-900">
          Biggest savings
        </h2>
        <span className="text-xs text-slate-500">All time · vs the average of the other quotes</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-600">
          Savings are measured once an awarded RFQ has at least two complete quotes to compare.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-start text-xs text-slate-500">
                <th scope="col" className="px-6 py-3 font-medium">RFQ</th>
                <th scope="col" className="px-3 py-3 font-medium">Awarded to</th>
                <th scope="col" className="px-3 py-3 text-end font-medium">Paid</th>
                <th scope="col" className="px-3 py-3 text-end font-medium">Avg. alternative</th>
                <th scope="col" className="px-6 py-3 text-end font-medium">Saved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.rfqId} className="transition-colors hover:bg-slate-50">
                  <td className="max-w-[240px] px-6 py-3">
                    <Link href={`/rfqs/${r.rfqId}/compare`} className="block truncate font-medium text-slate-900 hover:underline">
                      <bdi>{r.title}</bdi>
                    </Link>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-3 text-slate-600"><bdi>{r.awardedLabel}</bdi></td>
                  <td className="px-3 py-3 text-end text-slate-600">{formatMoneyWhole(r.awardedTotal ?? 0, r.currency)}</td>
                  <td className="px-3 py-3 text-end text-slate-600">{formatMoneyWhole(r.baseline ?? 0, r.currency)}</td>
                  <td className="px-6 py-3 text-end">
                    <span className={r.savings < 0 ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
                      {formatMoneyWhole(r.savings, r.currency)}
                    </span>
                    <span className="ms-1.5 text-xs text-slate-500">{formatPct(r.savingsPct)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
