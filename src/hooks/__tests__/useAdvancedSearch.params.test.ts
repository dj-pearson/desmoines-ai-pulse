import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));

import {
  DEFAULT_ADVANCED_FILTERS,
  filtersFromSearchParams,
  withSearchParams,
  type AdvancedSearchFilters,
} from '@/hooks/useAdvancedSearch';

/**
 * /search/advanced keeps the submitted search in the URL so Back and refresh
 * restore it. These pin the round trip and the param names: `q` is what
 * /search links here with, and changing it breaks those links.
 */
describe('advanced search URL params', () => {
  it('no params means no search was submitted', () => {
    expect(filtersFromSearchParams(new URLSearchParams(''))).toBeNull();
    expect(filtersFromSearchParams(new URLSearchParams('utm_source=x'))).toBeNull();
  });

  it('?q= alone (the /search hand-off) is a submitted search', () => {
    expect(filtersFromSearchParams(new URLSearchParams('q=jazz'))).toEqual({
      ...DEFAULT_ADVANCED_FILTERS,
      query: 'jazz',
    });
    // A blank submit browses everything; it must survive a refresh too.
    expect(filtersFromSearchParams(new URLSearchParams('q='))).toEqual(DEFAULT_ADVANCED_FILTERS);
  });

  it('round-trips every filter', () => {
    const filters: AdvancedSearchFilters = {
      query: 'tacos',
      category: 'Restaurants',
      location: 'Ankeny',
      rating: 4.5,
      dateRange: { start: '2026-11-01', end: '2026-11-08' },
      sortBy: 'rating',
      featuredOnly: true,
    };
    const params = withSearchParams(new URLSearchParams(''), filters);
    expect(params.toString()).toBe(
      'q=tacos&category=restaurants&location=Ankeny&rating=4.5&from=2026-11-01&to=2026-11-08&sort=rating&featured=1',
    );
    expect(filtersFromSearchParams(params)).toEqual(filters);
  });

  it('writes defaults as q only, and keeps params it does not own', () => {
    const params = withSearchParams(new URLSearchParams('utm_source=x&rating=4'), DEFAULT_ADVANCED_FILTERS);
    expect(params.toString()).toBe('utm_source=x&q=');
  });

  it('a stale or hand-edited link lands on defaults, not on a query no control shows', () => {
    const f = filtersFromSearchParams(
      new URLSearchParams('q=x&category=bars&rating=7&from=yesterday&sort=price&featured=yes'),
    );
    expect(f).toEqual({ ...DEFAULT_ADVANCED_FILTERS, query: 'x', dateRange: { start: undefined, end: undefined } });
  });
});
