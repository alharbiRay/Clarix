import { isGeminiRateLimited, isGeminiOutputError } from "@/lib/gemini-errors";

/**
 * Durable background job processor. Storage-agnostic: the Supabase-backed
 * store lives in ./supabase-store.ts, tests use an in-memory one. Callers
 * (the inline runner after a quote lands, and the /api/jobs/process cron
 * sweep) both go through processJobs, and claim_jobs' `skip locked` makes
 * them safe to run concurrently.
 */

export interface Job {
  id: string;
  type: string;
  buyer_id: string | null;
  rfq_id: string | null;
  payload: Record<string, unknown>;
  /** Already incremented for the current run by claim_jobs. */
  attempts: number;
  max_attempts: number;
}

export interface JobStore {
  claim(opts: { limit: number; jobId?: string }): Promise<Job[]>;
  complete(id: string, result: unknown): Promise<void>;
  reschedule(id: string, runAfter: Date, error: string): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

export type JobHandler = (job: Job) => Promise<unknown>;

/** "quota": Gemini rate limit / quota. "transient": anything else worth retrying. */
export type RetryKind = "quota" | "transient";

export interface JobHooks {
  onRetry?(job: Job, error: unknown, kind: RetryKind): Promise<void> | void;
  onGiveUp?(job: Job, error: unknown): Promise<void> | void;
}

/** Thrown by a handler when retrying cannot help (bad input, deleted RFQ). */
export class PermanentJobError extends Error {
  /** Why, when the buyer's notice should say something specific. */
  readonly reason?: "needs_manual_entry";
  constructor(message: string, options: { reason?: "needs_manual_entry" } = {}) {
    super(message);
    this.name = "PermanentJobError";
    this.reason = options.reason;
  }
}

const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
const QUOTA_MIN_BACKOFF_MS = 3_600_000;

/** Delay before the next try, given how many attempts have been made so far. */
export function backoffDelayMs(attempts: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1];
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

async function safely(fn: () => Promise<void> | void, context: string) {
  try {
    await fn();
  } catch (e) {
    console.error(JSON.stringify({ event: "jobs.hook_failed", context, error: errorMessage(e) }));
  }
}

export interface ProcessJobsOptions {
  store: JobStore;
  handlers: Record<string, JobHandler>;
  hooks?: JobHooks;
  /** Max jobs to run in this call. */
  limit?: number;
  jobId?: string;
  /**
   * Stop claiming new jobs once this much time has passed. Jobs are leased
   * one at a time, so anything not reached stays 'pending' for the next run
   * instead of being leased, stranded by a function timeout, and charged an
   * attempt it never got.
   */
  budgetMs?: number;
  now?: () => Date;
}

export interface ProcessSummary {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
}

export async function processJobs({
  store,
  handlers,
  hooks = {},
  limit = 5,
  jobId,
  budgetMs = Infinity,
  now = () => new Date(),
}: ProcessJobsOptions): Promise<ProcessSummary> {
  const summary: ProcessSummary = { claimed: 0, succeeded: 0, retried: 0, failed: 0 };
  const startedAt = now().getTime();

  while (summary.claimed < limit && now().getTime() - startedAt < budgetMs) {
    const [job] = await store.claim(jobId ? { limit: 1, jobId } : { limit: 1 });
    if (!job) break;
    summary.claimed++;

    if (job.attempts > job.max_attempts) {
      // Reclaimed after its lease went stale on the final attempt: the worker
      // was killed every time (e.g. a function timeout). Don't try again.
      const message = `Job did not finish after ${job.max_attempts} attempts (worker timed out or was stopped)`;
      await store.fail(job.id, message);
      summary.failed++;
      console.error(JSON.stringify({ event: "jobs.abandoned", jobId: job.id, type: job.type, attempts: job.attempts }));
      if (hooks.onGiveUp) await safely(() => hooks.onGiveUp!(job, new Error(message)), "onGiveUp");
      continue;
    }

    const handler = handlers[job.type];
    if (!handler) {
      await store.fail(job.id, `No handler for job type '${job.type}'`);
      summary.failed++;
      continue;
    }

    try {
      const result = await handler(job);
      await store.complete(job.id, result ?? null);
      summary.succeeded++;
      console.log(JSON.stringify({ event: "jobs.succeeded", jobId: job.id, type: job.type, attempts: job.attempts }));
    } catch (e) {
      const message = errorMessage(e);
      const exhausted = job.attempts >= job.max_attempts;
      if (e instanceof PermanentJobError || isGeminiOutputError(e) || exhausted) {
        await store.fail(job.id, message);
        summary.failed++;
        console.error(JSON.stringify({ event: "jobs.failed", jobId: job.id, type: job.type, attempts: job.attempts, error: message }));
        if (hooks.onGiveUp) await safely(() => hooks.onGiveUp!(job, e), "onGiveUp");
        continue;
      }

      const kind: RetryKind = isGeminiRateLimited(e) ? "quota" : "transient";
      const delay = kind === "quota"
        ? Math.max(backoffDelayMs(job.attempts), QUOTA_MIN_BACKOFF_MS)
        : backoffDelayMs(job.attempts);
      const runAfter = new Date(now().getTime() + delay);
      await store.reschedule(job.id, runAfter, message);
      summary.retried++;
      console.warn(JSON.stringify({ event: "jobs.retry_scheduled", jobId: job.id, type: job.type, kind, attempts: job.attempts, runAfter: runAfter.toISOString(), error: message }));
      if (hooks.onRetry) await safely(() => hooks.onRetry!(job, e, kind), "onRetry");
    }
  }

  return summary;
}
