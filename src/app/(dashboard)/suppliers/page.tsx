import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { computeSupplierStats } from "@/lib/supplier-stats";
import { formatDate } from "@/lib/format";
import { FadeIn } from "@/components/motion";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";
import { InviteToRfqDialog } from "@/components/suppliers/invite-to-rfq-dialog";
import { StarRating } from "@/components/suppliers/star-rating";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Supplier, SupplierStats } from "@/lib/types";

function formatPct(v: number | null) {
  if (v === null) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export default async function SuppliersPage() {
  const supabase = createClient();

  const { data: suppliersData } = await supabase
    .from("suppliers")
    .select("*")
    .order("created_at", { ascending: false });
  const suppliers = (suppliersData ?? []) as Supplier[];

  const statsBySupplierId = new Map<string, SupplierStats>(
    await Promise.all(
      suppliers.map(async (s) => [s.id, await computeSupplierStats(supabase, s.id)] as const)
    )
  );

  const { data: openRfqsData } = await supabase
    .from("rfqs")
    .select("id, title, status")
    .in("status", ["draft", "sent"])
    .order("created_at", { ascending: false });
  const openRfqs = openRfqsData ?? [];

  return (
    <div className="space-y-7">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Performance across every RFQ you&apos;ve sent them.
          </p>
        </div>
        <AddSupplierDialog />
      </FadeIn>

      <FadeIn delay={0.03} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {[
                "Supplier",
                "RFQs",
                "Win rate",
                "Avg response",
                "Price vs. peers",
                "Rating",
                "Last active",
                "",
              ].map((h) => (
                <TableHead key={h} className="px-6 text-xs font-semibold text-slate-500">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-36 text-center">
                  <span className="text-sm text-slate-400">
                    No suppliers yet. They&apos;re saved automatically the first time
                    they quote, or add one manually above.
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier) => {
                const stats = statsBySupplierId.get(supplier.id)!;
                const label = supplier.company_name || supplier.email;
                const priceColor =
                  stats.priceCompetitivenessPct === null
                    ? "text-slate-400"
                    : stats.priceCompetitivenessPct <= 0
                      ? "text-emerald-600"
                      : "text-amber-600";
                return (
                  <TableRow key={supplier.id} className="border-slate-100">
                    <TableCell className="px-6">
                      <Link
                        href={`/suppliers/${supplier.id}`}
                        className="font-semibold hover:underline underline-offset-4"
                      >
                        {label}
                      </Link>
                      <p className="text-xs text-slate-400">{supplier.email}</p>
                    </TableCell>
                    <TableCell className="px-6">{stats.rfqsParticipated}</TableCell>
                    <TableCell className="px-6">
                      {stats.winRate === null
                        ? "—"
                        : `${Math.round(stats.winRate * 100)}% (${stats.timesAwarded}/${stats.rfqsParticipated})`}
                    </TableCell>
                    <TableCell className="px-6">
                      {stats.avgResponseDays === null
                        ? "—"
                        : `${stats.avgResponseDays.toFixed(1)}d`}
                    </TableCell>
                    <TableCell className={`px-6 font-medium ${priceColor}`}>
                      {formatPct(stats.priceCompetitivenessPct)}
                    </TableCell>
                    <TableCell className="px-6">
                      <StarRating rating={stats.rating} />
                    </TableCell>
                    <TableCell className="px-6 text-slate-500">
                      {formatDate(stats.lastActive)}
                    </TableCell>
                    <TableCell className="px-6 text-right">
                      <InviteToRfqDialog
                        supplierId={supplier.id}
                        supplierLabel={label}
                        rfqs={openRfqs}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </FadeIn>
    </div>
  );
}
