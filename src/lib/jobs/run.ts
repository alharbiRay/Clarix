import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAutoRecommendation } from "@/lib/auto-recommendation";
import { processInboundEmailQuote } from "@/lib/inbound-email";
import {
  processJobs,
  type Job,
  type JobHandler,
  type JobHooks,
  type ProcessSummary,
} from "@/lib/jobs/processor";
import { supabaseJobStore } from "@/lib/jobs/supabase-store";
import { JOB_TYPES, autoRecommendationJob, enqueueJob } from "@/lib/jobs/enqueue";
import { recordAuditEvent } from "@/lib/audit";

export { JOB_TYPES };

async function rfqTitle(supabase: SupabaseClient, rfqId: string | null) {
  if (!rfqId) return "your RFQ";
  const { data } = await supabase.from("rfqs").select("title").eq("id", rfqId).maybeSingle();
  return (data?.title as string | undefined) ?? "your RFQ";
}

async function notify(supabase: SupabaseClient, job: Job, type: string, message: string) {
  if (!job.buyer_id || !job.rfq_id) return;
  const { error } = await supabase
    .from("notifications")
    .insert({ buyer_id: job.buyer_id, rfq_id: job.rfq_id, type, message });
  if (error) throw new Error(`notification insert failed: ${error.message}`);
}

/**
 * Buyer-facing side of job failures, so nothing fails silently:
 * - first Gemini quota/rate-limit hit → "delayed, will retry automatically"
 *   (once per job — later retries stay quiet);
 * - a job that gives up → what to do by hand.
 */
export function buildJobHooks(supabase: SupabaseClient): JobHooks {
  return {
    async onRetry(job, _error, kind) {
      if (kind !== "quota" || job.attempts !== 1 || !job.buyer_id) return;
      const title = await rfqTitle(supabase, job.rfq_id);
      const what =
        job.type === JOB_TYPES.inboundEmailQuote
          ? `Reading a supplier's emailed quote for ${title}`
          : `The AI recommendation for ${title}`;
      // Audit first: notify throws on failure, and the trail shouldn't depend on it.
      await recordAuditEvent(
        {
          buyerId: job.buyer_id,
          rfqId: job.rfq_id,
          actor: { type: "system" },
          type: "ai_quota_error",
          summary: `${what} hit the AI quota; retrying automatically`,
          payload: { jobType: job.type, what: job.type === JOB_TYPES.inboundEmailQuote ? "extraction" : "recommendation" },
        },
        supabase
      );
      await notify(
        supabase,
        job,
        "ai_delayed",
        `${what} is delayed — the Gemini API quota/rate limit was hit. Clarix will retry automatically.`
      );
    },
    async onGiveUp(job, error) {
      if (!job.buyer_id) return;
      await recordAuditEvent(
        {
          buyerId: job.buyer_id,
          rfqId: job.rfq_id,
          actor: { type: "system" },
          type: "job_failed",
          summary: `Automatic ${job.type.replace(/_/g, " ")} gave up after ${job.attempts} attempts`,
          // The error itself stays in the server logs — the trail is buyer-visible.
          payload: { jobType: job.type, attempts: job.attempts },
        },
        supabase
      );
      const title = await rfqTitle(supabase, job.rfq_id);
      const unreadable = error instanceof Error && /couldn't read this PDF reliably/i.test(error.message);
      const message =
        job.type === JOB_TYPES.inboundEmailQuote
          ? unreadable
            ? `A supplier's emailed quote for ${title} needs manual entry: the AI couldn't read the PDF reliably. Open the RFQ and add the quote by hand.`
            : `A supplier's emailed quote for ${title} couldn't be processed automatically. Ask them to resend it, or enter it manually.`
          : `The AI recommendation for ${title} couldn't be generated automatically. Generate it manually from the compare page.`;
      // Not "review_needed": that type renders an Approve button, which
      // makes no sense for a failure notice.
      await notify(supabase, job, "action_required", message);
    },
  };
}

export function buildJobHandlers(supabase: SupabaseClient): Record<string, JobHandler> {
  return {
    [JOB_TYPES.autoRecommendation]: async (job) => {
      if (!job.rfq_id) throw new Error("auto_recommendation job has no rfq_id");
      return runAutoRecommendation(job.rfq_id);
    },
    [JOB_TYPES.inboundEmailQuote]: async (job) => {
      const result = await processInboundEmailQuote(supabase, job);
      // Also on "already_processed": a previous run may have saved the quote
      // and then died before chaining this (enqueue is idempotent).
      if ((result.outcome === "created" || result.outcome === "already_processed") && job.rfq_id && job.buyer_id) {
        // Already in the background: chain the recommendation job directly.
        const next = await enqueueJob(supabase, autoRecommendationJob(job.rfq_id, job.buyer_id));
        await runJobs({ jobId: next, limit: 1 });
      }
      return result;
    },
  };
}

/** Claims and runs due jobs (or one specific job). Safe to call concurrently. */
export function runJobs(opts: { limit?: number; jobId?: string; budgetMs?: number } = {}): Promise<ProcessSummary> {
  const supabase = createAdminClient();
  return processJobs({
    store: supabaseJobStore(supabase),
    handlers: buildJobHandlers(supabase),
    hooks: buildJobHooks(supabase),
    ...opts,
  });
}
