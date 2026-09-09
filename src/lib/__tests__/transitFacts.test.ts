/**
 * Tests for sourced transit facts (WEB-FEAT-023).
 *
 * The load-bearing test is the last one. Every fact set has to be re-checked
 * against its source periodically, and a comment saying so is not a control -
 * this suite fails once a set goes past its verification window, the same way
 * check-annual-dates.mjs fails on a stale State Fair date.
 */
import { describe, it, expect } from 'vitest';
import {
  DART_FARES,
  TRANSIT_FACT_SETS,
  VERIFICATION_MAX_AGE_DAYS,
  daysSinceVerified,
  isVerificationStale,
  verificationLine,
} from '../transitFacts';

describe('DART fares', () => {
  it('carries the values confirmed against ridedart.com on 2026-09-09', () => {
    const byLabel = Object.fromEntries(DART_FARES.facts.map((f) => [f.label, f.value]));
    expect(byLabel['One trip']).toBe('$1.75');
    expect(byLabel['Half fare']).toBe('$0.75');
    expect(byLabel['Day pass']).toBe('$4');
    expect(byLabel['Weekly pass']).toBe('$16');
    expect(byLabel['Monthly pass']).toBe('$48');
  });

  it('does not carry the DART On Demand fare, which is a different service', () => {
    // $3.50 sits next to the bus fares on the same page and is easy to misread
    // as a day pass.
    const values = DART_FARES.facts.map((f) => f.value);
    expect(values).not.toContain('$3.50');
  });

  it('names its source', () => {
    expect(DART_FARES.sourceUrl).toContain('ridedart.com');
    expect(DART_FARES.sourceName.length).toBeGreaterThan(0);
  });
});

describe('daysSinceVerified', () => {
  it('counts whole days from the verification date', () => {
    expect(
      daysSinceVerified({ verifiedAt: '2026-09-09' }, new Date('2026-09-19T00:00:00Z')),
    ).toBe(10);
  });

  it('is zero on the day itself', () => {
    expect(
      daysSinceVerified({ verifiedAt: '2026-09-09' }, new Date('2026-09-09T12:00:00Z')),
    ).toBe(0);
  });

  it('treats an unparseable date as infinitely old rather than fresh', () => {
    // Failing open here would mean a typo silently disables the staleness check.
    expect(daysSinceVerified({ verifiedAt: 'whenever' })).toBe(Number.POSITIVE_INFINITY);
    expect(isVerificationStale({ verifiedAt: 'whenever' })).toBe(true);
  });
});

describe('isVerificationStale', () => {
  it('is false inside the window and true past it', () => {
    const base = { verifiedAt: '2026-01-01' };
    const inside = new Date('2026-01-01T00:00:00Z');
    inside.setUTCDate(inside.getUTCDate() + VERIFICATION_MAX_AGE_DAYS);
    const outside = new Date(inside);
    outside.setUTCDate(outside.getUTCDate() + 1);

    expect(isVerificationStale(base, inside)).toBe(false);
    expect(isVerificationStale(base, outside)).toBe(true);
  });
});

describe('verificationLine', () => {
  it('states when it was checked while fresh', () => {
    const line = verificationLine(DART_FARES, new Date(`${DART_FARES.verifiedAt}T00:00:00Z`));
    expect(line).toContain('Checked against DART');
    expect(line).toContain('2026');
  });

  it('warns rather than reassures once stale', () => {
    const stale = { ...DART_FARES, verifiedAt: '2020-01-01' };
    const line = verificationLine(stale);
    expect(line).toMatch(/may have changed/i);
    expect(line).toContain('DART');
  });
});

describe('the registry stays fresh', () => {
  it.each(TRANSIT_FACT_SETS.map((s) => [s.id, s] as const))(
    '%s has a well-formed verification date',
    (_id, set) => {
      expect(set.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(daysSinceVerified(set)).toBeGreaterThanOrEqual(0);
    },
  );

  // THE CONTROL. When this fails, do not bump the date - re-check the fares at
  // the source URL, correct any that moved, and then bump it.
  it.each(TRANSIT_FACT_SETS.map((s) => [s.id, s] as const))(
    '%s has been verified recently enough to publish',
    (_id, set) => {
      expect(
        isVerificationStale(set),
        `${set.id} was last verified ${daysSinceVerified(set)} days ago against ${set.sourceUrl}. ` +
          `Re-check the values, correct any that changed, then update verifiedAt.`,
      ).toBe(false);
    },
  );
});
