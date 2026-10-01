import { describe, it, expect } from 'vitest';
import { lastUpdatedLabel, neighborhoodLink, scheduleHoursSentence } from '@/lib/restaurantAtAGlance';

// 2026-10-02 is a Friday. 17:00Z is noon in Des Moines.
const FRIDAY = new Date('2026-10-02T17:00:00Z');
const SATURDAY = new Date('2026-10-03T17:00:00Z');
const SUNDAY = new Date('2026-10-04T17:00:00Z');
// 03:00Z Saturday is still 10 PM Friday in Des Moines.
const FRIDAY_NIGHT_UTC_SATURDAY = new Date('2026-10-03T03:00:00Z');

/** Atlas Cafe's production hours_json, 2026-10-01: Mon-Fri 7 AM - 2 PM, no weekend periods. */
const WEEKDAYS = {
  version: 1,
  periods: [1, 2, 3, 4, 5].map((day) => ({
    open: { day, hour: 7, minute: 0 },
    close: { day, hour: 14, minute: 0 },
  })),
};

describe('scheduleHoursSentence', () => {
  it('names the day and its hours, phrased so it stays true after the build', () => {
    expect(scheduleHoursSentence(WEEKDAYS, null, FRIDAY)).toBe('Open 7 AM to 2 PM on Fridays');
  });

  it('reads the day in Central time, not UTC', () => {
    expect(scheduleHoursSentence(WEEKDAYS, null, FRIDAY_NIGHT_UTC_SATURDAY)).toBe('Open 7 AM to 2 PM on Fridays');
  });

  it("says closed on a day Google's structured hours leave out", () => {
    expect(scheduleHoursSentence(WEEKDAYS, null, SATURDAY)).toBe('Closed on Saturdays');
  });

  it('spells out a split day', () => {
    const split = {
      periods: [
        { open: { day: 5, hour: 11, minute: 0 }, close: { day: 5, hour: 14, minute: 0 } },
        { open: { day: 5, hour: 17, minute: 30 }, close: { day: 5, hour: 21, minute: 0 } },
      ],
    };
    expect(scheduleHoursSentence(split, null, FRIDAY)).toBe('Open 11 AM to 2 PM and 5:30 PM to 9 PM on Fridays');
  });

  it('carries a close past midnight on the opening day', () => {
    const late = { periods: [{ open: { day: 5, hour: 17, minute: 0 }, close: { day: 6, hour: 2, minute: 0 } }] };
    expect(scheduleHoursSentence(late, null, FRIDAY)).toBe('Open 5 PM to 2 AM on Fridays');
  });

  it("reads Google's open-around-the-clock encoding", () => {
    const always = { periods: [{ open: { day: 0, hour: 0, minute: 0 } }] };
    expect(scheduleHoursSentence(always, null, FRIDAY)).toBe('Open 24 hours on Fridays');
  });

  it('gives nothing when a period has no close and is not the 24-hour shape', () => {
    const broken = { periods: [{ open: { day: 5, hour: 11, minute: 0 } }, ...WEEKDAYS.periods] };
    expect(scheduleHoursSentence(broken, null, FRIDAY)).toBeNull();
  });

  it('falls back to free-text hours', () => {
    expect(scheduleHoursSentence(null, 'Mon-Sat 11am-10pm, Sun 12-9pm', FRIDAY)).toBe('Open 11 AM to 10 PM on Fridays');
  });

  it('does not call a day closed when the free text never mentions it', () => {
    expect(scheduleHoursSentence(null, 'Mon-Fri 11am-9pm', SUNDAY)).toBeNull();
  });

  it('does call it closed when the free text says so', () => {
    expect(scheduleHoursSentence(null, 'Mon-Sat 11am-9pm, Closed Sunday', SUNDAY)).toBe('Closed on Sundays');
  });

  it('never guesses: no hours, or a date in `opening`, gives null', () => {
    expect(scheduleHoursSentence(null, null, FRIDAY)).toBeNull();
    expect(scheduleHoursSentence({ periods: [] }, null, FRIDAY)).toBeNull();
    // SEO-054: `opening` is a date column in production.
    expect(scheduleHoursSentence(null, '2026-03-15', FRIDAY)).toBeNull();
  });
});

describe('lastUpdatedLabel', () => {
  it('formats updated_at as a Central date', () => {
    expect(lastUpdatedLabel('2026-10-01T04:13:18.473998+00:00')).toBe('September 30, 2026');
    expect(lastUpdatedLabel('2026-10-01T15:00:00Z')).toBe('October 1, 2026');
  });

  it('is null for anything that is not a date', () => {
    expect(lastUpdatedLabel(null)).toBeNull();
    expect(lastUpdatedLabel('')).toBeNull();
    expect(lastUpdatedLabel('not a date')).toBeNull();
  });
});

describe('neighborhoodLink', () => {
  it('links the suburb page from the address locality', () => {
    expect(neighborhoodLink({}, 'West Des Moines')).toEqual({
      href: '/neighborhoods/west-des-moines',
      label: 'West Des Moines restaurants and things to do',
    });
  });

  it('prefers the neighborhood column when it names a page', () => {
    expect(neighborhoodLink({ neighborhood: 'East Village' }, 'Des Moines')?.href).toBe('/neighborhoods/east-village');
  });

  it('links nowhere for a place with no page', () => {
    expect(neighborhoodLink({}, 'Davenport')).toBeNull();
    expect(neighborhoodLink({}, 'Des Moines')).toBeNull();
    expect(neighborhoodLink({ neighborhood: null }, null)).toBeNull();
  });
});
