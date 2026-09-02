/**
 * The brand is defined once and the machine-read markup agrees with it
 * (WEB-SEO-022, WEB-SEO-023).
 *
 * SEO-006 was marked done and the JSON-LD said otherwise: 26 references to the
 * retired domain survived, and the ones that mattered were the ones a crawler
 * reads as facts. `@id` on roughly 480 restaurant pages pointed at another
 * origin -- which is not a broken link, it is a different entity -- and five
 * components asserted `sameAs` for social accounts the brand does not own.
 *
 * Separately, event pages carried a five-question FAQPage in the head with
 * nothing visible on the page, whose answers gave every venue in the metro the
 * same driving directions.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

Deno.test('sameAs comes from BRAND and is omitted when there is nothing to claim', async () => {
  // An empty sameAs array is itself a claim -- "this organisation has no
  // profiles" -- so the property is dropped rather than emitted empty.
  for (const rel of [
    'src/components/SEOHead.tsx',
    'src/components/SEOEnhancedHead.tsx',
    'src/components/EnhancedLocalSEO.tsx',
    'src/components/EventSchema.tsx',
    'src/pages/Index.tsx',
  ]) {
    const src = codeOnly(await read(rel));
    assert(
      /\.\.\.\(BRAND\.social\.length > 0 \? \{ sameAs: \[\.\.\.BRAND\.social\] \} : \{\}\)/.test(src),
      `${rel} must source sameAs from BRAND.social and omit it when empty`,
    );
  }

  const brand = await read('src/lib/brandConfig.ts');
  assert(/social: \[\] as readonly string\[\]/.test(brand), 'BRAND.social is the single source');
});

Deno.test('the footer links to the same profiles the JSON-LD claims', async () => {
  // They disagreed: the JSON-LD asserted three profiles while the footer linked
  // to the three networks' homepages. A "Follow us on Facebook" button that
  // opens Facebook is a dead control that looks alive.
  const footer = codeOnly(await read('src/components/Footer.tsx'));
  assert(/BRAND\.social\.length > 0 &&/.test(footer), 'the row is hidden when there is nothing to link');
  assert(/BRAND\.social\.map/.test(footer), 'and rendered from the same source');
  assertFalse(
    /href="https:\/\/(www\.)?(facebook|twitter|instagram)\.com"/.test(footer),
    'no links to a network homepage',
  );
});

Deno.test('entity ids are on the canonical origin', async () => {
  const rd = codeOnly(await read('src/pages/RestaurantDetails.tsx'));
  assert(
    /"@id": getCanonicalUrl\(`\/restaurants\/\$\{restaurant\.slug \|\| restaurant\.id\}`\)/.test(rd),
  );

  const menu = codeOnly(await read('src/components/schema/MenuSchema.tsx'));
  assert(/getCanonicalUrl\(`\/restaurants\/\$\{restaurantSlug\}`\)/.test(menu));
  assert(/\$\{restaurantUrl\}#menu/.test(menu), 'the menu id hangs off the same canonical URL');
});

Deno.test('hasMenu is claimed only where a menu exists', async () => {
  // It was unconditional, so every restaurant claimed a menu at #menu whether
  // one had been captured or not -- and where one had, the claim was a second
  // Menu node competing with the real one.
  const rd = codeOnly(await read('src/pages/RestaurantDetails.tsx'));
  assertFalse(/hasMenu:/.test(rd), 'the unconditional claim must be gone');

  // The real owner renders only when a menu with sections exists.
  const section = codeOnly(await read('src/components/RestaurantMenuSection.tsx'));
  assert(/if \(!data\?\.menu \|\| data\.sections\.length === 0\)/.test(section));
  assert(/<MenuSchema/.test(section));
});

Deno.test('the retired domain is gone and a check keeps it gone', async () => {
  const script = await read('scripts/check-brand-leak.mjs');
  assert(/const LEAK = /.test(script));
  // Matching the bare word would fail on SUPABASE_SERVICE_ROLE_KEY_DESMOINESPULSE,
  // an upstream hub's name for a credential that is not ours to rename -- and
  // the usual response to a check that fails on something you cannot fix is to
  // delete the check.
  assert(/ingest-events/.test(script), 'the narrowing must record why it is narrow');

  const pkg = JSON.parse(await read('package.json'));
  assert(pkg.scripts['check-brand-leak'], 'the script must be runnable');
  assert(
    pkg.scripts.validate.includes('check-brand-leak'),
    'and must run inside npm run validate',
  );
});

Deno.test('the brand handle typo is fixed', async () => {
  // codeOnly, because brandConfig's own comment QUOTES the old handle to explain
  // what was wrong with it. An assertion that reads prose fails on correct code.
  const brand = codeOnly(await read('src/lib/brandConfig.ts'));
  assertFalse(/@desmoinessider/.test(brand), 'the brand name with "in" missing was a typo');
  assert(/twitter: '@desmoinesinsider'/.test(brand));
});

Deno.test('event pages emit no head-only FAQPage', async () => {
  // WEB-SEO-022. Google requires FAQ content to be visible on the page it is
  // emitted from, and EventDetails renders no FAQ section at all.
  const seo = codeOnly(await read('src/components/EnhancedEventSEO.tsx'));
  assertFalse(/FAQPage/.test(seo), 'no FAQPage may be built here');
  assertFalse(/faqSchema/.test(seo));

  const details = codeOnly(await read('src/pages/EventDetails.tsx'));
  assertFalse(/<FAQSection/.test(details), 'and none was added to carry it');

  // The drift guard has to agree, or it fails on a component that no longer emits.
  const guard = codeOnly(await read('scripts/check-duplicate-schema.mjs'));
  assertFalse(
    /component: 'EnhancedEventSEO'/.test(guard),
    'the emitter table must drop it',
  );
});

Deno.test('the fabricated directions are gone', async () => {
  // Every event page asserted the same two interstates, downtown parking and a
  // bus route, for a barn dance in a suburb as readily as a show downtown.
  const seo = await read('src/components/EnhancedEventSEO.tsx');
  const code = codeOnly(seo);
  assertFalse(/I-235|I-80|DART bus/.test(code), 'no fabricated directions in emitted markup');
});
