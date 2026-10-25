/**
 * The parts of the rate limiter that need no network: the in-memory store,
 * the client key, and the 429 response both limiters return.
 *
 * Split out of rateLimit.ts so a Deno test can import it offline. rateLimit.ts
 * imports supabase-js from esm.sh for the persistent path, which nothing in
 * the offline test lanes can load. rateLimit.ts re-exports everything here, so
 * callers keep importing from rateLimit.ts.
 */

import { getClientIp } from './clientIp.ts';
import { getCorsHeaders, isOriginAllowed } from './cors.ts';

// In-memory fallback store (used when DB is unavailable)
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}
export const memoryStore: RateLimitStore = {};

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  endpoint?: string;
  /**
   * Verified user id (from auth.getUser, NOT from a client-supplied field).
   * When set, the limit is keyed per-user so a single shared NAT/IP can't
   * exhaust everyone's budget and so one user can't dodge the limit by
   * rotating IPs. Only pass this once the JWT has actually been verified.
   */
  userId?: string;
  /**
   * Skip the limit for a caller presenting EDGE_FUNCTION_API_KEY or
   * SUPABASE_SERVICE_ROLE_KEY (WEB-BE-047).
   *
   * THE CASE FOR IT. firecrawl-scraper allows 10 requests per 15 minutes keyed
   * by client IP; scrape-events invokes it once per scraping job from ONE
   * egress address, and there are 15 seeded jobs. The limit was throttling the
   * site's own ingestion, which is the opposite of what it is for.
   *
   * WHY IT COSTS NOTHING. Both credentials already authorise this function's
   * entire surface, and the service-role key authorises the whole database.
   * Throttling a caller that holds one protects nothing - it can do the damage
   * directly. The limit stays for anonymous and user-authenticated callers,
   * which is who it was written for.
   *
   * OPT-IN per endpoint, never a default: an endpoint that costs money per
   * call may want a ceiling even on internal traffic.
   */
  exemptInternal?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  response?: Response;
}

/**
 * Get client identifier for rate limiting.
 * When a verified userId is supplied, the limit is keyed per-user; otherwise
 * it falls back to the trusted client IP (for anonymous-allowed endpoints).
 */
export function getClientIdentifier(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  return `ip:${getClientIp(req)}`;
}

/**
 * Headers a browser can read on a cross-origin response only when they are
 * listed in Access-Control-Expose-Headers. Without this, the client sees the
 * 429 but not when it may retry.
 */
export const RATE_LIMIT_EXPOSED_HEADERS =
  'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset';

/**
 * CORS headers for a 429, keyed to the request's Origin.
 *
 * Every caller returns the limiter's 429 as-is, and it used to carry no CORS
 * headers at all. The browser then refused the response, supabase-js reported
 * a network error, and the client's "rate limit exceeded" branch
 * (useTripPlanner, among others) never ran. Only manage-subscription wrapped it
 * in addCorsHeaders, which still works: that call sets the same headers again.
 *
 * The request's Origin is echoed only when it is on the allow-list; anything
 * else gets the default allowed origin, which a foreign page cannot read.
 */
export function rateLimitCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  return {
    ...getCorsHeaders(origin && isOriginAllowed(origin) ? origin : undefined),
    'Access-Control-Expose-Headers': RATE_LIMIT_EXPOSED_HEADERS,
    'Vary': 'Origin',
  };
}

/**
 * The 429 both limiters return: the caller's message, the retry time, the
 * X-RateLimit-* headers, and CORS for the requesting origin.
 */
export function tooManyRequestsResponse(
  req: Request,
  args: { message: string; limit: number; resetTime: number; retryAfter: number },
): Response {
  return new Response(
    JSON.stringify({ error: args.message, retryAfter: args.retryAfter }),
    {
      status: 429,
      headers: {
        ...rateLimitCorsHeaders(req),
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': args.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': args.resetTime.toString(),
        'Retry-After': args.retryAfter.toString(),
      },
    },
  );
}

/**
 * In-memory fallback rate limit check (original implementation).
 */
export function checkRateLimitMemory(
  req: Request,
  clientId: string,
  windowMs: number,
  max: number,
  message: string,
): RateLimitResult {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetTime = windowStart + windowMs;
  const key = `${clientId}:${windowStart}`;

  // Cleanup old entries periodically
  if (Math.random() < 0.01) {
    for (const k in memoryStore) {
      if (memoryStore[k].resetTime < now) {
        delete memoryStore[k];
      }
    }
  }

  if (!memoryStore[key]) {
    memoryStore[key] = { count: 0, resetTime };
  }

  const entry = memoryStore[key];
  entry.count++;

  const remaining = Math.max(0, max - entry.count);

  if (entry.count > max) {
    const retryAfter = Math.ceil((resetTime - now) / 1000);
    return {
      success: false,
      limit: max,
      remaining: 0,
      resetTime,
      response: tooManyRequestsResponse(req, { message, limit: max, resetTime, retryAfter }),
    };
  }

  return { success: true, limit: max, remaining, resetTime };
}

/**
 * Check if request is rate limited (synchronous, in-memory).
 * Backward-compatible with all existing callers.
 *
 * For database-backed persistent rate limiting, use checkRateLimitPersistent().
 */
export function checkRateLimit(
  req: Request,
  options: RateLimitOptions = {},
): RateLimitResult {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;
  const message = options.message || 'Too many requests, please try again later.';

  const clientId = getClientIdentifier(req);
  return checkRateLimitMemory(req, clientId, windowMs, max, message);
}
