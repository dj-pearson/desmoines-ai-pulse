import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The restaurant list query (eat-drink pass 2 WP1 items 5, 6 and 7).
 *
 * - A search takes the table path with a prefix tsquery, so "harb" finds
 *   Harbinger, and a name that starts with the term leads page 1.
 * - A search that matches nothing returns did-you-mean SUGGESTIONS, looked up
 *   again for slugs and with merged rows dropped. The fuzzy rows are never
 *   swapped in as results: they ignore every filter.
 * - The rotation RPC falls back to the table only when it does not exist.
 * - The phone's Load More pages are offset windows of thirty.
 */

interface Call {
  method: string;
  args: unknown[];
}

interface TableResponse {
  data: unknown[] | null;
  error: { code?: string; message: string } | null;
  count?: number | null;
}

const tableCalls: Call[][] = [];
let listResponse: TableResponse = { data: [], error: null, count: 0 };
let lookupResponse: TableResponse = { data: [], error: null };
const rpc = vi.fn();

function tableQuery() {
  const calls: Call[] = [];
  tableCalls.push(calls);
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'neq', 'textSearch', 'in', 'gte', 'lte', 'eq', 'or', 'order', 'limit', 'range']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  chain.returns = () => {
    const select = calls.find((c) => c.method === 'select')?.args[0];
    return Promise.resolve(select === 'id,slug,name' ? lookupResponse : listResponse);
  };
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => tableQuery(),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

const {
  fetchRestaurantList,
  floatNamePrefixMatches,
  initialRestaurantPageParam,
  nextRestaurantPageParam,
  previousRestaurantPageParam,
} = await import('../useRestaurants');

function row(id: string, name: string, extra: Record<string, unknown> = {}) {
  return { id, name, slug: `slug-${id}`, status: 'open', ...extra };
}

function callsOf(i: number, method: string): unknown[][] {
  return (tableCalls[i] ?? []).filter((c) => c.method === method).map((c) => c.args);
}

beforeEach(() => {
  tableCalls.length = 0;
  rpc.mockReset();
  listResponse = { data: [], error: null, count: 0 };
  lookupResponse = { data: [], error: null };
});

describe('prefix search (item 6)', () => {
  it('sends a prefix tsquery on the table path and never calls the rotation RPC', async () => {
    listResponse = { data: [row('1', 'Harbinger')], error: null, count: 1 };
    const result = await fetchRestaurantList({ search: 'harb', sortBy: 'rating', limit: 30, offset: 0 });

    expect(rpc).not.toHaveBeenCalledWith('get_rotated_restaurants', expect.anything());
    const [column, query, options] = callsOf(0, 'textSearch')[0];
    expect(column).toBe('search_vector');
    expect(query).toBe('harb:*');
    expect(options).toEqual({ config: 'english' });
    expect(result.restaurants.map((r) => r.name)).toEqual(['Harbinger']);
  });

  it('takes the table path for a search on the default sort too', async () => {
    listResponse = { data: [row('1', 'Harbinger')], error: null, count: 1 };
    await fetchRestaurantList({ search: 'harb', limit: 30, offset: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(callsOf(0, 'textSearch')[0][1]).toBe('harb:*');
  });

  it('floats names that start with the term on page 1, keeping order otherwise', async () => {
    listResponse = {
      data: [row('1', 'The Harbor Grill'), row('2', 'Harbinger'), row('3', 'Big Harbor'), row('4', 'harbor lights')],
      error: null,
      count: 4,
    };
    const result = await fetchRestaurantList({ search: 'harb', sortBy: 'rating', limit: 30, offset: 0 });
    expect(result.restaurants.map((r) => r.id)).toEqual(['2', '4', '1', '3']);
  });

  it('leaves later pages in the order the server sent', async () => {
    listResponse = { data: [row('1', 'The Harbor Grill'), row('2', 'Harbinger')], error: null, count: 40 };
    const result = await fetchRestaurantList({ search: 'harb', sortBy: 'rating', limit: 30, offset: 30 });
    expect(result.restaurants.map((r) => r.id)).toEqual(['1', '2']);
  });

  it('floatNamePrefixMatches is a stable partition', () => {
    const rows = [{ name: 'b' }, { name: 'ab' }, { name: 'a' }, { name: null }];
    expect(floatNamePrefixMatches(rows, 'A').map((r) => r.name)).toEqual(['ab', 'a', 'b', null]);
  });
});

describe('the legacy path keeps its filters (item 5)', () => {
  it('returns fuzzy matches as suggestions with slugs, never as results', async () => {
    listResponse = { data: [], error: null, count: 0 };
    rpc.mockImplementation((fn: string) =>
      fn === 'fuzzy_search_restaurants'
        ? Promise.resolve({
            data: [
              { id: 'a', name: 'Taco Place' },
              { id: 'merged', name: 'Old Taco Place' },
              { id: 'b', name: 'Tacopocalypse' },
            ],
            error: null,
          })
        : Promise.resolve({ data: null, error: { message: 'unexpected' } }),
    );
    // The lookup drops the merged row and supplies the slugs.
    lookupResponse = {
      data: [
        { id: 'b', slug: 'tacopocalypse', name: 'Tacopocalypse' },
        { id: 'a', slug: 'taco-place', name: 'Taco Place' },
      ],
      error: null,
    };

    const result = await fetchRestaurantList({
      search: 'tacos',
      cuisine: ['Thai'],
      sortBy: 'rating',
      limit: 30,
      offset: 0,
    });

    expect(result.restaurants).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.suggestions).toEqual([
      { id: 'a', name: 'Taco Place', slug: 'taco-place' },
      { id: 'b', name: 'Tacopocalypse', slug: 'tacopocalypse' },
    ]);

    // The list query kept the cuisine filter.
    expect(callsOf(0, 'in')).toContainEqual(['cuisine', ['Thai']]);
    // The lookup: ids in fuzzy order, merged rows excluded, slug projection.
    expect(callsOf(1, 'select')[0]).toEqual(['id,slug,name']);
    expect(callsOf(1, 'in')[0]).toEqual(['id', ['a', 'merged', 'b']]);
    expect(callsOf(1, 'neq')[0]).toEqual(['is_merged', true]);
  });

  it('gives no suggestions when the lookup fails', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', name: 'Taco Place' }], error: null });
    lookupResponse = { data: null, error: { message: 'boom' } };
    const result = await fetchRestaurantList({ search: 'tacos', sortBy: 'rating', limit: 30, offset: 0 });
    expect(result.suggestions).toEqual([]);
  });

  it('never asks for suggestions on the sponsored query', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', name: 'Taco Place' }], error: null });
    const result = await fetchRestaurantList({ search: 'tacos', sponsoredOnly: true, limit: 10, offset: 0 });
    expect(result.restaurants).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(rpc).not.toHaveBeenCalledWith('fuzzy_search_restaurants', expect.anything());
  });

  it('sinks announced, opening-soon and closed rows below the rest', async () => {
    listResponse = {
      data: [
        row('1', 'Announced', { status: 'announced' }),
        row('2', 'Open'),
        row('3', 'Soon', { status: 'opening_soon' }),
        row('4', 'No status', { status: null }),
        row('5', 'Closed', { status: 'closed' }),
      ],
      error: null,
      count: 5,
    };
    const result = await fetchRestaurantList({ sortBy: 'rating', limit: 30, offset: 0 });
    expect(result.restaurants.map((r) => r.id)).toEqual(['2', '4', '1', '3', '5']);
  });
});

describe('rotation RPC fallback (item 5)', () => {
  it('falls back to the table only when the function is missing', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    listResponse = { data: [row('1', 'Table Row')], error: null, count: 1 };
    const result = await fetchRestaurantList({ limit: 30, offset: 0 });
    expect(result.restaurants.map((r) => r.id)).toEqual(['1']);
    expect(tableCalls).toHaveLength(1);
  });

  it('throws on any other RPC error, so the page shows its error state', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'statement timeout' } });
    await expect(fetchRestaurantList({ limit: 30, offset: 0 })).rejects.toMatchObject({ code: '57014' });
    expect(tableCalls).toHaveLength(0);
  });

  it('sends the page window to the RPC', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchRestaurantList({ limit: 30, offset: 30 }, { seed: 7 });
    expect(rpc).toHaveBeenCalledWith(
      'get_rotated_restaurants',
      expect.objectContaining({ limit_count: 30, offset_count: 30, rotation_seed: 7, search_query: null }),
    );
  });
});

describe('mobile pages (item 7)', () => {
  const page = (offset: number, limit: number, rows: number, totalCount: number) => ({
    offset,
    limit,
    totalCount,
    suggestions: [],
    restaurants: Array.from({ length: rows }, (_, i) => row(String(offset + i), `R${offset + i}`)) as never[],
  });

  it('starts at row 1, and a cold ?page=N restores at most two pages', () => {
    expect(initialRestaurantPageParam(1)).toEqual({ offset: 0, limit: 30 });
    expect(initialRestaurantPageParam(2)).toEqual({ offset: 0, limit: 60 });
    expect(initialRestaurantPageParam(5)).toEqual({ offset: 90, limit: 60 });
    expect(initialRestaurantPageParam(0)).toEqual({ offset: 0, limit: 30 });
  });

  it('asks for the next thirty after what is loaded', () => {
    expect(nextRestaurantPageParam(page(0, 30, 30, 478))).toEqual({ offset: 30, limit: 30 });
    expect(nextRestaurantPageParam(page(90, 60, 60, 478))).toEqual({ offset: 150, limit: 30 });
  });

  it('stops at the end, including a short page under a high estimate', () => {
    expect(nextRestaurantPageParam(page(450, 30, 28, 478))).toBeUndefined();
    expect(nextRestaurantPageParam(page(450, 30, 30, 480))).toBeUndefined();
    expect(nextRestaurantPageParam(page(0, 30, 12, 500))).toBeUndefined();
  });

  it('loads earlier results thirty at a time back to row 1', () => {
    expect(previousRestaurantPageParam({ offset: 90, limit: 60 })).toEqual({ offset: 60, limit: 30 });
    expect(previousRestaurantPageParam({ offset: 20, limit: 30 })).toEqual({ offset: 0, limit: 20 });
    expect(previousRestaurantPageParam({ offset: 0, limit: 30 })).toBeUndefined();
  });
});
