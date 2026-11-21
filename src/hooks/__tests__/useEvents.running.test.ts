import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * useEvents dropped a multi-day event on its second morning: the list filtered
 * `date >= today (Central)` and never read end_date. Site search goes through
 * this hook, so a search for "state fair" on day three came back empty while
 * the hubs and the calendar listed the fair.
 */

interface Call {
  method: string;
  args: unknown[];
}

const calls: Call[] = [];

function tableQuery() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'neq', 'is', 'textSearch', 'gte', 'lte', 'eq', 'or', 'order', 'limit', 'range']) {
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
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

const { fetchEvents, upcomingOrRunningFilter, eventsLowerBoundISO } = await import('../useEvents');

/**
 * Evaluate a flat PostgREST or= group of `col.gte.value` terms against a row,
 * the way PostgREST does: a NULL column fails its term.
 */
function matchesOrGroup(group: string, row: Record<string, string | null>): boolean {
  return group.split(',').some((term) => {
    const [col, op, ...rest] = term.split('.');
    const value = rest.join('.');
    expect(op).toBe('gte');
    const cell = row[col];
    if (cell == null) return false;
    return Date.parse(cell) >= Date.parse(value);
  });
}

const TODAY = '2026-08-16T05:00:00.000Z'; // Central midnight, 2026-08-16 (CDT)

describe('upcomingOrRunningFilter', () => {
  const group = upcomingOrRunningFilter(TODAY);

  it('keeps a run that started days ago and ends later', () => {
    const stateFair = { date: '2026-08-13T15:00:00Z', end_date: '2026-08-23T04:00:00Z' };
    expect(matchesOrGroup(group, stateFair)).toBe(true);
  });

  it('keeps a run on its final day', () => {
    const lastDay = { date: '2026-08-14T15:00:00Z', end_date: '2026-08-17T03:00:00Z' };
    expect(matchesOrGroup(group, lastDay)).toBe(true);
  });

  it('drops a run that ended yesterday', () => {
    const over = { date: '2026-08-10T15:00:00Z', end_date: '2026-08-15T23:00:00Z' };
    expect(matchesOrGroup(group, over)).toBe(false);
  });

  it('drops a past one-night show with no end_date', () => {
    const lastNight = { date: '2026-08-16T01:00:00Z', end_date: null };
    expect(matchesOrGroup(group, lastNight)).toBe(false);
  });

  it('keeps tonight and later shows with no end_date', () => {
    expect(matchesOrGroup(group, { date: '2026-08-17T00:30:00Z', end_date: null })).toBe(true);
    expect(matchesOrGroup(group, { date: '2026-09-01T00:30:00Z', end_date: null })).toBe(true);
  });
});

describe('fetchEvents window', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('sends the start-or-end group instead of a bare date floor', async () => {
    await fetchEvents({ search: 'state fair', limit: 5 });

    const ors = calls.filter((c) => c.method === 'or').map((c) => c.args[0]);
    expect(ors).toEqual([upcomingOrRunningFilter(eventsLowerBoundISO())]);
    // The old filter, which no end_date could rescue a row from.
    expect(calls.some((c) => c.method === 'gte' && c.args[0] === 'date')).toBe(false);
  });

  it('keeps the unpublish filters alongside it', async () => {
    await fetchEvents({});
    expect(calls).toContainEqual({ method: 'neq', args: ['is_merged', true] });
    expect(calls).toContainEqual({ method: 'neq', args: ['is_hidden', true] });
    expect(calls).toContainEqual({ method: 'is', args: ['archived_at', null] });
  });
});
