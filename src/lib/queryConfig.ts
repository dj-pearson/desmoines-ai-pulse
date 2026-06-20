/**
 * Centralized TanStack Query cache + retry tuning (WEB-PERF-006).
 *
 * One source of truth for per-data-class `staleTime` values so hooks stop
 * sprinkling magic numbers, plus a shared retry policy used by the global
 * QueryClient. The guiding split:
 *   - Public content changes slowly  -> longer staleTime, long gcTime so
 *     back-navigation renders instantly from cache.
 *   - User-specific data must feel live after a mutation -> short staleTime
 *     (mutation hooks still invalidate explicitly; this is the safety net).
 */

/** Per-data-class freshness windows, in milliseconds. */
export const STALE_TIME = {
  /** Public content lists (events / restaurants / attractions / hotels). */
  CONTENT_LIST: 10 * 60 * 1000, // 10 min
  /** A single content detail row. */
  CONTENT_DETAIL: 15 * 60 * 1000, // 15 min
  /** Rarely-changing reference data: filter options, categories, cuisines. */
  REFERENCE: 60 * 60 * 1000, // 1 hour
  /** User-specific data: favorites, subscription, profile, usage. */
  USER: 30 * 1000, // 30 s
  /** Fast-moving signals: trending, social counts. */
  SHORT: 60 * 1000, // 1 min
} as const;

/**
 * Keep inactive query data cached long enough that returning to a recently
 * visited list (back-navigation) renders instantly instead of refetching.
 */
export const GC_TIME = 30 * 60 * 1000; // 30 min

const MAX_RETRIES = 2;
const MAX_RETRY_DELAY = 10_000; // 10 s cap

/**
 * Pull an HTTP-ish status code out of the assorted error shapes our data
 * layer throws (fetch `Response`, Supabase Postgrest/Auth errors).
 */
function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  if (typeof e.status === "number") return e.status;
  if (typeof e.statusCode === "number") return e.statusCode;
  return undefined;
}

/**
 * Retry transient failures (network blips, 5xx) up to {@link MAX_RETRIES},
 * never retry client errors the user can't fix by waiting (401/403/404 and
 * other 4xx), but still retry 408 (timeout) and 429 (rate limited).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    if (status !== 408 && status !== 429) return false;
  }
  return failureCount < MAX_RETRIES;
}

/** Exponential backoff with a hard cap: 1s, 2s, 4s, ... (max 10s). */
export function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, MAX_RETRY_DELAY);
}
