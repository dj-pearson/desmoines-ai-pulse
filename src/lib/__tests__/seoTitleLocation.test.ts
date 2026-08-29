import { describe, it, expect } from 'vitest';
import { qualifyTitleWithCity, titleNamesCity } from '@/lib/seoTitleLocation';

/**
 * SEO-005.
 *
 * The case: /restaurants/texas-roadhouse (Johnston) and
 * /restaurants/texas-roadhouse-2 (Mills Civic Pkwy, West Des Moines) are two
 * REAL restaurants that both served the title "Texas Roadhouse", because both
 * rows carry a hand-set seo_title of exactly that and it overrides the generated
 * fallback that would have named the city.
 *
 * Both directions matter and the second is the dangerous one. Under-qualifying
 * leaves the two branches indistinguishable; over-qualifying rewrites an
 * editor's title, or stutters a city into a title that already names it.
 */

describe('titleNamesCity', () => {
  it('matches a plain occurrence', () => {
    expect(titleNamesCity('Texas Roadhouse West Des Moines', 'West Des Moines')).toBe(true);
  });

  it('ignores case and punctuation', () => {
    expect(titleNamesCity('Bonchon - WEST DES MOINES, IA', 'West Des Moines')).toBe(true);
  });

  it('matches the abbreviations that appear in real titles', () => {
    expect(titleNamesCity('Zombie Burger DSM', 'Des Moines')).toBe(true);
    expect(titleNamesCity('Fresko WDM', 'West Des Moines')).toBe(true);
  });

  it('does not match a different city', () => {
    expect(titleNamesCity('Texas Roadhouse Johnston', 'West Des Moines')).toBe(false);
  });

  it('does not match a substring inside another word', () => {
    // "Clive" must not match inside "Cliveden", or a title would be judged to
    // name a city it never mentions.
    expect(titleNamesCity('The Cliveden Room', 'Clive')).toBe(false);
  });

  it('an empty city never matches', () => {
    expect(titleNamesCity('Texas Roadhouse', '')).toBe(false);
  });
});

describe('qualifyTitleWithCity — fills the gap', () => {
  it('qualifies the bare title that caused the collision', () => {
    expect(qualifyTitleWithCity('Texas Roadhouse', 'Johnston')).toBe('Texas Roadhouse - Johnston');
    expect(qualifyTitleWithCity('Texas Roadhouse', 'West Des Moines')).toBe(
      'Texas Roadhouse - West Des Moines',
    );
  });

  it('gives the two branches DIFFERENT titles, which is the whole point', () => {
    const a = qualifyTitleWithCity('Texas Roadhouse', 'Johnston');
    const b = qualifyTitleWithCity('Texas Roadhouse', 'West Des Moines');
    expect(a).not.toBe(b);
  });

  it('inserts before the first separator so the suffix stays last', () => {
    expect(qualifyTitleWithCity('Bonchon | Menu, Hours & Reviews', 'West Des Moines')).toBe(
      'Bonchon - West Des Moines | Menu, Hours & Reviews',
    );
  });
});

describe('qualifyTitleWithCity — never overrides an editor', () => {
  it('leaves a title that already names the city untouched', () => {
    const t = 'Texas Roadhouse West Des Moines - Steakhouse';
    expect(qualifyTitleWithCity(t, 'West Des Moines')).toBe(t);
  });

  it('leaves the generated fallback untouched, since it already carries the city', () => {
    const t = 'Texas Roadhouse - Steakhouse in Johnston, Iowa | Menu, Hours & Reviews';
    expect(qualifyTitleWithCity(t, 'Johnston')).toBe(t);
  });

  it('does not stutter when the title uses an abbreviation', () => {
    expect(qualifyTitleWithCity('Fresko WDM', 'West Des Moines')).toBe('Fresko WDM');
  });

  it('adds nothing when the row has no city, rather than inventing one', () => {
    expect(qualifyTitleWithCity('Texas Roadhouse', null)).toBe('Texas Roadhouse');
    expect(qualifyTitleWithCity('Texas Roadhouse', '')).toBe('Texas Roadhouse');
    expect(qualifyTitleWithCity('Texas Roadhouse', '   ')).toBe('Texas Roadhouse');
  });

  it('returns an empty title as empty rather than as a bare city name', () => {
    expect(qualifyTitleWithCity('', 'Johnston')).toBe('');
    expect(qualifyTitleWithCity(null, 'Johnston')).toBe('');
  });

  it('is idempotent — running it twice does not append twice', () => {
    const once = qualifyTitleWithCity('Texas Roadhouse', 'Johnston');
    expect(qualifyTitleWithCity(once, 'Johnston')).toBe(once);
  });
});

describe('qualifyTitleWithCity — ASCII only, per the house rule', () => {
  it('uses a plain hyphen, not an en or em dash', () => {
    const out = qualifyTitleWithCity('Texas Roadhouse', 'Johnston');
    expect(out).toContain(' - ');
    expect(out).not.toMatch(/[–—]/);
  });
});
