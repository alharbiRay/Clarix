import { describe, expect, it } from "vitest";
import {
  isGeminiQuotaError,
  isGeminiRateLimited,
  isRetryableGeminiError,
  parseGeminiError,
} from "@/lib/gemini-errors";

/** The Gemini SDK throws an Error whose message is the raw JSON API error body. */
function apiError(status: string, message: string, retryDelay?: string) {
  return new Error(
    JSON.stringify({
      error: {
        code: status === "RESOURCE_EXHAUSTED" ? 429 : 503,
        status,
        message,
        details: retryDelay
          ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }]
          : [],
      },
    })
  );
}

const DAILY_QUOTA = apiError("RESOURCE_EXHAUSTED", "Quota exceeded for metric: GenerateRequestsPerDayPerProjectPerModel-FreeTier", "40s");
const PREPAY = apiError("RESOURCE_EXHAUSTED", "Your prepayment credits are depleted.");
const PER_MINUTE = apiError("RESOURCE_EXHAUSTED", "Quota exceeded for metric: GenerateRequestsPerMinutePerProjectPerModel", "7s");
const OVERLOADED = apiError("UNAVAILABLE", "The model is overloaded.");

describe("parseGeminiError", () => {
  it("reads status, message and RetryInfo delay from the SDK error body", () => {
    expect(parseGeminiError(PER_MINUTE)).toEqual({
      status: "RESOURCE_EXHAUSTED",
      message: expect.stringContaining("PerMinute"),
      retryDelaySeconds: 7,
    });
  });

  it("falls back to the raw message for non-JSON errors", () => {
    expect(parseGeminiError(new Error("socket hang up"))).toEqual({ message: "socket hang up" });
  });
});

describe("isGeminiQuotaError (won't recover by retrying soon)", () => {
  it.each([
    ["daily quota", DAILY_QUOTA, true],
    ["depleted prepayment", PREPAY, true],
    ["per-minute rate limit", PER_MINUTE, false],
    ["overloaded", OVERLOADED, false],
    ["plain error", new Error("boom"), false],
  ])("%s → %s", (_label, err, expected) => {
    expect(isGeminiQuotaError(err)).toBe(expected);
  });
});

describe("isGeminiRateLimited (any 429)", () => {
  it("is true for every RESOURCE_EXHAUSTED and false otherwise", () => {
    expect(isGeminiRateLimited(DAILY_QUOTA)).toBe(true);
    expect(isGeminiRateLimited(PER_MINUTE)).toBe(true);
    expect(isGeminiRateLimited(OVERLOADED)).toBe(false);
  });
});

describe("isRetryableGeminiError (worth an immediate in-request retry)", () => {
  it("retries overload and short rate limits, not exhausted quotas", () => {
    expect(isRetryableGeminiError(parseGeminiError(OVERLOADED))).toBe(true);
    expect(isRetryableGeminiError(parseGeminiError(PER_MINUTE))).toBe(true);
    expect(isRetryableGeminiError(parseGeminiError(DAILY_QUOTA))).toBe(false);
    expect(isRetryableGeminiError(parseGeminiError(PREPAY))).toBe(false);
    expect(isRetryableGeminiError(parseGeminiError(apiError("RESOURCE_EXHAUSTED", "slow down", "30s")))).toBe(false);
  });
});
