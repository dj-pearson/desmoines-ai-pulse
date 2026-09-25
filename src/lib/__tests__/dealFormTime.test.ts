import { afterEach, describe, expect, it } from 'vitest';
import { fromCentralInput, nowCentralInput, toCentralInput } from '@/lib/dealFormTime';

/**
 * Explore pass 2 WP6 item 1. The old form filled inputs with UTC wall time and
 * parsed them as browser-local time, so every save moved a deal 5-6 hours.
 * Each case runs with the process in UTC and in Des Moines, since the bug only
 * showed when those two differ from each other.
 */
const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

// Postgres returns timestamptz with a +00:00 offset and sometimes seconds.
const STORED_START = '2026-09-23T22:00:00+00:00';
const STORED_END = '2026-12-31T23:59:59.123+00:00';

for (const zone of ['UTC', 'America/Chicago']) {
  describe(`deal form times with the process in ${zone}`, () => {
    it('shows a stored instant as Des Moines wall time', () => {
      process.env.TZ = zone;
      // 22:00 UTC is 17:00 CDT.
      expect(toCentralInput(STORED_START)).toBe('2026-09-23T17:00');
      // January is CST, UTC-6.
      expect(toCentralInput('2027-01-15T18:30:00Z')).toBe('2027-01-15T12:30');
    });

    it('reads an input as Des Moines wall time', () => {
      process.env.TZ = zone;
      expect(fromCentralInput('2026-09-23T17:00')).toBe('2026-09-23T22:00:00.000Z');
      expect(fromCentralInput('2027-01-15T12:30')).toBe('2027-01-15T18:30:00.000Z');
    });

    it('open and save without changes leaves both dates byte-identical', () => {
      process.env.TZ = zone;
      const startInput = toCentralInput(STORED_START);
      const endInput = toCentralInput(STORED_END);
      expect(fromCentralInput(startInput, STORED_START)).toBe(STORED_START);
      expect(fromCentralInput(endInput, STORED_END)).toBe(STORED_END);
    });

    it('an edited input is re-read, not replaced by the original', () => {
      process.env.TZ = zone;
      expect(fromCentralInput('2026-09-23T18:00', STORED_START)).toBe('2026-09-23T23:00:00.000Z');
    });

    it('re-reading its own output is stable without an original', () => {
      process.env.TZ = zone;
      const iso = fromCentralInput('2026-11-01T01:30');
      expect(iso).not.toBeNull();
      expect(toCentralInput(iso)).toBe('2026-11-01T01:30');
    });
  });
}

describe('edge values', () => {
  it('empty and malformed values are null or empty', () => {
    expect(toCentralInput(null)).toBe('');
    expect(toCentralInput('not a date')).toBe('');
    expect(fromCentralInput('')).toBeNull();
    expect(fromCentralInput('2026-09-23')).toBeNull();
  });

  it('the default start is the current Des Moines minute', () => {
    expect(nowCentralInput(new Date('2026-09-24T03:15:00Z'))).toBe('2026-09-23T22:15');
  });
});
