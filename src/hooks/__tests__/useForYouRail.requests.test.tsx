import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

/**
 * WEB-PERF-052 - the For You rail for a signed-in user with swipe history made
 * three sequential requests on every load: an exact count of swipes, the
 * personalized RPC, then an events read for is_sponsored / sponsored_until.
 *
 * Now: an existence check cached as its own query, then
 * get_personalized_recommendations_v2, which returns the flags. Until that
 * migration is applied, v2 answers PGRST202 and the rail falls back to v1 plus
 * the follow-up read, once per session.
 */

type Result = { data: unknown; error: { code?: string; message?: string } | null };

/** Every request the fake client was asked to make, in order. */
const requests: Array<{ kind: 'from' | 'rpc'; name: string; calls: Array<[string, unknown[]]> }> = [];
let answer: (kind: 'from' | 'rpc', name: string) => Result = () => ({ data: [], error: null });

function builder(kind: 'from' | 'rpc', name: string, first: Array<[string, unknown[]]> = []) {
  const entry = { kind, name, calls: first };
  requests.push(entry);
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'neq', 'is', 'in', 'order', 'limit', 'range']) {
    chain[m] = (...args: unknown[]) => {
      entry.calls.push([m, args]);
      return chain;
    };
  }
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(answer(kind, name)).then(resolve, reject);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => builder('from', table),
    rpc: (fn: string, args: unknown) => builder('rpc', fn, [['args', [args]]]),
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useUserPreferences', () => ({ useUserPreferences: () => ({ preferences: null }) }));
// The rail reads the hook as "./useProfile"; vi.mock resolves both to one module.
vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { communication_preferences: { event_recommendations: true } }, isLoading: false }),
}));
vi.mock('@/hooks/useHomeShownIds', () => ({
  FOR_YOU_RAIL_KEY: ['for-you-rail'],
  useHomeShownIds: () => ({ tonight: new Set<string>(), forYou: new Set<string>() }),
}));

const { renderHook, waitFor, act } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

/** Fresh module per test: the "v2 is missing" flag is module state. */
async function load() {
  vi.resetModules();
  return import('../useForYouRail');
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const rec = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: `Event ${id}`,
  date: '2026-12-01T00:00:00Z',
  category: 'Music',
  image_url: null,
  venue: null,
  is_featured: false,
  recommendation_score: 10,
  recommendation_reason: 'Coming up soon',
  ...extra,
});

const names = () => requests.map((r) => r.name);

beforeEach(() => {
  requests.length = 0;
  answer = () => ({ data: [], error: null });
});

describe('hasRecentSwipes', () => {
  it('asks for the fifth swipe, not a count', async () => {
    const { hasRecentSwipes, SWIPE_THRESHOLD } = await load();
    answer = () => ({ data: [{ id: 's5' }], error: null });

    expect(await hasRecentSwipes('user-1')).toBe(true);

    expect(requests).toHaveLength(1);
    const calls = requests[0].calls;
    expect(calls).toContainEqual(['select', ['id']]);
    expect(calls).toContainEqual(['eq', ['user_id', 'user-1']]);
    expect(calls).toContainEqual(['range', [SWIPE_THRESHOLD - 1, SWIPE_THRESHOLD - 1]]);
    // No count option anywhere: select got one argument.
    expect(calls.filter(([m]) => m === 'select').every(([, a]) => a.length === 1)).toBe(true);
  });

  it('is false with fewer than five swipes, and false on a failed read', async () => {
    const { hasRecentSwipes } = await load();
    expect(await hasRecentSwipes('user-1')).toBe(false);
    answer = () => ({ data: null, error: { code: '500', message: 'boom' } });
    expect(await hasRecentSwipes('user-1')).toBe(false);
  });
});

describe('fetchPersonalRows', () => {
  it('takes v2 rows with flags as they are: one request', async () => {
    const { fetchPersonalRows } = await load();
    answer = () => ({
      data: [rec('a', { is_sponsored: true, sponsored_until: '2026-12-31T00:00:00Z' })],
      error: null,
    });

    const rows = await fetchPersonalRows(12);

    expect(names()).toEqual(['get_personalized_recommendations_v2']);
    expect(rows[0].is_sponsored).toBe(true);
  });

  it('falls back to v1 plus the follow-up read when v2 is missing, once per session', async () => {
    const { fetchPersonalRows } = await load();
    answer = (kind, name) => {
      if (name === 'get_personalized_recommendations_v2') {
        return { data: null, error: { code: 'PGRST202', message: 'not found' } };
      }
      if (kind === 'rpc') return { data: [rec('a'), rec('hidden')], error: null };
      return { data: [{ id: 'a', is_sponsored: true, sponsored_until: null }], error: null };
    };

    const rows = await fetchPersonalRows(12);
    expect(names()).toEqual(['get_personalized_recommendations_v2', 'get_personalized_recommendations', 'events']);
    // The follow-up still drops rows the visibility predicate hides.
    expect(rows.map((r) => r.id)).toEqual(['a']);
    expect(rows[0].is_sponsored).toBe(true);

    requests.length = 0;
    await fetchPersonalRows(12);
    expect(names()).toEqual(['get_personalized_recommendations', 'events']);
  });

  it('does the follow-up read when v2 rows lack the flags', async () => {
    const { fetchPersonalRows } = await load();
    answer = (kind) =>
      kind === 'rpc'
        ? { data: [rec('a')], error: null }
        : { data: [{ id: 'a', is_sponsored: false, sponsored_until: null }], error: null };

    const rows = await fetchPersonalRows(12);
    expect(names()).toEqual(['get_personalized_recommendations_v2', 'events']);
    expect(rows[0].is_sponsored).toBe(false);
  });

  it('throws any other v2 error instead of hiding it behind v1', async () => {
    const { fetchPersonalRows } = await load();
    answer = () => ({ data: null, error: { code: '57014', message: 'timeout' } });
    await expect(fetchPersonalRows(12)).rejects.toMatchObject({ code: '57014' });
    expect(names()).toEqual(['get_personalized_recommendations_v2']);
  });
});

describe('useForYouRail, signed in with swipe history', () => {
  it('makes two requests, and a rail refetch does not repeat the swipe check', async () => {
    const { useForYouRail } = await load();
    answer = (kind, name) => {
      if (name === 'swipe_interactions') return { data: [{ id: 's5' }], error: null };
      return { data: [rec('a', { is_sponsored: false, sponsored_until: null })], error: null };
    };

    const { result } = renderHook(() => useForYouRail(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('for-you');
    expect(result.current.recommendations.map((r) => r.id)).toEqual(['a']);
    // Was three: count(swipe_interactions), the RPC, events for the flags.
    expect(names()).toEqual(['swipe_interactions', 'get_personalized_recommendations_v2']);

    requests.length = 0;
    await act(async () => {
      result.current.refetch();
    });
    await waitFor(() => expect(requests.length).toBe(1));
    expect(names()).toEqual(['get_personalized_recommendations_v2']);
  });

  it('reads trending rows when the user has fewer than five swipes', async () => {
    const { useForYouRail } = await load();
    answer = (kind, name) =>
      name === 'swipe_interactions' ? { data: [], error: null } : { data: [rec('t')], error: null };

    const { result } = renderHook(() => useForYouRail(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('trending');
    expect(names()).toEqual(['swipe_interactions', 'events']);
  });
});
