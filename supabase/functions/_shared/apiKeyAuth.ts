/**
 * API Key authentication middleware for edge functions.
 *
 * Used by data-processing and admin-triggered functions that
 * cannot use JWT auth (cron jobs, GitHub Actions, admin scripts).
 *
 * The API key is stored as a Supabase secret (EDGE_FUNCTION_API_KEY)
 * and must be passed in the X-API-Key header or Authorization header.
 */

export interface ApiKeyAuthResult {
  success: boolean;
  error?: string;
}

/**
 * Validate an API key from the request against the stored secret.
 *
 * Checks (in order):
 * 1. X-API-Key header
 * 2. Authorization: Bearer <key> header
 *
 * @param req - The incoming request
 * @returns AuthResult with success=true if valid, or an error message
 */
export function validateApiKey(req: Request): ApiKeyAuthResult {
  const expectedKey = Deno.env.get('EDGE_FUNCTION_API_KEY');

  // If no API key is configured, allow the request (backwards compatibility)
  // Once the key is set via `supabase secrets set EDGE_FUNCTION_API_KEY=<key>`,
  // all requests without a valid key will be rejected.
  if (!expectedKey) {
    return { success: true };
  }

  // Check X-API-Key header first
  const apiKeyHeader = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (apiKeyHeader && timingSafeEqual(apiKeyHeader, expectedKey)) {
    return { success: true };
  }

  // Check Authorization: Bearer <key>
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token && timingSafeEqual(token, expectedKey)) {
      return { success: true };
    }
  }

  return {
    success: false,
    error: 'Invalid or missing API key. Provide via X-API-Key header.',
  };
}

/**
 * Middleware wrapper that returns a 401 response if the API key is invalid.
 */
export function requireApiKey(req: Request, corsHeaders: Record<string, string>): Response | null {
  const result = validateApiKey(req);

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: result.error }),
      {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  return null; // Auth passed, continue processing
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }

  return result === 0;
}
