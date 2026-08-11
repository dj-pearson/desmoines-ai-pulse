import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WEB-QA-024. Two guarantees, both of which the hook previously broke:
 *
 *   1. The events counts carry the SAME visibility predicate as useEvents
 *      (.neq is_merged / .neq is_hidden), so the homepage tile and the /events
 *      page it links to cannot disagree.
 *   2. A failed count THROWS rather than resolving to 0. The old code read
 *      `count ?? 0` and dropped the error, so an outage rendered a confident
 *      "0 Events Today" — a wrong number a visitor believes.
 */

/** Records every builder method called on one query, and resolves to `result`. */
function makeQuery(result: { count: number | null; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {
    calls,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ['select', 'gte', 'lte', 'neq', 'eq', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return builder as { calls: Array<[string, unknown[]]> } & Record<string, (...a: unknown[]) => unknown>;
}

const queries: Array<ReturnType<typeof makeQuery>> = [];
let nextResults: Array<{ count: number | null; error: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const q = makeQuery(nextResults[queries.length] ?? { count: 0, error: null });
      queries.push(q);
      return q;
    },
  },
}));

vi.mock('@/lib/errorHandler', () => ({ handleError: vi.fn() }));

const { fetchHomepageCounts } = await import('../useHomepageStats');

const ok = (count: number) => ({ count, error: null });

beforeEach(() => {
  queries.length = 0;
  nextResults = [];
});

describe('fetchHomepageCounts', () => {
  it('filters both event counts on is_merged and is_hidden, matching useEvents', async () => {
    nextResults = [ok(4), ok(120), ok(9)];

    await fetchHomepageCounts();

    // Query 0 = events today, query 1 = restaurants, query 2 = new this week.
    for (const index of [0, 2]) {
      const negations = queries[index].calls
        .filter(([method]) => method === 'neq')
        .map(([, args]) => args);
      expect(negations).toEqual([
        ['is_merged', true],
        ['is_hidden', true],
      ]);
    }
  });

  it('returns the counts when every query succeeds', async () => {
    nextResults = [ok(4), ok(120), ok(9)];

    await expect(fetchHomepageCounts()).resolves.toEqual({
      eventsToday: 4,
      restaurantsCount: 120,
      newThisWeek: 9,
    });
  });

  it('throws when a count query fails instead of reporting zero', async () => {
    nextResults = [
      { count: null, error: { message: 'permission denied for table events' } },
      ok(120),
      ok(9),
    ];

    await expect(fetchHomepageCounts()).rejects.toMatchObject({
      message: 'permission denied for table events',
    });
  });

  it('throws when only the restaurants count fails', async () => {
    nextResults = [ok(4), { count: null, error: { message: 'timeout' } }, ok(9)];

    await expect(fetchHomepageCounts()).rejects.toMatchObject({ message: 'timeout' });
  });
});
