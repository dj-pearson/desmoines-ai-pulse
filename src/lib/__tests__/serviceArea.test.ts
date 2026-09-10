import { describe, it, expect } from 'vitest';
import { isOutsideIowa } from '@/lib/serviceArea';

describe('WEB-SEO-037 isOutsideIowa', () => {
  it('keeps Iowa rows', () => {
    for (const loc of [
      '1234 Main St, Des Moines, IA 50309',
      'Ankeny, IA',
      '500 Grand Ave, Des Moines, Iowa',
    ]) {
      expect(isOutsideIowa(loc), loc).toBe(false);
    }
  });

  it('drops rows that name another state', () => {
    for (const loc of [
      '4033 SE Woodstock Blvd, Portland, OR 97202',
      'Seattle, WA',
      '1000 Blake St, Denver, CO 80202',
      'Kansas City, Missouri',
    ]) {
      expect(isOutsideIowa(loc), loc).toBe(true);
    }
  });

  it('does not mistake an Iowa town for a state code', () => {
    // The reason this is a regex and not `location NOT ILIKE '%, OR%'`.
    for (const loc of [
      '210 Central Ave, Orange City, IA 51041',
      '123 W Main, Independence, IA',
      'Indianola, IA 50125',
    ]) {
      expect(isOutsideIowa(loc), loc).toBe(false);
    }
  });

  it('keeps a row with no state at all rather than guessing', () => {
    expect(isOutsideIowa('1234 Main St, Ankeny')).toBe(false);
    expect(isOutsideIowa('')).toBe(false);
    expect(isOutsideIowa(null)).toBe(false);
  });
});
