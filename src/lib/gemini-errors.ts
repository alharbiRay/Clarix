/**
 * Classification of errors thrown by the Gemini SDK. Kept separate from
 * src/lib/gemini.ts (which pulls in the SDK) so the job processor and tests
 * can reason about failures without loading it.
 */

/** Longest RetryInfo delay worth waiting out inside a single request. */
export const MAX_IN_REQUEST_RETRY_DELAY_MS = 10_000;

export interface GeminiErrorInfo {
  status?: string;
  message: string;
  retryDelaySeconds?: number;
}

/** Best-effort parse of the Gemini SDK's error — its .message is the raw JSON API error body. */
export function parseGeminiError(e: unknown): GeminiErrorInfo {
  const raw = e instanceof Error ? e.message : String(e);
  try {
    const parsed = JSON.parse(raw);
    const err = parsed?.error;
    if (!err || typeof err !== "object") return { message: raw };
    const details = Array.isArray(err.details) ? err.details : [];
    const retryInfo = details.find(
      (d: unknown) =>
        typeof d === "object" &&
        d !== null &&
        typeof (d as { "@type"?: unknown })["@type"] === "string" &&
        (d as { "@type": string })["@type"].includes("RetryInfo")
    ) as { retryDelay?: string } | undefined;
    const match = retryInfo?.retryDelay ? /^([\d.]+)s$/.exec(retryInfo.retryDelay) : null;
    return {
      status: typeof err.status === "string" ? err.status : undefined,
      message: typeof err.message === "string" ? err.message : raw,
      retryDelaySeconds: match ? parseFloat(match[1]) : undefined,
    };
  } catch {
    return { message: raw };
  }
}

/**
 * True if a Gemini call failed because the daily quota is exhausted or the
 * account's prepayment balance is depleted — a 429 that retrying within the
 * request can't fix. Callers surface this to the buyer and schedule a later
 * retry instead of letting it disappear into a generic error.
 */
export function isGeminiQuotaError(e: unknown): boolean {
  const info = parseGeminiError(e);
  return (
    info.status === "RESOURCE_EXHAUSTED" &&
    (/prepayment credits/i.test(info.message) || /PerDay/i.test(info.message))
  );
}

/** Any 429, including short per-minute limits. */
export function isGeminiRateLimited(e: unknown): boolean {
  return parseGeminiError(e).status === "RESOURCE_EXHAUSTED";
}

/**
 * Only retries errors actually likely to succeed on a second try within a
 * few seconds: 503 (transient overload) or a 429 whose own RetryInfo
 * suggests a short wait. A 429 backed by an exhausted daily quota or a
 * depleted prepayment balance won't recover by retrying — failing fast
 * there saves the function's time budget for the durable job retry instead.
 */
export function isRetryableGeminiError(info: GeminiErrorInfo): boolean {
  if (info.status === "UNAVAILABLE") return true;
  if (info.status === "RESOURCE_EXHAUSTED") {
    if (/prepayment credits/i.test(info.message)) return false;
    if (/PerDay/i.test(info.message)) return false;
    return (
      typeof info.retryDelaySeconds === "number" &&
      info.retryDelaySeconds <= MAX_IN_REQUEST_RETRY_DELAY_MS / 1000
    );
  }
  return false;
}

/**
 * The model answered, but not with usable output (invalid JSON, wrong shape,
 * or declined) — even after one repair attempt. Retrying the same input
 * won't help: callers fall back to manual entry instead.
 */
export class GeminiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiOutputError";
  }
}

export function isGeminiOutputError(e: unknown): e is GeminiOutputError {
  return e instanceof GeminiOutputError || (e instanceof Error && e.name === "GeminiOutputError");
}
