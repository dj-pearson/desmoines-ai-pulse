import { describe, expect, it } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import { readFileSync } from 'node:fs';
import { discoverMapRestaurantStatus, isDiscoverMapRestaurantListed } from '@/lib/discoverMapRestaurant';
import { DISCOVER_MAP_RESTAURANT_COLUMNS } from '@/lib/listColumns';

/** WEB-FEAT-053: /discover-map restaurant pins read hours_json and business_status. */

// Wed 2026-09-30, Central.
const wednesdayAt = (hhmm: string) => fromZonedTime(`2026-09-30T${hhmm}:00`, 'America/Chicago');

/** Production shape: `opening` holds a date, the hours live only in hours_json. Every day 11:00-21:00. */
const productionRow = {
  status: null,
  business_status: 'OPERATIONAL',
  is_merged: false,
  opening: '2019-05-01',
  hours_json: {
    version: 1,
    timeZone: 'America/Chicago',
    periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      open: { day, hour: 11, minute: 0 },
      close: { day, hour: 21, minute: 0 },
    })),
    weekdayDescriptions: [],
  },
};

describe('discoverMapRestaurantStatus', () => {
  it('reads hours_json on a production-shaped row', () => {
    const lunch = discoverMapRestaurantStatus(productionRow, wednesdayAt('12:00'));
    expect(lunch.result.status).toBe('open');
    expect(lunch.label).toBe('Open until 9 PM');
    const early = discoverMapRestaurantStatus(productionRow, wednesdayAt('08:00'));
    expect(early.result.status).toBe('closed');
    expect(early.label).toMatch(/^Closed, opens /);
  });

  it('never treats the date in `opening` as hours (the old call)', () => {
    const noJson = discoverMapRestaurantStatus({ ...productionRow, hours_json: null }, wednesdayAt('12:00'));
    expect(noJson.result.status).toBe('unknown');
    expect(noJson.label).toBeNull();
  });

  it('still reads free-text hours when a row has no hours_json', () => {
    const text = discoverMapRestaurantStatus(
      { opening: 'Mon-Sun 11am-11pm', hours_json: null, business_status: null },
      wednesdayAt('12:00'),
    );
    expect(text.label).toBe('Open until 11 PM');
  });

  it('calls a CLOSED_TEMPORARILY place closed instead of reading the weekly hours Google keeps', () => {
    const shut = discoverMapRestaurantStatus(
      { ...productionRow, business_status: 'CLOSED_TEMPORARILY' },
      wednesdayAt('12:00'),
    );
    expect(shut.result.status).toBe('closed');
    expect(shut.result.isOpen).toBe(false);
    expect(shut.label).toBe('Temporarily closed');
  });
});

describe('isDiscoverMapRestaurantListed', () => {
  it('keeps a serving place and a temporarily closed one', () => {
    expect(isDiscoverMapRestaurantListed(productionRow)).toBe(true);
    expect(isDiscoverMapRestaurantListed({ ...productionRow, business_status: 'CLOSED_TEMPORARILY' })).toBe(true);
  });

  it('drops merged, not-yet-open and closed-for-good rows', () => {
    expect(isDiscoverMapRestaurantListed({ ...productionRow, is_merged: true })).toBe(false);
    expect(isDiscoverMapRestaurantListed({ ...productionRow, status: 'opening_soon' })).toBe(false);
    expect(isDiscoverMapRestaurantListed({ ...productionRow, status: 'announced' })).toBe(false);
    expect(isDiscoverMapRestaurantListed({ ...productionRow, status: 'closed' })).toBe(false);
    expect(isDiscoverMapRestaurantListed({ ...productionRow, status: 'permanently_closed' })).toBe(false);
    expect(isDiscoverMapRestaurantListed({ ...productionRow, business_status: 'CLOSED_PERMANENTLY' })).toBe(false);
  });
});

describe('DiscoverMap restaurant projection', () => {
  it('selects the columns discoverMapRestaurantStatus reads', () => {
    const columns = DISCOVER_MAP_RESTAURANT_COLUMNS.split(',').map((c) => c.trim());
    for (const c of ['hours_json', 'business_status', 'opening', 'status', 'is_merged']) {
      expect(columns).toContain(c);
    }
  });

  it('the page selects that projection and no longer evaluates `opening` alone', () => {
    const page = readFileSync('src/pages/DiscoverMap.tsx', 'utf8');
    expect(page).toMatch(/\.select\(DISCOVER_MAP_RESTAURANT_COLUMNS\)/);
    expect(page).toMatch(/discoverMapRestaurantStatus\(/);
    expect(page).not.toMatch(/resolveOpenStatus\(undefined/);
  });
});
