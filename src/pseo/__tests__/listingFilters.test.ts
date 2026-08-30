import { describe, it, expect } from 'vitest';
import { CATEGORY_FILTERS, temporalRange } from '../listingFilters';

/**
 * These two filters were the reason 244 published pSEO pages rendered listings
 * that did not match their URLs (WEB-SEO-013 AC5). The temporal dimension was
 * read and never applied, so every temporal variant of a page showed the same
 * twelve rows; the category dimension was matched by display name against
 * stored values that never contain it. Both are pure functions of a slug, so
 * both are cheap to pin down here.
 */

const AUG_23 = new Date(2026, 7, 23); // a Sunday

describe('temporalRange', () => {
  it('today is a single day', () => {
    expect(temporalRange('today', AUG_23)).toEqual({ from: '2026-08-23', to: '2026-08-23' });
  });

  it('this-weekend spans the coming Saturday and Sunday', () => {
    // From a Sunday, the coming Saturday is six days out - not today.
    expect(temporalRange('this-weekend', AUG_23)).toEqual({ from: '2026-08-29', to: '2026-08-30' });
  });

  it('a named month in progress starts today, not on the first', () => {
    // The listing only ever shows upcoming rows, so a window that opens in the
    // past would widen the query without widening the result.
    expect(temporalRange('august', AUG_23)).toEqual({ from: '2026-08-23', to: '2026-08-31' });
  });

  it('rolls a finished month forward a year rather than returning nothing', () => {
    expect(temporalRange('march', AUG_23)).toEqual({ from: '2027-03-01', to: '2027-03-31' });
  });

  it('seasons cover their three months', () => {
    expect(temporalRange('fall', AUG_23)).toEqual({ from: '2026-09-01', to: '2026-11-30' });
    // Summer is in progress, so it is clamped the same way august is - which is
    // why the two windows are identical in late August. That collision is real
    // and the pages built on it are genuinely the same page.
    expect(temporalRange('summer', AUG_23)).toEqual({ from: '2026-08-23', to: '2026-08-31' });
  });

  it('winter crosses the year boundary', () => {
    expect(temporalRange('winter', AUG_23)).toEqual({ from: '2026-12-01', to: '2027-02-28' });
  });

  it('returns null for a slug with no window, so no filter is applied', () => {
    expect(temporalRange('date-night', AUG_23)).toBeNull();
    expect(temporalRange('', AUG_23)).toBeNull();
  });
});

describe('CATEGORY_FILTERS', () => {
  const match = (slug: string, value: string) =>
    new RegExp(CATEGORY_FILTERS[slug].pattern, 'i').test(value);

  it('matches the values actually stored, not the display name', () => {
    // The display names are "Live Music" and "BBQ & Smokehouse"; these are the
    // strings in events.category and restaurants.cuisine.
    expect(match('live-music', 'Music')).toBe(true);
    expect(match('live-music', 'Concert')).toBe(true);
    expect(match('live-music', 'Performing Arts')).toBe(true);
    expect(match('festivals', 'Festival')).toBe(true);
    expect(match('bbq', 'BBQ')).toBe(true);
    expect(match('bbq', 'Texas-style BBQ')).toBe(true);
    expect(match('asian', 'Chinese (Cantonese)')).toBe(true);
    expect(match('brunch', 'Bakery')).toBe(true);
  });

  it('does not match unrelated categories', () => {
    expect(match('live-music', 'Comedy')).toBe(false);
    expect(match('festivals', 'Community')).toBe(false);
    expect(match('bbq', 'Pizza')).toBe(false);
    expect(match('italian', 'Mexican')).toBe(false);
  });

  it('declares which entity each category belongs to', () => {
    // This is what stops /events/italian from rendering the generic upcoming
    // list under a URL promising Italian events.
    expect(CATEGORY_FILTERS['italian'].entity).toBe('restaurants');
    expect(CATEGORY_FILTERS['live-music'].entity).toBe('events');
  });

  it('has no pattern containing a non-ASCII byte', () => {
    // These become PostgREST query strings; a curly quote or an accented
    // character in one is a runtime failure that reads as an empty result.
    for (const [slug, f] of Object.entries(CATEGORY_FILTERS)) {
      expect(/^[\x20-\x7e]+$/.test(f.pattern), `${slug}: ${f.pattern}`).toBe(true);
    }
  });
});
