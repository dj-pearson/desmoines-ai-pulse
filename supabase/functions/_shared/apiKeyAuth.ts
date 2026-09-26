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
import { classifyCaller, expectedSecrets, isMachineCaller, presentedCredentials, timingSafeEqual } from "./callerKind.ts";
import { highestRole, isFullAdmin } from './roles.ts';

// Re-exported: several functions import it from here and the implementation
// moved to a module with no remote imports so it could be tested (WEB-BE-047).
export { timingSafeEqual };

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
 * Role values that count as administrative. Kept as one constant so a function
 * can never accidentally accept a narrower or wider set (WEB-SEC-023).
 */
export const ADMIN_ROLE_VALUES = new Set(['admin', 'root_admin']);

/**
 * THE admin check. Mirrors the client-side one (src/contexts/AuthContext.tsx):
 * 1) user_roles.role keyed by user_id, then 2) profiles.user_role keyed by user_id.
 *
 * WEB-SEC-023: eight functions used to hand-roll this as
 * `profiles.select('role').eq('id', user.id)` — wrong column AND wrong key.
 * `profiles.role` is not in the generated schema at all, so those checks fail
 * closed and lock real admins out. Everything that needs to know whether a user
 * is an admin calls this, and nothing queries the role columns directly.
 *
 * @param label - caller name, used only to tag the rejection diagnostic
 */
export async function isAdminUserId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  label = 'isAdminUserId',
): Promise<boolean> {
  // Every row, not .maybeSingle(): user_roles is unique on (user_id, role),
  // so a user can hold two grants, and maybeSingle errored (PGRST116) on
  // exactly those users - an admin who also had a 'user' row was denied.
  const { data: roleRows, error: roleErr } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  const strongest = highestRole(roleRows);
  if (isFullAdmin(strongest)) return true;

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('user_role')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile?.user_role && ADMIN_ROLE_VALUES.has(profile.user_role)) return true;

  // Surface exactly why the check rejected so the data can be fixed.
  console.error(`[${label}] admin check failed`, {
    userId,
    user_roles_roles: (roleRows ?? []).map((r: { role?: unknown }) => r?.role ?? null),
    user_roles_error: roleErr?.message ?? null,
    profiles_user_role: profile?.user_role ?? null,
    profiles_error: profileErr?.message ?? null,
  });

  return false;
}

/**
 * Every admin's user_id. Use this instead of selecting from profiles by role —
 * the returned values are user_ids (what campaign_notifications.recipient_user_id
 * and every other FK expects), not the profiles row PK (WEB-SEC-023).
 */
export async function listAdminUserIds(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: roleRows, error: roleErr } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', [...ADMIN_ROLE_VALUES]);

  if (roleErr) {
    console.error('[listAdminUserIds] user_roles query failed:', roleErr.message);
  }
  for (const row of roleRows ?? []) {
    if (row?.user_id) ids.add(row.user_id);
  }

  const { data: profileRows, error: profileErr } = await supabase
    .from('profiles')
    .select('user_id, user_role')
    .in('user_role', [...ADMIN_ROLE_VALUES]);

  if (profileErr) {
    console.error('[listAdminUserIds] profiles query failed:', profileErr.message);
  }
  for (const row of profileRows ?? []) {
    if (row?.user_id) ids.add(row.user_id);
  }

  return [...ids];
}

/**
 * Filled in by requireAdminOrApiKey when the caller authenticated with a user
 * JWT rather than a shared key. Stays null for API-key / service-role callers,
 * which have no user identity — functions that attribute a write to a person
 * (`sent_by`, `created_by`, …) must handle that.
 */
export interface AdminCaller {
  // deno-lint-ignore no-explicit-any
  user: any | null;
}

/**
 * Validate that the request carries either a valid EDGE_FUNCTION_API_KEY
 * (cron / automation) or a valid Supabase user JWT belonging to an admin
 * (admin UI). On failure returns a 401/403 Response;
 * on success returns null and the caller continues.
 *
 * @param caller - optional out-param; receives the resolved user so callers
 *   that need the admin's identity don't re-verify the JWT themselves.
 */
export async function requireAdminOrApiKey(
  req: Request,
  corsHeaders: Record<string, string>,
  caller?: AdminCaller,
): Promise<Response | null> {
  // 1) Machine callers first: EDGE_FUNCTION_API_KEY (cron, CI, the hub) or
  // SUPABASE_SERVICE_ROLE_KEY (pg_cron and other server-to-server callers).
  //
  // WEB-BE-047 moved the three timing-safe comparisons that used to sit here
  // into _shared/callerKind.ts, because nothing outside this file could ask the
  // question - and firecrawl-scraper needed to, to stop rate-limiting its own
  // orchestrator. Accepting the service-role key grants no extra privilege: it
  // is a secret with full database access, and this keeps scheduled automation
  // working without shipping EDGE_FUNCTION_API_KEY into every cron migration.
  const presented = presentedCredentials(req);
  const bearer = presented.bearer ?? '';
  if (isMachineCaller(classifyCaller(presented, expectedSecrets()))) {
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

  if (await isAdminUserId(supabase, userRes.user.id, 'requireAdminOrApiKey')) {
    if (caller) caller.user = userRes.user;
    return null;
  }

  // Diagnostic detail is logged server-side above; the client body stays generic
  // so we don't leak user ids / role internals to callers.
  return new Response(
    JSON.stringify({ error: 'Admin role required' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}

