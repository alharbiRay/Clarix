import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMetricsRfqs } from "@/lib/metrics/load";
import { primaryCurrency } from "@/lib/metrics";
import { scoreSuppliers } from "@/lib/scorecard";
import { buildPreviewCases, type PreviewCase } from "@/lib/approval/preview";

/** How many recent RFQs the settings preview replays. */
export const PREVIEW_RFQ_LIMIT = 200;
const ID_CHUNK = 100;

/**
 * Loads the history the settings preview replays: recent RFQs, each one's
 * latest AI pick, and current supplier scores. `supabase` is the RLS-scoped
 * client, so only the signed-in buyer's data is read.
 */
export async function loadPreviewCases(
  supabase: SupabaseClient,
  buyerId: string
): Promise<{ cases: PreviewCase[]; currency: string }> {
  const all = await loadMetricsRfqs(supabase, buyerId);
  const recent = all.slice(0, PREVIEW_RFQ_LIMIT);

  const picks = new Map<string, string | null>();
  const ids = recent.map((r) => r.id);
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from("ai_recommendations")
      .select("rfq_id, content, created_at")
      .in("rfq_id", ids.slice(i, i + ID_CHUNK))
      // Auto-approval only runs after automatic recommendations.
      .eq("auto_generated", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to load recommendations: ${error.message}`);
    for (const row of (data ?? []) as { rfq_id: string; content: unknown }[]) {
      if (picks.has(row.rfq_id)) continue; // newest first: keep the latest
      const ranking = (row.content as { ranking?: { rank: number; supplier: string }[] } | null)?.ranking;
      const top = Array.isArray(ranking) ? ranking.find((r) => r.rank === 1)?.supplier : undefined;
      picks.set(row.rfq_id, top ?? null);
    }
  }

  // Scores from the full history, as auto-approval computes them.
  const refs = new Map<string, { id: string; email?: string }>();
  for (const r of recent) for (const i of r.invites) if (i.supplier_id) refs.set(i.supplier_id, { id: i.supplier_id, email: i.email });
  const scores = new Map<string, number>();
  for (const [id, { card }] of Array.from(scoreSuppliers(all, Array.from(refs.values())))) {
    if (card) scores.set(id, card.score);
  }

  return { cases: buildPreviewCases(recent, picks, scores), currency: primaryCurrency(all) };
}
