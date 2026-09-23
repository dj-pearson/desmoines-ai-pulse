/**
 * Tests for the restaurant title/description builder.
 *
 * The rows below are the production shapes measured 2026-09-23: `location` is
 * the full Google-formatted address, and `city` says "Des Moines" for a
 * restaurant in West Des Moines.
 */
import { describe, it, expect } from 'vitest';
import {
  parseIowaAddress,
  restaurantLocality,
  isStaleOpeningCopy,
  restaurantPageTitle,
  restaurantMetaDescription,
  readGeoFaq,
  RESTAURANT_TITLE_BUDGET,
  RESTAURANT_DESCRIPTION_BUDGET,
} from '@/lib/restaurantMeta';

const BONCHON = {
  name: 'Bonchon',
  city: 'Des Moines',
  location: '6880 EP True Pkwy Unit 104, West Des Moines, IA 50266, USA',
  cuisine: 'Korean',
  price_range: '$$',
  seo_description: 'Bonchon West Des Moines is opening soon with Korean fried chicken.',
};

describe('parseIowaAddress', () => {
  it('splits a Google-formatted address', () => {
    expect(parseIowaAddress(BONCHON.location)).toEqual({
      streetAddress: '6880 EP True Pkwy Unit 104',
      addressLocality: 'West Des Moines',
      postalCode: '50266',
    });
  });

  it('keeps a street that itself contains commas', () => {
    expect(parseIowaAddress('Jordan Creek Town Center, 101 Jordan Creek Pkwy, West Des Moines, IA 50266')).toEqual({
      streetAddress: 'Jordan Creek Town Center, 101 Jordan Creek Pkwy',
      addressLocality: 'West Des Moines',
      postalCode: '50266',
    });
  });

  it('accepts a missing ZIP', () => {
    expect(parseIowaAddress('1 Main St, Norwalk, Iowa')).toEqual({
      streetAddress: '1 Main St',
      addressLocality: 'Norwalk',
    });
  });

  it('refuses shapes it cannot read rather than guessing', () => {
    expect(parseIowaAddress('East Village')).toBeNull();
    expect(parseIowaAddress('1 Main St, Omaha, NE 68102')).toBeNull();
    expect(parseIowaAddress(null)).toBeNull();
  });
});

describe('restaurantLocality', () => {
  it('prefers the address over the city column', () => {
    expect(restaurantLocality(BONCHON)).toBe('West Des Moines');
  });
  it('falls back to the city column', () => {
    expect(restaurantLocality({ city: 'Ankeny', location: 'Uptown' })).toBe('Ankeny');
  });
  it('returns null with nothing to go on', () => {
    expect(restaurantLocality({ city: null, location: null })).toBeNull();
  });
});

describe('isStaleOpeningCopy', () => {
  it.each([
    'Coming soon!',
    'Bonchon is opening soon in West Des Moines',
    'The restaurant opens in March 2026',
    'Plans still need to be approved by the city',
    'Set to open this fall',
  ])('flags %s', (s) => expect(isStaleOpeningCopy(s)).toBe(true));

  it.each([
    'Korean fried chicken, double-fried and glazed.',
    'Open late on weekends with a full bar.',
    'Opened in 2019 by two brothers.',
  ])('passes %s', (s) => expect(isStaleOpeningCopy(s)).toBe(false));
});

describe('restaurantPageTitle', () => {
  it('names the suburb and the menu', () => {
    expect(restaurantPageTitle(BONCHON)).toBe('Bonchon West Des Moines - Menu, Hours & Reviews');
  });

  it('does not repeat a suburb the name already carries', () => {
    expect(
      restaurantPageTitle({ name: "Bubbie's Pleasant Hill", location: '1 Main St, Pleasant Hill, IA 50327' }),
    ).toBe("Bubbie's Pleasant Hill - Menu, Hours & Reviews");
  });

  it('shortens a long name to fit the budget, keeping the suburb first', () => {
    const t = restaurantPageTitle({
      name: 'Purveyor Restaurant & Wine Market',
      location: '2716 Beaver Ave, Des Moines, IA 50310',
    });
    expect(t).toBe('Purveyor Restaurant & Wine Market Des Moines - Menu & Hours');
    expect(t.length).toBeLessThanOrEqual(RESTAURANT_TITLE_BUDGET);
  });

  it('never exceeds the budget unless the bare name does', () => {
    const t = restaurantPageTitle({ name: 'A'.repeat(70), city: 'Ankeny' });
    expect(t).toBe('A'.repeat(70));
  });
});

describe('restaurantMetaDescription', () => {
  it('replaces stale pre-opening copy with facts', () => {
    const d = restaurantMetaDescription(BONCHON);
    expect(d).toBe(
      'Bonchon is a Korean restaurant at 6880 EP True Pkwy Unit 104 in West Des Moines, Iowa. $15-30 a person. Menu, hours, phone, map and directions.',
    );
    expect(d.length).toBeLessThanOrEqual(RESTAURANT_DESCRIPTION_BUDGET);
  });

  it('keeps a current hand-written description', () => {
    expect(
      restaurantMetaDescription({ ...BONCHON, seo_description: 'Double-fried Korean chicken in West Des Moines.' }),
    ).toBe('Double-fried Korean chicken in West Des Moines.');
  });

  it('clips long copy on a word boundary', () => {
    const d = restaurantMetaDescription({ name: 'X', seo_description: 'word '.repeat(60) });
    expect(d.length).toBeLessThanOrEqual(RESTAURANT_DESCRIPTION_BUDGET);
    expect(d.endsWith('word...')).toBe(true);
  });
});

describe('readGeoFaq', () => {
  it('keeps well-formed pairs and drops the rest', () => {
    expect(
      readGeoFaq([
        { question: ' Is there parking? ', answer: 'Yes, a free lot.' },
        { question: 'No answer' },
        'not an object',
        { question: 1, answer: 2 },
      ]),
    ).toEqual([{ question: 'Is there parking?', answer: 'Yes, a free lot.' }]);
  });
  it('returns [] for anything that is not an array', () => {
    expect(readGeoFaq(null)).toEqual([]);
    expect(readGeoFaq({ question: 'q', answer: 'a' })).toEqual([]);
  });
});
