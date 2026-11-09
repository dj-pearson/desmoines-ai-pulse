import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WEB-FEAT-060. Every tag a restaurant filter offers must change the query.
 *
 * useRestaurantFilterOptions offered Takeout, Delivery, Outdoor Seating,
 * Family Friendly, Date Night and Happy Hour. resolveDietarySelections drops
 * all six and no column stores them, so selecting one (or opening a
 * ?tags=Happy%20Hour link) counted as an active filter over the unfiltered
 * list. These tests drive fetchRestaurantList with each offered tag and
 * compare the queries it sends against the untagged baseline.
 */

interface Call {
  method: string;
  args: unknown[];
}

const tableCalls: Call[][] = [];
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
  chain.returns = () => Promise.resolve({ data: [], error: null, count: 0 });
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => tableQuery(),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

const { fetchRestaurantList, RESTAURANT_FILTER_TAGS, appliedRestaurantTags } = await import('../useRestaurants');
const { DIETS } = await import('@/lib/restaurantDiets');

const RETIRED_TAGS = ['Takeout', 'Delivery', 'Outdoor Seating', 'Family Friendly', 'Date Night', 'Happy Hour'];

/** Everything fetchRestaurantList sent: RPC calls plus each table chain. */
async function queryFor(tags: string[], sortBy: 'popularity' | 'rating') {
  tableCalls.length = 0;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
  await fetchRestaurantList({ tags, sortBy, limit: 30, offset: 0 });
  return JSON.stringify({ rpc: rpc.mock.calls, table: tableCalls });
}

beforeEach(() => {
  tableCalls.length = 0;
  rpc.mockReset();
});

describe('RESTAURANT_FILTER_TAGS', () => {
  it('offers exactly the diet ids and none of the retired tags', () => {
    expect([...RESTAURANT_FILTER_TAGS].sort()).toEqual(DIETS.map((d) => d.id).sort());
    for (const tag of RETIRED_TAGS) expect(RESTAURANT_FILTER_TAGS).not.toContain(tag);
  });

  it.each(['popularity', 'rating'] as const)('every offered tag changes the %s query', async (sortBy) => {
    const baseline = await queryFor([], sortBy);
    for (const tag of RESTAURANT_FILTER_TAGS) {
      expect(await queryFor([tag], sortBy), `tag ${tag}`).not.toEqual(baseline);
    }
  });

  it('an offered tag adds an ilike clause on the table path', async () => {
    for (const tag of RESTAURANT_FILTER_TAGS) {
      tableCalls.length = 0;
      rpc.mockReset();
      await fetchRestaurantList({ tags: [tag], sortBy: 'popularity', limit: 30, offset: 0 });
      // A diet cannot be expressed by the rotation RPC, so it must not be used.
      expect(rpc, `tag ${tag}`).not.toHaveBeenCalled();
      const ors = tableCalls.flat().filter((c) => c.method === 'or').map((c) => String(c.args[0]));
      expect(ors.some((o) => o.includes('.ilike.%')), `tag ${tag}`).toBe(true);
    }
  });

  it('a retired tag changes nothing, which is why it is not offered', async () => {
    const baseline = await queryFor([], 'popularity');
    for (const tag of RETIRED_TAGS) {
      expect(await queryFor([tag], 'popularity')).toEqual(baseline);
    }
  });
});

describe('appliedRestaurantTags', () => {
  it('keeps diet ids from a URL, in order', () => {
    expect(appliedRestaurantTags(['keto', 'vegan'])).toEqual(['keto', 'vegan']);
  });

  it('drops a retired tag from an old link instead of showing a chip for it', () => {
    expect(appliedRestaurantTags(['Happy Hour'])).toEqual([]);
    expect(appliedRestaurantTags(['Date Night', 'halal', 'Takeout'])).toEqual(['halal']);
  });
});
