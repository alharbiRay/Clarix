import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, JobStore } from "@/lib/jobs/processor";

/** JobStore backed by public.jobs and the claim_jobs RPC (migration 0007). Service-role client only. */
export function supabaseJobStore(supabase: SupabaseClient): JobStore {
  async function patch(id: string, values: Record<string, unknown>) {
    const { error } = await supabase.from("jobs").update(values).eq("id", id);
    if (error) throw new Error(`jobs update failed for ${id}: ${error.message}`);
  }

  return {
    async claim({ limit, jobId }) {
      const { data, error } = await supabase.rpc("claim_jobs", {
        p_limit: limit,
        p_job_id: jobId ?? null,
      });
      if (error) throw new Error(`claim_jobs failed: ${error.message}`);
      return (data ?? []) as Job[];
    },
    complete: (id, result) =>
      patch(id, { status: "succeeded", result: result ?? null, locked_at: null, last_error: null }),
    reschedule: (id, runAfter, error) =>
      patch(id, { status: "pending", run_after: runAfter.toISOString(), locked_at: null, last_error: error.slice(0, 2000) }),
    fail: (id, error) =>
      patch(id, { status: "failed", locked_at: null, last_error: error.slice(0, 2000) }),
  };
}
