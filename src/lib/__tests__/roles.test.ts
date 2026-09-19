import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE,
  hasAdminAccess,
  highestRole,
  isFullAdmin,
  isRootAdmin,
  isUserRole,
  mayOpenAdminRoute,
  roleAtLeast,
  MODERATOR_ROUTES,
  ROLE_PRECEDENCE,
  type UserRole,
} from '@/lib/roles';

/**
 * WEB-AUTH-010. Three resolvers disagreed about what role a user holds:
 *
 *   AuthContext.checkIsAdmin  .maybeSingle(), which resolves with PGRST116 when
 *                             a user holds two role rows - logged and returned
 *                             false, so an extra row silently revoked admin.
 *   useAdminAuth              .order('created_at', desc).limit(1) - the NEWEST
 *                             row, not the highest.
 *   public.is_admin() (SQL)   EXISTS ... role IN ('admin','root_admin'), which
 *                             is correct with any number of rows and is the one
 *                             RLS enforces.
 *
 * The visible symptom was a moderator shown admin links that led to Access
 * Denied. These tests pin the rule the single resolver now applies.
 */
describe('highestRole', () => {
  it('returns the strongest of several rows, not the newest', () => {
    // The case the ACs name. Under the old resolvers this was either `false`
    // (maybeSingle errored) or whichever row was inserted last.
    expect(highestRole([{ role: 'moderator' }, { role: 'admin' }])).toBe('admin');
    expect(highestRole([{ role: 'admin' }, { role: 'moderator' }])).toBe('admin');
    expect(highestRole([{ role: 'user' }, { role: 'root_admin' }, { role: 'moderator' }])).toBe(
      'root_admin',
    );
  });

  it('never throws on a shape the database might hand back', () => {
    expect(highestRole(null)).toBe(DEFAULT_ROLE);
    expect(highestRole(undefined)).toBe(DEFAULT_ROLE);
    expect(highestRole([])).toBe(DEFAULT_ROLE);
    expect(highestRole([null, undefined])).toBe(DEFAULT_ROLE);
    expect(highestRole([{}])).toBe(DEFAULT_ROLE);
  });

  it('ignores a role it does not recognise rather than ranking it', () => {
    // A role added to the enum and not to ROLE_PRECEDENCE cannot be ranked, and
    // guessing is the failure this module exists to prevent. It must not be
    // silently treated as the strongest OR quietly promote the user.
    expect(highestRole([{ role: 'superuser' }])).toBe(DEFAULT_ROLE);
    expect(highestRole([{ role: 'superuser' }, { role: 'moderator' }])).toBe('moderator');
    expect(highestRole([{ role: 42 }, { role: 'admin' }])).toBe('admin');
  });

  it('is stable regardless of row order', () => {
    const rows = [{ role: 'user' }, { role: 'moderator' }, { role: 'admin' }];
    const forwards = highestRole(rows);
    const backwards = highestRole([...rows].reverse());
    expect(forwards).toBe(backwards);
  });
});

describe('isFullAdmin', () => {
  it('matches public.is_admin(), which is what RLS enforces', () => {
    // admin and root_admin only. A client that granted more than the database
    // does would just produce pages that load and then show nothing.
    expect(isFullAdmin('root_admin')).toBe(true);
    expect(isFullAdmin('admin')).toBe(true);
    expect(isFullAdmin('moderator')).toBe(false);
    expect(isFullAdmin('user')).toBe(false);
  });

  it('is exactly the set the SQL function lists', () => {
    const fromSql: UserRole[] = ['admin', 'root_admin'];
    expect(ROLE_PRECEDENCE.filter(isFullAdmin).sort()).toEqual(fromSql.sort());
  });
});

describe('isRootAdmin', () => {
  it('is only root_admin', () => {
    expect(isRootAdmin('root_admin')).toBe(true);
    expect(isRootAdmin('admin')).toBe(false);
  });
});

describe('the moderator allowlist', () => {
  it('is empty, which is the decision and not an oversight', () => {
    // The only migration policy mentioning 'moderator' is an INSERT on
    // admin_action_logs. There is no moderator SELECT policy on any content
    // table and public.is_admin() excludes moderators, so a moderator who
    // reached an admin page would load it and see nothing.
    expect(MODERATOR_ROUTES).toEqual([]);
  });

  it('means a moderator is offered no admin entry point', () => {
    // The bug this closes: the nav granted moderators and the guard denied
    // them, so the only thing a moderator could reliably reach was the Access
    // Denied page.
    expect(hasAdminAccess('moderator')).toBe(false);
    expect(mayOpenAdminRoute('moderator', '/admin/content')).toBe(false);
  });

  it('still lets full admins through everything', () => {
    expect(hasAdminAccess('admin')).toBe(true);
    expect(hasAdminAccess('root_admin')).toBe(true);
    expect(mayOpenAdminRoute('admin', '/admin/anything')).toBe(true);
  });

  it('matches a listed route and its children, not a prefix collision', () => {
    // Guards the shape for when the list is not empty: /admin/moderation must
    // not also open /admin/moderation-settings.
    const allow = (path: string) =>
      ['/admin/moderation'].some((a) => path === a || path.startsWith(`${a}/`));
    expect(allow('/admin/moderation')).toBe(true);
    expect(allow('/admin/moderation/queue')).toBe(true);
    expect(allow('/admin/moderation-settings')).toBe(false);
  });
});

describe('roleAtLeast', () => {
  it('ranks the four roles in one direction only', () => {
    // AdminNav kept its own ROLE_RANK map, inverted relative to
    // ROLE_PRECEDENCE. They agreed, but by coincidence - and it was the fourth
    // place in the codebase deciding what outranks what.
    expect(roleAtLeast('root_admin', 'admin')).toBe(true);
    expect(roleAtLeast('admin', 'admin')).toBe(true);
    expect(roleAtLeast('moderator', 'admin')).toBe(false);
    expect(roleAtLeast('moderator', 'moderator')).toBe(true);
    expect(roleAtLeast('user', 'moderator')).toBe(false);
  });

  it('is consistent with isFullAdmin', () => {
    for (const role of ROLE_PRECEDENCE) {
      expect(roleAtLeast(role, 'admin')).toBe(isFullAdmin(role));
    }
  });
});

describe('isUserRole', () => {
  it('accepts every role in the precedence list and nothing else', () => {
    for (const role of ROLE_PRECEDENCE) expect(isUserRole(role)).toBe(true);
    expect(isUserRole('superuser')).toBe(false);
    expect(isUserRole('')).toBe(false);
    expect(isUserRole(null)).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
  });
});
