import { describe, it, expect, vi } from 'vitest';

// The module imports the Supabase client at load; these helpers never touch it.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { loosenQuery, orderExamplesForHour, daypartForHour, NLP_SEARCH_EXAMPLES } = await import('../useNLPSearch');

describe('daypartForHour', () => {
  it('splits the Central day into four parts', () => {
    expect(daypartForHour(8)).toBe('morning');
    expect(daypartForHour(13)).toBe('afternoon');
    expect(daypartForHour(19)).toBe('evening');
    expect(daypartForHour(23)).toBe('late');
    expect(daypartForHour(2)).toBe('late');
  });
});

describe('orderExamplesForHour', () => {
  it('puts brunch first in the morning and live music first in the evening', () => {
    const morning = orderExamplesForHour(9);
    expect(morning.slice(0, 3)).toContain('Best brunch spots with outdoor seating');
    expect(morning.indexOf('Best brunch spots with outdoor seating')).toBeLessThan(
      morning.indexOf('Live music events tonight'),
    );
    const evening = orderExamplesForHour(19);
    expect(evening.indexOf('Live music events tonight')).toBeLessThan(
      evening.indexOf('Best brunch spots with outdoor seating'),
    );
  });

  it('keeps every example and is stable within a rank', () => {
    const ordered = orderExamplesForHour(14);
    expect([...ordered].sort()).toEqual([...NLP_SEARCH_EXAMPLES].sort());
    const untagged = ordered.filter((e) => e === 'Events this week under $20');
    expect(untagged).toHaveLength(1);
  });
});

describe('loosenQuery', () => {
  it('drops dates, budgets and place qualifiers', () => {
    expect(loosenQuery('Live music events tonight')).toBe('Live music events');
    expect(loosenQuery('Family dinner under $50 near downtown Saturday')).toBe('Family dinner');
    expect(loosenQuery('Romantic dinner date in East Village')).toBe('Romantic dinner date');
  });

  it('falls back to dropping the last word', () => {
    expect(loosenQuery('thai noodle soup')).toBe('thai noodle');
  });

  it('returns null when there is nothing sensible left', () => {
    expect(loosenQuery('pizza')).toBeNull();
    expect(loosenQuery('tonight')).toBeNull();
    expect(loosenQuery('   ')).toBeNull();
  });
});
