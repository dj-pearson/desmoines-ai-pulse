/**
 * Role ranking for edge functions. The server half of src/lib/roles.ts.
 *
 * A user_roles row is a grant, and a user can hold more than one (the table is
 * unique on (user_id, role), not on user_id). Code that read the table with
 * .maybeSingle() got PGRST116 for a two-row user and treated the error as "no
 * role": isAdminUserId denied a real admin, and assign-role returned 500 for
 * any target with two rows. Read every row and take the strongest.
 *
 * ROLE_PRECEDENCE must match src/lib/roles.ts; roles.test.ts imports that file
 * and fails if the two lists drift.
 *
 * Pure: no Supabase client, no Deno APIs, so it is tested directly.
 */

export type Role = 'user' | 'moderator' | 'admin' | 'root_admin';

/** Strongest first. The index is the rank; lower wins. */
export const ROLE_PRECEDENCE: readonly Role[] = ['root_admin', 'admin', 'moderator', 'user'];

export const DEFAULT_ROLE: Role = 'user';

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLE_PRECEDENCE as readonly string[]).includes(value);
}

/** Rank of a role; unknown values rank as 'user' so they never grant anything. */
export function roleRank(role: unknown): number {
  return isRole(role) ? ROLE_PRECEDENCE.indexOf(role) : ROLE_PRECEDENCE.indexOf(DEFAULT_ROLE);
}

/** The strongest role among the rows. No rows, or only unknown values, is 'user'. */
export function highestRole(
  rows: ReadonlyArray<{ role?: unknown } | null | undefined> | null | undefined,
): Role {
  let best = roleRank(DEFAULT_ROLE);
  for (const row of rows ?? []) {
    const rank = roleRank(row?.role);
    if (rank < best) best = rank;
  }
  return ROLE_PRECEDENCE[best];
}

export function isFullAdmin(role: Role): boolean {
  return role === 'admin' || role === 'root_admin';
}

export type RoleChangeDecision = { ok: true } | { ok: false; reason: string };

/**
 * May `caller` move `target` from `current` to `next`?
 *
 * - Only admin and root_admin assign roles at all.
 * - Nobody changes their own role.
 * - Only root_admin grants admin or root_admin.
 * - An admin may only change someone ranked below admin. Without this an admin
 *   could demote a root_admin, or another admin, to 'user'. root_admin may
 *   change anyone else, including another root_admin.
 */
export function decideRoleChange(input: {
  callerId: string;
  callerRole: Role;
  targetId: string;
  current: Role;
  next: Role;
}): RoleChangeDecision {
  const { callerId, callerRole, targetId, current, next } = input;
  if (!isFullAdmin(callerRole)) return { ok: false, reason: 'Admin role required' };
  if (callerId === targetId) return { ok: false, reason: 'You cannot change your own role' };
  if (callerRole === 'root_admin') return { ok: true };
  if (isFullAdmin(next)) {
    return { ok: false, reason: 'Only a root_admin can assign admin or root_admin roles' };
  }
  if (roleRank(current) <= roleRank(callerRole)) {
    return {
      ok: false,
      reason: `Only a root_admin can change the role of a user who is ${current}`,
    };
  }
  return { ok: true };
}

export interface RoleRow {
  id: string;
  role: unknown;
}

export interface RoleWritePlan {
  /** Rows to delete first. They are never the user's only grant of their current role. */
  deleteIds: string[];
  /** Row to set to the new role, or null when none needs updating. */
  updateId: string | null;
  /** True when the user has no rows and one must be inserted. */
  insert: boolean;
}

/**
 * How to make `next` the user's only role, given their current rows.
 *
 * Keeps the row that already holds `next` if there is one (updating another row
 * to `next` would hit the (user_id, role) unique key), otherwise the strongest
 * row, and deletes the rest. Deletes run before the update, so if the update
 * fails the strongest row is still in place and the effective role has not
 * changed.
 */
export function planRoleWrite(rows: ReadonlyArray<RoleRow>, next: Role): RoleWritePlan {
  if (rows.length === 0) return { deleteIds: [], updateId: null, insert: true };
  const exact = rows.find((r) => r.role === next);
  const keep = exact ??
    [...rows].sort((a, b) => roleRank(a.role) - roleRank(b.role))[0];
  return {
    deleteIds: rows.filter((r) => r.id !== keep.id).map((r) => r.id),
    updateId: exact ? null : keep.id,
    insert: false,
  };
}
