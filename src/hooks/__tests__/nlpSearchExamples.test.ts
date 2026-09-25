import { describe, it, expect, vi } from 'vitest';

// The module imports the Supabase client at load; these constants never touch it.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { NLP_SEARCH_EXAMPLES, NLP_EXAMPLE_DAYPARTS, orderExamplesForHour } = await import('../useNLPSearch');

/**
 * home-pass2 WP1 item 6. An example chip is a promise about what the box
 * understands. nlp-search turns only these facets into SQL: when, free, area,
 * cuisine, category, kid-friendly and content type
 * (supabase/functions/nlp-search/search.ts). Every phrase below parses into a
 * filter the planner reports as unapplied, so an example using one returns the
 * unfiltered list under a heading that claims otherwise.
 */
const UNAPPLIED_PHRASES = [
  'under $',
  'near me',
  'near downtown',
  'dog',
  'pet',
  'outdoor seating',
  'romantic',
  'date night',
  'morning',
  'afternoon',
  'evening',
];

describe('NLP_SEARCH_EXAMPLES', () => {
  it.each(NLP_SEARCH_EXAMPLES)('"%s" uses only facets the planner applies', (example) => {
    const lower = example.toLowerCase();
    const hits = UNAPPLIED_PHRASES.filter((phrase) => lower.includes(phrase));
    expect(hits).toEqual([]);
  });

  it('has no duplicates and enough for the six chips the box shows', () => {
    expect(new Set(NLP_SEARCH_EXAMPLES).size).toBe(NLP_SEARCH_EXAMPLES.length);
    expect(NLP_SEARCH_EXAMPLES.length).toBeGreaterThanOrEqual(6);
  });

  it('tags only examples that exist, so a rename cannot leave a dead daypart entry', () => {
    for (const tagged of Object.keys(NLP_EXAMPLE_DAYPARTS)) {
      expect(NLP_SEARCH_EXAMPLES).toContain(tagged);
    }
  });

  it('orders for the Central hour without dropping any example', () => {
    const morning = orderExamplesForHour(9);
    const evening = orderExamplesForHour(19);
    expect([...morning].sort()).toEqual([...NLP_SEARCH_EXAMPLES].sort());
    expect(morning.indexOf('Kid-friendly attractions')).toBeLessThan(morning.indexOf('Concerts tonight'));
    expect(evening.indexOf('Concerts tonight')).toBeLessThan(evening.indexOf('Kid-friendly attractions'));
  });
});
