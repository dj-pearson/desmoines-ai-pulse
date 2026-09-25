import { describe, it, expect } from 'vitest';
import {
  eventLowerBoundFilter,
  eventStatusLabel,
  eventWindow,
  inEventWindow,
  type MapEventTiming,
} from '@/lib/mapEventWindow';

// Fri 2026-10-02, CDT (UTC-5).
const FRI_1910 = Date.parse('2026-10-03T00:10:00Z'); // 19:10 CT
const FRI_1900 = Date.parse('2026-10-03T00:00:00Z'); // 19:00 CT
const FRI_UNTIMED = Date.parse('2026-10-03T00:31:58Z'); // the 19:31:58 CT marker
// Mon 2026-09-28 10:00 CT.
const MON_10 = Date.parse('2026-09-28T15:00:00Z');
const FRI_MIDNIGHT_CT = '2026-10-02T05:00:00.000Z';

const timed = (startMs: number, endMs?: number): MapEventTiming => ({ startMs, endMs, timed: true });

describe('mapEventWindow', () => {
  it('keeps a 7 PM show with no end on Tonight at 7:10 PM and says it started', () => {
    const w = eventWindow('tonight', FRI_1910)!;
    const row = timed(FRI_1900);
    expect(inEventWindow(row, w, FRI_1910)).toBe(true);
    expect(eventStatusLabel(row, FRI_1910)).toBe('Started 7 PM');
  });

  it('keeps it on Now too, and drops it once the grace has passed', () => {
    const row = timed(FRI_1900);
    expect(inEventWindow(row, eventWindow('now', FRI_1910)!, FRI_1910)).toBe(true);
    const late = FRI_1900 + 2 * 60 * 60 * 1000 + 60_000;
    expect(inEventWindow(row, eventWindow('tonight', late)!, late)).toBe(false);
  });

  it('keeps a run whose end has not passed', () => {
    const row = timed(FRI_1900 - 6 * 60 * 60 * 1000, FRI_1900 + 60 * 60 * 1000);
    expect(inEventWindow(row, eventWindow('tonight', FRI_1910)!, FRI_1910)).toBe(true);
    expect(eventStatusLabel(row, FRI_1910)).toBe('Happening now');
  });

  it('never prints the untimed marker as a showtime', () => {
    const row: MapEventTiming = { startMs: FRI_UNTIMED, timed: false };
    const today = eventStatusLabel(row, FRI_1910)!;
    expect(today).toBe('Today');
    expect(today).not.toContain('7:31');
    const fromMonday = eventStatusLabel(row, MON_10)!;
    expect(fromMonday).toBe('Fri, Oct 2');
    expect(fromMonday).not.toContain('7:31');
  });

  it('keeps an untimed row under Tonight for its whole day', () => {
    const row: MapEventTiming = { startMs: FRI_UNTIMED, timed: false };
    const tenPm = Date.parse('2026-10-03T03:00:00Z');
    expect(inEventWindow(row, eventWindow('tonight', tenPm)!, tenPm)).toBe(true);
  });

  it('on a Monday, This weekend starts Friday and gives no grace before it', () => {
    const w = eventWindow('weekend', MON_10)!;
    expect(new Date(w.from).toISOString()).toBe(FRI_MIDNIGHT_CT);
    const thursdayLate = Date.parse(FRI_MIDNIGHT_CT) - 30 * 60 * 1000;
    expect(inEventWindow(timed(thursdayLate), w, MON_10)).toBe(false);
    expect(inEventWindow(timed(FRI_1900), w, MON_10)).toBe(true);
    expect(eventLowerBoundFilter('weekend', MON_10)).toBe(
      `date.gte.${FRI_MIDNIGHT_CT},end_date.gte.${FRI_MIDNIGHT_CT}`,
    );
  });

  it('asks for "not over" at the window start once the window has begun', () => {
    const f = eventLowerBoundFilter('any', FRI_1910);
    // 19:10 CT minus two hours.
    expect(f).toContain('date.gte.2026-10-02T22:10:00.000Z');
    expect(f).toContain('end_date.gte.2026-10-03T00:10:00.000Z');
    expect(f).toContain('date.eq.2026-10-03T00:31:58.000Z');
    expect(eventLowerBoundFilter('now', FRI_1910)).toBe(f);
  });
});
