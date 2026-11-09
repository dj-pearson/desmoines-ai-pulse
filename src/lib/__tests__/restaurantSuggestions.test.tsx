import { useRef, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * WEB-FEAT-048: a restaurant closed for good stays in both typeaheads, labelled
 * "Permanently closed" and ranked below every place still serving, so a
 * visitor who typed its name reaches its page (which says it closed) and an
 * open match is never pushed out of the five slots by it.
 *
 * Rows are production-shaped: status is our lifecycle column (the SEO-059
 * pass set 'closed'), business_status is Google's, and some rows carry only
 * the legacy 'permanently_closed' spelling.
 */
type Call = [string, ...unknown[]];
const calls: Record<string, Call[]> = {};
let restaurantRows: Array<Record<string, unknown>> = [];

vi.mock('@/integrations/supabase/client', () => {
  const chain = (table: string): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    calls[table] = [];
    for (const m of ['select', 'eq', 'neq', 'is', 'not', 'gte', 'lte', 'or', 'ilike', 'order', 'limit']) {
      c[m] = (...args: unknown[]) => {
        calls[table].push([m, ...args]);
        return c;
      };
    }
    c.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: table === 'restaurants' ? restaurantRows : [], error: null });
    return c;
  };
  return { supabase: { from: (table: string) => chain(table) } };
});
vi.mock('@/hooks/useRestaurants', () => ({
  restaurantFilterOptionsQuery: {
    queryKey: ['restaurant-filter-options'],
    queryFn: async () => ({ cuisines: [] }),
  },
}));

import {
  orderRestaurantSuggestions,
  restaurantSuggestionScanRows,
  restaurantSuggestionSubtitle,
} from '@/lib/restaurantSuggestions';
import { fetchEntitySuggestions } from '@/hooks/useEntitySuggestions';
import { SearchAutocomplete } from '@/components/SearchAutocomplete';

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Taco ${id}`,
  slug: `taco-${id}`,
  cuisine: 'Mexican',
  status: null,
  business_status: 'OPERATIONAL',
  ...extra,
});

// The closed places come FIRST from the server, as an unordered ilike can
// return them; five open matches follow.
const ROWS = [
  row('gone', { status: 'closed', business_status: 'CLOSED_PERMANENTLY' }),
  row('legacy', { status: 'permanently_closed', business_status: null }),
  row('a'),
  row('paused', { business_status: 'CLOSED_TEMPORARILY' }),
  row('b'),
  row('c'),
  row('d'),
];

describe('restaurant suggestion rules', () => {
  it('labels a closure instead of the cuisine, and the cuisine otherwise', () => {
    expect(restaurantSuggestionSubtitle(ROWS[0])).toBe('Permanently closed');
    expect(restaurantSuggestionSubtitle(ROWS[1])).toBe('Permanently closed');
    expect(restaurantSuggestionSubtitle(ROWS[3])).toBe('Temporarily closed');
    expect(restaurantSuggestionSubtitle(ROWS[2])).toBe('Mexican');
    expect(restaurantSuggestionSubtitle({ cuisine: '  ', status: null })).toBeNull();
  });

  it('moves places closed for good behind every other match before cutting', () => {
    expect(orderRestaurantSuggestions(ROWS, 5).map((r) => r.id)).toEqual(['a', 'paused', 'b', 'c', 'd']);
    // With room, the closed places are still offered, last.
    expect(orderRestaurantSuggestions(ROWS, 10).map((r) => r.id)).toEqual([
      'a', 'paused', 'b', 'c', 'd', 'gone', 'legacy',
    ]);
  });

  it('keeps a closed place when it is the only match for the typed name', () => {
    expect(orderRestaurantSuggestions([ROWS[0]], 5).map((r) => r.id)).toEqual(['gone']);
  });
});

describe('hero typeahead (fetchEntitySuggestions)', () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
  });

  it('asks for status columns and spare rows, not a closed filter', async () => {
    restaurantRows = ROWS;
    await fetchEntitySuggestions('taco');
    const rc = calls.restaurants ?? [];
    expect(rc).toContainEqual(['select', 'id, name, cuisine, slug, status, business_status']);
    expect(rc).toContainEqual(['neq', 'is_merged', true]);
    expect(rc).toContainEqual(['limit', restaurantSuggestionScanRows(5)]);
    expect(rc.some(([m]) => m === 'or')).toBe(false);
  });

  it('offers open places first and labels a lone closed match', async () => {
    restaurantRows = ROWS;
    const many = await fetchEntitySuggestions('taco');
    expect(many.restaurants.map((r) => r.id)).toEqual(['a', 'paused', 'b', 'c', 'd']);
    expect(many.restaurants[1].subtitle).toBe('Temporarily closed');

    restaurantRows = [ROWS[0]];
    const one = await fetchEntitySuggestions('taco gone');
    expect(one.restaurants).toEqual([
      expect.objectContaining({ id: 'gone', subtitle: 'Permanently closed', href: '/restaurants/taco-gone' }),
    ]);
  });
});

function Harness({ value }: { value: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} aria-label="Search restaurants" defaultValue={value} />
      <SearchAutocomplete contentType="restaurants" value={value} onSelect={() => {}} inputRef={ref} />
    </>
  );
}

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('/restaurants typeahead (SearchAutocomplete)', () => {
  it('lists the closed place last, under "Permanently closed"', async () => {
    restaurantRows = [ROWS[0], ROWS[2]];
    render(wrap(<Harness value="taco" />));
    fireEvent.focus(screen.getByLabelText('Search restaurants'));
    const group = await waitFor(() => screen.getByRole('group', { name: 'Suggestions' }), { timeout: 2000 });
    const options = within(group).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Taco aMexican', 'Taco gonePermanently closed']);
    expect(calls.restaurants).toContainEqual(['limit', restaurantSuggestionScanRows(5)]);
  });
});
