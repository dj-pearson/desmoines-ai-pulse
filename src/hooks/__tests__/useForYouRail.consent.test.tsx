import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

/**
 * The "Personalized suggestions" switch (communication_preferences
 * .event_recommendations, logged as personalization_ai) controlled nothing:
 * the rail ranked a signed-in user's swipes and saves whatever it said. Now
 * only an explicit true sends the rail down the personalized path, and without
 * it the swipe history is not read at all.
 */

type Result = { data: unknown; error: { code?: string; message?: string } | null };

const requested: string[] = [];
let answer: (name: string) => Result = () => ({ data: [], error: null });

function builder(name: string) {
  requested.push(name);
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'neq', 'is', 'in', 'or', 'order', 'limit', 'range']) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(answer(name)).then(resolve, reject);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: (fn: string) => builder(fn),
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/hooks/useUserPreferences', () => ({ useUserPreferences: () => ({ preferences: null }) }));
vi.mock('@/hooks/useHomeShownIds', () => ({
  FOR_YOU_RAIL_KEY: ['for-you-rail'],
  useHomeShownIds: () => ({ tonight: new Set<string>(), forYou: new Set<string>() }),
}));

let profileState: { profile: unknown; isLoading: boolean } = { profile: null, isLoading: false };
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => profileState }));

const { renderHook, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const row = (id: string) => ({
  id,
  title: `Event ${id}`,
  date: '2026-12-01T00:00:00Z',
  category: 'Music',
  image_url: null,
  venue: null,
  is_featured: false,
  is_sponsored: false,
  sponsored_until: null,
  recommendation_score: 10,
  recommendation_reason: 'Coming up soon',
});

async function renderRail() {
  vi.resetModules();
  const { useForYouRail } = await import('../useForYouRail');
  return renderHook(() => useForYouRail(), { wrapper: makeWrapper() });
}

beforeEach(() => {
  requested.length = 0;
  // A user with plenty of swipes: only the switch decides the path.
  answer = (name) =>
    name === 'swipe_interactions' ? { data: [{ id: 's5' }], error: null } : { data: [row('a')], error: null };
});

describe('useForYouRail honours the personalized-suggestions switch', () => {
  it('opted in: probes swipes and reads the personalized RPC', async () => {
    profileState = { profile: { communication_preferences: { event_recommendations: true } }, isLoading: false };
    const { result } = await renderRail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('for-you');
    expect(requested).toEqual(['swipe_interactions', 'get_personalized_recommendations_v2']);
  });

  it('switched off: trending rows, and the swipe history is never read', async () => {
    profileState = { profile: { communication_preferences: { event_recommendations: false } }, isLoading: false };
    const { result } = await renderRail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('trending');
    expect(requested).toEqual(['events']);
  });

  it('never answered (no key, as on a Google or Apple account): trending', async () => {
    profileState = { profile: { communication_preferences: { email_notifications: true } }, isLoading: false };
    const { result } = await renderRail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('trending');
    expect(requested).not.toContain('swipe_interactions');
  });

  it('a profile that failed to load is not consent', async () => {
    profileState = { profile: undefined, isLoading: false };
    const { result } = await renderRail();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.source).toBe('trending');
    expect(requested).toEqual(['events']);
  });

  it('waits for the profile instead of reading trending rows it would throw away', async () => {
    profileState = { profile: undefined, isLoading: true };
    const { result } = await renderRail();
    await new Promise((r) => setTimeout(r, 20));

    expect(result.current.isLoading).toBe(true);
    expect(requested).toEqual([]);
  });
});
