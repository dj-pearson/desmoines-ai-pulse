/**
 * Time and token budgets for the menu scraper.
 *
 * WHY THESE NUMBERS
 * -----------------
 * Supabase closes a request that has sent nothing for 150 seconds
 * (`IDLE_TIMEOUT: Request idle timeout limit (150s) reached`, HTTP 504). The
 * scraper answers with one JSON body at the end, so the whole invocation has
 * to finish inside that window. It used to plan for 260s per run and 110s per
 * restaurant, with Claude calls of up to 90s retried three times, so a single
 * PDF menu could run past the limit and the caller got a 504 with nothing in
 * it - no partial result, and no attempt log, because that is written after
 * the restaurant finishes.
 *
 * Measured 2026-10-11: one restaurant (a Wix site with a PDF menu) in a dry
 * run returned the 504.
 *
 * The shape now:
 *   - work of every kind stops at RUN_DEADLINE_MS, and a Claude call in flight
 *     at that moment is cut off and whatever it had streamed is salvaged;
 *   - the handler answers at RESPONSE_DEADLINE_MS whatever is still running,
 *     which leaves 15s of margin under the 150s idle limit.
 *
 * Kept dependency-free so the arithmetic is unit-tested (menuBudget.test.ts).
 */

/** Supabase's request idle timeout. The response must be sent before this. */
export const PLATFORM_IDLE_TIMEOUT_MS = 150_000;

/** The handler sends its response by this point, finished or not. */
export const RESPONSE_DEADLINE_MS = 135_000;

/** No fetch or Claude call runs past this point (measured from request start). */
export const RUN_DEADLINE_MS = 125_000;

/** Wall-clock per restaurant, so the first restaurant cannot take the whole run. */
export const MS_PER_RESTAURANT = 100_000;

/**
 * Output cap for menu extraction, independent of `ai_configuration.max_tokens_large`.
 *
 * That shared setting was "80000" on 2026-10-11, above the 64000 output cap of
 * claude-sonnet-4-5, so every menu request was rejected with a 400 and every
 * LLM path reported "empty". Other functions read the same row, so the menu
 * path stops depending on it. 16000 tokens is roughly 300-400 menu items in
 * the tool schema, more than any one PDF or page chunk carries; a longer reply
 * is cut off and salvaged by the prefix recovery in menuJson.ts.
 */
export const MENU_MAX_TOKENS = 16_000;

/** Longest a single Claude attempt may run, before the run deadline clamps it. */
export const LLM_ATTEMPT_TIMEOUT_MS = 90_000;

/**
 * Least time worth starting a Claude call with. A vision request over a PDF
 * rarely produces anything useful in under ~20s, and starting one with 3s left
 * only spends tokens on output that is thrown away.
 */
export const MIN_LLM_WINDOW_MS = 20_000;

/** Least time worth starting a page/asset fetch with. */
export const MIN_FETCH_WINDOW_MS = 4_000;

/** Milliseconds left before `deadline`, never negative. */
export function remainingMs(deadline: number, now: number): number {
  return Math.max(0, deadline - now);
}

/**
 * How long one Claude attempt may run: the per-attempt ceiling, clamped to the
 * time left. An undefined deadline means the caller set none.
 */
export function llmAttemptWindow(deadline: number | undefined, now: number): number {
  if (deadline === undefined) return LLM_ATTEMPT_TIMEOUT_MS;
  return Math.min(LLM_ATTEMPT_TIMEOUT_MS, remainingMs(deadline, now));
}

/** Is there enough time left to start (or retry) a Claude call? */
export function canStartLlmAttempt(deadline: number | undefined, now: number): boolean {
  return llmAttemptWindow(deadline, now) >= MIN_LLM_WINDOW_MS;
}

/** A fetch timeout no longer than `ceilingMs` and no later than `deadline`. */
export function fetchWindow(deadline: number, now: number, ceilingMs: number): number {
  return Math.min(ceilingMs, remainingMs(deadline, now));
}

/**
 * Resolve with `fallback` if `promise` has not settled within `ms`.
 *
 * For callees that take no AbortSignal (the shared scraper's render backends
 * chain several fallbacks, each with its own timeout, and one of them has
 * none). The underlying work is not cancelled; the caller just stops waiting.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (ms <= 0) {
    promise.catch(() => {});
    return Promise.resolve(fallback);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
