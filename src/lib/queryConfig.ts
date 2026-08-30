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
 * True for errors that describe the SHAPE of the request or schema rather than
 * a transient condition — retrying cannot change the answer.
 *
 * Supabase Postgrest errors do NOT carry an HTTP status: they arrive as
 * `{ code, message, details, hint }`. So a status-based guard alone never sees
 * them and every schema error burns the full retry budget. Measured: the
 * homepage issued 6 get_active_ads requests for 2 placements, all failing with
 * PGRST203, because the status check found nothing to match on.
 *
 *   PGRST*  PostgREST-level: unknown function, ambiguous overload, bad
 *           projection, schema-cache miss.
 *   42xxx   Postgres syntax/access class: undefined column (42703),
 *           undefined table (42P01), and friends.
 *
 * Deliberately narrow. Connection/resource-class Postgres errors (08xxx,
 * 53xxx) are NOT listed — those are exactly the ones worth retrying.
 */
function isPermanentDataError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as Record<string, unknown>).code;
  if (typeof code !== "string") return false;
  return code.startsWith("PGRST") || /^42[0-9A-Z]{3}$/.test(code);
}

/**
 * Retry transient failures (network blips, 5xx) up to {@link MAX_RETRIES},
 * never retry client errors the user can't fix by waiting (401/403/404 and
 * other 4xx), but still retry 408 (timeout) and 429 (rate limited).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  // Checked BEFORE status, because Supabase Postgrest errors carry no status
  // at all — a status-only guard never matches them.
  if (isPermanentDataError(error)) return false;

  const status = getErrorStatus(error);

  // Anything below 500 that surfaced as an ERROR is a permanent condition —
  // waiting cannot change the answer. The guard previously started at 400,
  // which let 3xx through to the retryable branch.
  //
  // That is not theoretical: get_active_ads currently returns HTTP 300
  // (PGRST203, "could not choose the best candidate function" — two
  // overloads coexist until migration 20260718000001 is applied). 300 is not
  // >= 400, so every ad lookup burned all MAX_RETRIES on a schema condition
  // that will never resolve by retrying. Measured on the homepage: 2 ad
  // placements produced 6 requests, all failing.
  //
  // A 3xx reaching this layer at all is already unusual — fetch follows
  // ordinary redirects — so treating it as terminal is safe.
  //
  // 408 (timeout) and 429 (rate limited) remain retryable: those genuinely do
  // resolve by waiting. Network failures carry no status and stay retryable.
  if (status !== undefined && status >= 300 && status < 500) {
    if (status !== 408 && status !== 429) return false;
  }
  return failureCount < MAX_RETRIES;
}

/** Exponential backoff with a hard cap: 1s, 2s, 4s, ... (max 10s). */
export function retryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, MAX_RETRY_DELAY);
}
