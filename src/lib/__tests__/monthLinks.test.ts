import { describe, it, expect } from 'vitest';
import { upcomingMonths } from '@/components/seo/MonthLinks';

/**
 * SEO-016.
 *
 * The slugs these produce must match the pattern EventsSegmentHandler dispatches
 * on and the middleware's MONTH_YEAR regex, or the link 404s into the SPA
 * fallback - which answers 200 with the homepage shell, so it would not fail
 * loudly.
 */

// The exact pattern from src/components/EventsSegmentHandler.tsx.
const MONTH_YEAR_PATTERN =
  /^(january|february|march|april|may|june|july|august|september|october|november|december)-\d{4}$/i;

describe('upcomingMonths', () => {
  it('starts with the month it is given', () => {
    const [first] = upcomingMonths(new Date(2026, 7, 29), 6); // August 2026
    expect(first.slug).toBe('august-2026');
    expect(first.label).toBe('August 2026');
    expect(first.href).toBe('/events/august-2026');
  });

  it('returns the requested count', () => {
    expect(upcomingMonths(new Date(2026, 7, 29), 6)).toHaveLength(6);
    expect(upcomingMonths(new Date(2026, 7, 29), 3)).toHaveLength(3);
  });

  it('rolls over the year correctly', () => {
    // The case nobody tests until January. November 2026 + 4 months.
    const slugs = upcomingMonths(new Date(2026, 10, 15), 4).map((m) => m.slug);
    expect(slugs).toEqual(['november-2026', 'december-2026', 'january-2027', 'february-2027']);
  });

  it('is not affected by the day of the month', () => {
    // Building from `new Date(y, m + i, 1)` rather than mutating the input date
    // matters: starting on the 31st and adding a month lands in the month after
    // next for any 30-day month.
    const from31 = upcomingMonths(new Date(2026, 0, 31), 3).map((m) => m.slug);
    expect(from31).toEqual(['january-2026', 'february-2026', 'march-2026']);
  });

  it('every slug matches the pattern the router dispatches on', () => {
    const months = upcomingMonths(new Date(2026, 7, 29), 12);
    expect(months.every((m) => MONTH_YEAR_PATTERN.test(m.slug))).toBe(true);
    // Not vacuous: the list is genuinely populated.
    expect(months).toHaveLength(12);
  });

  it('the pattern would reject a malformed slug', () => {
    // Counter-assertion for the check above. If the pattern matched anything,
    // that test would pass whatever the generator emitted.
    expect(MONTH_YEAR_PATTERN.test('sept-2026')).toBe(false);
    expect(MONTH_YEAR_PATTERN.test('september-26')).toBe(false);
    expect(MONTH_YEAR_PATTERN.test('september')).toBe(false);
  });

  it('hrefs carry no trailing slash, which SEO-004 would 301', () => {
    expect(upcomingMonths(new Date(2026, 7, 29), 12).every((m) => !m.href.endsWith('/'))).toBe(true);
  });

  it('produces no duplicate months', () => {
    const slugs = upcomingMonths(new Date(2026, 7, 29), 12).map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
