#!/usr/bin/env node
/**
 * Offline checks for the pSEO shippable rules (WEB-SEO-013).
 *
 *   npx tsx scripts/__tests__/pseo-shippable.test.mjs
 *
 * The measurement half needs production and is exercised by
 * `npm run check-pseo-inventory`. These are the rules that decide what a
 * measurement MEANS, and they are the half that would silently put a doorway
 * page or a soft-404 into sitemap-pseo.xml if they were wrong.
 *
 * Weighted toward what must NOT happen: a claimed slug becoming canonical, and
 * a claimed slug suppressing the URL that does render.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { classifySlugs } from '../lib/pseoRouteClaims.mjs';
import { selectCanonical } from '../lib/pseoShippable.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function page(slug, over = {}) {
  return { slug, fingerprint: 'a|b|c', passes: true, hasTemporal: false, claimed: false, ...over };
}

console.log('selectCanonical: one URL per listing');
{
  const { canonical, shadowed } = selectCanonical([
    page('/restaurants/bbq'),
    page('/bbq/august', { hasTemporal: true }),
    page('/bbq/winter', { hasTemporal: true }),
  ]);
  check('keeps the evergreen URL', eq(canonical, ['/restaurants/bbq']), canonical.join(','));
  check('shadows the seasonal duplicates', eq(shadowed.sort(), ['/bbq/august', '/bbq/winter']));
}
{
  // Shortest-slug alone picked /asian/fall over /restaurants/asian. A month in
  // the canonical URL for content that does not change monthly is the doorway
  // pattern with a tidier name.
  const { canonical } = selectCanonical([page('/asian/fall', { hasTemporal: true }), page('/restaurants/asian')]);
  check('prefers evergreen over a shorter seasonal slug', eq(canonical, ['/restaurants/asian']), canonical.join(','));
}
{
  const { canonical } = selectCanonical([page('/things-to-do/live-music'), page('/events/live-music')]);
  check('breaks evergreen ties on length', eq(canonical, ['/events/live-music']), canonical.join(','));
}
{
  const { canonical, shadowed } = selectCanonical([
    page('/bbq/august', { passes: false, hasTemporal: true }),
    page('/bbq/winter', { passes: false, hasTemporal: true }),
  ]);
  check('drops a group where nothing clears the floor', eq(canonical, []) && eq(shadowed, []));
}
{
  // An empty fingerprint means the query returned nothing. Grouping those
  // together would collapse every empty page into one "listing" and elect a
  // canonical for it.
  const { canonical } = selectCanonical([page('/a/b', { fingerprint: '' }), page('/c/d', { fingerprint: '' })]);
  check('ignores pages with no fingerprint', eq(canonical, []), canonical.join(','));
}

console.log('\nselectCanonical: a claimed slug does not render the page - the direction that must not break');
{
  const { canonical } = selectCanonical([
    page('/restaurants/asian', { claimed: true }),
    page('/asian/fall', { hasTemporal: true }),
  ]);
  check('never makes a claimed slug canonical', eq(canonical, ['/asian/fall']), canonical.join(','));
}
{
  // The regression that matters: filtering claimed slugs AFTER choosing the
  // group head would pick /restaurants/asian, drop it, and ship nothing for a
  // listing that has a perfectly good URL.
  const { canonical, shadowed } = selectCanonical([
    page('/restaurants/asian', { claimed: true }),
    page('/asian/west-des-moines'),
  ]);
  check(
    'a claimed slug does not suppress the URL that does render',
    eq(canonical, ['/asian/west-des-moines']) && eq(shadowed, []),
    canonical.join(','),
  );
}
{
  const { canonical, temporalOnlyByClaim } = selectCanonical([
    page('/restaurants/italian', { claimed: true }),
    page('/italian/fall', { hasTemporal: true }),
  ]);
  check(
    'reports a canonical that is seasonal only because the evergreen URL is claimed',
    eq(canonical, ['/italian/fall']) &&
      eq(temporalOnlyByClaim, [{ canonical: '/italian/fall', claimed: ['/restaurants/italian'] }]),
    JSON.stringify(temporalOnlyByClaim),
  );
}
{
  const { temporalOnlyByClaim } = selectCanonical([
    page('/live-music/august', { hasTemporal: true }),
    page('/live-music/fall', { hasTemporal: true, fingerprint: 'd|e|f' }),
  ]);
  check('stays quiet when there was no evergreen sibling at all', eq(temporalOnlyByClaim, []));
}

console.log('\nclassifySlugs: which routes claim a slug');
const dir = mkdtempSync(join(tmpdir(), 'pseo-claims-'));
try {
  const appPath = join(dir, 'App.tsx');
  const redirectsPath = join(dir, '_redirects');
  writeFileSync(
    appPath,
    `
    <Route path="/events/:slug" element={<EventDetails />} />
    <Route path="/events/today" element={<EventsToday />} />
    <Route path="/restaurants/:slug" element={<RestaurantDetails />} />
    <Route path="/things-to-do/tourists" element={<VisitorsGuide />} />
    <Route path="/:seg1/:seg2" element={<PseoRoutePage />} />
    <Route path="*" element={<NotFound />} />
    `,
  );
  writeFileSync(redirectsPath, '# comment\n/things-to-do/tourists /visitors-guide 301\n');

  // /events/today matches BOTH /events/:slug (declared first) and the literal
  // /events/today. React Router ranks the literal higher, and the AC7 baseline
  // is keyed on the exact set - so first-match-wins would move a known collision
  // into the shadowed bucket and quietly empty the baseline.
  const literal = classifySlugs(['/events/today'], { appPath, redirectsPath });
  check(
    'a literal route beats a parameterised one declared before it',
    eq(literal.exact, [{ slug: '/events/today', route: '/events/today' }]) && literal.claimed.has('/events/today'),
    JSON.stringify(literal.exact),
  );

  const param = classifySlugs(['/restaurants/asian'], { appPath, redirectsPath });
  check(
    'an entity-detail route hit is shadowed, and claimed',
    eq(param.shadowed, [{ slug: '/restaurants/asian', route: '/restaurants/:slug' }]) &&
      param.claimed.has('/restaurants/asian'),
    JSON.stringify(param.shadowed),
  );

  const red = classifySlugs(['/things-to-do/tourists'], { appPath, redirectsPath });
  check(
    'an existing redirect is the resolution, not a claim',
    eq(red.redirected, ['/things-to-do/tourists']) && red.claimed.size === 0,
    JSON.stringify(red.redirected),
  );

  // /:seg1/:seg2 renders the pSEO page and * is the fallback. If either counted,
  // every generated slug would report as claimed and the shippable set would be
  // empty - which would look like a very tidy sitemap.
  const unclaimed = classifySlugs(['/asian/west-des-moines'], { appPath, redirectsPath });
  check('the pSEO route and the catch-all do not claim a slug', unclaimed.claimed.size === 0);

  const brokenApp = join(dir, 'BrokenApp.tsx');
  writeFileSync(brokenApp, '<Route path="/events/today" element={<EventsToday />} />');
  let threw = '';
  try {
    classifySlugs(['/asian/fall'], { appPath: brokenApp, redirectsPath });
  } catch (err) {
    threw = String(err.message);
  }
  check('throws when no pSEO route is found rather than claiming everything', /No pSEO-serving route/.test(threw), threw);

  const emptyApp = join(dir, 'EmptyApp.tsx');
  writeFileSync(emptyApp, 'export default function App() { return null; }');
  threw = '';
  try {
    classifySlugs(['/asian/fall'], { appPath: emptyApp, redirectsPath });
  } catch (err) {
    threw = String(err.message);
  }
  check('throws when no routes parse rather than reporting a clean surface', /The check is blind/.test(threw), threw);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
