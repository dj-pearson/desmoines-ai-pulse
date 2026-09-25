import { describe, it, expect } from 'vitest';
import { NEIGHBORHOODS } from '@/lib/neighborhoods';
import { countTonightByArea, eventMatchesArea, tonightCountLabel } from '@/lib/neighborhoodTonight';

/** home pass-2 WP4 item 9: per-area tonight counts from the Tonight rail's rows. */

const ev = (city: string | null, venue: string | null = null, location: string | null = null) => ({
  city,
  venue,
  location,
});

describe('eventMatchesArea', () => {
  it('matches city, venue or location case-insensitively, as a substring', () => {
    expect(eventMatchesArea(ev('ANKENY'), ['Ankeny'])).toBe(true);
    expect(eventMatchesArea(ev(null, 'Prairie Trail Pavilion'), ['Prairie Trail'])).toBe(true);
    expect(eventMatchesArea(ev(null, null, '123 Main St, Altoona, IA'), ['Altoona'])).toBe(true);
    expect(eventMatchesArea(ev('Des Moines', 'Hoyt Sherman Place'), ['Ankeny'])).toBe(false);
  });

  it('matches nothing on an event with no place fields', () => {
    expect(eventMatchesArea(ev(null), ['Ankeny'])).toBe(false);
  });

  it('ignores blank terms', () => {
    expect(eventMatchesArea(ev('Ankeny'), ['  '])).toBe(false);
  });
});

describe('countTonightByArea', () => {
  it('counts each event once per area and every area appears', () => {
    const counts = countTonightByArea(
      [
        ev('Ankeny', 'Prairie Trail Pavilion'), // two Ankeny terms, one event
        ev('Ankeny'),
        ev('West Des Moines', 'Valley Junction'),
        ev('Des Moines', 'Wells Fargo Arena'),
      ],
      NEIGHBORHOODS,
    );
    expect(counts.ankeny).toBe(2);
    expect(counts['west-des-moines']).toBe(1);
    expect(counts.waukee).toBe(0);
    expect(Object.keys(counts).sort()).toEqual(NEIGHBORHOODS.map((n) => n.slug).sort());
  });

  it('does not count a Des Moines event for West Des Moines', () => {
    const counts = countTonightByArea([ev('Des Moines')], NEIGHBORHOODS);
    expect(counts['west-des-moines']).toBe(0);
  });
});

describe('tonightCountLabel', () => {
  it('prints an exact count, a floor when capped, and nothing at zero', () => {
    expect(tonightCountLabel(3, false)).toBe('3 tonight');
    expect(tonightCountLabel(3, true)).toBe('3+ tonight');
    expect(tonightCountLabel(0, false)).toBeNull();
    expect(tonightCountLabel(0, true)).toBeNull();
  });
});
