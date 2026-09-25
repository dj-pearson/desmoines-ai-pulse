#!/usr/bin/env node
/**
 * WP5 item 7 (docs/page-plans/home.md): an inline ld+json script must be fed
 * toJsonLd(), not a bare JSON.stringify().
 *
 * The HTML parser ends a <script> at the first "</script" it meets, whatever
 * the JSON says. Event pages pass AI-written geo_faq rows into FAQSection, so
 * a row containing "</script><script>..." broke out of the FAQPage block and
 * ran. toJsonLd (src/lib/jsonLd.ts) escapes < > & U+2028 U+2029 as \uXXXX,
 * which JSON.parse reads back identically.
 *
 * Two halves:
 *   1. toJsonLd itself: escapes what it must, and round-trips.
 *   2. A source scan. The four emitters WP5 converted must stay converted,
 *      and no NEW file may add a bare JSON.stringify inside an ld+json script.
 *      The files that still do are listed in BASELINE; that list may only
 *      shrink. Remove a file from it when you convert it.
 *
 * Run by `npm run test:offline` (tsx, because it imports a .ts module).
 */
import fs from 'node:fs';
import path from 'node:path';
import { toJsonLd } from '../../src/lib/jsonLd.ts';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

console.log('\ntoJsonLd');
const hostile = {
  name: 'Q</script><script>alert(1)</script>',
  text: 'a & b > c \u2028 line \u2029 para',
  nested: [{ x: '<!--' }],
};
const out = toJsonLd(hostile);
check('no "</script" survives', !/<\/script/i.test(out), out);
check('no raw "<" survives', !out.includes('<'));
check('no raw ">" survives', !out.includes('>'));
check('no raw U+2028 / U+2029 survives', !/[\u2028\u2029]/.test(out));
check('round-trips through JSON.parse', JSON.stringify(JSON.parse(out)) === JSON.stringify(hostile));
check('undefined serialises to "null", not a crash', toJsonLd(undefined) === 'null');

console.log('\nld+json emitters');

const SRC = path.resolve('src');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx$/.test(e.name)) out.push(full);
  }
  return out;
}

/** True when some ld+json <script> in the source is fed a bare JSON.stringify. */
function bareStringifyInLdJson(src) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    // Up to the closing tag (or 400 chars), whichever is first.
    const rest = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const body = rest.split('</script>')[0];
    if (/JSON\.stringify\s*\(/.test(body)) return true;
  }
  // dangerouslySetInnerHTML={{ __html: JSON.stringify(...) }} on an ld+json script.
  if (/application\/ld\+json[^>]{0,200}__html\s*:\s*JSON\.stringify/.test(src)) return true;
  return false;
}

// Must stay converted (WP5 item 7).
const REQUIRED_CLEAN = [
  // Event detail prerenders scraped descriptions (events WP8 item 1).
  'components/EnhancedEventSEO.tsx',
  'components/FAQSection.tsx',
  'components/SEOHead.tsx',
  'components/schema/SpeakableSchema.tsx',
  'components/schema/BreadcrumbListSchema.tsx',
  // Eat & Drink WP9: scraped menu text, brewery names, restaurant details.
  'components/schema/MenuSchema.tsx',
  'components/schema/ItemListSchema.tsx',
  'components/EnhancedLocalSEO.tsx',
  // Explore WP3: attraction descriptions and geo_summary are AI-written.
  'components/EnhancedAttractionSEO.tsx',
  // Plan & Stay WP2: hotel descriptions come from a table any signed-in user
  // could write until D2 lands.
  'components/schema/HotelSchema.tsx',
  // Events pass 2 WP6 item 1: scraped event names and descriptions on 14
  // prerendered events routes, every month page and every music venue page.
  'components/schema/EventListJsonLd.tsx',
  'pages/VenueDetail.tsx',
  // Explore pass 2 WP4 item 1: playground names, descriptions and amenities
  // come from a Google Places import.
  'components/EnhancedPlaygroundSEO.tsx',
  // Explore pass 2 WP5 item 11 converts it; WP4 owns this file and moves it.
  'pages/TeamDetail.tsx',
];

// Still bare as of 2026-09-24. May only shrink.
const BASELINE = new Set([
  'components/LocalSEO.tsx',
  // Builds a copy-paste snippet in a template string for the admin SEO tool,
  // not a live script tag; listed so the scan stays simple.
  'components/SEOTools.tsx',
  'components/schema/FAQSchema.tsx',
  'components/schema/TouristTripSchema.tsx',
  'pages/SeasonalGuide.tsx',
]);

const offenders = walk(SRC)
  .filter((f) => bareStringifyInLdJson(fs.readFileSync(f, 'utf8')))
  .map((f) => path.relative(SRC, f).replace(/\\/g, '/'));

for (const rel of REQUIRED_CLEAN) {
  const src = fs.readFileSync(path.join(SRC, rel), 'utf8');
  check(`${rel} uses toJsonLd`, /toJsonLd\(/.test(src) && !offenders.includes(rel));
}

const unexpected = offenders.filter((rel) => !BASELINE.has(rel));
check('no new file feeds JSON.stringify to an ld+json script', unexpected.length === 0, unexpected.join(', ') + ' - use toJsonLd from @/lib/jsonLd');

const fixed = [...BASELINE].filter((rel) => !offenders.includes(rel));
check('BASELINE lists only files that still offend', fixed.length === 0, `remove from BASELINE: ${fixed.join(', ')}`);

console.log('\nthe scan is not vacuous');
check('fires on a bare stringify', bareStringifyInLdJson('<script type="application/ld+json">{JSON.stringify(x)}</script>'));
check('does not fire on toJsonLd', !bareStringifyInLdJson('<script type="application/ld+json">{toJsonLd(x)}</script>'));
check('found the known offenders', offenders.length > 0, 'zero offenders with a non-empty BASELINE means the scan broke');

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: json-ld-escape - ${failures} failing check(s)\n`);
process.exit(failures === 0 ? 0 : 1);
