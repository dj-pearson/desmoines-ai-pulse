/**
 * API Key authentication middleware for edge functions.
 *
 * Used by data-processing and admin-triggered functions that
 * cannot use JWT auth (cron jobs, GitHub Actions, admin scripts).
 *
 * The API key is stored as a Supabase secret (EDGE_FUNCTION_API_KEY)
 * and must be passed in the X-API-Key header or Authorization header.
 *
 * For functions triggered from the admin UI, prefer requireAdminOrApiKey,
 * which also accepts a valid admin user JWT — so the browser doesn't
 * need to ship the shared API key.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

  // Fail closed in production: reject all requests when API key is not configured.
  // In development, allow with a warning for ease of testing.
  if (!expectedKey) {
    const env = Deno.env.get('ENVIRONMENT') || 'development';
    if (env === 'production') {
      console.error('EDGE_FUNCTION_API_KEY is not configured in production — rejecting request');
      return { success: false, error: 'API key authentication is not configured' };
    }
    console.warn('WARNING: EDGE_FUNCTION_API_KEY is not set. Allowing request in non-production environment.');
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
 * Validate that the request carries either a valid EDGE_FUNCTION_API_KEY
 * (cron / automation) or a valid Supabase user JWT belonging to a profile
 * with role='admin' (admin UI). On failure returns a 401/403 Response;
 * on success returns null and the caller continues.
 */
export async function requireAdminOrApiKey(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  // 1) Try API key first — both X-API-Key and Authorization: Bearer <key>
  const expectedKey = Deno.env.get('EDGE_FUNCTION_API_KEY');
  const apiKeyHeader = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  if (expectedKey && apiKeyHeader && timingSafeEqual(apiKeyHeader, expectedKey)) {
    return null;
  }

  const authHeader = req.headers.get('Authorization') || '';
  const [scheme, token] = authHeader.split(' ');
  const bearer = scheme?.toLowerCase() === 'bearer' ? token : '';

  if (expectedKey && bearer && timingSafeEqual(bearer, expectedKey)) {
    return null;
  }

  // 2) Otherwise try treating the bearer as a user JWT and checking admin role.
  if (!bearer) {
    return new Response(
      JSON.stringify({ error: 'Missing Authorization bearer token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Server is not configured for JWT verification' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: userRes, error: userErr } = await supabase.auth.getUser(bearer);
  if (userErr || !userRes?.user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: 'Admin role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  return null;
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
