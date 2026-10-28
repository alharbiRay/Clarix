import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadMetricsRfqs } from "@/lib/metrics/load";
import { formatMoneyWhole, formatMonthLabel, formatPct } from "@/lib/metrics/format";
import { buildReport, parseReportFilters, type Report } from "@/lib/reports";
import { CSV_SECTIONS } from "@/lib/reports/csv";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale, type Locale } from "@/i18n/config";
import { MonthlyBars } from "@/components/reports/monthly-bars";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";



function formatDay(day: string, locale: Locale) {
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${formatMonthLabel(`${y}-${String(m).padStart(2, "0")}`, false, locale)} ${y}`;
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

    const t = await getTranslations("reports");
  const rawLocale = await getLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const now = new Date();
  const filters = parseReportFilters(searchParams, now);
  const report = buildReport(await loadMetricsRfqs(supabase, user.id), filters, now);
  const c = report.currency;
  const supplierName = report.filters.supplier
    ? (report.supplierOptions.find((o) => o.key === report.filters.supplier)?.label ?? t("selectedSupplier"))
    : null;
  const empty = report.totals.awards === 0 && report.autoApproval.decided === 0 && report.suppliers.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 print:max-w-none print:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("range", { from: formatDay(report.filters.from, locale), to: formatDay(report.filters.to, locale) })}
            {supplierName && (
              <>
                {" · "}
                <bdi>{supplierName}</bdi>
              </>
            )}
            {" · "}
            {t("amountsIn", { currency: c })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <PrintButton />
        </div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 print:hidden" aria-label={t("filters")}>
        <div>
          <label htmlFor="from" className="text-xs font-medium text-slate-600">
            {t("from")}
          </label>
          <input id="from" name="from" type="date" defaultValue={report.filters.from} className="mt-1 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]" />
        </div>
        <div>
          <label htmlFor="to" className="text-xs font-medium text-slate-600">
            {t("to")}
          </label>
          <input id="to" name="to" type="date" defaultValue={report.filters.to} className="mt-1 block h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]" />
        </div>
        <div className="min-w-[12rem]">
          <label htmlFor="supplier" className="text-xs font-medium text-slate-600">
            {t("supplier")}
          </label>
          <select id="supplier" name="supplier" defaultValue={report.filters.supplier ?? ""} className="mt-1 block h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]">
            <option value="">{t("allSuppliers")}</option>
            {report.supplierOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-9 rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2">
          {t("apply")}
        </button>
        <Link href="/reports" className="h-9 px-1 text-sm leading-9 text-slate-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]">
          {t("reset")}
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
              {t(`csv.${s}`)}
            </a>
          ))}
        </div>
      </form>

      {empty ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {supplierName
              ? t("emptySupplier")
              : t("empty")}
          </CardContent>
        </Card>
      ) : (
        <>
          <dl className="grid grid-cols-2 divide-slate-100 rounded-xl border border-slate-200 bg-white sm:grid-cols-4 sm:divide-x print:grid-cols-4">
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">{t("spendExVat")}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{formatMoneyWhole(report.totals.spend, c)}</dd>
              <dd className="text-xs text-slate-500">
                {t("pos", { count: report.totals.awards })}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">{t("savings")}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{formatMoneyWhole(report.totals.savings, c)}</dd>
              <dd className="text-xs text-slate-500">
                {report.totals.savingsPct === null
                  ? t("noCompeting")
                  : report.totals.savingsPct < 0
                    ? t("aboveAvg", { pct: formatPct(-report.totals.savingsPct) })
                    : t("belowAvg", { pct: formatPct(report.totals.savingsPct) })}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">{t("autoRate")}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{formatPct(report.autoApproval.rate)}</dd>
              <dd className="text-xs text-slate-500">
                {t("decisions", { auto: report.autoApproval.automatic, count: report.autoApproval.decided })}
              </dd>
            </div>
            <div className="p-4">
              <dt className="text-xs font-medium text-slate-500">{t("suppliers")}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{report.suppliers.length}</dd>
              <dd className="text-xs text-slate-500">{t("suppliersHint")}</dd>
            </div>
          </dl>

          {(report.excludedOtherCurrency > 0 || report.totals.unmeasurable > 0) && (
            <p className="text-xs text-slate-500">
              {report.excludedOtherCurrency > 0 &&
                `${t("excluded", { count: report.excludedOtherCurrency })} `}
              {report.totals.unmeasurable > 0 &&
                t("unmeasurable", { count: report.totals.unmeasurable })}
            </p>
          )}

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("byMonth")}</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                {t("byMonthHint")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2">
                <MonthlyBars title={t("spend")} currency={c} data={report.months.map((m) => ({ month: m.month, value: m.spend }))} />
                <MonthlyBars title={t("savings")} currency={c} data={report.months.map((m) => ({ month: m.month, value: m.savings }))} />
              </div>
              <div className="relative overflow-x-auto print:overflow-visible">
                <table className="w-full min-w-[420px] print:min-w-0">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>{t("month")}</th>
                      <th scope="col" className={thNum}>{t("spend")}</th>
                      <th scope="col" className={thNum}>{t("savings")}</th>
                      <th scope="col" className={thNum}>{t("posCol")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.months.map((m) => (
                      <tr key={m.month} className="border-b border-slate-50 last:border-0">
                        <th scope="row" className={`${td} text-start font-normal`}>
                          {formatMonthLabel(m.month, true, locale)}
                          {report.partialMonths.includes(m.month) && <span className="ms-1 text-xs text-slate-500">{t("partMonth")}</span>}
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
              <CardTitle className="text-sm font-semibold">{t("supplierComparison")}</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                {t("supplierComparisonHint")}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative overflow-x-auto print:overflow-visible">
              {report.suppliers.length === 0 ? (
                <p className="text-sm text-slate-500">{t("noSupplierActivity")}</p>
              ) : (
                <table className="w-full min-w-[720px] print:min-w-0 print:text-[11px]">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>{t("supplier")}</th>
                      <th scope="col" className={thNum}>{t("quoted")}</th>
                      <th scope="col" className={thNum}>{t("responseRate")}</th>
                      <th scope="col" className={thNum}>{t("won")}</th>
                      <th scope="col" className={thNum}>{t("winRate")}</th>
                      <th scope="col" className={thNum}>{t("posSent")}</th>
                      <th scope="col" className={thNum}>{t("spend")}</th>
                      <th scope="col" className={thNum}>{t("savingsDelivered")}</th>
                      <th scope="col" className={thNum}>{t("priceVsLowest")}</th>
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
                          {t("of", { a: s.quoted, b: s.invited })}
                        </td>
                        <td className={tdNum}>{formatPct(s.responseRate)}</td>
                        <td className={tdNum}>
                          {t("of", { a: s.won, b: s.decided })}
                        </td>
                        <td className={tdNum}>{formatPct(s.winRate)}</td>
                        <td className={tdNum}>{s.posSent}</td>
                        <td className={tdNum}>{formatMoneyWhole(s.spend, c)}</td>
                        <td className={tdNum}>{formatMoneyWhole(s.savings, c)}</td>
                        <td className={tdNum}>{s.avgPriceVsLowest === null ? "—" : s.avgPriceVsLowest === 0 ? t("lowest") : `+${formatPct(s.avgPriceVsLowest)}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">{t("byCategory")}</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                {t("byCategoryHint")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {report.categories.length === 0 ? (
                <p className="text-sm text-slate-500">{t("noPos")}</p>
              ) : (
                <table className="w-full">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>{t("category")}</th>
                      <th scope="col" className={`${thNum} w-1/2`}>{t("share")}</th>
                      <th scope="col" className={thNum}>{t("spend")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categories.map((k) => (
                      <tr key={k.category} className="border-b border-slate-50 last:border-0">
                        <th scope="row" className={`${td} text-start font-normal`}>{t(`categories.${k.category}`)}</th>
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
              <CardTitle className="text-sm font-semibold">{t("posCol")}</CardTitle>
              <CardDescription className="text-xs text-slate-500">{t("newestFirst")}</CardDescription>
            </CardHeader>
            <CardContent className="relative overflow-x-auto print:overflow-visible">
              {report.awards.length === 0 ? (
                <p className="text-sm text-slate-500">{t("noPos")}</p>
              ) : (
                <table className="w-full min-w-[720px] print:min-w-0 print:text-[11px]">
                  <thead className="border-b border-slate-100">
                    <tr>
                      <th scope="col" className={th}>{t("date")}</th>
                      <th scope="col" className={th}>{t("rfq")}</th>
                      <th scope="col" className={th}>{t("supplier")}</th>
                      <th scope="col" className={thNum}>{t("totalExVat")}</th>
                      <th scope="col" className={thNum}>{t("savings")}</th>
                      <th scope="col" className={th}>{t("decision")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.awards.map((a) => (
                      <tr key={a.rfqId} className="border-b border-slate-50 last:border-0 print:break-inside-avoid">
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{formatDay(a.awardedOn, locale)}</td>
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
                        <td className={td}>{a.automatic ? t("automatic") : t("manual")}</td>
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
