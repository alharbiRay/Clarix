import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoRecommendationJob, enqueueJob, type EnqueueInput } from "@/lib/jobs/enqueue";
import { runJobs } from "@/lib/jobs/run";

/**
 * Starts a job right away without holding up the response: on Vercel,
 * waitUntil keeps the function alive (up to maxDuration) after the response
 * is sent. If the instance dies anyway, the job is still in the table and
 * the /api/jobs/process sweep picks it up — the durability guarantee the
 * old fire-and-forget call lacked.
 */
export function runInBackground(jobId: string) {
  waitUntil(
    runJobs({ jobId, limit: 1 }).catch((e) =>
      console.error(JSON.stringify({ event: "jobs.inline_run_failed", jobId, error: String(e) }))
    )
  );
}

/** Enqueue (source of truth) + background run (optimization). Never throws. */
export async function scheduleJob(input: EnqueueInput): Promise<string | null> {
  try {
    const jobId = await enqueueJob(createAdminClient(), input);
    runInBackground(jobId);
    return jobId;
  } catch (e) {
    console.error(JSON.stringify({ event: "jobs.enqueue_failed", type: input.type, rfqId: input.rfqId, error: String(e) }));
    return null;
  }
}

/** Called wherever a quote lands. Saving the quote must never fail because scheduling did. */
export function scheduleAutoRecommendation(rfqId: string, buyerId: string) {
  return scheduleJob(autoRecommendationJob(rfqId, buyerId));
}
