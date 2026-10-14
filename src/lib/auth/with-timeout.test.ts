import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "@/lib/auth/with-timeout";

describe("withTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves with the value when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
  });

  it("rejects with TimeoutError when the promise is too slow", async () => {
    const slow = new Promise(() => {});
    const result = withTimeout(slow, 2500, "auth.getUser");
    vi.advanceTimersByTime(2500);
    await expect(result).rejects.toBeInstanceOf(TimeoutError);
    await expect(result).rejects.toThrow("auth.getUser timed out after 2500ms");
  });

  it("propagates the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 100)).rejects.toThrow("boom");
  });

  it("clears its timer once the promise settles", async () => {
    await withTimeout(Promise.resolve(1), 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
