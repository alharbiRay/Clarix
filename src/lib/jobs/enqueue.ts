import type { SupabaseClient } from "@supabase/supabase-js";

export const JOB_TYPES = {
  autoRecommendation: "auto_recommendation",
  inboundEmailQuote: "inbound_email_quote",
} as const;

export interface EnqueueInput {
  type: string;
  buyerId: string | null;
  rfqId: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  maxAttempts?: number;
}

/** Records a job durably via enqueue_job. Returns its id (or that of an identical job already pending). */
export async function enqueueJob(supabase: SupabaseClient, input: EnqueueInput): Promise<string> {
  const { data, error } = await supabase.rpc("enqueue_job", {
    p_type: input.type,
    p_buyer_id: input.buyerId,
    p_rfq_id: input.rfqId,
    p_payload: input.payload ?? {},
    p_dedupe_key: input.dedupeKey ?? null,
    p_max_attempts: input.maxAttempts ?? 5,
  });
  if (error || !data) throw new Error(`enqueue_job failed: ${error?.message ?? "no id returned"}`);
  return data as string;
}

export function autoRecommendationJob(rfqId: string, buyerId: string): EnqueueInput {
  return {
    type: JOB_TYPES.autoRecommendation,
    buyerId,
    rfqId,
    dedupeKey: `${JOB_TYPES.autoRecommendation}:${rfqId}`,
  };
}
