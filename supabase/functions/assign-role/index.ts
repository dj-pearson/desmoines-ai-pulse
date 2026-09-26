/**
 * assign-role — server-authoritative role assignment.
 *
 * Role escalation must be impossible from the browser. Previously the web
 * client wrote public.user_roles directly with `assigned_by` set client-side,
 * and the validate_role_assignment trigger trusts that column (and skips all
 * checks when it is NULL) — so a crafted insert could self-escalate. This
 * function is now the ONLY sanctioned write path:
 *   1. verify the caller's JWT,
 *   2. confirm the caller is admin/root_admin SERVER-side,
 *   3. enforce the assignment hierarchy,
 *   4. write user_roles with the service client (assigned_by = verified caller),
 *   5. record an immutable security_audit_logs row (actor, target, old, new).
 *
 * RLS on user_roles denies INSERT/UPDATE/DELETE to authenticated/anon, so the
 * old direct-write path no longer works.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { getCorsHeaders, handleCors } from '../_shared/cors.ts';
import {
  decideRoleChange,
  highestRole,
  isRole,
  planRoleWrite,
  ROLE_PRECEDENCE,
  type Role,
  type RoleRow,
} from '../_shared/roles.ts';

const VALID_ROLES: readonly Role[] = ROLE_PRECEDENCE;

function json(body: unknown, status = 200, corsHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  // This function imported `corsHeaders`, which _shared/cors.ts has never
  // exported - it exports getCorsHeaders(origin) and handleCors(req), because
  // the allowed origin is decided per request. Deno throws
  // "The requested module does not provide an export named 'corsHeaders'" at
  // MODULE LOAD, so assign-role could not start at all and every role
  // assignment through it failed. It is a deployed function, so this was live.
  //
  // Nothing caught it: tsconfig excludes supabase/, eslint runs no type-aware
  // rules, and npm run check-imports covers src/ only. The edge type check
  // added today is what surfaced it (WEB-QA-001's defect class, in the
  // directory that guard does not reach).
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get('origin') || undefined);
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured' }, 500, corsHeaders);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // 1) Verify caller JWT
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return json({ error: 'Authentication required' }, 401, corsHeaders);

  const { data: callerRes, error: callerErr } = await admin.auth.getUser(bearer);
  if (callerErr || !callerRes?.user) return json({ error: 'Invalid or expired token' }, 401, corsHeaders);
  const callerId = callerRes.user.id;

  // 2) Confirm caller is admin/root_admin server-side (user_roles then profiles)
  const caller = await readRoles(admin, callerId);
  if (!caller) return json({ error: 'Failed to read roles' }, 500, corsHeaders);
  const callerRole = caller.role;
  if (callerRole !== 'admin' && callerRole !== 'root_admin') {
    return json({ error: 'Admin role required' }, 403, corsHeaders);
  }

  // Parse + validate input
  let payload: { targetUserId?: string; role?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  const targetUserId = payload.targetUserId?.trim();
  const role = payload.role as Role | undefined;

  if (!targetUserId) return json({ error: 'targetUserId is required' }, 400, corsHeaders);
  if (!isRole(role)) {
    return json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, 400, corsHeaders);
  }

  // The target's current rows decide both the hierarchy check and the write.
  // A failed read refuses rather than guesses: read as "no rows", it would
  // take the INSERT branch and add a second grant (WEB-BE-032 AC2), and it
  // would rank the target as 'user' and let an admin past the check below.
  const target = await readRoles(admin, targetUserId);
  if (!target) return json({ error: 'Failed to assign role' }, 500, corsHeaders);
  const oldRole = target.role;

  // 3) Hierarchy (_shared/roles.ts): only root_admin grants admin or
  // root_admin, nobody changes their own role, and an admin cannot change the
  // role of an admin or root_admin.
  const decision = decideRoleChange({
    callerId,
    callerRole,
    targetId: targetUserId,
    current: oldRole,
    next: role,
  });
  if (!decision.ok) return json({ error: decision.reason }, 403, corsHeaders);

  // 4) Write with the service client. assigned_by = verified caller, so the
  // validate_role_assignment trigger re-checks against a trustworthy actor.
  // A user can hold several rows; the new role becomes their only one, or the
  // strongest leftover row would still win.
  const plan = planRoleWrite(target.rows, role);
  let writeErr: { message: string } | null = null;
  if (plan.deleteIds.length > 0) {
    ({ error: writeErr } = await admin.from('user_roles').delete().in('id', plan.deleteIds));
  }
  if (!writeErr && plan.updateId) {
    ({ error: writeErr } = await admin
      .from('user_roles')
      .update({ role, assigned_by: callerId, assigned_at: new Date().toISOString() })
      .eq('id', plan.updateId));
  }
  if (!writeErr && plan.insert) {
    ({ error: writeErr } = await admin
      .from('user_roles')
      .insert({ user_id: targetUserId, role, assigned_by: callerId }));
  }

  if (writeErr) {
    console.error('[assign-role] write failed:', writeErr.message);
    return json({ error: 'Failed to assign role' }, 500, corsHeaders);
  }

  // 5) Immutable audit row (actor, target, old_role, new_role, timestamp).
  const { error: auditErr } = await admin.from('security_audit_logs').insert({
    event_type: 'role_assignment',
    identifier: callerId,
    user_id: callerId,
    resource: 'user_roles',
    action: 'assign_role',
    severity: role === 'root_admin' || role === 'admin' ? 'high' : role === 'moderator' ? 'medium' : 'low',
    details: {
      actor: callerId,
      actor_role: callerRole,
      target_user_id: targetUserId,
      old_role: oldRole,
      new_role: role,
    },
  });
  if (auditErr) {
    // Never fail the operation on an audit-write hiccup, but make it visible.
    console.error('[assign-role] audit log failed:', auditErr.message);
  }

  return json({ success: true, targetUserId, role, previousRole: oldRole }, 200, corsHeaders);
});

/**
 * A user's role rows and effective role: the strongest user_roles row, or
 * profiles.user_role when there are no rows. Returns null when user_roles
 * cannot be read, because every caller of this makes an authorization
 * decision and "unknown" must not turn into "user".
 */
async function readRoles(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ role: Role; rows: RoleRow[] } | null> {
  const { data, error: roleErr } = await admin
    .from('user_roles')
    .select('id, role')
    .eq('user_id', userId);
  if (roleErr) {
    console.error(`[assign-role] user_roles read failed for ${userId}: ${roleErr.message}`);
    return null;
  }
  const rows = (data ?? []) as RoleRow[];
  if (rows.length > 0) return { role: highestRole(rows), rows };

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('user_role')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileErr) console.warn(`[assign-role] profiles read failed for ${userId}: ${profileErr.message}`);
  const legacy = (profile as { user_role?: unknown } | null)?.user_role;
  return { role: isRole(legacy) ? legacy : 'user', rows };
}
