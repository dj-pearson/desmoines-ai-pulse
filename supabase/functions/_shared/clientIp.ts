/**
 * Resolve the trusted client IP.
 *
 * Its own module, with no imports, so the AI quota guard can key anonymous
 * callers the same way the rate limiter does and still be tested offline
 * (rateLimit.ts imports supabase-js from esm.sh).
 *
 * SECURITY: `X-Forwarded-For` is a client-controllable header - the LEFTMOST
 * entry is whatever the caller wrote, so keying on it lets an attacker forge a
 * fresh identity per request and evade the limit entirely. We therefore prefer
 * Cloudflare's `CF-Connecting-IP` (set by the trusted edge in front of
 * Supabase), then `X-Real-IP`, and only fall back to the RIGHTMOST XFF entry
 * (the hop appended by the trusted proxy, not the spoofable client value).
 */
export function getClientIp(req: Request): string {
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
