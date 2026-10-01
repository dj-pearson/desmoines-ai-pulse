import { describe, it, expect } from 'vitest';
import {
  getDealExpiryBadge,
  formatDealSchedule,
  isDealLiveAt,
  isDealOnToday,
  dealTodayStatus,
  filterDealsByWhen,
  normalizeDealWhen,
  type Deal,
} from '@/hooks/useDeals';

/**
 * WP7 (docs/page-plans/explore.md) and explore pass 2 WP6 item 6. Every case
 * runs against a fixed clock.
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
    is_featured: false,
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
    // Thu 07:00 CT, the next Des Moines day.
    const d = deal({ start_date: '2026-09-22T12:00:00Z', end_date: '2026-09-24T12:00:00Z' });
    expect(getDealExpiryBadge(d, WED_5PM_CT)?.text).toBe('Ends tomorrow');
  });

  it('counts Des Moines calendar days, not 24-hour blocks', () => {
    // Wed 17:00 CT -> Wed 21:00 CT is today, with the time.
    expect(getDealExpiryBadge(deal({ end_date: '2026-09-24T02:00:00Z' }), WED_5PM_CT)?.text).toBe(
      'Ends today at 9 PM',
    );
    // Thu 23:00 CT is under 36 hours away but still tomorrow, not "2 days".
    expect(getDealExpiryBadge(deal({ end_date: '2026-09-25T04:00:00Z' }), WED_5PM_CT)?.text).toBe(
      'Ends tomorrow',
    );
    // Wed 23:30 CT, 6.5 hours out: it's already Thursday in UTC, but today here.
    expect(getDealExpiryBadge(deal({ end_date: '2026-09-24T04:30:00Z' }), WED_5PM_CT)?.text).toBe(
      'Ends today at 11:30 PM',
    );
    // Sat 12:00 CT is three Des Moines days out.
    expect(getDealExpiryBadge(deal({ end_date: '2026-09-26T17:00:00Z' }), WED_5PM_CT)?.text).toBe(
      'Ends in 3 days',
    );
  });

  it('drops the minute for an end stored as 23:59 CT', () => {
    expect(getDealExpiryBadge(deal({ end_date: '2026-09-24T04:59:00Z' }), WED_5PM_CT)?.text).toBe('Ends today');
  });

  it('says nothing about a deal that already ended', () => {
    expect(getDealExpiryBadge(deal({ end_date: '2026-09-23T21:00:00Z' }), WED_5PM_CT)).toBeNull();
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

  it('today includes an overnight deal while the previous night is still running', () => {
    // Fri 21:00-02:00; Sat 01:00 CT is 06:00Z on Sat 2026-09-26.
    const friLate = deal({ days_of_week: ['fri'], start_time: '21:00:00', end_time: '02:00:00' });
    const sat1am = new Date('2026-09-26T06:00:00Z');
    expect(isDealLiveAt(friLate, sat1am)).toBe(true);
    expect(isDealOnToday(friLate, sat1am)).toBe(true);
    expect(filterDealsByWhen([friLate], 'today', sat1am)).toHaveLength(1);
    // Sat 03:00 CT: the window closed and Saturday isn't a deal day.
    expect(isDealOnToday(friLate, new Date('2026-09-26T08:00:00Z'))).toBe(false);
  });

  it('all still drops a deal that expired while the page was open', () => {
    const endsAt5 = deal({ end_date: '2026-09-23T21:59:00Z' });
    expect(filterDealsByWhen([endsAt5], 'all', new Date('2026-09-23T21:00:00Z'))).toHaveLength(1);
    expect(filterDealsByWhen([endsAt5], 'all', WED_5PM_CT)).toHaveLength(0);
  });

  it('normalises unknown when values to all', () => {
    expect(normalizeDealWhen('now')).toBe('now');
    expect(normalizeDealWhen('tomorrow')).toBe('all');
    expect(normalizeDealWhen(null)).toBe('all');
  });
});

describe('dealTodayStatus', () => {
  it('says when a later window starts, from the same clock as the badge', () => {
    // Wed 12:00 CT
    expect(dealTodayStatus(TUE_THU_4_6, new Date('2026-09-23T17:00:00Z'))).toEqual({
      kind: 'later',
      text: 'Starts 4 PM',
    });
  });

  it('is running inside the window', () => {
    expect(dealTodayStatus(TUE_THU_4_6, WED_5PM_CT)).toEqual({ kind: 'running' });
  });

  it('says Ended for today after the window closes', () => {
    // Wed 19:00 CT
    expect(dealTodayStatus(TUE_THU_4_6, new Date('2026-09-24T00:00:00Z'))).toEqual({
      kind: 'ended',
      text: 'Ended for today',
    });
  });

  it('is null on a day the deal does not run, and for a deal with no times', () => {
    expect(dealTodayStatus(TUE_THU_4_6, MON_NOON_CT)).toBeNull();
    expect(dealTodayStatus(deal({ days_of_week: ['wed'] }), WED_5PM_CT)).toBeNull();
  });

  it('an overnight window before it opens starts later, not ended', () => {
    const wedLate = deal({ days_of_week: ['wed'], start_time: '21:00:00', end_time: '02:00:00' });
    expect(dealTodayStatus(wedLate, WED_5PM_CT)).toEqual({ kind: 'later', text: 'Starts 9 PM' });
  });
});
