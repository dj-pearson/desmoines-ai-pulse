import { describe, it, expect } from 'vitest';
import { RESTAURANT_AREA_SLUGS } from '@/pseo/restaurantAreaSlugs';
import { locationDimension } from '@/pseo/taxonomy';
import { COVERAGE_LOCATIONS } from '@/pseo/coverageRule';

describe('RESTAURANT_AREA_SLUGS (SEO-065)', () => {
  it('is exactly the taxonomy location slugs, so no area page is left on the 404 path', () => {
    expect([...RESTAURANT_AREA_SLUGS].sort()).toEqual(locationDimension.values.map((v) => v.slug).sort());
  });

  it('covers every area the coverage rule can publish a /restaurants/<area> page for', () => {
    for (const loc of COVERAGE_LOCATIONS) expect(RESTAURANT_AREA_SLUGS).toContain(loc);
  });
});
