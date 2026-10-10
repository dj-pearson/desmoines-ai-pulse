import { describe, it, expect } from 'vitest';
import { RESTAURANT_AREA_SLUGS, RESTAURANT_CUISINE_SLUGS, isRestaurantPseoSlug } from '@/pseo/restaurantAreaSlugs';
import { locationDimension } from '@/pseo/taxonomy';
import { COVERAGE_LOCATIONS } from '@/pseo/coverageRule';
import { CATEGORY_FILTERS } from '@/pseo/listingFilters';

describe('RESTAURANT_AREA_SLUGS (SEO-065)', () => {
  it('is exactly the taxonomy location slugs, so no area page is left on the 404 path', () => {
    expect([...RESTAURANT_AREA_SLUGS].sort()).toEqual(locationDimension.values.map((v) => v.slug).sort());
  });

  it('covers every area the coverage rule can publish a /restaurants/<area> page for', () => {
    for (const loc of COVERAGE_LOCATIONS) expect(RESTAURANT_AREA_SLUGS).toContain(loc);
  });
});

describe('RESTAURANT_CUISINE_SLUGS', () => {
  const restaurantCategories = Object.entries(CATEGORY_FILTERS)
    .filter(([, f]) => f.entity === 'restaurants')
    .map(([slug]) => slug)
    .sort();

  it('is exactly the categories whose listing selects restaurants', () => {
    expect([...RESTAURANT_CUISINE_SLUGS].sort()).toEqual(restaurantCategories);
  });

  it('shares no slug with the areas, so a URL means one kind of page', () => {
    for (const c of RESTAURANT_CUISINE_SLUGS) expect(RESTAURANT_AREA_SLUGS).not.toContain(c);
  });

  it('does not take event categories, whose /restaurants/<x> rows list nothing', () => {
    expect(restaurantCategories.length).toBeGreaterThan(0);
    expect(isRestaurantPseoSlug('festivals')).toBe(false);
    expect(isRestaurantPseoSlug('italian')).toBe(true);
  });
});
