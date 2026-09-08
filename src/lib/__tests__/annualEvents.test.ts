/**
 * Tests for the annual event registry (WEB-FEAT-029).
 *
 * The boundary cases are the point. This page shipped a fair two years gone
 * once already, and the subtle version of the same bug is calling the fair over
 * while it is still running, because `new Date('2026-08-23')` is midnight UTC -
 * which is 7pm the previous evening in Des Moines.
 */
import { describe, it, expect } from 'vitest';
import {
  ANNUAL_EVENTS,
  annualEventStatus,
  getAnnualEvent,
  isAnnualEventStale,
  staleAnnualEventCopy,
} from '../annualEvents';

const FAIR_2027 = { startISO: '2027-08-12', endISO: '2027-08-22' };

/** A UTC instant, so each case states exactly which moment it means. */
const at = (iso: string) => new Date(iso);

describe('annualEventStatus', () => {
  it('is upcoming before the first day', () => {
    expect(annualEventStatus(FAIR_2027, at('2027-08-11T12:00:00Z'))).toBe('upcoming');
  });

  it('is running on the first day', () => {
    expect(annualEventStatus(FAIR_2027, at('2027-08-12T12:00:00Z'))).toBe('running');
  });

  it('is running on the last day', () => {
    expect(annualEventStatus(FAIR_2027, at('2027-08-22T12:00:00Z'))).toBe('running');
  });

  it('is ended the day after', () => {
    expect(annualEventStatus(FAIR_2027, at('2027-08-23T12:00:00Z'))).toBe('ended');
  });

  it('still says running late on the final evening in Des Moines', () => {
    // 2027-08-23T02:00Z is 21:00 on 2027-08-22 in Central time. A UTC-based
    // comparison would call the fair over three hours before it closed.
    expect(annualEventStatus(FAIR_2027, at('2027-08-23T02:00:00Z'))).toBe('running');
  });

  it('says ended once it is genuinely the next day in Des Moines', () => {
    // 2027-08-23T06:00Z is 01:00 on 2027-08-23 in Central time.
    expect(annualEventStatus(FAIR_2027, at('2027-08-23T06:00:00Z'))).toBe('ended');
  });

  it('does not start early on the eve, Central time', () => {
    // 2027-08-12T02:00Z is 21:00 on 2027-08-11 in Central time.
    expect(annualEventStatus(FAIR_2027, at('2027-08-12T02:00:00Z'))).toBe('upcoming');
  });
});

describe('isAnnualEventStale', () => {
  it('is true only once the event has ended', () => {
    expect(isAnnualEventStale(FAIR_2027, at('2027-08-22T12:00:00Z'))).toBe(false);
    expect(isAnnualEventStale(FAIR_2027, at('2027-08-24T12:00:00Z'))).toBe(true);
  });
});

describe('the registry itself', () => {
  it('is not empty', () => {
    expect(ANNUAL_EVENTS.length).toBeGreaterThan(0);
  });

  it('holds the Iowa State Fair', () => {
    expect(getAnnualEvent('iowa-state-fair')).toBeDefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(getAnnualEvent('nope')).toBeUndefined();
  });

  it.each(ANNUAL_EVENTS.map((e) => [e.id, e] as const))(
    '%s has coherent, well-formed dates',
    (_id, event) => {
      const isoDate = /^\d{4}-\d{2}-\d{2}$/;
      expect(event.startISO).toMatch(isoDate);
      expect(event.endISO).toMatch(isoDate);
      expect(event.verifiedAt).toMatch(isoDate);
      // Lexicographic order is calendar order for zero-padded ISO dates.
      expect(event.startISO < event.endISO).toBe(true);
      // The label and the machine-readable dates must agree on the year, which
      // is exactly the disagreement WEB-SEO-015 found in the old page.
      expect(event.rangeLabel).toContain(String(event.year));
      expect(event.startISO.startsWith(String(event.year))).toBe(true);
      expect(event.endISO.startsWith(String(event.year))).toBe(true);
      expect(event.route.startsWith('/')).toBe(true);
    },
  );
});

describe('staleAnnualEventCopy', () => {
  it('names this year as over and next year as unannounced', () => {
    const fair = getAnnualEvent('iowa-state-fair')!;
    const copy = staleAnnualEventCopy(fair);
    expect(copy.headline).toContain(String(fair.year));
    expect(copy.headline).toContain('has ended');
    expect(copy.detail).toContain(String(fair.year + 1));
    // It must never present a date it does not have.
    expect(copy.detail).not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/);
  });
});
