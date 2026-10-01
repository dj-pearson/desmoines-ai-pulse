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
import { coverageVerdict, finalVerdicts, placeMatches } from '../../src/pseo/coverageRule.ts';
import { evaluateCoverage, DATA_TEMPLATE_GENERATOR } from '../lib/pseoCoverage.ts';

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
