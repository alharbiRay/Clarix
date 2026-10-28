import { describe, expect, it, vi } from "vitest";
import { GeminiOutputError } from "@/lib/gemini-errors";
import { PermanentJobError, backoffDelayMs, processJobs, type Job, type JobStore } from "@/lib/jobs/processor";

const NOW = new Date("2026-03-01T10:00:00Z");

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    type: "auto_recommendation",
    buyer_id: "buyer-1",
    rfq_id: "rfq-1",
    payload: {},
    attempts: 1,
    max_attempts: 5,
    ...overrides,
  };
}

function memoryStore(jobs: Job[]) {
  const store: JobStore & { log: string[] } = {
    log: [],
    claim: vi.fn(async ({ limit }: { limit: number }) => jobs.splice(0, limit)),
    complete: vi.fn(async (id: string) => void store.log.push(`complete:${id}`)),
    reschedule: vi.fn(async (id: string, runAfter: Date) => void store.log.push(`reschedule:${id}@${runAfter.toISOString()}`)),
    fail: vi.fn(async (id: string) => void store.log.push(`fail:${id}`)),
  };
  return store;
}

const quotaError = new Error(
  JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel" } })
);

describe("processJobs", () => {
  it("gives up at once on output the AI couldn't produce, instead of retrying the same input", async () => {
    const store = memoryStore([job({ attempts: 1 })]);
    const onGiveUp = vi.fn();
    const summary = await processJobs({
      store,
      handlers: { auto_recommendation: async () => { throw new GeminiOutputError("still invalid"); } },
      hooks: { onGiveUp },
      now: () => NOW,
    });
    expect(store.log).toEqual(["fail:job-1"]);
    expect(summary.failed).toBe(1);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it("runs the handler for each claimed job and records the result", async () => {
    const store = memoryStore([job({ id: "a" }), job({ id: "b" })]);
    const handler = vi.fn(async () => ({ outcome: "generated" }));
    const summary = await processJobs({ store, handlers: { auto_recommendation: handler }, now: () => NOW });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(store.complete).toHaveBeenCalledWith("a", { outcome: "generated" });
    expect(summary).toEqual({ claimed: 2, succeeded: 2, retried: 0, failed: 0 });
  });

  it("claims one job at a time, passing a specific job id through to the store", async () => {
    const store = memoryStore([]);
    await processJobs({ store, handlers: {}, limit: 3, jobId: "only-me" });
    expect(store.claim).toHaveBeenCalledWith({ limit: 1, jobId: "only-me" });
  });

  it("stops claiming once the time budget is spent, so unstarted jobs are not leased and stranded", async () => {
    let t = NOW.getTime();
    const store = memoryStore([job({ id: "a" }), job({ id: "b" }), job({ id: "c" })]);
    const summary = await processJobs({
      store,
      handlers: { auto_recommendation: async () => { t += 30_000; } },
      now: () => new Date(t),
      limit: 10,
      budgetMs: 40_000,
    });
    expect(summary.claimed).toBe(2);
    expect(store.claim).toHaveBeenCalledTimes(2);
  });

  it("gives up without running a job reclaimed past max_attempts (its worker kept dying)", async () => {
    const onGiveUp = vi.fn();
    const handler = vi.fn();
    const store = memoryStore([job({ attempts: 6, max_attempts: 5 })]);
    const summary = await processJobs({ store, handlers: { auto_recommendation: handler }, hooks: { onGiveUp } });
    expect(handler).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith("job-1", expect.stringMatching(/did not finish/));
    expect(onGiveUp).toHaveBeenCalled();
    expect(summary.failed).toBe(1);
  });

  it("reschedules a failed job with backoff while attempts remain", async () => {
    const store = memoryStore([job({ attempts: 2 })]);
    const summary = await processJobs({
      store,
      handlers: { auto_recommendation: async () => { throw new Error("socket hang up"); } },
      now: () => NOW,
    });
    expect(store.reschedule).toHaveBeenCalledWith("job-1", new Date(NOW.getTime() + backoffDelayMs(2)), "socket hang up");
    expect(summary.retried).toBe(1);
  });

  it("gives up after max attempts and calls onGiveUp", async () => {
    const onGiveUp = vi.fn();
    const store = memoryStore([job({ attempts: 5, max_attempts: 5 })]);
    await processJobs({
      store,
      handlers: { auto_recommendation: async () => { throw new Error("still broken"); } },
      hooks: { onGiveUp },
    });
    expect(store.fail).toHaveBeenCalledWith("job-1", "still broken");
    expect(onGiveUp).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }), expect.any(Error));
  });

  it("fails permanent errors immediately without retrying", async () => {
    const store = memoryStore([job({ attempts: 1 })]);
    await processJobs({
      store,
      handlers: { auto_recommendation: async () => { throw new PermanentJobError("RFQ was deleted"); } },
    });
    expect(store.fail).toHaveBeenCalledWith("job-1", "RFQ was deleted");
    expect(store.reschedule).not.toHaveBeenCalled();
  });

  it("fails jobs of an unknown type", async () => {
    const store = memoryStore([job({ type: "mystery" })]);
    await processJobs({ store, handlers: {} });
    expect(store.fail).toHaveBeenCalledWith("job-1", "No handler for job type 'mystery'");
  });

  it("reports quota errors through onRetry with kind 'quota' and backs off at least an hour", async () => {
    const onRetry = vi.fn();
    const store = memoryStore([job({ attempts: 1 })]);
    await processJobs({
      store,
      handlers: { auto_recommendation: async () => { throw quotaError; } },
      hooks: { onRetry },
      now: () => NOW,
    });
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ id: "job-1" }), quotaError, "quota");
    const runAfter = (store.reschedule as ReturnType<typeof vi.fn>).mock.calls[0][1] as Date;
    expect(runAfter.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it("keeps going when one job fails and when a hook throws", async () => {
    const store = memoryStore([job({ id: "bad" }), job({ id: "good" })]);
    const summary = await processJobs({
      store,
      handlers: {
        auto_recommendation: async (j) => {
          if (j.id === "bad") throw new Error("nope");
          return null;
        },
      },
      hooks: { onRetry: () => { throw new Error("hook exploded"); } },
    });
    expect(store.log).toContain("complete:good");
    expect(summary).toMatchObject({ succeeded: 1, retried: 1 });
  });
});

describe("backoffDelayMs", () => {
  it("grows with each attempt and caps at six hours", () => {
    const delays = [1, 2, 3, 4, 5, 9].map(backoffDelayMs);
    expect(delays).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 21_600_000]);
  });
});
