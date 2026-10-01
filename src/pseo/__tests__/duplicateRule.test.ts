import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  duplicateFamily,
  duplicateVerdict,
  ignoredDimension,
  listsSomethingNew,
  MAX_PARENT_OVERLAP,
  MIN_DISTINCT_ITEMS,
  parentOf,
  parentOverlap,
  parentPage,
} from '../duplicateRule';

/**
 * SEO-064. 80 pSEO pages added a dimension their listing never reads, so each
 * rendered its parent's list under another URL. These pin the rule and the
 * reason it holds.
 */

const dims = (...pairs: Array<[string, string]>) => pairs.map(([dimension, slug]) => ({ dimension, slug, name: slug }));
const families = dims(['audience', 'families'], ['temporal', 'this-weekend']);
const mexicanAugust = dims(['category', 'mexican'], ['temporal', 'august']);

describe('duplicateFamily', () => {
  it('governs audience x time and restaurant cuisine x time pages', () => {
    expect(duplicateFamily('audience-temporal', families)).toBe('audience-time');
    expect(duplicateFamily('category-temporal', mexicanAugust)).toBe('restaurant-time');
  });

  it('leaves event categories and pages without a time dimension alone', () => {
    // /festivals/august: the temporal window does narrow events.
    expect(duplicateFamily('category-temporal', dims(['category', 'festivals'], ['temporal', 'august']))).toBeNull();
    expect(duplicateFamily('category-location', dims(['category', 'mexican'], ['location', 'ankeny']))).toBeNull();
    expect(duplicateFamily('content-audience', dims(['content_type', 'events'], ['audience', 'families']))).toBeNull();
  });
});

describe('thresholds', () => {
  it('needs 5 items and under 70% shared with the parent', () => {
    expect(MAX_PARENT_OVERLAP).toBe(0.7);
    expect(MIN_DISTINCT_ITEMS).toBe(5);
    expect(listsSomethingNew(5, 0.69)).toBe(true);
    expect(listsSomethingNew(5, 0.7)).toBe(false);
    expect(listsSomethingNew(4, 0)).toBe(false);
  });

  it('measures overlap as the share of the child the parent also lists', () => {
    expect(parentOverlap(['a', 'b', 'c', 'd'], ['a', 'b', 'x'])).toBe(0.5);
    expect(parentOverlap([], ['a'])).toBe(1);
  });

  it('noindexes a duplicate with impressions and redirects one without', () => {
    expect(duplicateVerdict(12, 1, 68)).toBe('noindex-canonical');
    expect(duplicateVerdict(12, 1, 0)).toBe('redirect');
    expect(duplicateVerdict(8, 0.25, 0)).toBe('indexable');
  });
});

describe('parentPage', () => {
  const redirects = new Map([['/things-to-do/this-weekend', '/events/this-weekend']]);

  it('drops the audience, then follows the 301 the parent itself carries', () => {
    expect(parentOf('audience-time', families).slug).toBe('/things-to-do/this-weekend');
    expect(parentPage('audience-time', families, redirects)).toBe('/events/this-weekend');
  });

  it('falls back to the hub when the parent is in no sitemap', () => {
    const spring = dims(['audience', 'budget'], ['temporal', 'spring']);
    expect(parentPage('audience-time', spring, redirects, new Set(['/things-to-do/fall']))).toBe('/things-to-do');
    expect(parentPage('audience-time', spring, redirects, new Set(['/things-to-do/spring']))).toBe('/things-to-do/spring');
  });

  it('sends restaurant x time pages to the directory, compared with the cuisine-only list', () => {
    expect(parentOf('restaurant-time', mexicanAugust).dimensions).toEqual(dims(['category', 'mexican']));
    expect(parentPage('restaurant-time', mexicanAugust, redirects)).toBe('/restaurants');
  });
});

describe('ignoredDimension matches the live listing query', () => {
  // If fetchListings starts reading audience, or restaurants gain a date
  // filter, these pages can differ from their parent and the rule's
  // "duplicate by construction" premise (and the offline check) must change.
  const src = readFileSync('src/pseo/components/sections/PseoLiveListings.tsx', 'utf8');
  const fetchListings = src.slice(src.indexOf('async function fetchListings'));
  const restaurants = fetchListings.slice(fetchListings.indexOf("if (entityType === 'restaurants')"), fetchListings.indexOf('// Attractions'));

  it('fetchListings never reads the audience dimension', () => {
    expect(ignoredDimension('audience-time')).toBe('audience');
    expect(fetchListings).not.toMatch(/['"]audience['"]/);
  });

  it('the restaurant query applies no date window', () => {
    expect(ignoredDimension('restaurant-time')).toBe('temporal');
    expect(restaurants.length).toBeGreaterThan(0);
    expect(restaurants).not.toMatch(/temporalRange|\.gte\(|\.lt\(/);
  });
});
