/**
 * Every middleware rewrite must target a tag the shell actually has
 * (WEB-SEO-006, WEB-SEO-030).
 *
 *   npx tsx functions/__tests__/middleware-shell-selectors.test.mjs
 *
 * The middleware rewrites the SPA fallback, which is the PRERENDERED homepage -
 * not the source index.html. Its head is written by src/components/SEOHead.tsx
 * through Helmet, so a selector naming a tag SEOHead does not emit is a rule
 * that never fires. That is invisible in review: the rule reads correctly, the
 * code runs, and nothing happens.
 *
 * Found by this check on its first run: `meta[property="og:image:secure_url"]`
 * was in the entity-shell rules and NOTHING in the codebase emits that tag.
 *
 * AND IT CORRECTED A CLAIM THE OTHER WAY. A note on WEB-SEO-006 said
 * `meta[name="robots"]` never fires either, reasoning from the source
 * index.html, which has none. SEOHead emits one on every page, so the 404/410
 * branch's rewrite of it does fire. Reading the wrong file is how both
 * mistakes happened, which is why this test names the right one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEO_HEAD = readFileSync(join(HERE, '../../src/components/SEOHead.tsx'), 'utf8');
const MIDDLEWARE = readFileSync(join(HERE, '../_middleware.ts'), 'utf8');
// The body target is not in the head: App.tsx renders the one <main> every
// route shares, and the entity shell replaces its contents.
const APP = readFileSync(join(HERE, '../../src/App.tsx'), 'utf8');

const { selfCanonicalRewrites, entityShellRewrites } = await import('../_middleware.ts');

let bad = 0;
const ck = (name, cond, detail = '') => {
  console.log((cond ? '  ok    ' : '  FAIL  ') + name + (cond || !detail ? '' : `  -> ${detail}`));
  if (!cond) bad++;
};

/** Does SEOHead render a tag this selector would match? */
function shellEmits(selector) {
  // `head` is the document's own element; an injection target, always present.
  if (selector === 'head') return true;
  if (selector === 'title') return /<title>/.test(SEO_HEAD);
  const meta = /^meta\[(name|property)="([^"]+)"\]$/.exec(selector);
  if (meta) return new RegExp(`${meta[1]}="${meta[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(SEO_HEAD);
  if (selector === 'link[rel="canonical"]') return /rel="canonical"/.test(SEO_HEAD);
  if (selector === 'script[type="application/ld+json"]') return /application\/ld\+json/.test(SEO_HEAD);
  if (selector === 'main#main-content') return /<main id="main-content"/.test(APP);
  return null; // unrecognised shape - reported rather than silently passed
}

const RULE_SETS = {
  selfCanonicalRewrites: selfCanonicalRewrites('https://desmoinesinsider.com/events/x'),
  entityShellRewrites: entityShellRewrites({
    pageUrl: 'https://desmoinesinsider.com/events/x',
    sbBase: 'https://proj.supabase.co',
    type: 'event',
    entity: { id: '1', title: 'T', description: 'D', startDate: '2026-01-01' },
  }),
};

for (const [name, rules] of Object.entries(RULE_SETS)) {
  console.log(`\n${name}`);
  for (const rule of rules) {
    const emitted = shellEmits(rule.selector);
    ck(
      `${rule.selector} is a tag the shell has`,
      emitted === true,
      emitted === null ? 'unrecognised selector shape - teach shellEmits about it' : 'SEOHead emits no such tag',
    );
  }
}

// The 404/410 branch is inline rather than a rule list, so its two selectors
// are read from the source. Keep them here so the set stays complete.
console.log('\nthe dead-slug branch');
for (const selector of ['link[rel="canonical"]', 'meta[name="robots"]']) {
  ck(`${selector} is used by the dead-slug branch`, MIDDLEWARE.includes(`.on('${selector}'`), 'the branch no longer names it');
  ck(`${selector} is a tag the shell has`, shellEmits(selector) === true);
}

console.log('\nthe tag that started this');
ck(
  'nothing emits og:image:secure_url',
  !/og:image:secure_url/.test(SEO_HEAD),
  'SEOHead emits it now - the middleware rule can come back',
);
ck(
  'and the middleware no longer rewrites it',
  !MIDDLEWARE.includes(`'meta[property="og:image:secure_url"]', setAttribute`),
);

console.log(`\n${bad} failure(s)`);
process.exit(bad ? 1 : 0);
