export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/**
 * Races `promise` against a hard deadline. The timer is always cleared, so
 * nothing keeps the (edge) runtime alive after the race settles.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
