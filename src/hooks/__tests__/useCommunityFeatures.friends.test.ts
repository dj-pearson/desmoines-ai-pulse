import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * WEB-FEAT-030. sendFriendRequest could never succeed, for two independent
 * reasons, and fetchFriends hid half the friendships that did exist.
 *
 * Each of these was verified by running the statement against a scratch
 * Postgres 16 carrying the real table and the real policies from migration
 * 20250802043023:
 *
 *   1. The insert named `requested_by`, which is not a column on user_friends.
 *      Migration 20250816041658 declared it, but as CREATE TABLE IF NOT EXISTS
 *      against a table that already existed, so it was a no-op. -> 42703.
 *   2. It inserted a reciprocal PAIR, and the second row set user_id to the
 *      other person, which the INSERT policy forbids:
 *      WITH CHECK (auth.uid() = user_id). -> "new row violates row-level
 *      security policy". Fixing (1) alone still failed on (2).
 *   3. fetchFriends filtered on user_id only. A friendship is one row owned by
 *      whoever sent the request, so a user who ACCEPTED a request never saw it.
 *      EnhancedGroupPlanner reads this list and told them "No friends to invite".
 *
 * These tests assert the payload shape rather than the outcome, because the
 * outcome under a mock is always success - the shape is the thing that was
 * wrong.
 */

const from = vi.fn();
const rpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

const AUTH = vi.hoisted(() => {
  const user = { id: 'alice-id' };
  return { value: { user, isAuthenticated: true } };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => AUTH.value,
  useAuthState: () => AUTH.value,
  useAuthFlags: () => ({ isAuthenticated: true }),
  useAuthActions: () => ({}),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { useCommunityFeatures } from '../useCommunityFeatures';

interface Recorded {
  table: string;
  filters: Array<{ method: string; args: unknown[] }>;
  inserted?: unknown;
}

let calls: Recorded[] = [];
let fixtures: Record<string, unknown> = {};

/** Chainable builder that records every filter and any insert payload. */
function builderFor(table: string) {
  const record: Recorded = { table, filters: [] };
  calls.push(record);

  const builder: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    record.filters.push({ method, args });
    return builder;
  };
  for (const method of ['select', 'eq', 'or', 'gte', 'lte', 'order', 'limit', 'in', 'neq', 'update']) {
    builder[method] = chain(method);
  }
  builder.insert = (payload: unknown) => {
    record.inserted = payload;
    return builder;
  };
  const result = { data: fixtures[table] ?? [], error: null };
  builder.maybeSingle = () => Promise.resolve({ data: fixtures[`${table}:single`] ?? null, error: null });
  builder.single = () => Promise.resolve({ data: fixtures[`${table}:single`] ?? null, error: null });
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return builder;
}

beforeEach(() => {
  calls = [];
  fixtures = {};
  from.mockReset();
  rpc.mockReset();
  from.mockImplementation((table: string) => builderFor(table));
});

/** The insert call against user_friends, normalised to an array of rows. */
function insertedFriendRows(): Record<string, unknown>[] {
  const call = calls.find((c) => c.table === 'user_friends' && c.inserted !== undefined);
  if (!call) return [];
  return (Array.isArray(call.inserted) ? call.inserted : [call.inserted]) as Record<
    string,
    unknown
  >[];
}

describe('sendFriendRequest', () => {
  beforeEach(() => {
    // profiles lookup resolves to Bob; no existing friendship.
    fixtures['profiles:single'] = { user_id: 'bob-id' };
    fixtures['user_friends:single'] = null;
  });

  it('writes exactly one row, not a reciprocal pair', async () => {
    const { result } = renderHook(() => useCommunityFeatures());
    await act(async () => {
      await result.current.sendFriendRequest('bob@example.com');
    });

    expect(insertedFriendRows()).toHaveLength(1);
  });

  it('never sends requested_by, which is not a column on the table', async () => {
    const { result } = renderHook(() => useCommunityFeatures());
    await act(async () => {
      await result.current.sendFriendRequest('bob@example.com');
    });

    for (const row of insertedFriendRows()) {
      expect(row).not.toHaveProperty('requested_by');
    }
  });

  it('owns the row with the requester, which is what the INSERT policy checks', async () => {
    const { result } = renderHook(() => useCommunityFeatures());
    await act(async () => {
      await result.current.sendFriendRequest('bob@example.com');
    });

    const [row] = insertedFriendRows();
    // WITH CHECK (auth.uid() = user_id)
    expect(row.user_id).toBe('alice-id');
    expect(row.friend_id).toBe('bob-id');
    expect(row.status).toBe('pending');
  });

  it('sends only the columns user_friends actually has', async () => {
    const { result } = renderHook(() => useCommunityFeatures());
    await act(async () => {
      await result.current.sendFriendRequest('bob@example.com');
    });

    const allowed = new Set(['id', 'user_id', 'friend_id', 'status', 'created_at', 'accepted_at']);
    for (const row of insertedFriendRows()) {
      for (const key of Object.keys(row)) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it('uses maybeSingle for the duplicate check, since zero rows is normal', async () => {
    const { result } = renderHook(() => useCommunityFeatures());
    await act(async () => {
      await result.current.sendFriendRequest('bob@example.com');
    });

    // `single()` raises PGRST116 on an empty result, which is the common path.
    const dupCheck = calls.find(
      (c) => c.table === 'user_friends' && c.inserted === undefined && c.filters.some((f) => f.method === 'or'),
    );
    expect(dupCheck).toBeDefined();
  });
});

describe('fetchFriends', () => {
  it('reads both directions, so an accepted request is visible to its recipient', async () => {
    const { result } = renderHook(() => useCommunityFeatures());

    await waitFor(() => {
      expect(calls.some((c) => c.table === 'user_friends')).toBe(true);
    });

    const read = calls.find((c) => c.table === 'user_friends' && c.inserted === undefined);
    const orFilter = read?.filters.find((f) => f.method === 'or');

    expect(orFilter, 'fetchFriends must not filter on user_id alone').toBeDefined();
    const clause = String(orFilter?.args[0] ?? '');
    expect(clause).toContain('user_id.eq.alice-id');
    expect(clause).toContain('friend_id.eq.alice-id');
  });

  it('still restricts to accepted friendships', async () => {
    const { result } = renderHook(() => useCommunityFeatures());

    await waitFor(() => {
      expect(calls.some((c) => c.table === 'user_friends')).toBe(true);
    });

    const read = calls.find((c) => c.table === 'user_friends' && c.inserted === undefined);
    const statusFilter = read?.filters.find(
      (f) => f.method === 'eq' && f.args[0] === 'status',
    );
    expect(statusFilter?.args[1]).toBe('accepted');
  });
});
