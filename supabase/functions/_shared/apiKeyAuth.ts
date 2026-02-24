/**
 * API Key Authentication Middleware for Edge Functions
 *
 * Validates the X-API-Key header against the WORKER_API_KEY secret.
 * Used for data processing endpoints (scrapers, crawlers, bulk operations)
 * that are triggered by automated systems (GitHub Actions, cron jobs)
 * rather than end-user browsers.
 *
 * Usage:
 *   import { validateApiKey, apiKeyAuthError } from '../_shared/apiKeyAuth.ts';
 *
 *   serve(async (req) => {
 *     if (req.method === 'OPTIONS') { ... }
 *     const authResult = validateApiKey(req);
 *     if (!authResult.valid) {
 *       return apiKeyAuthError(authResult.error);
 *     }
 *     // ... handler logic
 *   });
 */

import { corsHeaders } from './cors.ts';

export interface ApiKeyAuthResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate the X-API-Key header against the WORKER_API_KEY secret.
 * Returns { valid: true } if the key matches, or { valid: false, error: string } otherwise.
 */
export function validateApiKey(req: Request): ApiKeyAuthResult {
  const workerApiKey = Deno.env.get('WORKER_API_KEY');

  if (!workerApiKey) {
    console.error('WORKER_API_KEY secret is not configured');
    return { valid: false, error: 'Server misconfiguration: API key not set' };
  }

  const providedKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');

  if (!providedKey) {
    return { valid: false, error: 'Missing X-API-Key header' };
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(providedKey, workerApiKey)) {
    return { valid: false, error: 'Invalid API key' };
  }

  return { valid: true };
}

/**
 * Create a 401 Unauthorized response for failed API key validation.
 */
export function apiKeyAuthError(message?: string): Response {
  return new Response(
    JSON.stringify({ error: message || 'Unauthorized' }),
    {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);

  let result = 0;
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }

  return result === 0;
}
