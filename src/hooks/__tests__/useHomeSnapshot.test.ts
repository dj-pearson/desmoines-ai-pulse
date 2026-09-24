import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WP5 item 4 (docs/page-plans/home.md). The dated snapshot is a sentence meant
 * to be quoted, so three things must hold:
 *   1. The weekend window comes from the Central calendar, not the reader's.
 *   2. The counts carry the same visibility predicate as fetchHomepageCounts.
 *   3. A failed or count-less query throws; it never becomes a zero.
 */

type Result = { count?: number | null; data?: unknown; error: unknown };

function makeQuery(result: Result) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {
    calls,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ['select', 'gte', 'lte', 'neq', 'is', 'eq', 'or', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return builder as { calls: Array<[string, unknown[]]> } & Record<string, (...a: unknown[]) => unknown>;
}

const queries: Array<ReturnType<typeof makeQuery>> = [];
let nextResults: Result[] = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const q = makeQuery(nextResults[queries.length] ?? { count: 0, data: [], error: null });
      queries.push(q);
      return q;
    },
  },
}));

vi.mock('@/lib/errorHandler', () => ({ handleError: vi.fn() }));

const { homeSnapshotWindow, fetchHomeSnapshot, toNextUp } = await import('../useHomeSnapshot');

beforeEach(() => {
  queries.length = 0;
  nextResults = [];
});

describe('homeSnapshotWindow', () => {
  it('on a Thursday counts the coming Friday to Sunday, Central', () => {
    // Thu 2026-09-24 15:00 Central (CDT, UTC-5)
    const w = homeSnapshotWindow(new Date('2026-09-24T20:00:00Z'));
    expect(w.asOfDate).toBe('2026-09-24');
    expect(w.asOfLabel).toBe('Thursday, September 24');
    expect(w.weekendStartUtc).toBe('2026-09-25T05:00:00.000Z');
    expect(w.weekendEndUtc).toBe('2026-09-28T04:59:59.999Z');
    expect(w.weekendLabel).toBe('Friday, September 25 - Sunday, September 27');
  });

  it('on a Saturday counts from the start of today, not from Friday', () => {
    const w = homeSnapshotWindow(new Date('2026-09-26T18:00:00Z'));
    expect(w.weekendStartUtc).toBe('2026-09-26T05:00:00.000Z');
    expect(w.weekendLabel).toBe('Saturday, September 26 - Sunday, September 27');
  });

  it('uses the Central date late at night, when UTC has already rolled over', () => {
    // Thu 2026-09-24 22:30 Central is Fri 03:30 UTC.
    const w = homeSnapshotWindow(new Date('2026-09-25T03:30:00Z'));
    expect(w.asOfDate).toBe('2026-09-24');
    expect(w.weekendStartUtc).toBe('2026-09-25T05:00:00.000Z');
  });
});

describe('fetchHomeSnapshot', () => {
  it('filters every query on is_merged, is_hidden and archived_at', async () => {
    nextResults = [
      { count: 38, error: null },
      { count: 12, error: null },
      { data: [], error: null },
    ];
    const s = await fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'));
    expect(s.weekendCount).toBe(38);
    expect(s.weekendFreeCount).toBe(12);
    expect(s.nextUp).toBeNull();
    for (const q of queries) {
      expect(q.calls.filter(([m]) => m === 'neq').map(([, a]) => a)).toEqual([
        ['is_merged', true],
        ['is_hidden', true],
      ]);
      expect(q.calls.filter(([m]) => m === 'is').map(([, a]) => a)).toEqual([['archived_at', null]]);
    }
  });

  it('does not count an unknown (null) price as free', async () => {
    nextResults = [{ count: 1, error: null }, { count: 0, error: null }, { data: [], error: null }];
    await fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'));
    const or = queries[1].calls.find(([m]) => m === 'or');
    expect(or?.[1][0]).not.toMatch(/is\.null/);
  });

  it('throws on a query error instead of reporting zero', async () => {
    nextResults = [{ count: null, error: { message: 'boom' } }, { count: 0, error: null }, { data: [], error: null }];
    await expect(fetchHomeSnapshot()).rejects.toBeTruthy();
  });

  it('throws when a count comes back null without an error', async () => {
    nextResults = [{ count: null, error: null }, { count: 0, error: null }, { data: [], error: null }];
    await expect(fetchHomeSnapshot()).rejects.toThrow(/no count/);
  });
});

describe('toNextUp', () => {
  it('labels today and builds the Central-dated slug', () => {
    const n = toNextUp(
      {
        id: '1',
        title: 'Jazz in July',
        date: '2026-09-25T00:30:00Z',
        event_start_utc: '2026-09-25T00:30:00Z',
        event_start_local: '2026-09-24T19:30:00',
        venue: ' Hoyt Sherman Place ',
      },
      '2026-09-24',
    );
    expect(n).toMatchObject({
      title: 'Jazz in July',
      href: '/events/jazz-in-july-2026-09-24',
      venue: 'Hoyt Sherman Place',
      dayLabel: 'today',
      timeLabel: '7:30 PM',
    });
  });

  it('prints no time for the no-time marker', () => {
    const n = toNextUp(
      {
        id: '2',
        title: 'Market',
        date: '2026-09-26T00:31:58Z',
        event_start_utc: '2026-09-26T00:31:58Z',
        event_start_local: '2026-09-25T19:31:58',
        venue: null,
      },
      '2026-09-24',
    );
    expect(n?.dayLabel).toBe('tomorrow');
    expect(n?.timeLabel).toBeNull();
  });

  it('returns null for a row without a title', () => {
    expect(toNextUp(null, '2026-09-24')).toBeNull();
  });
});
