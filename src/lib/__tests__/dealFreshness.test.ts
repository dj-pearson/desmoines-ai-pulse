import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WEB-FEAT-104: an open-ended deal (no end_date) not confirmed for 90 days is
 * hidden from /deals, the restaurant page and its makesOffer, and the Happy
 * hour now strip. Every case runs against a fixed clock.
 */
const calls: Array<[string, ...unknown[]]> = [];
const dealResults: Array<{ data: unknown; error: unknown }> = [];
let restaurantResult: { data: unknown; error: unknown } = { data: [], error: null };
let currentTable = '';

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'not', 'lte', 'or', 'order', 'limit', 'in']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve(currentTable === 'deals' ? dealResults.shift() : restaurantResult);
  return {
    supabase: {
      from: (table: string) => {
        currentTable = table;
        calls.push(['from', table]);
        return builder;
      },
    },
  };
});
vi.mock('@/lib/errorHandler', () => ({ handleError: vi.fn() }));

import {
  DEAL_RECONFIRM_DAYS,
  confirmedDealFilter,
  dealConfirmationCutoff,
  dealConfirmedLabel,
  isStaleOpenEndedDeal,
  staleConfirmationFilter,
} from '@/lib/dealFreshness';
import {
  fetchDeals,
  fetchRestaurantDeals,
  filterDealsByWhen,
  happyHourNow,
  venuePageDeals,
  type Deal,
} from '@/hooks/useDeals';
import { restaurantDealOffers } from '@/lib/restaurantMeta';

// 2026-11-21 18:00 UTC is noon in Des Moines (CST).
const NOW = new Date('2026-11-21T18:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'd1',
    title: 'Half-price drafts',
    description: null,
    business_name: 'Noce',
    entity_type: 'restaurant',
    entity_id: 'r1',
    deal_type: 'percentage',
    discount_value: null,
    code: null,
    terms: null,
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    image_url: null,
    is_featured: false,
    created_at: '2026-01-01T00:00:00Z',
    days_of_week: null,
    start_time: null,
    end_time: null,
    ...overrides,
  };
}

const FRESH = deal({ id: 'fresh', last_confirmed_at: daysAgo(89) });
const STALE = deal({ id: 'stale', last_confirmed_at: daysAgo(91) });
const NEVER = deal({ id: 'never', last_confirmed_at: null });
const STALE_WITH_END = deal({ id: 'dated', last_confirmed_at: daysAgo(400), end_date: '2026-12-31T23:59:00Z' });

/**
 * Evaluates the `or` filter the way PostgREST does for the two operators it
 * uses, so the client predicate and the query string are tested against the
 * same rows. SQL comparison with NULL is not true, hence the null branches.
 */
function postgrestOr(filter: string, row: Deal): boolean {
  return filter.split(',').some((clause) => {
    const [column, ...rest] = clause.split('.');
    const op = rest.join('.');
    const value = row[column as keyof Deal] as string | null | undefined;
    if (op === 'not.is.null') return value !== null && value !== undefined;
    if (op === 'is.null') return value === null || value === undefined;
    if (op.startsWith('gte.')) return value != null && new Date(value) >= new Date(op.slice(4));
    if (op.startsWith('lt.')) return value != null && new Date(value) < new Date(op.slice(3));
    throw new Error(`unhandled clause ${clause}`);
  });
}

beforeEach(() => {
  calls.length = 0;
  dealResults.length = 0;
  restaurantResult = { data: [], error: null };
});

describe('isStaleOpenEndedDeal', () => {
  it('hides an open-ended deal confirmed 91 days ago and keeps one confirmed 89 days ago', () => {
    expect(isStaleOpenEndedDeal(STALE, NOW)).toBe(true);
    // Negative control: same deal, inside the window.
    expect(isStaleOpenEndedDeal(FRESH, NOW)).toBe(false);
  });

  it('draws the line at exactly 90 days', () => {
    expect(DEAL_RECONFIRM_DAYS).toBe(90);
    expect(isStaleOpenEndedDeal(deal({ last_confirmed_at: daysAgo(90) }), NOW)).toBe(false);
    expect(
      isStaleOpenEndedDeal(deal({ last_confirmed_at: new Date(NOW.getTime() - 90 * DAY - 1000).toISOString() }), NOW),
    ).toBe(true);
  });

  it('never hides a deal that has an end date, however old the confirmation', () => {
    expect(isStaleOpenEndedDeal(STALE_WITH_END, NOW)).toBe(false);
  });

  it('hides a never-confirmed open-ended deal, and keeps one read without the column', () => {
    expect(isStaleOpenEndedDeal(NEVER, NOW)).toBe(true);
    // undefined: the fallback read before the migration, where the rule cannot apply.
    expect(isStaleOpenEndedDeal(deal(), NOW)).toBe(false);
  });

  it('agrees with the PostgREST filter on every case', () => {
    const filter = confirmedDealFilter(NOW);
    expect(filter).toBe(`end_date.not.is.null,last_confirmed_at.gte.${dealConfirmationCutoff(NOW).toISOString()}`);
    for (const row of [FRESH, STALE, NEVER, STALE_WITH_END, deal({ last_confirmed_at: daysAgo(90) })]) {
      expect(postgrestOr(filter, row), row.id).toBe(!isStaleOpenEndedDeal(row, NOW));
    }
  });

  it('the admin re-confirm filter selects exactly the open-ended deals the public filter drops', () => {
    const stale = staleConfirmationFilter(NOW);
    for (const row of [FRESH, STALE, NEVER]) {
      expect(postgrestOr(stale, row), row.id).toBe(isStaleOpenEndedDeal(row, NOW));
    }
  });
});

describe('every public surface drops the stale deal', () => {
  it('the restaurant page section and its makesOffer', () => {
    const pageDeals = venuePageDeals([STALE, FRESH, NEVER, STALE_WITH_END], { shut: false, now: NOW });
    expect(pageDeals.map((d) => d.id)).toEqual(['fresh', 'dated']);
    const offers = restaurantDealOffers(pageDeals, 'https://example.test/restaurants/noce');
    expect(offers.map((o) => o.name)).toHaveLength(2);
    expect(offers.some((o) => o.validThrough === undefined)).toBe(true); // the fresh open-ended one stays
  });

  it('a shut restaurant still shows none, fresh or not', () => {
    expect(venuePageDeals([FRESH], { shut: true, now: NOW })).toEqual([]);
  });

  it('/deals for every ?when', () => {
    const rows = [STALE, FRESH, NEVER];
    for (const when of ['all', 'now', 'today'] as const) {
      expect(filterDealsByWhen(rows, when, NOW).map((d) => d.id), when).toEqual(['fresh']);
    }
  });

  it('the Happy hour now strip', () => {
    const timed = { days_of_week: null, start_time: '11:00:00', end_time: '14:00:00' };
    const r = (id: string) => ({ id, name: id, slug: id, status: null, business_status: null });
    const rows = happyHourNow(
      [
        { deal: deal({ ...timed, id: 'stale', last_confirmed_at: daysAgo(120) }), restaurant: r('a') },
        { deal: deal({ ...timed, id: 'fresh', last_confirmed_at: daysAgo(3) }), restaurant: r('b') },
      ],
      NOW,
    );
    expect(rows.map((x) => x.deal.id)).toEqual(['fresh']);
  });
});

describe('the reads', () => {
  it('fetchDeals asks for the column and the confirmation filter, and drops a stale row the server returned', async () => {
    dealResults.push({ data: [STALE, FRESH], error: null });
    restaurantResult = { data: [{ id: 'r1', status: null, business_status: null }], error: null };
    const out = await fetchDeals('all');
    expect(out.map((d) => d.id)).toEqual(['fresh']);
    const select = calls.find((c) => c[0] === 'select');
    expect(String(select?.[1])).toMatch(/last_confirmed_at/);
    const ors = calls.filter((c) => c[0] === 'or').map((c) => String(c[1]));
    expect(ors.some((o) => /^end_date\.not\.is\.null,last_confirmed_at\.gte\./.test(o))).toBe(true);
  });

  it('retries without the column when the migration is not applied (42703)', async () => {
    dealResults.push({ data: null, error: { code: '42703', message: 'column deals.last_confirmed_at does not exist' } });
    dealResults.push({ data: [deal({ id: 'legacy', entity_id: null })], error: null });
    const out = await fetchRestaurantDeals('r1');
    expect(out.map((d) => d.id)).toEqual(['legacy']);
    const selects = calls.filter((c) => c[0] === 'select').map((c) => String(c[1]));
    expect(selects).toHaveLength(2);
    expect(selects[1]).not.toMatch(/last_confirmed_at/);
  });

  it('fetchDeals leaves out restaurant deals when their status cannot be read', async () => {
    dealResults.push({
      data: [deal({ id: 'rest', last_confirmed_at: daysAgo(1) }), deal({ id: 'hotel', entity_type: 'hotel', entity_id: 'h1', last_confirmed_at: daysAgo(1) })],
      error: null,
    });
    restaurantResult = { data: null, error: { message: 'boom' } };
    const out = await fetchDeals();
    expect(out.map((d) => d.id)).toEqual(['hotel']);
  });
});

describe('dealConfirmedLabel', () => {
  it('states the Des Moines date, or nothing', () => {
    // 03:00 UTC on the 4th is still the 3rd in Des Moines.
    expect(dealConfirmedLabel('2026-11-04T03:00:00Z')).toBe('Confirmed Nov 3, 2026');
    expect(dealConfirmedLabel(null)).toBeNull();
    expect(dealConfirmedLabel(undefined)).toBeNull();
    expect(dealConfirmedLabel('not a date')).toBeNull();
  });
});
