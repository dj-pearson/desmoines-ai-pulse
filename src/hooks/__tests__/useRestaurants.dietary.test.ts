import { describe, it, expect } from 'vitest';
import { DIETARY_KEYWORDS, resolveDietarySelections } from '../useRestaurants';

/**
 * WEB-FEAT-032. The dietary filter on /restaurants did nothing.
 *
 * RestaurantInlineFilters writes its selections into `filters.tags`, because
 * the URL parameter is `tags`. useRestaurants only ever read `filters.dietary`,
 * which no caller populates. Two consequences, and the second is why the bug
 * was invisible rather than merely wrong:
 *
 *   1. The ILIKE fan-out never ran.
 *   2. `useRotationRpc` gates on the same empty key, so the query also stayed
 *      on the rotation RPC - which by its own comment cannot express dietary
 *      filtering at all.
 *
 * So picking Vegan showed an active filter, changed the URL, incremented the
 * count, and returned the identical unfiltered list.
 */
describe('resolveDietarySelections', () => {
  it('reads the tags key the UI actually writes to', () => {
    expect(resolveDietarySelections({ tags: ['vegan'] })).toEqual(['vegan']);
  });

  it('still reads an explicit dietary key', () => {
    expect(resolveDietarySelections({ dietary: ['halal'] })).toEqual(['halal']);
  });

  it('merges both without duplicating', () => {
    const out = resolveDietarySelections({ dietary: ['vegan'], tags: ['vegan', 'keto'] });
    expect(out.sort()).toEqual(['keto', 'vegan']);
  });

  it('accepts every option the filter UI offers', () => {
    // These are the DIETARY_OPTIONS values in RestaurantInlineFilters. If the
    // two lists drift, the filter silently stops matching again.
    const uiValues = ['vegan', 'vegetarian', 'gluten-free', 'keto', 'halal'];
    expect(resolveDietarySelections({ tags: uiValues }).sort()).toEqual([...uiValues].sort());
    for (const value of uiValues) {
      expect(DIETARY_KEYWORDS[value]).toBeDefined();
    }
  });

  it('drops anything outside the dietary vocabulary', () => {
    // `tags` is a general-purpose URL parameter. A stray value must not become
    // an ILIKE across name, description and cuisine.
    expect(resolveDietarySelections({ tags: ['Happy Hour', 'Date Night'] })).toEqual([]);
    expect(resolveDietarySelections({ tags: ['vegan', 'Takeout'] })).toEqual(['vegan']);
  });

  it('is empty for empty or missing input', () => {
    expect(resolveDietarySelections({})).toEqual([]);
    expect(resolveDietarySelections({ tags: [], dietary: [] })).toEqual([]);
  });

  it('never returns a value with no keyword mapping', () => {
    // The query builder falls back to the raw value when a mapping is missing,
    // so an unmapped selection would search for its own slug.
    for (const value of resolveDietarySelections({ tags: Object.keys(DIETARY_KEYWORDS) })) {
      expect(DIETARY_KEYWORDS[value].length).toBeGreaterThan(0);
    }
  });
});
