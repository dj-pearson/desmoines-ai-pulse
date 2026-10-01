import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The dated snapshot (home pass-2 WP4, docs/page-plans/home-pass2.md). It is a
 * sentence meant to be quoted, so:
 *   1. Its weekend is /events/this-weekend's weekend: centralWindow plus
 *      running events, the same filter useEventLanding sends, call for call.
 *   2. Its free count uses FREE_PRICE_FILTER, the site's one definition.
 *   3. A failed or count-less query throws; it never becomes a zero.
 */

type Result = { count?: number | null; data?: unknown; error: unknown };
type Call = [string, unknown[]];

function makeQuery(result: Result) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    calls,
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  for (const method of ['select', 'gte', 'lt', 'lte', 'neq', 'is', 'eq', 'or', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return builder as { calls: Call[] } & Record<string, (...a: unknown[]) => unknown>;
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

const { homeSnapshotWindow, fetchHomeSnapshot, toNextUp, rangeLabel } = await import('../useHomeSnapshot');
const { useEventLanding } = await import('../useEventLanding');
const { FREE_PRICE_FILTER } = await import('@/lib/eventPrice');

beforeEach(() => {
  queries.length = 0;
  nextResults = [];
});

afterEach(() => {
  vi.useRealTimers();
});

/** The calls that decide WHICH rows: not the projection, order or cap. */
function filterCalls(calls: Call[]): Call[] {
  return calls.filter(([m]) => ['or', 'gte', 'lt', 'lte', 'neq', 'is', 'eq'].includes(m));
}

async function landingCalls(or: string | undefined, now: Date): Promise<Call[]> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  queries.length = 0;
  nextResults = [{ data: [], error: null }];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(
    () => useEventLanding({ key: { landing: 'test' }, window: 'this-weekend', includeOngoing: true, or }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  vi.useRealTimers();
  return filterCalls(queries[0].calls);
}

const SATURDAY = new Date('2026-09-26T18:00:00Z'); // 13:00 CDT

describe('the snapshot counts what /events/this-weekend lists', () => {
  it('builds the same weekend filter as useEventLanding (this-weekend, includeOngoing)', async () => {
    const landing = await landingCalls(undefined, SATURDAY);
    queries.length = 0;
    nextResults = [
      { count: 7, data: [], error: null },
      { count: 2, error: null },
      { count: 5, error: null },
      { data: [], error: null },
    ];
    await fetchHomeSnapshot(SATURDAY);
    expect(filterCalls(queries[0].calls)).toEqual(landing);
  });

  it('builds the same free filter as useEventLanding with FREE_PRICE_FILTER', async () => {
    const landing = await landingCalls(FREE_PRICE_FILTER, SATURDAY);
    queries.length = 0;
    nextResults = [
      { count: 7, data: [], error: null },
      { count: 2, error: null },
      { count: 5, error: null },
      { data: [], error: null },
    ];
    await fetchHomeSnapshot(SATURDAY);
    expect(filterCalls(queries[1].calls)).toEqual(landing);
  });

  it('on a Saturday also counts what is still to come, from the start of today', async () => {
    nextResults = [
      { count: 38, data: [], error: null },
      { count: 12, error: null },
      { count: 20, error: null },
      { data: [], error: null },
    ];
    const s = await fetchHomeSnapshot(SATURDAY);
    expect(s.weekendCount).toBe(38);
    expect(s.weekendFreeCount).toBe(12);
    expect(s.remainingCount).toBe(20);
    expect(s.remainingLabel).toBe('today and Sunday');
    const or = queries[2].calls.find(([m]) => m === 'or');
    expect(or?.[1][0]).toContain('"2026-09-26T05:00:00.000Z"');
  });

  it('on a Thursday makes no still-to-come request', async () => {
    nextResults = [
      { count: 38, data: [], error: null },
      { count: 12, error: null },
      { data: [], error: null },
    ];
    const s = await fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'));
    expect(queries).toHaveLength(3);
    expect(s.remainingCount).toBeNull();
    expect(s.remainingLabel).toBeNull();
  });
});

describe('homeSnapshotWindow', () => {
  it('on a Thursday is the coming Friday to Sunday, Central', () => {
    // Thu 2026-09-24 15:00 Central (CDT, UTC-5)
    const w = homeSnapshotWindow(new Date('2026-09-24T20:00:00Z'));
    expect(w.asOfDate).toBe('2026-09-24');
    expect(w.asOfLabel).toBe('Thursday, September 24');
    expect(w.weekendStartUtc).toBe('2026-09-25T05:00:00.000Z');
    expect(w.weekendEndUtc).toBe('2026-09-28T04:59:59.999Z');
    expect(w.weekendLabel).toBe('Friday, September 25 - Sunday, September 27');
    expect(w.remainingStartUtc).toBeNull();
  });

  it('on a Saturday is the whole weekend in progress, as the landing counts it', () => {
    const w = homeSnapshotWindow(SATURDAY);
    expect(w.weekendStartUtc).toBe('2026-09-25T05:00:00.000Z');
    expect(w.weekendLabel).toBe('Friday, September 25 - Sunday, September 27');
    expect(w.remainingStartUtc).toBe('2026-09-26T05:00:00.000Z');
  });

  it('on a Sunday the remainder is one day', () => {
    const w = homeSnapshotWindow(new Date('2026-09-27T18:00:00Z'));
    expect(w.remainingLabel).toBe('today');
  });

  it('uses the Central date late at night, when UTC has already rolled over', () => {
    // Thu 2026-09-24 22:30 Central is Fri 03:30 UTC.
    const w = homeSnapshotWindow(new Date('2026-09-25T03:30:00Z'));
    expect(w.asOfDate).toBe('2026-09-24');
    expect(w.weekendStartUtc).toBe('2026-09-25T05:00:00.000Z');
  });

  it('bounds next-up to the next 7 Central days', () => {
    const w = homeSnapshotWindow(new Date('2026-09-24T20:00:00Z'));
    expect(w.nextUpEndUtc).toBe('2026-10-01T04:59:59.999Z');
  });
});

describe('rangeLabel', () => {
  it('prints a one-day window once', () => {
    expect(rangeLabel('2026-09-27', '2026-09-27')).toBe('Sunday, September 27');
  });
});

describe('fetchHomeSnapshot', () => {
  it('filters every query on is_merged, is_hidden and archived_at', async () => {
    nextResults = [
      { count: 38, data: [], error: null },
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

  it('counts free with FREE_PRICE_FILTER and never an unknown (null) price', async () => {
    nextResults = [{ count: 1, data: [], error: null }, { count: 0, error: null }, { data: [], error: null }];
    await fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'));
    const or = String(queries[1].calls.find(([m]) => m === 'or')?.[1][0]);
    expect(or).toContain(`or(${FREE_PRICE_FILTER})`);
    expect(or).not.toMatch(/is\.null/);
  });

  it('bounds next-up to the next 7 days', async () => {
    nextResults = [{ count: 1, data: [], error: null }, { count: 0, error: null }, { data: [], error: null }];
    await fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'));
    expect(queries[2].calls.find(([m]) => m === 'lte')?.[1]).toEqual(['date', '2026-10-01T04:59:59.999Z']);
  });

  it('turns the weekend rows into ItemList entries', async () => {
    nextResults = [
      {
        count: 9,
        data: [
          {
            id: 'a',
            title: 'Jazz in July',
            date: '2026-09-26T00:30:00Z',
            event_start_utc: '2026-09-26T00:30:00Z',
            event_start_local: '2026-09-25T19:30:00',
            venue: null,
          },
          { id: 'b', title: null, date: null, event_start_utc: null, event_start_local: null, venue: null },
        ],
        error: null,
      },
      { count: 0, error: null },
      { data: [], error: null },
    ];
    const s = await fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'));
    expect(s.weekendEvents).toEqual([{ title: 'Jazz in July', href: '/events/jazz-in-july-2026-09-25' }]);
  });

  it('throws on a query error instead of reporting zero', async () => {
    nextResults = [{ count: null, error: { message: 'boom' } }, { count: 0, error: null }, { data: [], error: null }];
    await expect(fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'))).rejects.toBeTruthy();
  });

  it('throws when a count comes back null without an error', async () => {
    nextResults = [{ count: null, data: [], error: null }, { count: 0, error: null }, { data: [], error: null }];
    await expect(fetchHomeSnapshot(new Date('2026-09-24T20:00:00Z'))).rejects.toThrow(/no count/);
  });

  it('throws when the still-to-come count is missing on a weekend day', async () => {
    nextResults = [
      { count: 3, data: [], error: null },
      { count: 0, error: null },
      { count: null, error: null },
      { data: [], error: null },
    ];
    await expect(fetchHomeSnapshot(SATURDAY)).rejects.toThrow(/no count/);
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

  it('prints the full date beyond tomorrow', () => {
    const n = toNextUp(
      {
        id: '3',
        title: 'Harvest Fest',
        date: '2026-09-27T15:00:00Z',
        event_start_utc: '2026-09-27T15:00:00Z',
        event_start_local: '2026-09-27T10:00:00',
        venue: null,
      },
      '2026-09-24',
    );
    expect(n?.dayLabel).toBe('Sunday, September 27');
  });

  it('returns null for a row without a title', () => {
    expect(toNextUp(null, '2026-09-24')).toBeNull();
  });
});
