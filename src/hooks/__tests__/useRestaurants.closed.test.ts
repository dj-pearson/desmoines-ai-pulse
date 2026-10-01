import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Closed restaurants leave browse lists (SEO-059).
 *
 * - A browse (no search, not the admin table) asks the table for rows that
 *   are not closed, in the query, so the count matches the pages.
 * - The rotation RPC leaves them out server-side (20261017000059); the client
 *   drops any it still gets, including a Google-only CLOSED_PERMANENTLY.
 * - A search and the admin table keep them: a reader who types a name learns
 *   it closed, and an editor can still manage the row.
 */

interface Call {
  method: string;
  args: unknown[];
}

const tableCalls: Call[][] = [];
let listResponse: { data: unknown[] | null; error: null; count?: number } = { data: [], error: null, count: 0 };
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
  chain.returns = () => Promise.resolve(listResponse);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => tableQuery(),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

const { fetchRestaurantList, listHidesClosed, withoutPermanentlyClosed } = await import('../useRestaurants');
const { NOT_CLOSED_RESTAURANT_FILTER, isPermanentlyClosedRestaurant } = await import('@/lib/restaurantHours');

function row(id: string, extra: Record<string, unknown> = {}) {
  return { id, name: `R${id}`, slug: `r-${id}`, status: 'open', ...extra };
}

function orArgs(i = 0): unknown[] {
  return (tableCalls[i] ?? []).filter((c) => c.method === 'or').map((c) => c.args[0]);
}

beforeEach(() => {
  tableCalls.length = 0;
  rpc.mockReset();
  listResponse = { data: [], error: null, count: 0 };
});

describe('isPermanentlyClosedRestaurant', () => {
  it('reads our status and Google business_status', () => {
    expect(isPermanentlyClosedRestaurant({ status: 'closed' })).toBe(true);
    expect(isPermanentlyClosedRestaurant({ status: ' Closed ' })).toBe(true);
    expect(isPermanentlyClosedRestaurant({ status: 'open', business_status: 'CLOSED_PERMANENTLY' })).toBe(true);
  });

  it('is false for open, not-yet-open and temporarily closed places', () => {
    for (const r of [
      { status: 'open' },
      { status: null },
      { status: 'opening_soon' },
      { status: 'announced' },
      { status: 'newly_opened', business_status: 'OPERATIONAL' },
      { status: 'open', business_status: 'CLOSED_TEMPORARILY' },
    ]) {
      expect(isPermanentlyClosedRestaurant(r)).toBe(false);
    }
    expect(isPermanentlyClosedRestaurant(null)).toBe(false);
  });

  it('the PostgREST filter keeps NULL status rows', () => {
    expect(NOT_CLOSED_RESTAURANT_FILTER).toBe('status.is.null,status.neq.closed');
  });
});

describe('which lists hide closed places', () => {
  it('a browse hides them; a search and the admin table do not', () => {
    expect(listHidesClosed({})).toBe(true);
    expect(listHidesClosed({ search: '   ' })).toBe(true);
    expect(listHidesClosed({ search: 'proof' })).toBe(false);
    expect(listHidesClosed({ includeAdminFields: true })).toBe(false);
  });

  it('withoutPermanentlyClosed keeps order and drops only permanent closures', () => {
    const rows = [
      row('1'),
      row('2', { status: 'closed' }),
      row('3', { status: 'opening_soon' }),
      row('4', { business_status: 'CLOSED_PERMANENTLY' }),
      row('5', { business_status: 'CLOSED_TEMPORARILY' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(withoutPermanentlyClosed(rows as any).map((r) => r.id)).toEqual(['1', '3', '5']);
  });
});

describe('fetchRestaurantList', () => {
  it('a browse on the table path filters closed rows in the query', async () => {
    listResponse = { data: [row('1')], error: null, count: 1 };
    await fetchRestaurantList({ sortBy: 'rating', limit: 30, offset: 0 });
    expect(orArgs()).toContain(NOT_CLOSED_RESTAURANT_FILTER);
  });

  it('a search keeps closed rows findable', async () => {
    listResponse = { data: [row('1', { status: 'closed' })], error: null, count: 1 };
    const result = await fetchRestaurantList({ search: 'proof', sortBy: 'rating', limit: 30, offset: 0 });
    expect(orArgs()).not.toContain(NOT_CLOSED_RESTAURANT_FILTER);
    expect(result.restaurants.map((r) => r.id)).toEqual(['1']);
  });

  it('the admin table keeps closed rows and skips the rotation RPC', async () => {
    listResponse = { data: [row('1', { status: 'closed' })], error: null, count: 1 };
    await fetchRestaurantList({ includeAdminFields: true, limit: 30, offset: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(orArgs()).not.toContain(NOT_CLOSED_RESTAURANT_FILTER);
  });

  it('the rotation RPC path drops any closed row it is handed', async () => {
    rpc.mockResolvedValue({
      data: [
        { restaurant_data: row('1'), total_count: 3 },
        { restaurant_data: row('2', { status: 'closed' }), total_count: 3 },
        { restaurant_data: row('3', { business_status: 'CLOSED_PERMANENTLY' }), total_count: 3 },
      ],
      error: null,
    });
    const result = await fetchRestaurantList({ limit: 30, offset: 0 });
    expect(rpc).toHaveBeenCalledWith('get_rotated_restaurants', expect.anything());
    expect(result.restaurants.map((r) => r.id)).toEqual(['1']);
  });
});
