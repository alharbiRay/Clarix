import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { computeSupplierStats } from "@/lib/supplier-stats";
import { computeQuoteTotal } from "@/lib/quote-comparison";
import { formatDate, formatMoney } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import { StarRating } from "@/components/suppliers/star-rating";
import {
  SupplierPerformanceChart,
  type SupplierMonthPoint,
} from "@/components/suppliers/performance-chart";
import { SupplierNotes } from "@/components/suppliers/supplier-notes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Quote, QuoteItem, RfqItem, Supplier } from "@/lib/types";

interface RfqSupplierRow {
  id: string;
  rfq_id: string;
  rfqs: { id: string; title: string; currency: string; rfq_items: RfqItem[] } | null;
  quotes: (Quote & { quote_items: QuoteItem[] })[];
}

function formatPct(v: number | null) {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export default async function SupplierDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data } = await supabase.from("suppliers").select("*").eq("id", params.id).single();
  if (!data) notFound();
  const supplier = data as Supplier;

  const stats = await computeSupplierStats(supabase, supplier.id);

  const { data: rfqSuppliersData } = await supabase
    .from("rfq_suppliers")
    .select("id, rfq_id, rfqs(id, title, currency, rfq_items(*)), quotes(*, quote_items(*))")
    .eq("supplier_id", supplier.id);

  const rfqSuppliers = (rfqSuppliersData ?? []) as unknown as RfqSupplierRow[];

  const historyRows = rfqSuppliers
    .flatMap((rs) =>
      rs.quotes.map((quote) => ({
        rfq: rs.rfqs,
        quote,
        total: rs.rfqs ? computeQuoteTotal(rs.rfqs.rfq_items, quote).total : null,
      }))
    )
    .sort(
      (a, b) => new Date(b.quote.submitted_at).getTime() - new Date(a.quote.submitted_at).getTime()
    );

  const currency = historyRows[0]?.rfq?.currency ?? "SAR";

  // Last 7 calendar months, same bucketing as the dashboard chart
  const months: SupplierMonthPoint[] = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    const inMonth = historyRows.filter((r) => {
      const t = new Date(r.quote.submitted_at);
      return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
    });
    months.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      quotedTotal: inMonth.reduce((sum, r) => sum + (r.total ?? 0), 0),
      quotes: inMonth.length,
    });
  }

  const label = supplier.company_name || supplier.email;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <FadeIn>
        <Link
          href="/suppliers"
          className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          <ArrowLeft size={13} />
          Suppliers
        </Link>
        <div className="mt-1.5 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight">{label}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} /> {supplier.email}
              </span>
              {supplier.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={13} /> {supplier.phone}
                </span>
              )}
              {supplier.contact_name && <span>Contact: {supplier.contact_name}</span>}
            </div>
          </div>
          <StarRating rating={stats.rating} />
        </div>
      </FadeIn>

      <FadeIn delay={0.03}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "RFQs participated", value: String(stats.rfqsParticipated) },
            {
              label: "Win rate",
              value:
                stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`,
            },
            {
              label: "Avg response",
              value: stats.avgResponseDays === null ? "—" : `${stats.avgResponseDays.toFixed(1)}d`,
            },
            { label: "Price vs. peers", value: formatPct(stats.priceCompetitivenessPct) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="pt-6">
                <p className="text-xs font-medium text-slate-400">{s.label}</p>
                <p className="mt-1 text-xl font-bold tracking-tight">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.05}>
        <SupplierPerformanceChart data={months} currency={currency} />
      </FadeIn>

      <FadeIn delay={0.07}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Quote history ({historyRows.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Every quote this supplier has submitted, across all RFQs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                No quotes yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 hover:bg-slate-50">
                      <TableHead className="text-xs font-semibold text-slate-500">RFQ</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-500">
                        Submitted
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-500">
                        Total
                      </TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-500">
                        Status
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.map(({ rfq, quote, total }) => (
                      <TableRow key={quote.id} className="border-slate-100">
                        <TableCell className="font-medium">
                          {rfq ? (
                            <Link
                              href={`/rfqs/${rfq.id}/compare`}
                              className="hover:underline underline-offset-4"
                            >
                              {rfq.title}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {formatDate(quote.submitted_at)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {total === null || !rfq ? "—" : formatMoney(total, rfq.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-600">
                            {quote.status.replace("_", " ")}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.09}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Notes</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Private — only visible to you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupplierNotes supplierId={supplier.id} initialNotes={supplier.notes} />
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
