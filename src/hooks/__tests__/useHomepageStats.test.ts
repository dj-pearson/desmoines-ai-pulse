import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The hero's one count (home-pass2 WP1 items 4 and 13, WEB-QA-024):
 *
 *   1. It carries the site's visibility predicate (is_merged, is_hidden,
 *      archived_at), so the line and /events/today cannot disagree.
 *   2. Its window is the Central day /events/today lists, and after 15:00
 *      Central it counts only what has not started.
 *   3. A failed count, or one with no count, THROWS rather than resolving to 0.
 *      `count ?? 0` rendered a confident "0 events today" during an outage.
 *   4. It is one request. The restaurants and new-this-week counts went with
 *      the desktop tiles.
 */

/** Records every builder method called on one query, and resolves to `result`. */
function makeQuery(result: { count: number | null; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {
    calls,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ['select', 'gte', 'lte', 'lt', 'neq', 'is', 'eq', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return builder as { calls: Array<[string, unknown[]]> } & Record<string, (...a: unknown[]) => unknown>;
}

const queries: Array<ReturnType<typeof makeQuery>> = [];
const tables: string[] = [];
let nextResults: Array<{ count: number | null; error: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const q = makeQuery(nextResults[queries.length] ?? { count: 0, error: null });
      queries.push(q);
      tables.push(table);
      return q;
    },
  },
}));

vi.mock('@/lib/errorHandler', () => ({ handleError: vi.fn() }));

const { fetchHomepageCounts, todayCountMode } = await import('../useHomepageStats');

const ok = (count: number) => ({ count, error: null });

// 2026-09-25 is a Friday. CDT is UTC-5.
const MORNING = new Date('2026-09-25T14:00:00Z'); // 09:00 CT
const EVENING = new Date('2026-09-25T23:30:00Z'); // 18:30 CT

beforeEach(() => {
  queries.length = 0;
  tables.length = 0;
  nextResults = [];
});

function argsOf(method: string) {
  return queries[0].calls.filter(([m]) => m === method).map(([, args]) => args);
}

describe('fetchHomepageCounts', () => {
  it('makes one events request with the visibility predicate', async () => {
    nextResults = [ok(4)];
    await fetchHomepageCounts(MORNING);

    expect(tables).toEqual(['events']);
    expect(argsOf('neq')).toEqual([
      ['is_merged', true],
      ['is_hidden', true],
    ]);
    expect(argsOf('is')).toEqual([['archived_at', null]]);
  });

  it('counts the whole Central day before 15:00', async () => {
    nextResults = [ok(4)];
    await expect(fetchHomepageCounts(MORNING)).resolves.toEqual({ count: 4, mode: 'today' });

    // Midnight to 23:59:59.999 CDT on 2026-09-25.
    expect(argsOf('gte')).toEqual([['date', '2026-09-25T05:00:00.000Z']]);
    expect(argsOf('lte')).toEqual([['date', '2026-09-26T04:59:59.999Z']]);
  });

  it('counts only what has not started after 15:00', async () => {
    nextResults = [ok(3)];
    await expect(fetchHomepageCounts(EVENING)).resolves.toEqual({ count: 3, mode: 'still-to-start' });

    expect(argsOf('gte')).toEqual([['date', EVENING.toISOString()]]);
    expect(argsOf('lte')).toEqual([['date', '2026-09-26T04:59:59.999Z']]);
  });

  it('keeps a real zero', async () => {
    nextResults = [ok(0)];
    await expect(fetchHomepageCounts(MORNING)).resolves.toEqual({ count: 0, mode: 'today' });
  });

  it('throws when the count query fails instead of reporting zero', async () => {
    nextResults = [{ count: null, error: { message: 'permission denied for table events' } }];
    await expect(fetchHomepageCounts(MORNING)).rejects.toMatchObject({
      message: 'permission denied for table events',
    });
  });

  it('throws when the response carries no count', async () => {
    nextResults = [{ count: null, error: null }];
    await expect(fetchHomepageCounts(MORNING)).rejects.toThrow(/without a count/);
  });
});

describe('todayCountMode', () => {
  it('switches at 15:00 Central, not at the visitor clock', () => {
    expect(todayCountMode(new Date('2026-09-25T19:59:00Z'))).toBe('today'); // 14:59 CT
    expect(todayCountMode(new Date('2026-09-25T20:00:00Z'))).toBe('still-to-start'); // 15:00 CT
  });
});
