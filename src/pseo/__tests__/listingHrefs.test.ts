import { describe, it, expect } from 'vitest';
import { attractionListingHref, eventListingHref, restaurantListingHref } from '../listingHrefs';

/**
 * pSEO listing cards linked by UUID because the selects never fetched a slug.
 * /attractions/<uuid> is a 404 (the resolver matches slug or name, never id),
 * and /events/<uuid> is a redirect hop away from the canonical URL.
 */
const UUID = '0b9f2c1e-8d7a-4c2b-9e1f-3a4b5c6d7e8f';

describe('pSEO listing hrefs', () => {
  it('events use the title plus the Central Time date, never the id', () => {
    // 02:30 UTC on the 4th is still the 3rd in Des Moines.
    const href = eventListingHref({ title: 'Jazz in July!', event_start_utc: '2026-07-04T02:30:00Z', date: null });
    expect(href).toBe('/events/jazz-in-july-2026-07-03');
    expect(href).not.toContain(UUID);
  });

  it('events fall back to date when event_start_utc is missing', () => {
    expect(eventListingHref({ title: 'Farmers Market', date: '2026-10-03T14:00:00Z' })).toBe(
      '/events/farmers-market-2026-10-03',
    );
  });

  it('attractions link by name slug, since /attractions/<id> does not resolve', () => {
    expect(attractionListingHref({ name: 'Blank Park Zoo' })).toBe('/attractions/blank-park-zoo');
  });

  it('restaurants use the stored slug, and the id only when there is none', () => {
    // RestaurantDetails resolves by slug column or UUID, never by name, so a
    // name-derived fallback would be a 404.
    expect(restaurantListingHref({ id: UUID, slug: 'fongs-pizza' })).toBe('/restaurants/fongs-pizza');
    expect(restaurantListingHref({ id: UUID, slug: null })).toBe(`/restaurants/${UUID}`);
  });
});
