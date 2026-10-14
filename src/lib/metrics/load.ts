import type { SupabaseClient } from "@supabase/supabase-js";
import type { AwardDecision, InviteStatus, MetricsRfq, QuoteStatusValue } from "@/lib/metrics";

/** Rows per request — at or below PostgREST's max-rows so paging is exact. */
export const METRICS_PAGE_SIZE = 1000;

/** Columns the metrics need — nothing more (no notes, PDFs or extraction payloads). */
export const METRICS_SELECT =
  "id, title, currency, created_at, status, deadline, " +
  "rfq_items(id, name, quantity, unit), " +
  "rfq_suppliers(id, company_name, email, supplier_id, status, invited_at), " +
  "quotes(id, supplier_id, status, submitted_at, delivery_days, warranty, quote_items(rfq_item_id, unit_price, total_price)), " +
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
  status?: "draft" | "sent" | "closed" | "awarded";
  deadline?: string | null;
  rfq_items: { id: string; name: string; quantity: number | string; unit?: string }[];
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
    delivery_days?: number | null;
    warranty?: string | null;
    quote_items: { rfq_item_id: string; unit_price?: number | string | null; total_price: number | string | null }[];
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
    status: row.status,
    deadline: row.deadline ?? null,
    items: row.rfq_items.map((i) => ({ id: i.id, name: i.name, quantity: Number(i.quantity), unit: i.unit })),
    invites: row.rfq_suppliers.map((s) => ({
      id: s.id,
      label: s.company_name || s.email,
      email: s.email,
      supplier_id: s.supplier_id,
      status: s.status as InviteStatus,
      invited_at: s.invited_at,
    })),
    quotes: row.quotes.map((q) => ({
      id: q.id,
      invite_id: q.supplier_id,
      status: q.status as QuoteStatusValue,
      submitted_at: q.submitted_at,
      delivery_days: q.delivery_days ?? null,
      warranty: q.warranty ?? null,
      lines: q.quote_items.map((qi) => ({
        item_id: qi.rfq_item_id,
        total: qi.total_price === null ? null : Number(qi.total_price),
        unit: qi.unit_price === null || qi.unit_price === undefined ? null : Number(qi.unit_price),
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
export async function loadMetricsRfqs(
  supabase: SupabaseClient,
  buyerId: string,
  opts: { rfqIds?: string[]; since?: string } = {}
): Promise<MetricsRfq[]> {
  if (opts.rfqIds) {
    // Targeted load (compare page, supplier detail): only the RFQs asked for.
    const rows: MetricsRow[] = [];
    for (let i = 0; i < opts.rfqIds.length; i += ID_CHUNK) {
      const ids = opts.rfqIds.slice(i, i + ID_CHUNK);
      const { data, error } = await supabase.from("rfqs").select(METRICS_SELECT).eq("buyer_id", buyerId).in("id", ids);
      if (error) throw new Error(`Failed to load metrics data: ${error.message}`);
      rows.push(...((data ?? []) as unknown as MetricsRow[]));
    }
    return rows.map(toMetricsRfq);
  }

  // PostgREST caps each response (max-rows, 1000 on Supabase). Page through
  // explicitly so all-time figures never silently drop older RFQs.
  const rows: MetricsRow[] = [];
  for (let from = 0; ; from += METRICS_PAGE_SIZE) {
    let query = supabase.from("rfqs").select(METRICS_SELECT).eq("buyer_id", buyerId);
    if (opts.since) query = query.gte("created_at", opts.since);
    const { data, error } = await query
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

const ID_CHUNK = 100;

/**
 * RFQ ids a set of suppliers took part in — by linked profile or, for
 * invitations not yet linked, by email. RLS scopes this to the buyer.
 */
export async function rfqIdsForSuppliers(
  supabase: SupabaseClient,
  suppliers: { id: string; email?: string | null }[]
): Promise<string[]> {
  const ids = suppliers.map((s) => s.id);
  const emails = suppliers.map((s) => s.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e));
  const [byId, byEmail] = await Promise.all([
    ids.length ? supabase.from("rfq_suppliers").select("rfq_id").in("supplier_id", ids) : { data: [], error: null },
    emails.length ? supabase.from("rfq_suppliers").select("rfq_id").in("email", emails) : { data: [], error: null },
  ]);
  if (byId.error || byEmail.error) throw new Error("Failed to look up supplier history");
  return Array.from(new Set([...(byId.data ?? []), ...(byEmail.data ?? [])].map((r) => r.rfq_id as string)));
}
