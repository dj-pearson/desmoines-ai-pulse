/**
 * One answer to "what role does this user hold" (WEB-AUTH-010).
 *
 * THERE WERE THREE, AND THEY DISAGREED.
 *
 *   AuthContext.checkIsAdmin   .maybeSingle() on user_roles, admin/root_admin
 *                              only. A user with TWO role rows makes
 *                              maybeSingle resolve with PGRST116, which the
 *                              handler logs and returns false for - so holding
 *                              an extra row silently revokes admin.
 *   useAdminAuth               .order('created_at', desc).limit(1) - the NEWEST
 *                              row, not the highest. An admin later given a
 *                              moderator row resolves as moderator.
 *   public.is_admin() (SQL)    EXISTS ... role IN ('admin','root_admin'). This
 *                              one is correct with any number of rows, and it
 *                              is the one RLS actually enforces.
 *
 * So the database and the client could differ, and the two clients differed
 * from each other: the nav (useAdminAuth) granted moderators, the route guard
 * (checkIsAdmin) denied them, and a moderator saw admin links that led to an
 * Access Denied page.
 *
 * PRECEDENCE, NOT RECENCY. A role row is a grant; holding two means holding
 * both, and the effective role is the strongest. Ordering by created_at asks a
 * question nobody meant to ask.
 *
 * `isFullAdmin` deliberately matches public.is_admin() rather than being
 * generous: RLS is the real gate, so a client that grants more than the
 * database does only produces pages that load and then show nothing.
 */

export type UserRole = 'user' | 'moderator' | 'admin' | 'root_admin';

/** Strongest first. Index is the precedence; lower wins. */
export const ROLE_PRECEDENCE: readonly UserRole[] = [
  'root_admin',
  'admin',
  'moderator',
  'user',
];

export const DEFAULT_ROLE: UserRole = 'user';

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (ROLE_PRECEDENCE as readonly string[]).includes(value);
}

/**
 * The strongest role among the rows given. Unknown strings and non-strings are
 * ignored rather than trusted: a role the client does not know about cannot be
 * ranked, and ranking it wrong is the failure this module exists to prevent.
 */
export function highestRole(rows: ReadonlyArray<{ role?: unknown } | null | undefined> | null | undefined): UserRole {
  if (!rows || rows.length === 0) return DEFAULT_ROLE;
  let best = ROLE_PRECEDENCE.length - 1;
  for (const row of rows) {
    const role = row?.role;
    if (!isUserRole(role)) continue;
    const rank = ROLE_PRECEDENCE.indexOf(role);
    if (rank >= 0 && rank < best) best = rank;
  }
  return ROLE_PRECEDENCE[best];
}

/**
 * Admin in the sense the database means it. Matches public.is_admin(), which is
 * what every admin RLS policy calls, so the client and the row-level gate give
 * the same answer.
 */
export function isFullAdmin(role: UserRole): boolean {
  return role === 'admin' || role === 'root_admin';
}

export function isRootAdmin(role: UserRole): boolean {
  return role === 'root_admin';
}

/**
 * Is this role at least as strong as `minimum`?
 *
 * The FOURTH ranking of these four values (AdminNav kept its own ROLE_RANK
 * map, inverted relative to ROLE_PRECEDENCE - same order, opposite direction).
 * Agreeing by coincidence is not agreeing.
 */
export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_PRECEDENCE.indexOf(role) <= ROLE_PRECEDENCE.indexOf(minimum);
}

/**
 * Routes a moderator may open.
 *
 * EMPTY, AND THAT IS THE DECISION (WEB-AUTH-010 AC3), not an oversight.
 * Searched every migration: the only policy mentioning 'moderator' is an
 * INSERT on admin_action_logs. There is no moderator SELECT policy on any
 * content table, and public.is_admin() - which every admin read policy calls -
 * excludes moderators. So a moderator who reached an admin page would load the
 * page and see nothing, because RLS would deny every query on it.
 *
 * Until a moderator is granted something to READ, showing them the door is
 * worse than not showing it: today the nav offers admin links to moderators
 * and the route guard refuses them, so the only thing a moderator can reliably
 * reach is the Access Denied page.
 *
 * To give moderators a route: add the RLS policy first, then the path here.
 * The nav and the guard both read this list, so they cannot drift again.
 */
export const MODERATOR_ROUTES: readonly string[] = [];

/** May a user with this role open this path? */
export function mayOpenAdminRoute(role: UserRole, path: string): boolean {
  if (isFullAdmin(role)) return true;
  if (role !== 'moderator') return false;
  return MODERATOR_ROUTES.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

/**
 * Does this role get an admin entry point in the UI at all? True only when the
 * role can actually open something, so the nav never advertises a dead end.
 */
export function hasAdminAccess(role: UserRole): boolean {
  return isFullAdmin(role) || (role === 'moderator' && MODERATOR_ROUTES.length > 0);
}
