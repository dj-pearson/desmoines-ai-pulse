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

  // 1b) Accept the Supabase service-role key as a trusted internal caller.
  // pg_cron jobs (and other server-to-server callers) authenticate with
  // `Authorization: Bearer <service_role_key>`. The service-role key is a
  // secret with full DB access, so accepting it grants no extra privilege —
  // it keeps scheduled automation working without shipping the shared
  // EDGE_FUNCTION_API_KEY into every cron migration.
  const serviceRoleKeyEarly = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceRoleKeyEarly && bearer && timingSafeEqual(bearer, serviceRoleKeyEarly)) {
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
    console.error('[requireAdminOrApiKey] auth.getUser failed:', userErr?.message ?? 'no user returned');
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Match the client-side admin check (src/contexts/AuthContext.tsx):
  // 1) user_roles.role keyed by user_id, then 2) profiles.user_role keyed by user_id.
  // Accepted values: 'admin' or 'root_admin'.
  const ADMIN_VALUES = new Set(['admin', 'root_admin']);
  const userId = userRes.user.id;

  const { data: roleRow, error: roleErr } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (roleRow?.role && ADMIN_VALUES.has(roleRow.role)) return null;

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('user_role')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.user_role && ADMIN_VALUES.has(profile.user_role)) return null;

  // Surface exactly why the check rejected so the user can fix the data.
  console.error('[requireAdminOrApiKey] admin check failed', {
    userId,
    userEmail: userRes.user.email,
    user_roles_role: roleRow?.role ?? null,
    user_roles_error: roleErr?.message ?? null,
    profiles_user_role: profile?.user_role ?? null,
    profiles_error: profileErr?.message ?? null,
  });

  return new Response(
    JSON.stringify({
      error: 'Admin role required',
      debug: {
        userId,
        user_roles_role: roleRow?.role ?? null,
        profiles_user_role: profile?.user_role ?? null,
        user_roles_error: roleErr?.message ?? null,
        profiles_error: profileErr?.message ?? null,
      },
    }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
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
