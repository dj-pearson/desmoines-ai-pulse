/**
 * Centralized TanStack Query cache + retry policy.
 *
 * These are the documented constants behind the QueryClient defaults in
 * `src/main.tsx`. The goal (WEB-PERF-006) is per-data-class tuning instead of
 * one-size-fits-all magic numbers:
 *
 *  - Public content (events/restaurants/attractions lists) is cheap to serve a
 *    little stale and benefits hugely from caching → long `staleTime`.
 *  - User-specific or fast-changing data (favorites, dashboards, admin queues)
 *    must stay fresh → short `staleTime` (these hooks override the global
 *    default with `STALE_TIME.USER`). Mutation hooks additionally call
 *    `invalidateQueries`, which forces an immediate refetch regardless of
 *    `staleTime`, so a long default never hides a user's own write.
 *  - `gcTime` is generous globally so a recently-visited list renders instantly
 *    from cache on back-navigation instead of re-fetching.
 */

/** staleTime presets, in milliseconds. Pass to a hook's `useQuery({ staleTime })`. */
export const STALE_TIME = {
  /** User-specific / fast-changing data (favorites, dashboards, admin queues). */
  USER: 30 * 1000, // 30s
  /** Public content lists and detail pages. */
  CONTENT: 10 * 60 * 1000, // 10min
  /** Rarely-changing reference data (filter options, categories, taxonomies). */
  STATIC: 60 * 60 * 1000, // 1h
} as const;

/** gcTime presets, in milliseconds. */
export const GC_TIME = {
  /**
   * Keep cached query data around long enough that back-navigation to a
   * recently-visited list renders instantly from cache (no refetch flash).
   */
  DEFAULT: 30 * 60 * 1000, // 30min
} as const;

/** Maximum automatic retries for a failed query (after the initial attempt). */
export const MAX_QUERY_RETRIES = 2;

/**
 * HTTP-ish status codes that mean "retrying will not help" — auth, forbidden,
 * not-found, and unambiguous client errors. We never retry these.
 */
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 405, 422]);

/**
 * Best-effort extraction of an HTTP status from the many error shapes thrown
 * across our data layer: native `fetch`/Response, Supabase Functions
 * (`FunctionsHttpError` → `.context.status`), and assorted wrappers.
 * Returns `undefined` when no status is discernible (e.g. network failure).
 */
function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  const candidates = [
    e.status,
    e.statusCode,
    (e.context as Record<string, unknown> | undefined)?.status,
    (e.response as Record<string, unknown> | undefined)?.status,
  ];
  for (const c of candidates) {
    const n = typeof c === "string" ? Number(c) : c;
    if (typeof n === "number" && Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Retry predicate for the QueryClient: retry transient failures (network /
 * 5xx) up to `MAX_QUERY_RETRIES`, but never retry definitive client errors
 * (401/403/404 etc.) — those won't fix themselves and just waste round-trips.
 */
export function smartRetry(failureCount: number, error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== undefined && NON_RETRYABLE_STATUSES.has(status)) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

/** Exponential backoff (1s, 2s, 4s, …) capped at 30s. */
export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 30 * 1000);
}
