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
import { corsHeaders } from '../_shared/cors.ts';

type Role = 'user' | 'moderator' | 'admin' | 'root_admin';
const VALID_ROLES: Role[] = ['user', 'moderator', 'admin', 'root_admin'];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server not configured' }, 500);
  }
  const admin = createClient(supabaseUrl, serviceKey);

  // 1) Verify caller JWT
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return json({ error: 'Authentication required' }, 401);

  const { data: callerRes, error: callerErr } = await admin.auth.getUser(bearer);
  if (callerErr || !callerRes?.user) return json({ error: 'Invalid or expired token' }, 401);
  const callerId = callerRes.user.id;

  // 2) Confirm caller is admin/root_admin server-side (user_roles then profiles)
  const callerRole = await resolveRole(admin, callerId);
  if (callerRole !== 'admin' && callerRole !== 'root_admin') {
    return json({ error: 'Admin role required' }, 403);
  }

  // Parse + validate input
  let payload: { targetUserId?: string; role?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const targetUserId = payload.targetUserId?.trim();
  const role = payload.role as Role | undefined;

  if (!targetUserId) return json({ error: 'targetUserId is required' }, 400);
  if (!role || !VALID_ROLES.includes(role)) {
    return json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, 400);
  }

  // 3) Hierarchy: only root_admin may grant admin/root_admin.
  if ((role === 'root_admin' || role === 'admin') && callerRole !== 'root_admin') {
    return json({ error: 'Only a root_admin can assign admin or root_admin roles' }, 403);
  }
  // Nobody can change their OWN role (no self-escalation / self-lockout).
  if (targetUserId === callerId) {
    return json({ error: 'You cannot change your own role' }, 403);
  }

  // Capture the previous role for the audit trail.
  const oldRole = await resolveRole(admin, targetUserId);

  // 4) Write with the service client. assigned_by = verified caller, so the
  // existing validate_role_assignment trigger re-checks against a trustworthy
  // actor (not a client-supplied value).
  const { data: existing } = await admin
    .from('user_roles')
    .select('id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  let writeErr;
  if (existing?.id) {
    ({ error: writeErr } = await admin
      .from('user_roles')
      .update({ role, assigned_by: callerId, assigned_at: new Date().toISOString() })
      .eq('id', existing.id));
  } else {
    ({ error: writeErr } = await admin
      .from('user_roles')
      .insert({ user_id: targetUserId, role, assigned_by: callerId }));
  }

  if (writeErr) {
    console.error('[assign-role] write failed:', writeErr.message);
    return json({ error: 'Failed to assign role' }, 500);
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

  return json({ success: true, targetUserId, role, previousRole: oldRole });
});

/** Resolve a user's effective role from user_roles, falling back to profiles. */
async function resolveRole(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<Role> {
  const { data: roleRow } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (roleRow?.role && VALID_ROLES.includes(roleRow.role as Role)) return roleRow.role as Role;

  const { data: profile } = await admin
    .from('profiles')
    .select('user_role')
    .eq('user_id', userId)
    .maybeSingle();
  if (profile?.user_role && VALID_ROLES.includes(profile.user_role as Role)) {
    return profile.user_role as Role;
  }
  return 'user';
}
