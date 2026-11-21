#!/usr/bin/env node
/**
 * WEB-BE-070 / WEB-SEO-079: the edge shell's restaurant title says Reviews
 * exactly when the page's does, from the same Google review count.
 *
 *   npx tsx functions/__tests__/middleware-review-count.test.mjs
 */
const { entityShellRewrites } = await import('../_middleware.ts');
const { restaurantPageTitle } = await import('../../src/lib/restaurantMeta.ts');
const { restaurantReviewCount } = await import('../../src/lib/googleFacts.ts');

let failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) failed++;
};

const row = {
  id: '1',
  name: 'Lucca',
  location: '420 E Locust St, Des Moines, IA 50309',
  rating: 4.6,
  google_review_count: 312,
};
const title = (r) =>
  JSON.stringify(
    entityShellRewrites({
      pageUrl: 'https://example.test/restaurants/lucca',
      sbBase: 'https://sb.test',
      type: 'restaurant',
      entity: { id: '1', title: 'Lucca', row: r },
    }).find((rule) => rule.selector === 'title'),
  );

const withCount = title(row);
check('shell title says Reviews with a Google count', /Reviews/.test(withCount));
check(
  'shell title equals the page title for the same count',
  withCount.includes(restaurantPageTitle({ ...row, reviewCount: restaurantReviewCount(row) })),
);
const without = { ...row, google_review_count: null };
check('no count: shell title has no Reviews', !/Reviews/.test(title(without)));
check(
  'no count: page title has no Reviews',
  !/Reviews/.test(restaurantPageTitle({ ...without, reviewCount: restaurantReviewCount(without) })),
);

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
