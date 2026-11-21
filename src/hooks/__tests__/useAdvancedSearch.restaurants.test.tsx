import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * /search/advanced is the one restaurant list that skipped both rules every
 * other one applies: a row merged into its duplicate (WEB-AUTO-005) and a place
 * closed for good (SEO-059) are not places to send anyone. A rating filter made
 * it worse, because a closed place keeps its rating and sorted to the top.
 *
 * The mock records every builder call per table and answers restaurants with
 * the rows below, so these assert both the query and what reaches the page.
 */
type Call = [string, ...unknown[]];
const calls: Record<string, Call[]> = {};

const RESTAURANT_ROWS = [
  { id: 'r-open', name: 'Open Place', status: null, rating: 4.1 },
  { id: 'r-soon', name: 'Soon Place', status: 'opening_soon', rating: null },
  { id: 'r-gone', name: 'Gone Place', status: 'permanently_closed', rating: 4.9 },
];

vi.mock('@/integrations/supabase/client', () => {
  const chain = (table: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    calls[table] = [];
    for (const m of ['select', 'eq', 'neq', 'is', 'gte', 'lte', 'or', 'ilike', 'order', 'limit']) {
      c[m] = (...args: unknown[]) => {
        calls[table].push([m, ...args]);
        return c;
      };
    }
    c.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === 'restaurants' ? RESTAURANT_ROWS : [], error: null });
    return c;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import { useAdvancedSearch } from '@/hooks/useAdvancedSearch';
import { NOT_CLOSED_RESTAURANT_FILTER } from '@/lib/restaurantHours';

function wrapper(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[url]}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

async function search(url: string) {
  const { result } = renderHook(() => useAdvancedSearch(), { wrapper: wrapper(url) });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.isError).toBe(false);
  return result.current.results;
}

describe('advanced search restaurants', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
  });

  it('asks only for rows that are not merged and not closed for good', async () => {
    await search('/search/advanced?q=tacos&category=restaurants');
    const restaurantCalls = calls.restaurants ?? [];
    expect(restaurantCalls).toContainEqual(['neq', 'is_merged', true]);
    expect(restaurantCalls).toContainEqual(['or', NOT_CLOSED_RESTAURANT_FILTER]);
    // The text match is still its own `or`, ANDed with the closed filter.
    expect(restaurantCalls.filter(([m]) => m === 'or')).toHaveLength(2);
  });

  it('drops a closed row the server filter does not spell (permanently_closed)', async () => {
    const results = await search('/search/advanced?q=&category=restaurants');
    expect(results.map((r) => r.id)).toEqual(['r-open', 'r-soon']);
  });

  it('a closed place cannot top a rating sort', async () => {
    const results = await search('/search/advanced?q=&category=restaurants&rating=4&sort=rating');
    expect(results[0]?.id).toBe('r-open');
    expect(results.some((r) => r.id === 'r-gone')).toBe(false);
  });
});
