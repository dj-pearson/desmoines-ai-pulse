import { describe, it, expect } from 'vitest';
import {
  orderHomeSections,
  cohortFor,
  isPersonalizedOrder,
  hasAffinity,
  HomeSection,
  HomeOrderingSignals,
} from '../homeSectionOrder';

// Canonical home sections mirroring Index.tsx: recommendations first, the
// recently-viewed rail carries the user's dominant type, neutral pinned.
const sectionsWithRailType = (
  railType: HomeSection['contentType'],
): HomeSection[] => [
  { key: 'recommendations', contentType: 'event' },
  { key: 'recentlyViewed', contentType: railType },
  { key: 'discover', contentType: 'event' },
  { key: 'mostSearched', contentType: 'neutral' },
];

const noSignal: HomeOrderingSignals = {
  engaged: false,
  favorites: { event: 0, restaurant: 0, attraction: 0 },
  recent: { event: 0, restaurant: 0, attraction: 0 },
};

const keys = (s: HomeSection[]) => s.map((x) => x.key);

describe('homeSectionOrder', () => {
  it('returns the canonical order unchanged for guests / no-signal users', () => {
    const sections = sectionsWithRailType('neutral');
    expect(keys(orderHomeSections(sections, noSignal))).toEqual([
      'recommendations',
      'recentlyViewed',
      'discover',
      'mostSearched',
    ]);
    expect(cohortFor(noSignal)).toBe('control');
    expect(hasAffinity(noSignal)).toBe(false);
    expect(isPersonalizedOrder(noSignal)).toBe(false);
  });

  it('leads with the dining rail for a restaurant-dominant user', () => {
    const signals: HomeOrderingSignals = {
      engaged: false,
      favorites: { event: 0, restaurant: 0, attraction: 0 },
      recent: { event: 1, restaurant: 4, attraction: 0 },
    };
    const sections = sectionsWithRailType('restaurant');
    expect(keys(orderHomeSections(sections, signals))).toEqual([
      'recentlyViewed',
      'recommendations',
      'discover',
      'mostSearched',
    ]);
    expect(cohortFor(signals)).toBe('personalized');
  });

  it('keeps event sections leading for an event-dominant user', () => {
    const signals: HomeOrderingSignals = {
      engaged: false,
      favorites: { event: 3, restaurant: 0, attraction: 0 },
      recent: { event: 2, restaurant: 1, attraction: 0 },
    };
    const sections = sectionsWithRailType('event');
    // All reorderable sections are event-typed → stable canonical order.
    expect(keys(orderHomeSections(sections, signals))).toEqual([
      'recommendations',
      'recentlyViewed',
      'discover',
      'mostSearched',
    ]);
  });

  it('never moves a neutral section out of its canonical slot', () => {
    const signals: HomeOrderingSignals = {
      engaged: false,
      favorites: { event: 0, restaurant: 0, attraction: 0 },
      recent: { event: 0, restaurant: 5, attraction: 0 },
    };
    const sections = sectionsWithRailType('restaurant');
    const ordered = orderHomeSections(sections, signals);
    // mostSearched (neutral) stays last regardless of affinity.
    expect(ordered[ordered.length - 1].key).toBe('mostSearched');
  });

  it('is deterministic — identical signals always yield identical order', () => {
    const signals: HomeOrderingSignals = {
      engaged: false,
      favorites: { event: 0, restaurant: 2, attraction: 1 },
      recent: { event: 0, restaurant: 3, attraction: 2 },
    };
    const sections = sectionsWithRailType('restaurant');
    const a = keys(orderHomeSections(sections, signals));
    const b = keys(orderHomeSections(sections, signals));
    expect(a).toEqual(b);
  });
});
