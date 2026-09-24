import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RESTAURANT_FILTERS,
  DIETARY_OPTIONS,
  RESTAURANT_PRESETS,
  activeRestaurantPresetId,
  availableRestaurantPresets,
  matchCuisines,
  presetFilters,
} from '../restaurantPresets';
import { getRestaurantRotationSeed } from '../restaurantRotation';
import { DIETARY_KEYWORDS, isSameListExceptPaging } from '@/hooks/useRestaurants';

/** Every cuisine any preset names, with rows, so no preset is filtered out. */
const FULL_FACET = RESTAURANT_PRESETS.flatMap((p) => p.filters.cuisine ?? []).map((cuisine) => ({
  cuisine,
  count: 3,
}));

/** The part of a filter set useRestaurants turns into a query. */
function queryShape(f: typeof DEFAULT_RESTAURANT_FILTERS) {
  return JSON.stringify({
    cuisine: [...f.cuisine].sort(),
    price: [...f.priceRange].sort(),
    rating: f.rating,
    sort: f.sortBy,
    featured: f.featuredOnly,
    tags: f.tags.filter((t) => t in DIETARY_KEYWORDS).sort(),
    location: f.location,
  });
}

describe('restaurant presets (eat-drink WP2 item 2)', () => {
  it('never sets openNow, which nothing server-side reads', () => {
    for (const preset of RESTAURANT_PRESETS) {
      expect(preset.filters.openNow).toBeUndefined();
    }
  });

  it('never writes a tag outside the dietary vocabulary', () => {
    for (const preset of RESTAURANT_PRESETS) {
      for (const tag of preset.filters.tags ?? []) {
        expect(DIETARY_KEYWORDS).toHaveProperty(tag);
      }
    }
  });

  it('every preset changes the query, and no two presets produce the same one', () => {
    const unfiltered = queryShape(DEFAULT_RESTAURANT_FILTERS);
    const shapes = availableRestaurantPresets(FULL_FACET).map((p) => queryShape(presetFilters(p)));
    expect(shapes.length).toBe(RESTAURANT_PRESETS.length);
    for (const shape of shapes) expect(shape).not.toBe(unfiltered);
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('drops the no-op and duplicate presets', () => {
    const ids = RESTAURANT_PRESETS.map((p) => p.id);
    expect(ids).not.toContain('quick-lunch');
    expect(ids).not.toContain('late-night');
    expect(ids).not.toContain('kids');
  });

  it('hides a cuisine preset whose cuisines have no rows, and trims the rest', () => {
    const facet = [
      { cuisine: 'Cafe', count: 4 },
      { cuisine: 'Brunch', count: 0 },
    ];
    const presets = availableRestaurantPresets(facet);
    const ids = presets.map((p) => p.id);
    expect(ids).toContain('brunch');
    expect(ids).not.toContain('healthy');
    expect(presets.find((p) => p.id === 'brunch')?.filters.cuisine).toEqual(['Cafe']);
    // Non-cuisine presets never depend on the facet.
    expect(ids).toContain('date-night');
    expect(ids).toContain('family-dinner');
  });

  it('holds cuisine presets back while the facet is loading', () => {
    const ids = availableRestaurantPresets(undefined).map((p) => p.id);
    expect(ids).toEqual(['date-night', 'family-dinner']);
  });

  it('derives the active preset from the filters, so a reloaded URL shows it', () => {
    const presets = availableRestaurantPresets(FULL_FACET);
    const dateNight = presets.find((p) => p.id === 'date-night')!;
    const fromUrl = { ...DEFAULT_RESTAURANT_FILTERS, priceRange: ['$$$$', '$$$'], rating: [4, 5], sortBy: 'rating' as const };
    expect(activeRestaurantPresetId(fromUrl, presets)).toBe(dateNight.id);
  });

  it('clears the active preset when any filter is edited', () => {
    const presets = availableRestaurantPresets(FULL_FACET);
    const applied = presetFilters(presets[0]);
    expect(activeRestaurantPresetId(applied, presets)).toBe(presets[0].id);
    expect(activeRestaurantPresetId({ ...applied, cuisine: ['Thai'] }, presets)).toBeNull();
    expect(activeRestaurantPresetId({ ...applied, search: 'pho' }, presets)).toBeNull();
    expect(activeRestaurantPresetId({ ...applied, tags: ['vegan'] }, presets)).toBeNull();
    expect(activeRestaurantPresetId(DEFAULT_RESTAURANT_FILTERS, presets)).toBeNull();
  });

  it('offers only dietary values the query understands', () => {
    for (const option of DIETARY_OPTIONS) expect(DIETARY_KEYWORDS).toHaveProperty(option.value);
  });
});

describe('getRestaurantRotationSeed (eat-drink WP2 item 9)', () => {
  it('does not change between 6pm and 8pm Central, when the UTC day turns over', () => {
    // 2026-09-24 18:00 CDT = 23:00 UTC; 20:00 CDT = 01:00 UTC on the 25th.
    const six = getRestaurantRotationSeed(new Date('2026-09-24T23:00:00Z'));
    const seven = getRestaurantRotationSeed(new Date('2026-09-25T00:30:00Z'));
    const eight = getRestaurantRotationSeed(new Date('2026-09-25T01:00:00Z'));
    expect(seven).toBe(six);
    expect(eight).toBe(six);
  });

  it('turns over at midnight Central, winter and summer', () => {
    const beforeCdt = getRestaurantRotationSeed(new Date('2026-09-25T04:59:00Z'));
    const afterCdt = getRestaurantRotationSeed(new Date('2026-09-25T05:01:00Z'));
    expect(afterCdt).toBe(beforeCdt + 1);
    const beforeCst = getRestaurantRotationSeed(new Date('2026-01-15T05:59:00Z'));
    const afterCst = getRestaurantRotationSeed(new Date('2026-01-15T06:01:00Z'));
    expect(afterCst).toBe(beforeCst + 1);
  });

  it('keeps the days-since-epoch scale the RPC has always received', () => {
    expect(getRestaurantRotationSeed(new Date('2026-09-24T17:00:00Z'))).toBe(
      Math.floor(Date.UTC(2026, 8, 24) / 86_400_000)
    );
  });
});

describe('isSameListExceptPaging (eat-drink WP2 item 8)', () => {
  it('keeps rows across a Load More', () => {
    expect(isSameListExceptPaging({ cuisine: ['Thai'], limit: 30, offset: 0 }, { cuisine: ['Thai'], limit: 60, offset: 0 })).toBe(true);
  });

  it('does not keep rows across a filter change', () => {
    expect(isSameListExceptPaging({ cuisine: ['Thai'], limit: 30 }, { cuisine: ['Lao'], limit: 30 })).toBe(false);
    expect(isSameListExceptPaging(undefined, { limit: 30 })).toBe(false);
  });
});

describe('matchCuisines (eat-drink WP2 item 6)', () => {
  const facet = [
    { cuisine: 'Thai', count: 12 },
    { cuisine: 'Mexican', count: 30 },
    { cuisine: 'Southern Thai Street Food', count: 1 },
    { cuisine: 'Empty', count: 0 },
  ];

  it('offers the Thai cuisine for "thai", prefix matches first', () => {
    expect(matchCuisines(facet, 'thai')).toEqual(['Thai', 'Southern Thai Street Food']);
  });

  it('skips cuisines with no rows and ignores one-letter input', () => {
    expect(matchCuisines(facet, 'empty')).toEqual([]);
    expect(matchCuisines(facet, 't')).toEqual([]);
  });
});
