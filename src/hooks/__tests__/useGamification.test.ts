import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

/**
 * WEB-FEAT-028. Every fetcher in useGamification used to set an empty array
 * behind a comment claiming its table "doesn't exist yet". All of them exist
 * in production - badges, user_badges, community_challenges, user_activities,
 * user_reputation - and so does the award_user_xp RPC. The proof the comments
 * were stale rather than accurate was inside the same file: fetchUserReputation
 * queried user_reputation for real while fetchLeaderboard claimed that exact
 * table did not exist.
 *
 * What these tests hold onto:
 *   - each surface READS ITS TABLE. A regression to `setX([])` renders an empty
 *     page with no error, which is the failure mode that hid this for months,
 *     so "was the query issued" is the assertion that matters.
 *   - awardPoints CALLS award_user_xp. It previously logged the call and then
 *     showed "Points Earned!", which is worse than doing nothing.
 *   - awardPoints does NOT congratulate the user when the write fails.
 *   - joinChallenge does NOT claim success, because no participants table
 *     exists to record a join in.
 */

const rpc = vi.fn();
const from = vi.fn();
const toast = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (...args: unknown[]) => from(...args),
  },
}));

// The identity of `user` matters: useGamification keys its load effect on it,
// so a factory returning a fresh object literal per render would re-run the
// effect forever and isLoading would never settle. Hoisted to keep it stable.
const AUTH = vi.hoisted(() => {
  const user = { id: 'user-1' };
  return { user, value: { user, isAuthenticated: true } };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => AUTH.value,
  useAuthState: () => AUTH.value,
  useAuthFlags: () => ({ isAuthenticated: true }),
  useAuthActions: () => ({}),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('../use-toast', () => ({ useToast: () => ({ toast }) }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { useGamification } from '../useGamification';

/**
 * A chainable stub of the supabase query builder.
 *
 * Every builder method returns `this`, and the object is thenable so that
 * `await supabase.from(...).select(...)...` resolves to the configured result
 * whether or not the call chain ends in `.maybeSingle()`.
 */
function queryResult(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'in', 'neq']) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve({ data, error });
  builder.single = () => Promise.resolve({ data, error });
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data, error });
  return builder;
}

/** Records which tables were queried, and answers each with a fixture. */
function stubTables(fixtures: Record<string, unknown>) {
  const queried: string[] = [];
  from.mockImplementation((table: string) => {
    queried.push(table);
    return queryResult(fixtures[table] ?? []);
  });
  return queried;
}

const REPUTATION = {
  user_id: 'user-1',
  experience_points: 420,
  current_level: 4,
  current_level_progress: 20,
  next_level_xp: 500,
  total_badges: 2,
  streak_days: 3,
};

const BADGE = {
  id: 'badge-1',
  name: 'Regular',
  description: 'Attended five events',
  icon: 'star',
  badge_type: 'attendance',
  requirements: {},
  points_value: 50,
  rarity: 'common',
  is_active: true,
};

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  toast.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('useGamification reads the tables that exist', () => {
  it('queries every gamification table rather than returning empty arrays', async () => {
    const queried = stubTables({ user_reputation: REPUTATION });
    renderHook(() => useGamification());

    await waitFor(() => {
      expect(queried).toContain('user_reputation');
    });
    await waitFor(() => {
      for (const table of ['user_badges', 'badges', 'community_challenges', 'user_activities']) {
        expect(queried).toContain(table);
      }
    });
  });

  it('exposes the reputation row it fetched', async () => {
    stubTables({ user_reputation: REPUTATION });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => {
      expect(result.current.reputation?.experience_points).toBe(420);
    });
  });

  it('flattens the user_badges join into badges with earned_at', async () => {
    stubTables({
      user_reputation: REPUTATION,
      user_badges: [{ earned_at: '2026-09-01T00:00:00Z', badges: BADGE }],
    });
    const { result } = renderHook(() => useGamification());

    await waitFor(() => {
      expect(result.current.badges).toHaveLength(1);
    });
    expect(result.current.badges[0].name).toBe('Regular');
    expect(result.current.badges[0].earned_at).toBe('2026-09-01T00:00:00Z');
  });

  it('drops a join row whose badge failed to resolve', async () => {
    stubTables({
      user_reputation: REPUTATION,
      user_badges: [{ earned_at: '2026-09-01T00:00:00Z', badges: null }],
    });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.badges).toEqual([]);
  });

  it('surfaces available badges and open challenges', async () => {
    stubTables({
      user_reputation: REPUTATION,
      badges: [BADGE],
      community_challenges: [
        {
          id: 'c1',
          title: 'Try five new restaurants',
          description: 'Autumn challenge',
          challenge_type: 'dining',
          requirements: {},
          start_date: '2026-09-01',
          end_date: '2026-10-01',
          reward_points: 100,
          is_active: true,
        },
      ],
    });
    const { result } = renderHook(() => useGamification());

    await waitFor(() => {
      expect(result.current.availableBadges).toHaveLength(1);
      expect(result.current.challenges).toHaveLength(1);
    });
  });
});

describe('awardPoints', () => {
  it('calls the award_user_xp RPC with the documented parameters', async () => {
    stubTables({ user_reputation: REPUTATION });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.awardPoints('favorite_event', 10, 'event', 'event-1');
    });

    expect(rpc).toHaveBeenCalledWith('award_user_xp', {
      p_user_id: 'user-1',
      p_activity_type: 'favorite_event',
      p_points: 10,
      p_content_type: 'event',
      p_content_id: 'event-1',
      p_metadata: {},
    });
  });

  it('passes null rather than undefined for the optional parameters', async () => {
    stubTables({ user_reputation: REPUTATION });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.awardPoints('daily_visit', 5);
    });

    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_content_type: null,
      p_content_id: null,
    });
  });

  it('does not congratulate the user when the write fails', async () => {
    stubTables({ user_reputation: REPUTATION });
    rpc.mockResolvedValue({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    toast.mockReset();

    await act(async () => {
      await result.current.awardPoints('favorite_event', 10);
    });

    const congratulated = toast.mock.calls.some(([arg]) =>
      String((arg as { title?: string })?.title ?? '').includes('Points Earned'),
    );
    expect(congratulated).toBe(false);
  });

  it('congratulates the user only when the write succeeded', async () => {
    stubTables({ user_reputation: REPUTATION });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    toast.mockReset();

    await act(async () => {
      await result.current.awardPoints('favorite_event', 10);
    });

    const congratulated = toast.mock.calls.some(([arg]) =>
      String((arg as { title?: string })?.title ?? '').includes('Points Earned'),
    );
    expect(congratulated).toBe(true);
  });
});

describe('joinChallenge', () => {
  it('does not claim success, because nothing records a join', async () => {
    stubTables({ user_reputation: REPUTATION });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    toast.mockReset();

    await act(async () => {
      await result.current.joinChallenge('c1');
    });

    const titles = toast.mock.calls.map(([arg]) => String((arg as { title?: string })?.title ?? ''));
    expect(titles.some((t) => t.includes('Challenge Joined'))).toBe(false);
    expect(titles.some((t) => /not available/i.test(t))).toBe(true);
  });

  it('writes nothing', async () => {
    stubTables({ user_reputation: REPUTATION });
    const { result } = renderHook(() => useGamification());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    rpc.mockReset();

    await act(async () => {
      await result.current.joinChallenge('c1');
    });

    expect(rpc).not.toHaveBeenCalled();
  });
});
