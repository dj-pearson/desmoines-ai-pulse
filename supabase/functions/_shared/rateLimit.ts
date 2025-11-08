/**
 * Rate limiting middleware for Supabase Edge Functions
 * Uses in-memory storage (resets on function cold start)
 * For production, consider using Upstash Redis or Supabase tables
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  max?: number; // Maximum requests per window
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  response?: Response;
}

/**
 * Get client identifier from request
 * Uses IP address or Authorization header
 */
function getClientIdentifier(req: Request): string {
  // Try to get IP from headers
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';

  // Include auth token in identifier for authenticated requests
  const authHeader = req.headers.get('authorization');
  if (authHeader) {
    // Use first 8 chars of token for privacy
    const tokenHash = authHeader.substring(0, 20);
    return `${ip}:${tokenHash}`;
  }

  return ip;
}

/**
 * Clean up expired entries from store
 */
function cleanupStore() {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}

/**
 * Check if request is rate limited
 */
export function checkRateLimit(
  req: Request,
  options: RateLimitOptions = {}
): RateLimitResult {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
  const max = options.max || 100; // 100 requests default
  const message = options.message || 'Too many requests, please try again later.';

  const identifier = getClientIdentifier(req);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetTime = windowStart + windowMs;
  const key = `${identifier}:${windowStart}`;

  // Cleanup old entries periodically (every 100 requests)
  if (Math.random() < 0.01) {
    cleanupStore();
  }

  // Get or create rate limit entry
  if (!store[key]) {
    store[key] = {
      count: 0,
      resetTime,
    };
  }

  const entry = store[key];
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
        JSON.stringify({
          error: message,
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': max.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
            'Retry-After': retryAfter.toString(),
          },
        }
      ),
    };
  }

  return {
    success: true,
    limit: max,
    remaining,
    resetTime,
  };
}

/**
 * Decrement rate limit counter (for failed requests that shouldn't count)
 */
export function decrementRateLimit(req: Request, windowMs: number = 15 * 60 * 1000) {
  const identifier = getClientIdentifier(req);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${identifier}:${windowStart}`;

  if (store[key] && store[key].count > 0) {
    store[key].count--;
  }
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(
  req: Request,
  options: RateLimitOptions = {}
): { count: number; limit: number; remaining: number; resetTime: number } {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 100;

  const identifier = getClientIdentifier(req);
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetTime = windowStart + windowMs;
  const key = `${identifier}:${windowStart}`;

  const entry = store[key];
  const count = entry ? entry.count : 0;
  const remaining = Math.max(0, max - count);

  return {
    count,
    limit: max,
    remaining,
    resetTime,
  };
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: Response,
  result: RateLimitResult
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
