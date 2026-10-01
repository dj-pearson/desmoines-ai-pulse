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
  restaurantSeoTitleProblems,
  restaurantSeoDescriptionProblems,
  readGeoFaq,
  currentDescription,
  acceptsReservationsOf,
  buildRestaurantSchema,
  priceTier,
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
  opening: 'Daily 11am-10pm',
  menu_url: 'https://bonchon.com/menu',
  phone: '515-555-0100',
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
    expect(restaurantPageTitle(BONCHON)).toBe('Bonchon West Des Moines: Menu, Hours & Reviews');
  });

  it('does not repeat a suburb the name already carries', () => {
    expect(
      restaurantPageTitle({
        name: "Bubbie's Pleasant Hill",
        location: '1 Main St, Pleasant Hill, IA 50327',
        hasMenu: true,
        hasHours: true,
      }),
    ).toBe("Bubbie's Pleasant Hill: Menu, Hours & Reviews");
  });

  it('shortens a long name to fit the budget, keeping the suburb first', () => {
    const t = restaurantPageTitle({
      name: 'Purveyor Restaurant & Wine Market',
      location: '2716 Beaver Ave, Des Moines, IA 50310',
      hasMenu: true,
      hasHours: true,
    });
    expect(t).toBe('Purveyor Restaurant & Wine Market Des Moines: Menu & Hours');
    expect(t.length).toBeLessThanOrEqual(RESTAURANT_TITLE_BUDGET);
  });

  it('says Menu and Hours only when the page has them', () => {
    const base = { name: 'Atlas Cafe', location: '1 Main St, Des Moines, IA 50309' };
    expect(restaurantPageTitle(base)).toBe('Atlas Cafe Des Moines: Reviews');
    expect(restaurantPageTitle({ ...base, opening: 'Daily 7am-3pm' })).toBe('Atlas Cafe Des Moines: Hours & Reviews');
    expect(restaurantPageTitle({ ...base, menu_url: 'javascript:alert(1)' })).toBe('Atlas Cafe Des Moines: Reviews');
    // The page's own flags win over the row, e.g. a captured menu with no menu_url.
    expect(restaurantPageTitle({ ...base, hasMenu: true })).toBe('Atlas Cafe Des Moines: Menu & Reviews');
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
      'Bonchon is a Korean restaurant at 6880 EP True Pkwy Unit 104 in West Des Moines, Iowa. $$ on Google. Menu, hours, phone and directions.',
    );
    expect(d.length).toBeLessThanOrEqual(RESTAURANT_DESCRIPTION_BUDGET);
  });

  it('names only what the page has, and no dollar band', () => {
    const d = restaurantMetaDescription({
      name: 'Atlas Cafe',
      location: '1 Main St, Des Moines, IA 50309',
      price_range: '$',
    });
    expect(d).toBe('Atlas Cafe is a restaurant at 1 Main St in Des Moines, Iowa. $ on Google. Directions.');
    expect(d).not.toMatch(/\$\d/);
  });

  it('keeps a current hand-written description', () => {
    expect(
      restaurantMetaDescription({ ...BONCHON, seo_description: 'Double-fried Korean chicken at 6880 EP True Pkwy, West Des Moines.' }),
    ).toBe('Double-fried Korean chicken at 6880 EP True Pkwy, West Des Moines.');
  });

  it('replaces an over-long description with the template, and clips the template on a word boundary', () => {
    const d = restaurantMetaDescription({ name: 'X', seo_description: 'word '.repeat(60) });
    expect(d).toBe('X is a restaurant in Des Moines, Iowa.');
    const long = restaurantMetaDescription({ name: 'word '.repeat(40).trim() });
    expect(long.length).toBeLessThanOrEqual(RESTAURANT_DESCRIPTION_BUDGET);
    expect(long.endsWith('word...')).toBe(true);
  });

  // SEO-030: production rows, 2026-09-30.
  it('replaces a description with the wrong cuisine or suburb', () => {
    const bandit = {
      name: 'Bandit Burrito',
      location: '5340 Merle Hay Rd, Johnston, IA 50131, USA',
      cuisine: 'Mexican',
      seo_description:
        'Discover Bandit Burrito in Johnston, serving delicious affordable American cuisine. Local favorite for quick, tasty meals near Des Moines with budget-friendly prices.',
    };
    expect(restaurantSeoDescriptionProblems(bandit.seo_description, bandit)).toEqual(['too-long', 'no-cuisine', 'no-fact']);
    expect(restaurantMetaDescription(bandit)).toBe(
      'Bandit Burrito is a Mexican restaurant at 5340 Merle Hay Rd in Johnston, Iowa. Directions.',
    );
    const tasteOfNy = {
      name: 'Taste of New York Pizza Bar',
      location: '165 S Jordan Creek Pkwy Suite 160, West Des Moines, IA 50266, USA',
      cuisine: 'Pizza',
      seo_description: 'Taste of New York Pizza Bar brings authentic Italian pizza to Pleasant Hill, IA.',
    };
    expect(restaurantSeoDescriptionProblems(tasteOfNy.seo_description, tasteOfNy)).toEqual(['no-city', 'no-fact']);
  });

  it('uses "an" and a venue noun where the cuisine already says what the place is', () => {
    expect(restaurantMetaDescription({ name: 'Bix', cuisine: 'American', city: 'Ankeny' })).toBe(
      'Bix is an American restaurant in Ankeny, Iowa.',
    );
    expect(restaurantMetaDescription({ name: 'Jungle Tea', cuisine: 'Café (Boba Tea/Desserts)', city: 'Des Moines' })).toBe(
      'Jungle Tea is a Café (Boba Tea/Desserts) spot in Des Moines, Iowa.',
    );
  });

  it('keeps a description that names the suburb and the cuisine, accent-folded', () => {
    const row = { name: 'Jungle Tea', cuisine: 'Café (Boba Tea/Desserts)', location: '2726 Douglas Ave., Des Moines, IA' };
    expect(restaurantMetaDescription({ ...row, seo_description: 'A boba cafe at 2726 Douglas Ave in Des Moines.' })).toBe(
      'A boba cafe at 2726 Douglas Ave in Des Moines.',
    );
  });
});

describe('restaurantSeoTitleProblems and the seo_title fallback (SEO-030)', () => {
  const contrary = { name: 'The Contrary', location: 'Des Moines, IA', cuisine: 'Bar/Cocktails' };

  it('reads the city from a city-only location', () => {
    expect(restaurantLocality(contrary)).toBe('Des Moines');
    expect(restaurantPageTitle(contrary)).toBe('The Contrary Des Moines: Reviews');
  });

  it('says Photos when the row has one, and drops it first for length', () => {
    expect(restaurantPageTitle({ ...contrary, image_url: 'https://x.test/a.jpg' })).toBe(
      'The Contrary Des Moines: Photos & Reviews',
    );
    const t = restaurantPageTitle({
      name: 'Purveyor Restaurant & Wine Market',
      location: '2716 Beaver Ave, Des Moines, IA 50310',
      hasMenu: true,
      image_url: 'https://x.test/a.jpg',
    });
    expect(t).toBe('Purveyor Restaurant & Wine Market Des Moines: Menu & Reviews');
  });

  it('counts hours_json as hours', () => {
    expect(restaurantPageTitle({ ...contrary, hours_json: { periods: [] } })).toBe('The Contrary Des Moines: Hours & Reviews');
  });

  it.each([
    ['Texas Roadhouse: Best Steakhouse in Des Moines, Iowa', ['no-city', 'no-intent']],
    ['Bonchon Korean Fried Chicken | West Des Moines, IA', ['no-name', 'no-city', 'no-intent']],
    ['Texas Roadhouse Johnston: Menu & Reviews', ['claims-menu']],
    ['', ['empty']],
  ])('flags %s', (title, problems) => {
    const row = { name: 'Texas Roadhouse', location: '8744 Northpark Dr, Johnston, IA 50131, USA' };
    expect(restaurantSeoTitleProblems(title, row)).toEqual(problems);
  });

  it('uses a stored seo_title only when it has no problems', () => {
    const row = { name: 'Texas Roadhouse', location: '8744 Northpark Dr, Johnston, IA 50131, USA' };
    expect(restaurantPageTitle({ ...row, seo_title: 'Texas Roadhouse: Best Steakhouse in Des Moines, Iowa' })).toBe(
      'Texas Roadhouse Johnston: Reviews',
    );
    expect(restaurantPageTitle({ ...row, seo_title: 'Texas Roadhouse Johnston Reviews and Ratings' })).toBe(
      'Texas Roadhouse Johnston Reviews and Ratings',
    );
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

describe('currentDescription', () => {
  it('drops pre-opening copy once the place is open', () => {
    expect(currentDescription({ description: 'Coming soon!', status: 'open' })).toBeNull();
    expect(currentDescription({ description: 'Coming soon!', status: null })).toBeNull();
  });
  it('keeps it while the place is still upcoming', () => {
    expect(currentDescription({ description: 'Coming soon!', status: 'opening_soon' })).toBe('Coming soon!');
  });
  it('keeps current copy and returns null for none', () => {
    expect(currentDescription({ description: ' Double-fried chicken. ', status: 'open' })).toBe('Double-fried chicken.');
    expect(currentDescription({ description: null })).toBeNull();
  });
});

describe('priceTier', () => {
  it('accepts $ to $$$$ only', () => {
    expect(priceTier('$$')).toBe('$$');
    expect(priceTier('$$$$$')).toBeNull();
    expect(priceTier('Moderate')).toBeNull();
    expect(priceTier(null)).toBeNull();
  });
});

describe('buildRestaurantSchema', () => {
  const row = {
    name: 'Fixture Supper Club',
    cuisine: 'American',
    location: '400 Locust St, Des Moines, IA 50309',
    phone: '515-555-0100',
    price_range: '$$',
    latitude: 41.58,
    longitude: -93.62,
  };
  const spec = [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday'], opens: '11:00', closes: '22:00' }];
  const ctx = {
    url: 'https://example.com/restaurants/fixture',
    description: 'A place.',
    locality: 'Des Moines',
    website: 'https://example.com/',
    menuUrl: 'https://example.com/menu',
    hasCapturedMenu: false,
    openingHoursSpecification: spec,
    openForBusiness: true,
  };

  it('publishes facts from the row', () => {
    const s = buildRestaurantSchema(row, ctx);
    expect(s.priceRange).toBe('$$');
    expect(s.hasMenu).toBe('https://example.com/menu');
    expect(s.openingHoursSpecification).toEqual(spec);
    expect(s.address.streetAddress).toBe('400 Locust St');
    expect(s.address.postalCode).toBe('50309');
  });

  it('leaves hours out for a place that is not open for business', () => {
    expect(buildRestaurantSchema(row, { ...ctx, openForBusiness: false })).not.toHaveProperty('openingHoursSpecification');
  });

  it('points hasMenu at the on-page Menu node when a menu is captured', () => {
    // MenuSchema's @id is "<page url>#menu" (SEO-034).
    expect(buildRestaurantSchema(row, { ...ctx, hasCapturedMenu: true }).hasMenu).toBe(
      'https://example.com/restaurants/fixture#menu',
    );
  });

  it('has no hasMenu with neither a captured menu nor a menu URL', () => {
    expect(buildRestaurantSchema(row, { ...ctx, menuUrl: null })).not.toHaveProperty('hasMenu');
  });

  it('puts their site and the Google listing in sameAs, in that order', () => {
    const maps = 'https://maps.google.com/?cid=1';
    expect(buildRestaurantSchema(row, { ...ctx, mapsUrl: maps }).sameAs).toEqual(['https://example.com/', maps]);
    expect(buildRestaurantSchema(row, { ...ctx, website: null, mapsUrl: maps }).sameAs).toEqual([maps]);
    expect(buildRestaurantSchema(row, { ...ctx, website: null })).not.toHaveProperty('sameAs');
  });

  it('publishes acceptsReservations only when the row says', () => {
    expect(buildRestaurantSchema(row, ctx)).not.toHaveProperty('acceptsReservations');
    expect(buildRestaurantSchema(row, { ...ctx, acceptsReservations: false }).acceptsReservations).toBe(false);
    expect(buildRestaurantSchema(row, { ...ctx, acceptsReservations: 'https://resy.com/x' }).acceptsReservations).toBe(
      'https://resy.com/x',
    );
  });

  it('never carries an aggregateRating: the only rating held is Google\'s', () => {
    expect(buildRestaurantSchema({ ...row, rating: 4.7 } as typeof row, ctx)).not.toHaveProperty('aggregateRating');
  });

  it('acceptsReservationsOf: booking URL, then the yes/no, else unknown', () => {
    const safe = (u: unknown) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : null);
    expect(acceptsReservationsOf({ reservable: true, reservation_url: 'https://resy.com/x' }, safe)).toBe('https://resy.com/x');
    expect(acceptsReservationsOf({ reservable: false, reservation_url: 'javascript:alert(1)' }, safe)).toBe(false);
    expect(acceptsReservationsOf({ reservable: null }, safe)).toBeUndefined();
  });

  it('puts only a tier in priceRange, and no geo without coordinates', () => {
    const s = buildRestaurantSchema({ ...row, price_range: '$10-20', latitude: null, longitude: null }, ctx);
    expect(s).not.toHaveProperty('priceRange');
    expect(s).not.toHaveProperty('geo');
  });
});
