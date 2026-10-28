import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/** Every read fails the way PostgREST does: resolved, with `error` set. A
 *  permanent code, because the hook's own retry policy overrides the client's. */
vi.mock('@/integrations/supabase/client', () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'lte', 'or', 'ilike', 'order', 'limit']) {
      c[m] = () => c;
    }
    c.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: null, error: { message: 'boom', code: '42703', details: '', hint: '' } });
    return c;
  };
  return { supabase: { from: () => chain() } };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { useAdvancedSearch } from '@/hooks/useAdvancedSearch';

function wrapper(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('useAdvancedSearch failure', () => {
  it('a failed search is an error, not an empty result', async () => {
    const { result } = renderHook(() => useAdvancedSearch(), {
      wrapper: wrapper('/search/advanced?q=jazz&category=restaurants'),
    });

    // Driven from the URL: ?q= alone is enough to run it.
    expect(result.current.hasSearched).toBe(true);
    expect(result.current.filters.query).toBe('jazz');
    expect(result.current.filters.category).toBe('Restaurants');

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.results).toEqual([]);
    expect(typeof result.current.refetch).toBe('function');
  });

  it('no params: nothing submitted, nothing fetched', () => {
    const { result } = renderHook(() => useAdvancedSearch(), { wrapper: wrapper('/search/advanced') });
    expect(result.current.hasSearched).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
