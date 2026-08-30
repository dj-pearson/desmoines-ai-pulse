import { describe, it, expect } from 'vitest';
import { newestTimestamp } from '@/components/ListFreshness';

/**
 * SEO-009.
 *
 * The whole point of this helper is that it must never claim a freshness it
 * cannot demonstrate. Every "returns a date" case below is paired with a
 * "returns null" case, because a function that always returned the newest thing
 * it could find would pass a one-sided suite and still lie about an empty list.
 */

const NOW = Date.parse('2026-08-29T12:00:00.000Z');

describe('newestTimestamp — picks the real newest', () => {
  it('takes the newest updated_at across rows', () => {
    expect(
      newestTimestamp(
        [
          { updated_at: '2026-08-01T00:00:00.000Z' },
          { updated_at: '2026-08-20T00:00:00.000Z' },
          { updated_at: '2026-08-10T00:00:00.000Z' },
        ],
        NOW,
      ),
    ).toBe('2026-08-20T00:00:00.000Z');
  });

  it('falls back to created_at when a row has no updated_at', () => {
    expect(newestTimestamp([{ created_at: '2026-08-15T00:00:00.000Z' }], NOW)).toBe(
      '2026-08-15T00:00:00.000Z',
    );
  });

  it('prefers whichever of the two is actually newer', () => {
    expect(
      newestTimestamp(
        [{ updated_at: '2026-08-02T00:00:00.000Z', created_at: '2026-08-18T00:00:00.000Z' }],
        NOW,
      ),
    ).toBe('2026-08-18T00:00:00.000Z');
  });
});

describe('newestTimestamp — refuses to invent freshness', () => {
  it('returns null for an empty list', () => {
    expect(newestTimestamp([], NOW)).toBeNull();
  });

  it('returns null for null or undefined', () => {
    expect(newestTimestamp(null, NOW)).toBeNull();
    expect(newestTimestamp(undefined, NOW)).toBeNull();
  });

  it('returns null when no row carries a usable date', () => {
    // Unknown age must not render as fresh. This is the case the component
    // exists to get right.
    expect(newestTimestamp([{ updated_at: null }, { created_at: undefined }], NOW)).toBeNull();
  });

  it('ignores unparseable timestamps rather than producing Invalid Date', () => {
    expect(newestTimestamp([{ updated_at: 'not-a-date' }], NOW)).toBeNull();
    expect(
      newestTimestamp([{ updated_at: 'not-a-date' }, { updated_at: '2026-08-05T00:00:00.000Z' }], NOW),
    ).toBe('2026-08-05T00:00:00.000Z');
  });

  it('ignores a FUTURE timestamp', () => {
    // A row dated next week would make the list claim to be newer than today,
    // which reads as broken rather than fresh.
    expect(newestTimestamp([{ updated_at: '2027-01-01T00:00:00.000Z' }], NOW)).toBeNull();
  });

  it('still finds the newest VALID date when a future one is present', () => {
    // Counter-assertion for the rule above: skipping the future row must not
    // discard the rest of the list.
    expect(
      newestTimestamp(
        [{ updated_at: '2027-01-01T00:00:00.000Z' }, { updated_at: '2026-08-11T00:00:00.000Z' }],
        NOW,
      ),
    ).toBe('2026-08-11T00:00:00.000Z');
  });
});

describe('newestTimestamp — output shape', () => {
  it('returns an ISO string, so the caller can render an absolute date', () => {
    // Absolute, not relative: this text is frozen into prerendered HTML, and a
    // relative string computed at build time says "2 hours ago" forever.
    const out = newestTimestamp([{ updated_at: '2026-08-20T09:30:00.000Z' }], NOW);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
