import { describe, it, expect } from 'vitest';
import {
  getDealExpiryBadge,
  formatDealSchedule,
  isDealLiveAt,
  isDealOnToday,
  filterDealsByWhen,
  normalizeDealWhen,
  type Deal,
} from '@/hooks/useDeals';

/**
 * WP7 (docs/page-plans/explore.md). Every case runs against a fixed clock.
 * 2026-09-23 is a Wednesday; Des Moines is on CDT (UTC-5) that week, so
 * 22:00Z is 17:00 CT.
 */
const WED_5PM_CT = new Date('2026-09-23T22:00:00Z');
const MON_NOON_CT = new Date('2026-09-21T17:00:00Z');

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'd1',
    title: 'Happy hour',
    description: null,
    business_name: 'Noce',
    entity_type: 'restaurant',
    entity_id: null,
    deal_type: 'percentage',
    discount_value: null,
    code: null,
    terms: null,
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    image_url: null,
    is_verified: false,
    is_featured: false,
    redemption_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    days_of_week: null,
    start_time: null,
    end_time: null,
    ...overrides,
  };
}

const TUE_THU_4_6 = deal({
  days_of_week: ['tue', 'wed', 'thu'],
  start_time: '16:00:00',
  end_time: '18:00:00',
});

describe('getDealExpiryBadge', () => {
  it('never says New when created_at and start_date are both older than 7 days', () => {
    // The old rule fired on any deal ending 14+ days out.
    const d = deal({ end_date: '2026-12-31T00:00:00Z' });
    expect(getDealExpiryBadge(d, WED_5PM_CT)).toBeNull();
  });

  it('says New when the deal started within the last 7 days', () => {
    const d = deal({ start_date: '2026-09-20T12:00:00Z' });
    expect(getDealExpiryBadge(d, WED_5PM_CT)?.text).toBe('New this week');
  });

  it('says New when the row was created within the last 7 days', () => {
    const d = deal({ created_at: '2026-09-22T12:00:00Z' });
    expect(getDealExpiryBadge(d, WED_5PM_CT)?.text).toBe('New this week');
  });

  it('prefers urgency over New', () => {
    const d = deal({ start_date: '2026-09-22T12:00:00Z', end_date: '2026-09-24T12:00:00Z' });
    expect(getDealExpiryBadge(d, WED_5PM_CT)?.text).toBe('Last day!');
  });

  it('counts days left inside the last week', () => {
    const d = deal({ end_date: '2026-09-28T22:00:00Z' });
    expect(getDealExpiryBadge(d, WED_5PM_CT)?.text).toBe('5 days left');
  });
});

describe('formatDealSchedule', () => {
  it('collapses a run of days and a same-meridiem window', () => {
    expect(formatDealSchedule(TUE_THU_4_6)).toBe('Tue-Thu, 4-6 PM');
  });

  it('spells out a window that crosses noon, with minutes', () => {
    expect(
      formatDealSchedule({ days_of_week: ['fri'], start_time: '11:30:00', end_time: '14:00:00' }),
    ).toBe('Fri, 11:30 AM-2 PM');
  });

  it('lists separate days and calls seven days Daily', () => {
    expect(formatDealSchedule({ days_of_week: ['mon', 'wed'], start_time: null, end_time: null })).toBe('Mon, Wed');
    expect(
      formatDealSchedule({
        days_of_week: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
        start_time: '15:00:00',
        end_time: '18:00:00',
      }),
    ).toBe('Daily, 3-6 PM');
  });

  it('is null for a deal with no recurrence', () => {
    expect(formatDealSchedule(deal())).toBeNull();
  });
});

describe('isDealLiveAt / ?when=', () => {
  it('is live on Wed at 17:00 CT and not on Mon at 12:00 CT', () => {
    expect(isDealLiveAt(TUE_THU_4_6, WED_5PM_CT)).toBe(true);
    expect(isDealLiveAt(TUE_THU_4_6, MON_NOON_CT)).toBe(false);
  });

  it('ends at end_time', () => {
    expect(isDealLiveAt(TUE_THU_4_6, new Date('2026-09-23T23:00:00Z'))).toBe(false);
  });

  it('keeps an overnight window alive after midnight on the start day', () => {
    const late = deal({ days_of_week: ['wed'], start_time: '21:00:00', end_time: '02:00:00' });
    // Thu 01:00 CT
    expect(isDealLiveAt(late, new Date('2026-09-24T06:00:00Z'))).toBe(true);
    // Wed 01:00 CT belongs to Tuesday's window, which does not exist.
    expect(isDealLiveAt(late, new Date('2026-09-23T06:00:00Z'))).toBe(false);
  });

  it('is never live outside the date range', () => {
    const expired = deal({ ...TUE_THU_4_6, end_date: '2026-09-01T00:00:00Z' });
    expect(isDealLiveAt(expired, WED_5PM_CT)).toBe(false);
  });

  it('filters the list the same way', () => {
    const allDay = deal({ id: 'd2' });
    const list = [TUE_THU_4_6, allDay];
    expect(filterDealsByWhen(list, 'now', WED_5PM_CT).map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(filterDealsByWhen(list, 'now', MON_NOON_CT).map((d) => d.id)).toEqual(['d2']);
    expect(filterDealsByWhen(list, 'all', MON_NOON_CT)).toHaveLength(2);
  });

  it('today matches the Des Moines weekday, not the UTC one', () => {
    // Wed 20:00 CT is already Thursday in UTC.
    const wedOnly = deal({ days_of_week: ['wed'] });
    expect(isDealOnToday(wedOnly, new Date('2026-09-24T01:00:00Z'))).toBe(true);
  });

  it('normalises unknown when values to all', () => {
    expect(normalizeDealWhen('now')).toBe('now');
    expect(normalizeDealWhen('tomorrow')).toBe('all');
    expect(normalizeDealWhen(null)).toBe('all');
  });
});
