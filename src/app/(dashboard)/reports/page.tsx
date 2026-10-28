import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadMetricsRfqs } from "@/lib/metrics/load";
import { formatMoneyWhole, formatMonthLabel, formatPct } from "@/lib/metrics/format";
import { buildReport, parseReportFilters, type Report } from "@/lib/reports";
import { CSV_SECTIONS } from "@/lib/reports/csv";
import { MonthlyBars } from "@/components/reports/monthly-bars";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const CSV_LABELS: Record<(typeof CSV_SECTIONS)[number], string> = {
  awards: "Purchase orders",
  monthly: "Monthly",
  suppliers: "Suppliers",
  categories: "Categories",
};

function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${formatMonthLabel(`${y}-${String(m).padStart(2, "0")}`)} ${y}`;
}

function qs(report: Report, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ from: report.filters.from, to: report.filters.to, ...extra });
  if (report.filters.supplier) p.set("supplier", report.filters.supplier);
  return p.toString();
}

const th = "px-3 py-2 text-start text-xs font-semibold text-slate-500";
const thNum = "px-3 py-2 text-end text-xs font-semibold text-slate-500";
const td = "px-3 py-2 text-sm text-slate-800";
const tdNum = "px-3 py-2 text-end text-sm tabular-nums text-slate-800";

export default async function ReportsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = new Date();
  const filters = parseReportFilters(searchParams, now);
  const report = buildReport(await loadMetricsRfqs(supabase, user.id), filters, now);
  const c = report.currency;
  const supplierName = report.filters.supplier
    ? (report.supplierOptions.find((o) => o.key === report.filters.supplier)?.label ?? "Selected supplier")
    : null;
  const empty = report.totals.awards === 0 && report.autoApproval.decided === 0 && report.suppliers.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 print:max-w-none print:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatDay(report.filters.from)} to {formatDay(report.filters.to)}
            {supplierName && (
              <>
                {" · "}
                <bdi>{supplierName}</bdi>
              </>
            )}
            {" · "}amounts in {c}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <PrintButton />
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden" aria-label="Report filters">
        <div>
          <label htmlFor="from" className="text-xs font-medium text-slate-600">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={report.filters.from} className="mt-1 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]" />
        </div>
        <div>
          <label htmlFor="to" className="text-xs font-medium text-slate-600">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={report.filters.to} className="mt-1 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]" />
        </div>
        <div className="min-w-[12rem]">
          <label htmlFor="supplier" className="text-xs font-medium text-slate-600">
            Supplier
          </label>
          <select id="supplier" name="supplier" defaultValue={report.filters.supplier ?? ""} className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]">
            <option value="">All suppliers</option>
            {report.supplierOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2">
          Apply
        </button>
        <Link href="/reports" className="h-9 px-1 text-sm leading-9 text-slate-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]">
          Reset
        </Link>
        <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Download size={13} aria-hidden="true" />
            CSV
          </span>
          {CSV_SECTIONS.map((s) => (
            <a
              key={s}
              href={`/api/reports/csv?${qs(report, { section: s })}`}
              className="text-[#5B4FC4] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
            >
              {CSV_LABELS[s]}
            </a>
          ))}
        </div>
      </form>

      {empty ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {supplierName
              ? "Nothing to report for this supplier in this period. Try a wider date range or all suppliers."
              : "Nothing to report for this period yet. Try a wider date range, or come back once purchase orders have gone out."}
          </CardContent>
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-2 divide-slate-100 rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x print:grid-cols-4">
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">Spend</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{formatMoneyWhole(report.totals.spend, c)}</dd>
              <dd className="text-xs text-slate-500">
                {report.totals.awards} purchase order{report.totals.awards === 1 ? "" : "s"}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">Savings</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{formatMoneyWhole(report.totals.savings, c)}</dd>
              <dd className="text-xs text-slate-500">
                {report.totals.savingsPct === null
                  ? "No competing quotes to compare"
                  : report.totals.savingsPct < 0
                    ? `${formatPct(-report.totals.savingsPct)} above the average other quote`
                    : `${formatPct(report.totals.savingsPct)} below the average other quote`}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">Auto-approval rate</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{formatPct(report.autoApproval.rate)}</dd>
              <dd className="text-xs text-slate-500">
                {report.autoApproval.automatic} of {report.autoApproval.decided} decision{report.autoApproval.decided === 1 ? "" : "s"}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">Suppliers</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{report.suppliers.length}</dd>
              <dd className="text-xs text-slate-500">invited or sent a PO in this period</dd>
            </div>
          </dl>

          {(report.excludedOtherCurrency > 0 || report.totals.unmeasurable > 0) && (
            <p className="text-xs text-slate-500">
              {report.excludedOtherCurrency > 0 &&
                `${report.excludedOtherCurrency} purchase order${report.excludedOtherCurrency === 1 ? " is" : "s are"} in another currency and left out of the amounts. `}
              {report.totals.unmeasurable > 0 &&
                `${report.totals.unmeasurable} purchase order${report.totals.unmeasurable === 1 ? " has" : "s have"} unpriced lines, so ${report.totals.unmeasurable === 1 ? "its" : "their"} savings can't be measured.`}
            </p>
          )}

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">By month</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                By the month the purchase order went out. Savings compare the chosen quote with the average of the other complete quotes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
                <MonthlyBars title="Spend" currency={c} data={report.months.map((m) => ({ month: m.month, value: m.spend }))} />
                <MonthlyBars title="Savings" currency={c} data={report.months.map((m) => ({ month: m.month, value: m.savings }))} />
              </div>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full min-w-[420px] print:min-w-0">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>Month</th>
                      <th scope="col" className={thNum}>Spend</th>
                      <th scope="col" className={thNum}>Savings</th>
                      <th scope="col" className={thNum}>Purchase orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.months.map((m) => (
                      <tr key={m.month} className="border-b border-slate-50 last:border-0">
                        <th scope="row" className={`${td} text-start font-normal`}>
                          {formatMonthLabel(m.month, true)}
                          {report.partialMonths.includes(m.month) && <span className="ms-1 text-xs text-slate-500">(part of month)</span>}
                        </th>
                        <td className={tdNum}>{formatMoneyWhole(m.spend, c)}</td>
                        <td className={tdNum}>{formatMoneyWhole(m.savings, c)}</td>
                        <td className={tdNum}>{m.awarded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Supplier comparison</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Quotes, wins and win rate: RFQs created in this period. POs sent, spend and savings: purchase orders sent in it.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto print:overflow-visible">
              {report.suppliers.length === 0 ? (
                <p className="text-sm text-slate-500">No supplier activity in this period.</p>
              ) : (
                <table className="w-full min-w-[720px] print:min-w-0 print:text-[11px]">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>Supplier</th>
                      <th scope="col" className={thNum}>Quoted</th>
                      <th scope="col" className={thNum}>Response rate</th>
                      <th scope="col" className={thNum}>Won</th>
                      <th scope="col" className={thNum}>Win rate</th>
                      <th scope="col" className={thNum}>POs sent</th>
                      <th scope="col" className={thNum}>Spend</th>
                      <th scope="col" className={thNum}>Savings delivered</th>
                      <th scope="col" className={thNum}>Price vs lowest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.suppliers.map((s) => (
                      <tr key={s.key} className="border-b border-slate-50 last:border-0">
                        <th scope="row" className={`${td} text-start font-medium`}>
                          <Link href={`/suppliers/${s.key}`} className="hover:underline print:no-underline">
                            <bdi>{s.label}</bdi>
                          </Link>
                        </th>
                        <td className={tdNum}>
                          {s.quoted} of {s.invited}
                        </td>
                        <td className={tdNum}>{formatPct(s.responseRate)}</td>
                        <td className={tdNum}>
                          {s.won} of {s.decided}
                        </td>
                        <td className={tdNum}>{formatPct(s.winRate)}</td>
                        <td className={tdNum}>{s.posSent}</td>
                        <td className={tdNum}>{formatMoneyWhole(s.spend, c)}</td>
                        <td className={tdNum}>{formatMoneyWhole(s.savings, c)}</td>
                        <td className={tdNum}>{s.avgPriceVsLowest === null ? "—" : s.avgPriceVsLowest === 0 ? "Lowest" : `+${formatPct(s.avgPriceVsLowest)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Spend by category</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Each line item is grouped by what it is (from its name, in Arabic or English).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.categories.length === 0 ? (
                <p className="text-sm text-slate-500">No purchase orders in this period.</p>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>Category</th>
                      <th scope="col" className={`${thNum} w-1/2`}>Share</th>
                      <th scope="col" className={thNum}>Spend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((k) => (
                      <tr key={k.category} className="border-b border-slate-50 last:border-0">
                        <th scope="row" className={`${td} text-start font-normal`}>{k.label}</th>
                        <td className={tdNum}>
                          {/* The bar is decoration for the percentage next to it. */}
                          <div className="flex items-center justify-end gap-3">
                            <div className="h-2 flex-1 rounded-full bg-slate-100 print:border print:border-slate-300" aria-hidden="true">
                              <div className="h-2 rounded-full bg-[#6D5FD6] print:[print-color-adjust:exact]" style={{ width: `${Math.max(1, Math.round(k.share * 100))}%` }} />
                            </div>
                            <span className="w-10 shrink-0">{formatPct(k.share)}</span>
                          </div>
                        </td>
                        <td className={tdNum}>{formatMoneyWhole(k.spend, c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Purchase orders</CardTitle>
              <CardDescription className="text-xs text-slate-500">Newest first.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto print:overflow-visible">
              {report.awards.length === 0 ? (
                <p className="text-sm text-slate-500">No purchase orders in this period.</p>
              ) : (
                <table className="w-full min-w-[720px] print:min-w-0 print:text-[11px]">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>Date</th>
                      <th scope="col" className={th}>RFQ</th>
                      <th scope="col" className={th}>Supplier</th>
                      <th scope="col" className={thNum}>Total</th>
                      <th scope="col" className={thNum}>Savings</th>
                      <th scope="col" className={th}>Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.awards.map((a) => (
                      <tr key={a.rfqId} className="border-b border-slate-50 last:border-0 print:break-inside-avoid">
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{formatDay(a.awardedOn)}</td>
                        <th scope="row" className={`${td} text-start font-medium`}>
                          <Link href={`/rfqs/${a.rfqId}`} className="hover:underline print:no-underline">
                            <bdi>{a.title}</bdi>
                          </Link>
                        </th>
                        <td className={td}>
                          <bdi>{a.supplier}</bdi>
                        </td>
                        <td className={tdNum}>{a.total === null ? "—" : formatMoneyWhole(a.total, c)}</td>
                        <td className={tdNum}>{a.basis === "average_of_other_quotes" ? formatMoneyWhole(a.savings, c) : "—"}</td>
                        <td className={td}>{a.automatic ? "Automatic" : "Manual"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
