import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The hub's sponsored query carries the visitor's filters (eat-drink plan WP1
 * item 3), search included, and the hub boosts whatever it returns to the top
 * of page 1. The legacy path falls back to fuzzy_search_restaurants when a
 * text search matches nothing - and that RPC knows nothing of sponsorship. So a
 * search that matched no paid row came back with ordinary fuzzy matches, which
 * the hub then pinned above the real results. sponsoredOnly must never take
 * the fuzzy fallback.
 */
const rpc = vi.fn();

function emptyTableQuery() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'neq', 'textSearch', 'in', 'gte', 'lte', 'eq', 'or', 'order', 'limit', 'range']) {
    chain[m] = () => chain;
  }
  chain.returns = () => Promise.resolve({ data: [], error: null, count: 0 });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => emptyTableQuery(),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

const { renderHook, waitFor } = await import('@testing-library/react');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { createElement } = await import('react');
const { useRestaurants } = await import('../useRestaurants');

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [{ id: 'fuzzy-1', name: 'Not Sponsored Diner' }], error: null });
});

describe('useRestaurants sponsoredOnly with a search that matches nothing', () => {
  it('returns no rows and never calls fuzzy_search_restaurants', async () => {
    const { result } = renderHook(
      () => useRestaurants({ search: 'tacos', sponsoredOnly: true, limit: 2, offset: 0 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.restaurants).toEqual([]);
    expect(rpc).not.toHaveBeenCalledWith('fuzzy_search_restaurants', expect.anything());
  });

  it('still falls back to fuzzy matches for an ordinary search', async () => {
    const { result } = renderHook(
      () => useRestaurants({ search: 'tacos', sortBy: 'rating', limit: 30, offset: 0 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(rpc).toHaveBeenCalledWith('fuzzy_search_restaurants', expect.anything());
    expect(result.current.restaurants.map((r) => r.id)).toEqual(['fuzzy-1']);
  });
});
