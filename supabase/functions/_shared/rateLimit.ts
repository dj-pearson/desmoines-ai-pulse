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

// In-memory fallback store (used when DB is unavailable)
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}
const memoryStore: RateLimitStore = {};

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
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  response?: Response;
}

/**
 * Resolve the trusted client IP.
 *
 * SECURITY: `X-Forwarded-For` is a client-controllable header — the LEFTMOST
 * entry is whatever the caller wrote, so keying on it lets an attacker forge a
 * fresh identity per request and evade the limit entirely. We therefore prefer
 * Cloudflare's `CF-Connecting-IP` (set by the trusted edge in front of
 * Supabase), then `X-Real-IP`, and only fall back to the RIGHTMOST XFF entry
 * (the hop appended by the trusted proxy, not the spoofable client value).
 */
function getClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1]; // rightmost = trusted hop
  }

  return 'unknown';
}

/**
 * Get client identifier for rate limiting.
 * When a verified userId is supplied, the limit is keyed per-user; otherwise
 * it falls back to the trusted client IP (for anonymous-allowed endpoints).
 */
function getClientIdentifier(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  return `ip:${getClientIp(req)}`;
}

/**
 * Attempt database-backed rate limit check via the check_rate_limit RPC function.
 * Returns null if database is unavailable (triggers fallback).
 */
async function checkRateLimitDB(
  clientId: string,
  endpoint: string,
  windowMs: number,
  max: number,
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
        response: new Response(
          JSON.stringify({
            error: 'Too many requests, please try again later.',
            retryAfter,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': result.max_allowed.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': resetTime.toString(),
              'Retry-After': retryAfter.toString(),
            },
          },
        ),
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
 * In-memory fallback rate limit check (original implementation).
 */
function checkRateLimitMemory(
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
      response: new Response(
        JSON.stringify({ error: message, retryAfter }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': max.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
            'Retry-After': retryAfter.toString(),
          },
        },
      ),
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
  return checkRateLimitMemory(clientId, windowMs, max, message);
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

  const clientId = getClientIdentifier(req, options.userId);

  // Try database-backed rate limiting first
  const dbResult = await checkRateLimitDB(clientId, endpoint, windowMs, max);
  if (dbResult) return dbResult;

  // FAIL OPEN: a DB-lookup miss/outage must never break the product. The
  // in-memory fallback below still throttles within a warm isolate, but we
  // log so a persistent DB problem is visible rather than silently degrading.
  console.warn(
    `[rateLimit] persistent check unavailable for endpoint="${endpoint}" — falling back to in-memory (fail-open)`,
  );

  // Fallback to in-memory
  return checkRateLimitMemory(clientId, windowMs, max, message);
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
