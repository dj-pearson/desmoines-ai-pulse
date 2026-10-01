import { describe, it, expect } from 'vitest';
import {
  AREA_GUIDE_SLUGS,
  AREA_RESTAURANT_LIMIT,
  areaGuideIntro,
  boundaryForLocation,
  isBarCuisine,
  polygonBounds,
  splitAreaEvents,
  splitAreaPlaces,
  type AreaEventRow,
  type AreaPlaceRow,
} from '../areaGuide';

/**
 * SEO-040. The East Village guide lists only what the rows say: a bar is a
 * bar because its cuisine says so, one taproom stored twice is listed once,
 * and an event counts when its coordinates are inside the polygon.
 */

const place = (over: Partial<AreaPlaceRow>): AreaPlaceRow => ({
  id: over.name ?? 'x',
  name: 'Place',
  slug: null,
  cuisine: 'American',
  price_range: '$',
  rating: 4.5,
  status: 'open',
  latitude: 41.59,
  longitude: -93.612,
  ...over,
});

const event = (over: Partial<AreaEventRow>): AreaEventRow => ({
  id: over.title ?? 'e',
  title: 'Show',
  date: null,
  event_start_utc: null,
  time_tbd: null,
  venue: "Wooly's",
  location: null,
  latitude: 41.5908, // 504 E Locust St, inside the East Village polygon
  longitude: -93.6097,
  ...over,
});

const EV = boundaryForLocation('east-village')!;

describe('isBarCuisine', () => {
  it('reads the cuisine column, not the name', () => {
    expect(isBarCuisine('Bar & Grill')).toBe(true);
    expect(isBarCuisine('Brewery')).toBe(true);
    expect(isBarCuisine('Mexican')).toBe(false); // Bar Nico
    expect(isBarCuisine('Barbecue')).toBe(false);
    expect(isBarCuisine(null)).toBe(false);
  });
});

describe('splitAreaPlaces', () => {
  it('splits bars from restaurants and drops places not open', () => {
    const out = splitAreaPlaces([
      place({ name: 'Purveyor' }),
      place({ name: 'Bar Martinez', status: 'opening_soon' }),
      place({ name: 'Zombie Burger + Drink Lab', cuisine: 'Bar & Grill', latitude: 41.5908 }),
    ]);
    expect(out.restaurants.map((r) => r.name)).toEqual(['Purveyor']);
    expect(out.bars.map((r) => r.name)).toEqual(['Zombie Burger + Drink Lab']);
    expect(out.total).toBe(2);
  });

  it('lists one place stored twice once', () => {
    const out = splitAreaPlaces([
      place({ name: 'Iowa Taproom', latitude: 41.5876, longitude: -93.6132 }),
      place({ name: 'The Iowa Taproom', cuisine: 'Bar & Grill', latitude: 41.5876, longitude: -93.6132 }),
    ]);
    expect(out.total).toBe(1);
  });

  it('caps the restaurant list', () => {
    const rows = Array.from({ length: 15 }, (_, i) => place({ name: `R${i}`, latitude: 41.59 + i / 1000 }));
    expect(splitAreaPlaces(rows).restaurants).toHaveLength(AREA_RESTAURANT_LIMIT);
  });
});

describe('splitAreaEvents', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

  it('keeps events inside the polygon and splits this week from later', () => {
    const out = splitAreaEvents(
      [
        event({ title: 'Tomorrow', event_start_utc: at(1) }),
        event({ title: 'Ten days', event_start_utc: at(10) }),
        // Court Ave, west of the river: downtown, not the East Village.
        event({ title: 'Downtown', event_start_utc: at(2), latitude: 41.5845, longitude: -93.6235 }),
        event({ title: 'No coordinates', event_start_utc: at(2), latitude: null, longitude: null }),
        event({ title: 'Past', event_start_utc: at(-1) }),
      ],
      EV.polygon,
      now,
    );
    expect(out.thisWeek.map((e) => e.title)).toEqual(['Tomorrow']);
    expect(out.later.map((e) => e.title)).toEqual(['Ten days']);
  });

  it('shows nothing later once the week has enough', () => {
    const out = splitAreaEvents(
      [1, 2, 3].map((d) => event({ title: `D${d}`, event_start_utc: at(d) })).concat(event({ title: 'Later', event_start_utc: at(12) })),
      EV.polygon,
      now,
    );
    expect(out.thisWeek).toHaveLength(3);
    expect(out.later).toHaveLength(0);
  });
});

describe('boundaryForLocation / polygonBounds', () => {
  it('knows the neighbourhoods with a polygon and nothing else', () => {
    expect(boundaryForLocation('east-village')?.name).toBe('East Village');
    expect(boundaryForLocation('ankeny')).toBeUndefined();
    expect(boundaryForLocation(undefined)).toBeUndefined();
  });

  it('bounds the polygon', () => {
    const b = polygonBounds(EV.polygon);
    expect(b.minLat).toBeLessThan(b.maxLat);
    expect(b.minLng).toBeLessThan(b.maxLng);
  });
});

describe('areaGuideIntro', () => {
  it('is two sentences built from the boundary definition', () => {
    const intro = areaGuideIntro(EV);
    expect(intro.match(/[.!?](\s|$)/g)).toHaveLength(2);
    expect(intro).toContain('east of the Des Moines River, south of I-235 and west of East 14th Street');
  });

  it('applies to the East Village winner only', () => {
    expect([...AREA_GUIDE_SLUGS]).toEqual(['/things-to-do/east-village']);
  });
});
