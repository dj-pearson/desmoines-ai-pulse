import { describe, it, expect } from 'vitest';
import {
  areaPageCandidates,
  areaPageLabel,
  coverageLocationName,
  hubAreaPages,
  isIndexablePseoPage,
} from '@/pseo/restaurantAreaPages';
import { COVERAGE_LOCATIONS } from '@/pseo/coverageRule';

const row = {
  id: 'r1',
  name: 'Fixture Taqueria',
  city: 'Waukee',
  location: '100 Main St, Waukee, IA 50263, USA',
  cuisine: 'Mexican',
  status: 'open',
  is_merged: false,
};

describe('areaPageCandidates', () => {
  it("is the coverage rule's own membership: a Mexican place in Waukee belongs on /mexican/waukee", () => {
    expect(areaPageCandidates(row)).toEqual(['/mexican/waukee']);
  });

  it('an Italian/pizza place belongs on both pages its cuisine matches', () => {
    expect(areaPageCandidates({ ...row, cuisine: 'Italian/Pizza' })).toEqual(['/italian/waukee', '/pizza/waukee']);
  });

  it('a place the listing would drop belongs on none', () => {
    expect(areaPageCandidates({ ...row, status: 'opening_soon' })).toEqual([]);
    expect(areaPageCandidates({ ...row, status: 'closed' })).toEqual([]);
    expect(areaPageCandidates({ ...row, is_merged: true })).toEqual([]);
  });

  it('a Des Moines address with no mapped neighbourhood belongs on none', () => {
    expect(areaPageCandidates({ ...row, city: 'Des Moines', location: '1 Locust St, Des Moines, IA 50309' })).toEqual([]);
  });

  it('a mapped neighbourhood matches on the column (SEO-060), not the address text', () => {
    const eastVillage = { ...row, city: 'Des Moines', location: '400 E Locust St, Des Moines, IA 50309', neighborhood: 'east-village' };
    expect(areaPageCandidates(eastVillage)).toEqual(['/mexican/east-village']);
  });
});

describe('coverageLocationName', () => {
  it('title-cases every coverage suburb', () => {
    expect(COVERAGE_LOCATIONS.map(coverageLocationName)).toContain('West Des Moines');
    expect(coverageLocationName('windsor-heights')).toBe('Windsor Heights');
  });
});

describe('isIndexablePseoPage', () => {
  it('keeps published pages without noindex', () => {
    expect(isIndexablePseoPage({ slug: '/mexican/waukee', is_published: true, seo: { robots: null } })).toBe(true);
    expect(isIndexablePseoPage({ slug: '/mexican/waukee', is_published: true, seo: null })).toBe(true);
  });

  it('drops noindex and unpublished pages', () => {
    expect(isIndexablePseoPage({ slug: '/brunch/ankeny', is_published: true, seo: { robots: 'noindex, follow' } })).toBe(false);
    expect(isIndexablePseoPage({ slug: '/bbq/ankeny', is_published: false })).toBe(false);
  });
});

describe('areaPageLabel', () => {
  const page = (category: string, location: string) => ({
    slug: '/x/y',
    dimensions: [
      { dimension: 'category', name: category },
      { dimension: 'location', name: location },
    ],
  });

  it('reads as a phrase', () => {
    expect(areaPageLabel(page('Mexican', 'Waukee'))).toBe('Mexican restaurants in Waukee');
    expect(areaPageLabel(page('Steakhouses', 'West Des Moines'))).toBe('Steakhouses in West Des Moines');
    expect(areaPageLabel(page('Coffee & Cafes', 'Ankeny'))).toBe('Coffee & Cafes in Ankeny');
  });

  it('falls back to the slug without dimensions', () => {
    expect(areaPageLabel({ slug: '/mexican/waukee' })).toBe('/mexican/waukee');
  });
});

describe('hubAreaPages (SEO-038)', () => {
  const dims = (category: string, location: string) => [
    { dimension: 'category', slug: category, name: category.charAt(0).toUpperCase() + category.slice(1) },
    { dimension: 'location', slug: location, name: coverageLocationName(location) },
  ];

  it('keeps published, indexable restaurant cuisine x area pages only', () => {
    const pages = hubAreaPages([
      { slug: '/pizza/west-des-moines', page_type_id: 'category-location', is_published: true, seo: {}, dimensions: dims('pizza', 'west-des-moines') },
      { slug: '/brunch/ankeny', page_type_id: 'category-location', is_published: true, seo: { robots: 'noindex, follow' }, dimensions: dims('brunch', 'ankeny') },
      { slug: '/bbq/ankeny', page_type_id: 'category-location', is_published: false, seo: {}, dimensions: dims('bbq', 'ankeny') },
      { slug: '/live-music/ankeny', page_type_id: 'category-location', is_published: true, seo: {}, dimensions: dims('live-music', 'ankeny') },
      { slug: '/mexican/waukee', page_type_id: 'category-location', is_published: true, seo: null, dimensions: dims('mexican', 'waukee') },
    ]);
    expect(pages).toEqual([
      { href: '/mexican/waukee', label: 'Mexican restaurants in Waukee', categorySlug: 'mexican', locationSlug: 'waukee' },
      { href: '/pizza/west-des-moines', label: 'Pizza restaurants in West Des Moines', categorySlug: 'pizza', locationSlug: 'west-des-moines' },
    ]);
  });

  it('ignores a row whose dimensions carry no slugs', () => {
    expect(
      hubAreaPages([
        { slug: '/pizza/west-des-moines', page_type_id: 'category-location', is_published: true, dimensions: [{ dimension: 'category', name: 'Pizza' }] },
      ]),
    ).toEqual([]);
  });
});
