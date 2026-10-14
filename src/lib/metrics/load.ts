import type { SupabaseClient } from "@supabase/supabase-js";
import type { AwardDecision, InviteStatus, MetricsRfq, QuoteStatusValue } from "@/lib/metrics";

/** Rows per request — at or below PostgREST's max-rows so paging is exact. */
export const METRICS_PAGE_SIZE = 1000;

/** Columns the metrics need — nothing more (no notes, PDFs or extraction payloads). */
export const METRICS_SELECT =
  "id, title, currency, created_at, " +
  "rfq_items(id, name, quantity), " +
  "rfq_suppliers(id, company_name, email, supplier_id, status, invited_at), " +
  "quotes(id, supplier_id, status, submitted_at, quote_items(rfq_item_id, total_price)), " +
  "rfq_awards(decision, recommended_quote_id, po_sent_at, created_at, reason)";

interface AwardRow {
  decision: AwardDecision;
  recommended_quote_id: string | null;
  po_sent_at: string | null;
  created_at: string;
  reason: string | null;
}

export interface MetricsRow {
  id: string;
  title: string;
  currency: string;
  created_at: string;
  rfq_items: { id: string; name: string; quantity: number | string }[];
  rfq_suppliers: {
    id: string;
    company_name: string | null;
    email: string;
    supplier_id: string | null;
    status: string;
    invited_at: string | null;
  }[];
  quotes: {
    id: string;
    supplier_id: string;
    status: string;
    submitted_at: string;
    quote_items: { rfq_item_id: string; total_price: number | string | null }[];
  }[];
  rfq_awards: AwardRow | AwardRow[] | null;
}

export function toMetricsRfq(row: MetricsRow): MetricsRfq {
  // rfq_awards is keyed by rfq_id (1:1); PostgREST may embed it as an object or an array.
  const award = Array.isArray(row.rfq_awards) ? (row.rfq_awards[0] ?? null) : row.rfq_awards;
  return {
    id: row.id,
    title: row.title,
    currency: row.currency,
    created_at: row.created_at,
    items: row.rfq_items.map((i) => ({ id: i.id, name: i.name, quantity: Number(i.quantity) })),
    invites: row.rfq_suppliers.map((s) => ({
      id: s.id,
      label: s.company_name || s.email,
      supplier_id: s.supplier_id,
      status: s.status as InviteStatus,
      invited_at: s.invited_at,
    })),
    quotes: row.quotes.map((q) => ({
      id: q.id,
      invite_id: q.supplier_id,
      status: q.status as QuoteStatusValue,
      submitted_at: q.submitted_at,
      lines: q.quote_items.map((qi) => ({
        item_id: qi.rfq_item_id,
        total: qi.total_price === null ? null : Number(qi.total_price),
      })),
    })),
    award: award
      ? {
          decision: award.decision,
          quote_id: award.recommended_quote_id,
          po_sent_at: award.po_sent_at,
          created_at: award.created_at,
          reason: award.reason,
        }
      : null,
  };
}

/**
 * Loads the signed-in buyer's RFQs for metrics. `supabase` must be the
 * RLS-scoped server client; the explicit buyer_id filter is defence in depth.
 */
export async function loadMetricsRfqs(supabase: SupabaseClient, buyerId: string): Promise<MetricsRfq[]> {
  // PostgREST caps each response (max-rows, 1000 on Supabase). Page through
  // explicitly so all-time figures never silently drop older RFQs.
  const rows: MetricsRow[] = [];
  for (let from = 0; ; from += METRICS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("rfqs")
      .select(METRICS_SELECT)
      .eq("buyer_id", buyerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + METRICS_PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load metrics data: ${error.message}`);
    const page = (data ?? []) as unknown as MetricsRow[];
    rows.push(...page);
    if (page.length < METRICS_PAGE_SIZE) break;
  }
  return rows.map(toMetricsRfq);
}
