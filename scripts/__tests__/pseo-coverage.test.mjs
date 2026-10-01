#!/usr/bin/env node
/**
 * Offline checks for the SEO-041 coverage rule.
 *
 *   npx tsx scripts/__tests__/pseo-coverage.test.mjs
 *
 * The measurement against production is `npm run check-pseo-coverage`. These
 * pin what a measurement MEANS: the three bands, the duplicate-listing
 * condition, what counts as a place, and which published pages the rule
 * flags or keeps out of the sitemap.
 */
import { coverageVerdict, finalVerdicts, isCoverageScoped, placeMatches } from '../../src/pseo/coverageRule.ts';
import { evaluateCoverage, DATA_TEMPLATE_GENERATOR } from '../lib/pseoCoverage.ts';
import { neighborhoodFor } from '../../src/lib/neighborhoodBoundaries.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

console.log('coverageVerdict: the three bands');
check('2 places is not generated', coverageVerdict(2) === 'not-generated');
check('3 places is noindex', coverageVerdict(3) === 'noindex');
check('4 places is noindex', coverageVerdict(4) === 'noindex');
check('5 places is indexable', coverageVerdict(5) === 'indexable');

console.log('finalVerdicts: identical listings are one page');
{
  const v = finalVerdicts([
    { slug: '/pizza/ankeny', places: 5, fingerprint: 'a|b|c|d|e' },
    { slug: '/italian/ankeny', places: 5, fingerprint: 'a|b|c|d|e' },
    { slug: '/mexican/ankeny', places: 5, fingerprint: 'f|g|h|i|j' },
  ]);
  check('first by slug keeps indexable', v.get('/italian/ankeny') === 'indexable');
  check('its twin drops to noindex', v.get('/pizza/ankeny') === 'noindex');
  check('a distinct listing is untouched', v.get('/mexican/ankeny') === 'indexable');
}

console.log('placeMatches: what counts as a place');
const base = { id: '1', name: 'X', city: 'Waukee', location: null, cuisine: 'Mexican', status: 'open', is_merged: false };
check('open, in the city, matching cuisine', placeMatches(base, 'Waukee', 'mexican'));
check('closed is not a place', !placeMatches({ ...base, status: 'closed' }, 'Waukee', 'mexican'));
check('announced is not a place', !placeMatches({ ...base, status: 'announced' }, 'Waukee', 'mexican'));
check('a null status is visitable (column defaults to open)', placeMatches({ ...base, status: null }, 'Waukee', 'mexican'));
check('merged is not a place', !placeMatches({ ...base, is_merged: true }, 'Waukee', 'mexican'));
check('null is_merged is dropped, as .neq(true) drops it', !placeMatches({ ...base, is_merged: null }, 'Waukee', 'mexican'));
check('address match counts', placeMatches({ ...base, city: null, location: '123 Main St, Waukee, IA' }, 'Waukee', 'mexican'));
check('another city does not', !placeMatches({ ...base, city: 'Clive' }, 'Waukee', 'mexican'));
check('pizza matches "Italian/Pizza"', placeMatches({ ...base, cuisine: 'Italian/Pizza' }, 'Waukee', 'pizza'));
check('an event category never matches', !placeMatches(base, 'Waukee', 'festivals'));

console.log('placeMatches: neighbourhoods match restaurants.neighborhood (SEO-060)');
{
  const ev = { slug: 'east-village', name: 'East Village' };
  const row = { ...base, city: 'Des Moines', location: '420 E Locust St, Des Moines, IA 50309, USA', neighborhood: 'east-village' };
  check('a row in the neighbourhood counts', placeMatches(row, ev, 'mexican'));
  check('the name alone does not: a row naming "East Village" with no column value is out', !placeMatches({ ...row, neighborhood: null, location: 'East Village' }, ev, 'mexican'));
  check('another neighbourhood does not', !placeMatches({ ...row, neighborhood: 'downtown' }, ev, 'mexican'));
  check('a suburb given as an area still matches as text', placeMatches(base, { slug: 'waukee', name: 'Waukee' }, 'mexican'));
}

console.log('placeMatches + isCoverageScoped: the /restaurants/<area> page (SEO-065)');
{
  check('any cuisine counts on the area page', placeMatches({ ...base, cuisine: 'Ice Cream' }, 'Waukee', 'restaurants'));
  check('no cuisine at all still counts', placeMatches({ ...base, cuisine: null }, 'Waukee', 'restaurants'));
  check('a closed row does not', !placeMatches({ ...base, status: 'closed' }, 'Waukee', 'restaurants'));
  check('another city does not', !placeMatches({ ...base, city: 'Clive' }, 'Waukee', 'restaurants'));
  const dims = (content, slug) => [
    { dimension: 'content_type', slug: content, name: content },
    { dimension: 'location', slug, name: slug },
  ];
  check('content-location restaurants x suburb is governed', isCoverageScoped('content-location', dims('restaurants', 'ankeny')));
  check('things-to-do x suburb is not', !isCoverageScoped('content-location', dims('things-to-do', 'ankeny')));
  check('restaurants x an unmapped area is not', !isCoverageScoped('content-location', dims('restaurants', 'drake')));
  const report = evaluateCoverage([], [base, { ...base, id: '2' }, { ...base, id: '3' }, { ...base, id: '4' }, { ...base, id: '5', cuisine: 'Pizza' }]);
  const waukee = report.rows.find((r) => r.slug === '/restaurants/waukee');
  check('the area page is measured with every cuisine: 5 places, indexable', waukee?.places === 5 && waukee?.verdict === 'indexable', JSON.stringify(waukee));
}

console.log('neighborhoodFor: the polygons, on real addresses');
{
  check('101 E Locust St is the East Village', neighborhoodFor(41.5883, -93.6156, '101 E Locust St, Des Moines, IA 50309, USA') === 'east-village');
  check('200 SW 2nd St, across the river, is downtown', neighborhoodFor(41.5829, -93.6185, '200 SW 2nd St, Des Moines, IA 50309, USA') === 'downtown');
  check('1003 Locust St is downtown', neighborhoodFor(41.5858, -93.6302, '1003 Locust St, Des Moines, IA 50309, USA') === 'downtown');
  check('644 18th St, north of Woodland, is Sherman Hill', neighborhoodFor(41.5883, -93.6416, '644 18th St, Des Moines, IA 50314, USA') === 'sherman-hill');
  check('227 5th St, West Des Moines is Valley Junction', neighborhoodFor(41.5722, -93.7086, '227 5th St, West Des Moines, IA 50265, USA') === 'valley-junction');
  check('103 S 11th St, west of 8th, is not', neighborhoodFor(41.5687, -93.7184, '103 S 11th St, West Des Moines, IA 50265, USA') === null);
  check('2721 Ingersoll Ave is in no mapped neighbourhood', neighborhoodFor(41.5859, -93.654, null) === null);
  check('a downtown point on an Ankeny address is a bad geocode, not downtown', neighborhoodFor(41.5869, -93.6249, '1975 N Ankeny Blvd, Ankeny, IA 50023, USA') === null);
  check('no coordinates, no neighbourhood', neighborhoodFor(null, null, null) === null);
}

console.log('evaluateCoverage: published pages against the rule');
{
  const r = (id, cuisine) => ({ ...base, id, name: `R${id}`, cuisine });
  const restaurants = [
    r('1', 'Mexican'), r('2', 'Mexican'), r('3', 'Mexican'), r('4', 'Mexican'), r('5', 'Mexican'),
    r('6', 'Pizza'), r('7', 'Pizza'), r('8', 'Pizza'),
    r('9', 'BBQ'),
  ];
  const page = (slug, cat, over = {}) => ({
    id: slug,
    slug,
    page_type_id: 'category-location',
    dimensions: [
      { dimension: 'category', slug: cat, name: cat },
      { dimension: 'location', slug: 'waukee', name: 'Waukee' },
    ],
    seo: {},
    is_published: true,
    generation_meta: { generatedBy: 'generate-pseo-page' },
    sections: [],
    ...over,
  });
  const report = evaluateCoverage(
    [
      page('/mexican/waukee', 'mexican', { generation_meta: { generatedBy: DATA_TEMPLATE_GENERATOR, placeFingerprint: '1|2|3|4|5' } }),
      page('/pizza/waukee', 'pizza'),
      page('/bbq/waukee', 'bbq'),
    ],
    restaurants,
  );
  const v = report.violations.join(' | ');
  check('5 places with data-built copy is submittable', report.submittable.includes('/mexican/waukee'), report.submittable.join(','));
  check('3 places without noindex is a violation', v.includes('/pizza/waukee'), v);
  check('1 place published is a violation', v.includes('/bbq/waukee'), v);
  check('both are kept out of the sitemap', report.keepOutOfSitemap.has('/pizza/waukee') && report.keepOutOfSitemap.has('/bbq/waukee'));
  check('the noindex page is listed for prerendering', report.noindexPublished.includes('/pizza/waukee'));

  const stale = evaluateCoverage(
    [page('/mexican/waukee', 'mexican', { generation_meta: { generatedBy: DATA_TEMPLATE_GENERATOR, placeFingerprint: '1|2|3|4|99' } })],
    restaurants,
  );
  check('data-built copy written for another listing is flagged stale', stale.violations.some((x) => x.includes('changed')), stale.violations.join(' | '));

  const llm = evaluateCoverage([page('/mexican/waukee', 'mexican')], restaurants);
  check('an LLM-written indexable page is not added by the rule', llm.indexable.includes('/mexican/waukee') && !llm.submittable.includes('/mexican/waukee'));
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall pSEO coverage checks pass');
