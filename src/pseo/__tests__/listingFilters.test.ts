import { describe, it, expect } from 'vitest';
import { CATEGORY_FILTERS, dayAfter, temporalRange } from '../listingFilters';
import { attainable } from '../../../scripts/lib/pseoShippable';
import { centralWindow } from '../../lib/timezone';

/**
 * These two filters were the reason 244 published pSEO pages rendered listings
 * that did not match their URLs (WEB-SEO-013 AC5). The temporal dimension was
 * read and never applied, so every temporal variant of a page showed the same
 * twelve rows; the category dimension was matched by display name against
 * stored values that never contain it. Both are pure functions of a slug, so
 * both are cheap to pin down here.
 */

// Noon CDT on Sunday 2026-08-23. An instant, not new Date(2026, 7, 23): that
// is midnight in whatever zone the test runs in, which is the bug WEB-SEO-064
// fixed.
const AUG_23 = new Date('2026-08-23T17:00:00Z');

describe('temporalRange', () => {
  it('today is a single day', () => {
    expect(temporalRange('today', AUG_23)).toEqual({ from: '2026-08-23', to: '2026-08-23' });
  });

  it('this-weekend on a Sunday is the weekend in progress, not next weekend', () => {
    // WEB-SEO-065. This used to return 08-29..08-30, six days out.
    expect(temporalRange('this-weekend', AUG_23)).toEqual({ from: '2026-08-21', to: '2026-08-23' });
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

describe('temporalRange uses the Central date (WEB-SEO-064)', () => {
  // 9 PM CDT Sunday 2026-08-23 is 02:00Z Monday the 24th. The prerenderer and
  // the inventory gate run in UTC, so the old local-date code gave Monday here.
  const SUNDAY_EVENING = new Date('2026-08-24T02:00:00Z');

  it('today is the Central day, not the UTC day', () => {
    expect(temporalRange('today', SUNDAY_EVENING)).toEqual({ from: '2026-08-23', to: '2026-08-23' });
  });

  it('this-weekend counts from the Central weekday', () => {
    // 8 PM CDT Saturday 2026-08-29 is 01:00Z Sunday. Read as Sunday, the old
    // code jumped to the following weekend while Saturday night was still on.
    const SATURDAY_EVENING = new Date('2026-08-30T01:00:00Z');
    expect(temporalRange('this-weekend', SATURDAY_EVENING)).toEqual({ from: '2026-08-28', to: '2026-08-30' });
  });

  it('a month in progress clamps to the Central day on the last evening of the month', () => {
    // 8 PM CDT 2026-08-31 is 01:00Z September 1st: August is not over yet.
    const LAST_EVENING = new Date('2026-09-01T01:00:00Z');
    expect(temporalRange('august', LAST_EVENING)).toEqual({ from: '2026-08-31', to: '2026-08-31' });
    expect(temporalRange('summer', LAST_EVENING)).toEqual({ from: '2026-08-31', to: '2026-08-31' });
    expect(temporalRange('september', LAST_EVENING)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('new year: the year comes from the Central date', () => {
    // 7 PM CST 2026-12-31 is 01:00Z 2027-01-01. December 2026 is still on.
    const NYE = new Date('2027-01-01T01:00:00Z');
    expect(temporalRange('december', NYE)).toEqual({ from: '2026-12-31', to: '2026-12-31' });
    expect(temporalRange('winter', NYE)).toEqual({ from: '2026-12-31', to: '2027-02-28' });
    expect(temporalRange('january', NYE)).toEqual({ from: '2027-01-01', to: '2027-01-31' });
  });

  it('winter ends on Feb 29 in a leap year', () => {
    expect(temporalRange('winter', new Date('2027-06-01T17:00:00Z'))).toEqual({ from: '2027-12-01', to: '2028-02-29' });
  });

  it('dayAfter crosses month and year ends', () => {
    expect(dayAfter('2026-08-31')).toBe('2026-09-01');
    expect(dayAfter('2028-02-28')).toBe('2028-02-29');
    expect(dayAfter('2026-12-31')).toBe('2027-01-01');
  });
});

describe('this-weekend is the /events/this-weekend weekend (WEB-SEO-065)', () => {
  // Instants across one weekend, Fri 2026-10-02 to Sun 2026-10-04 (CDT), and
  // the days either side. Every one must give exactly centralWindow's days.
  const cases: Array<[string, string, { from: string; to: string }]> = [
    ['Thursday noon', '2026-10-01T17:00:00Z', { from: '2026-10-02', to: '2026-10-04' }],
    ['Friday 9 AM', '2026-10-02T14:00:00Z', { from: '2026-10-02', to: '2026-10-04' }],
    // 10 PM CDT Saturday is 03:00Z Sunday.
    ['Saturday 10 PM', '2026-10-04T03:00:00Z', { from: '2026-10-02', to: '2026-10-04' }],
    ['Sunday 3 PM', '2026-10-04T20:00:00Z', { from: '2026-10-02', to: '2026-10-04' }],
    // 11 PM CDT Sunday is 04:00Z Monday: still this weekend in Des Moines.
    ['Sunday 11 PM', '2026-10-05T04:00:00Z', { from: '2026-10-02', to: '2026-10-04' }],
    ['Monday 1 AM', '2026-10-05T06:00:00Z', { from: '2026-10-09', to: '2026-10-11' }],
  ];

  for (const [label, iso, want] of cases) {
    it(`${label} Central`, () => {
      const now = new Date(iso);
      expect(temporalRange('this-weekend', now)).toEqual(want);
      const w = centralWindow('this-weekend', now);
      expect({ from: w.startDay, to: w.endDay }).toEqual(want);
    });
  }

  it('the inventory gate counts Friday through Sunday, from today', () => {
    const SATURDAY_NOON = new Date('2026-10-03T17:00:00Z');
    const events = [
      { id: 'fri-night', date: '2026-10-03T01:00:00Z' }, // 8 PM CDT Fri: over
      { id: 'sat-night', date: '2026-10-04T01:00:00Z' }, // 8 PM CDT Sat
      { id: 'sun-brunch', date: '2026-10-04T15:00:00Z' }, // 10 AM CDT Sun
      { id: 'next-fri', date: '2026-10-10T00:00:00Z' }, // 7 PM CDT Fri 10-09
    ];
    const rows = attainable('events', { temporal: { slug: 'this-weekend' } }, { events, restaurants: [], attractions: [] }, SATURDAY_NOON);
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual(['sat-night', 'sun-brunch']);
  });
});

describe('attainable() compares Central date keys (WEB-SEO-064)', () => {
  const SUNDAY_EVENING = new Date('2026-08-24T02:00:00Z'); // 9 PM CDT Sun 08-23
  const events = [
    // 8 PM CDT tonight, stored as 01:00Z Monday. A UTC slice calls it Monday.
    { id: 'tonight', date: '2026-08-24T01:00:00Z' },
    // 6 PM CDT tonight, 23:00Z Sunday: the same Central day.
    { id: 'earlier-tonight', date: '2026-08-23T23:00:00Z' },
    // Noon CDT Monday.
    { id: 'monday', date: '2026-08-24T17:00:00Z' },
    // 8 PM CDT Saturday 08-22: over.
    { id: 'last-night', date: '2026-08-23T01:00:00Z' },
  ];
  const data = { events, restaurants: [], attractions: [] };
  const ids = (rows: Array<{ id: string }>) => rows.map((r) => r.id).sort();

  it('today keeps both of tonight\'s events and not Monday\'s', () => {
    const rows = attainable('events', { temporal: { slug: 'today' } }, data, SUNDAY_EVENING);
    expect(ids(rows)).toEqual(['earlier-tonight', 'tonight']);
  });

  it('the upcoming floor is the Central day, so last night is dropped and tonight is kept', () => {
    const rows = attainable('events', {}, data, SUNDAY_EVENING);
    expect(ids(rows)).toEqual(['earlier-tonight', 'monday', 'tonight']);
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
