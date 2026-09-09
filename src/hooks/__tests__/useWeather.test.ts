/**
 * Tests for the client-side weather reorder (WEB-FEAT-022).
 *
 * The property that matters most is the negative one: a weather-driven reorder
 * must never remove an item. A list that empties itself because the forecast
 * changed would be a far worse bug than an unhelpful ordering, so it is pinned
 * here rather than left to review.
 */
import { describe, it, expect } from 'vitest';
import {
  reorderForWeather,
  WEATHER_UNAVAILABLE,
  type WeatherSnapshot,
} from '../useWeather';

interface Item {
  id: string;
  indoor: boolean | null;
}

const items: Item[] = [
  { id: 'outdoor-1', indoor: false },
  { id: 'indoor-1', indoor: true },
  { id: 'unknown-1', indoor: null },
  { id: 'outdoor-2', indoor: false },
  { id: 'indoor-2', indoor: true },
];

const isIndoor = (item: Item) => item.indoor;

function snapshot(overrides: Partial<WeatherSnapshot>): WeatherSnapshot {
  return { ...WEATHER_UNAVAILABLE, available: true, ...overrides };
}

const NICE = snapshot({ outdoorFriendly: true, temperatureF: 72 });
const NASTY = snapshot({ outdoorFriendly: false, temperatureF: 12 });

describe('reorderForWeather', () => {
  it('never drops or duplicates an item', () => {
    for (const weather of [NICE, NASTY, WEATHER_UNAVAILABLE]) {
      const result = reorderForWeather(items, isIndoor, weather);
      expect(result).toHaveLength(items.length);
      expect(new Set(result.map((i) => i.id)).size).toBe(items.length);
    }
  });

  it('puts outdoor first on a nice day', () => {
    const ids = reorderForWeather(items, isIndoor, NICE).map((i) => i.id);
    expect(ids.slice(0, 2)).toEqual(['outdoor-1', 'outdoor-2']);
    expect(ids.at(-1)).toBe('indoor-2');
  });

  it('puts indoor first when the weather is against you', () => {
    const ids = reorderForWeather(items, isIndoor, NASTY).map((i) => i.id);
    expect(ids.slice(0, 2)).toEqual(['indoor-1', 'indoor-2']);
    expect(ids.at(-1)).toBe('outdoor-2');
  });

  it('ranks unclassified items ahead of a known mismatch', () => {
    const ids = reorderForWeather(items, isIndoor, NICE).map((i) => i.id);
    expect(ids.indexOf('unknown-1')).toBeLessThan(ids.indexOf('indoor-1'));
  });

  it('leaves the order untouched when weather is unavailable', () => {
    const ids = reorderForWeather(items, isIndoor, WEATHER_UNAVAILABLE).map((i) => i.id);
    expect(ids).toEqual(items.map((i) => i.id));
  });

  it('leaves the order untouched when the verdict is unknown', () => {
    const unknown = snapshot({ outdoorFriendly: null });
    const ids = reorderForWeather(items, isIndoor, unknown).map((i) => i.id);
    expect(ids).toEqual(items.map((i) => i.id));
  });

  it('is stable within a rank', () => {
    const allOutdoor: Item[] = [
      { id: 'a', indoor: false },
      { id: 'b', indoor: false },
      { id: 'c', indoor: false },
    ];
    const ids = reorderForWeather(allOutdoor, isIndoor, NICE).map((i) => i.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const original = [...items];
    reorderForWeather(items, isIndoor, NASTY);
    expect(items).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(reorderForWeather([], isIndoor, NICE)).toEqual([]);
  });

  it('handles a list where nothing is classified', () => {
    const unclassified: Item[] = [
      { id: 'x', indoor: null },
      { id: 'y', indoor: null },
    ];
    const ids = reorderForWeather(unclassified, isIndoor, NASTY).map((i) => i.id);
    expect(ids).toEqual(['x', 'y']);
  });
});
