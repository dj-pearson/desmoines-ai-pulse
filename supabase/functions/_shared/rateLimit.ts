/**
 * Rate limiting middleware for Supabase Edge Functions
 *
 * Uses database-backed storage (rate_limit_entries table) for persistent,
 * distributed rate limiting that survives cold starts. Falls back to
 * in-memory storage if database is unavailable.
 *
 * Rate Limit Tiers:
 *  - Read operations (default):     100 req / 15 min per client
 *  - Write operations:               30 req / 15 min per client
 *  - AI/LLM operations:              10 req / 15 min per client
 *  - Checkout/payment operations:     10 req / 15 min per client
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { classifyCaller, expectedSecrets, isMachineCaller, presentedCredentials } from "./callerKind.ts";
import { getClientIp } from "./clientIp.ts";

// getClientIp lives in clientIp.ts (no imports) so offline-tested modules can
// share it. Re-exported for callers that already import this file.
export { getClientIp };

import {
  checkRateLimitMemory,
  getClientIdentifier,
  memoryStore,
  tooManyRequestsResponse,
  type RateLimitOptions,
  type RateLimitResult,
} from "./rateLimitCore.ts";

// The in-memory limiter, the client key and the 429 builder live in
// rateLimitCore.ts (no remote imports) so they can be tested offline.
// Re-exported so existing callers keep importing from this file.
export { checkRateLimit, rateLimitCorsHeaders, RATE_LIMIT_EXPOSED_HEADERS } from "./rateLimitCore.ts";
export type { RateLimitOptions, RateLimitResult } from "./rateLimitCore.ts";

/**
 * Attempt database-backed rate limit check via the check_rate_limit RPC function.
 * Returns null if database is unavailable (triggers fallback).
 */
async function checkRateLimitDB(
  req: Request,
  clientId: string,
  endpoint: string,
  windowMs: number,
  max: number,
  message: string,
): Promise<RateLimitResult | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) return null;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_client_id: clientId,
      p_endpoint: endpoint,
      p_window_ms: windowMs,
      p_max_requests: max,
    });

    if (error || !data || data.length === 0) return null;

    const result = data[0];
    const resetTime = new Date(result.reset_at).getTime();

    if (!result.allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      return {
        success: false,
        limit: result.max_allowed,
        remaining: 0,
        resetTime,
        // The caller's message, as the in-memory path already sends. This
        // used to be a fixed string, so moving an endpoint to the persistent
        // limiter silently changed what its 429 said.
        response: tooManyRequestsResponse(req, {
          message,
          limit: result.max_allowed,
          resetTime,
          retryAfter,
        }),
      };
    }

    return {
      success: true,
      limit: result.max_allowed,
      remaining: result.remaining,
      resetTime,
    };
  } catch {
    // Database unavailable — fall through to in-memory
    return null;
  }
}

/**
 * Check if request is rate limited using persistent database storage.
 * Survives cold starts and works across distributed serverless instances.
 * Falls back to in-memory if database is unavailable.
 *
 * Use this for critical endpoints (auth, payments, AI) where
 * persistent rate limiting is important.
 */
export async function checkRateLimitPersistent(
  req: Request,
  options: RateLimitOptions = {},
): Promise<RateLimitResult> {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;
  const message = options.message || 'Too many requests, please try again later.';
  const endpoint = options.endpoint || 'default';

  if (options.exemptInternal && isMachineCaller(classifyCaller(presentedCredentials(req), expectedSecrets()))) {
    // Logged, not silent: "the limit did not apply" and "the limit was not
    // reached" produce the same 200, and only one of them is a decision.
    console.log(`[rateLimit] endpoint="${endpoint}" exempt: internal caller`);
    return { success: true, limit: max, remaining: max, resetTime: Date.now() + windowMs };
  }

  const clientId = getClientIdentifier(req, options.userId);

  // Try database-backed rate limiting first
  const dbResult = await checkRateLimitDB(req, clientId, endpoint, windowMs, max, message);
  if (dbResult) return dbResult;

  // FAIL OPEN: a DB-lookup miss/outage must never break the product. The
  // in-memory fallback below still throttles within a warm isolate, but we
  // log so a persistent DB problem is visible rather than silently degrading.
  console.warn(
    `[rateLimit] persistent check unavailable for endpoint="${endpoint}" — falling back to in-memory (fail-open)`,
  );

  // Fallback to in-memory
  return checkRateLimitMemory(req, clientId, windowMs, max, message);
}

/**
 * Decrement rate limit counter (for failed requests that shouldn't count).
 * Only works with in-memory fallback — DB-backed uses atomic upsert.
 */
export function decrementRateLimit(req: Request, windowMs: number = 15 * 60 * 1000) {
  const identifier = getClientIdentifier(req);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${identifier}:${windowStart}`;

  if (memoryStore[key] && memoryStore[key].count > 0) {
    memoryStore[key].count--;
  }
}

/**
 * Get current rate limit status.
 */
export function getRateLimitStatus(
  req: Request,
  options: RateLimitOptions = {},
): { count: number; limit: number; remaining: number; resetTime: number } {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;

  const identifier = getClientIdentifier(req);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetTime = windowStart + windowMs;
  const key = `${identifier}:${windowStart}`;

  const entry = memoryStore[key];
  const count = entry ? entry.count : 0;
  const remaining = Math.max(0, max - count);

  return { count, limit: max, remaining, resetTime };
}

/**
 * Add rate limit headers to response.
 */
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult,
): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Limit', result.limit.toString());
  headers.set('X-RateLimit-Remaining', result.remaining.toString());
  headers.set('X-RateLimit-Reset', result.resetTime.toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
