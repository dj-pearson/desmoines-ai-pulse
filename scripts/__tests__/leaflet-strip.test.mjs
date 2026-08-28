#!/usr/bin/env node
/**
 * Offline checks for stripLeafletRuntime (WEB-PERF-023 AC1).
 *
 *   npx tsx scripts/__tests__/leaflet-strip.test.mjs
 *
 * This runs over captured HTML on its way to dist/, so the cases that matter
 * are the ones it must NOT touch. Removing a content <img> from a prerendered
 * page is a silent SEO regression: the page still renders, the build still
 * passes, and a crawler just sees less than it did.
 */
import { stripLeafletRuntime, stripPrerenderSignal, dedupeJsonLd } from '../lazy-preload-patterns.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

const MARKER =
  '<img src="marker-icon.png" class="leaflet-marker-icon leaflet-zoom-animated leaflet-interactive" alt="Marker" tabindex="0" role="button" style="width: 25px;">';
const SHADOW =
  '<img src="marker-shadow.png" class="leaflet-marker-shadow leaflet-zoom-animated" alt="" style="width: 41px;">';
const TILE =
  '<img alt="" src="https://c.tile.openstreetmap.org/13/1965/3053.png" class="leaflet-tile leaflet-tile-loaded" style="width: 256px;">';

console.log('removes Leaflet runtime layers');
for (const [label, tag] of [['marker icon', MARKER], ['marker shadow', SHADOW], ['tile', TILE]]) {
  const [out, n] = stripLeafletRuntime(`<div>${tag}</div>`);
  check(label, n === 1 && out === '<div></div>', `${n} removed, got ${out}`);
}
{
  const [, n] = stripLeafletRuntime(`<div>${MARKER}${SHADOW}${TILE}${MARKER}</div>`);
  check('counts every removal', n === 4, String(n));
}

console.log('\nleaves everything else alone - the direction that must not break');
const KEEP = [
  ['a content image', '<img src="/hero.jpg" alt="Downtown Des Moines" class="w-full rounded">'],
  ['the site logo', '<img src="/DMI-Logo2.png" class="h-8 md:h-10 w-auto" alt="Des Moines Insider">'],
  ['a lazy card image', '<img src="/media/events/abc/hero.webp" loading="lazy" class="object-cover" alt="Concert">'],
  // A class that merely CONTAINS the word, on a real image. The regex is
  // anchored on the leaflet- prefix with word boundaries for this case.
  ['a class mentioning leaflets', '<img src="/x.jpg" class="leaflets-guide-photo" alt="Leaflets">'],
  ['the leaflet container div', '<div class="leaflet-pane leaflet-marker-pane"></div>'],
  ['a picture source', '<source srcset="/a.webp" type="image/webp">'],
];
for (const [label, tag] of KEEP) {
  const [out, n] = stripLeafletRuntime(tag);
  check(label, n === 0 && out === tag, `removed ${n}`);
}

console.log('\nreturns the input untouched when there is nothing to do');
{
  const html = '<div id="root"><p>no map here</p></div>';
  const [out, n] = stripLeafletRuntime(html);
  check('same string, zero count', out === html && n === 0);
}

console.log('\npreserves surrounding content');
{
  const html = `<div id="root"><h1>Map</h1>${MARKER}<p>Explore Des Moines</p>${TILE}</div>`;
  const [out, n] = stripLeafletRuntime(html);
  check(
    'text survives',
    n === 2 && out.includes('<h1>Map</h1>') && out.includes('<p>Explore Des Moines</p>'),
    out,
  );
}

console.log('\nstripPrerenderSignal: build-time handshake, not shipped output');
{
  const html = '<html lang="en" class="dark" data-queries-settled="true" style="--x: 1;"><head></head></html>';
  const [out, n] = stripPrerenderSignal(html);
  check(
    'removes the attribute and keeps lang, class and style',
    n === 1 && out === '<html lang="en" class="dark" style="--x: 1;"><head></head></html>',
    out,
  );
}
{
  const [out, n] = stripPrerenderSignal('<html lang="en"><head></head></html>');
  check('no-op when absent, same string', n === 0 && out === '<html lang="en"><head></head></html>');
}
{
  // The prerenderer writes "true", but a capture that timed out could carry
  // "false" - both are build-time state and neither should ship.
  const [, n] = stripPrerenderSignal('<html data-queries-settled="false"></html>');
  check('removes it whatever the value', n === 1);
}
{
  const [out] = stripPrerenderSignal('<div data-queries-total="9"></div>');
  check('leaves a differently-named data attribute alone', out === '<div data-queries-total="9"></div>', out);
}

console.log('');
console.log('dedupeJsonLd: it DELETES structured data, so the no-op cases are the ones that matter');
{
  const ld = (body, rh = true) =>
    '<script type="application/ld+json"' + (rh ? ' data-rh="true"' : '') + '>' + body + '</script>';
  const FAQ_A = ld('{"@type":"FAQPage","x":1}');
  const FAQ_B = ld('{"@type":"FAQPage","x":2}');
  const head = (s) => '<head>' + s + '</head>';

  {
    const [out, n, types] = dedupeJsonLd(head(FAQ_A + FAQ_B));
    check('drops the earlier of two same-@type Helmet blocks', n === 1 && out === head(FAQ_B), out);
    check('reports which @type was dropped', JSON.stringify(types) === '["FAQPage"]', JSON.stringify(types));
    // Helmet APPENDS the settled render, so the last block is the correct one.
    // Keeping the first would ship the loading render's JSON.
    check('keeps the LAST one, not the first', out.includes('"x":2') && !out.includes('"x":1'));
  }
  {
    const two = head(ld('{"@type":"FAQPage"}') + ld('{"@type":"ItemList"}'));
    const [out, n] = dedupeJsonLd(two);
    check('leaves different @types alone', n === 0 && out === two);
  }
  {
    // A block written straight into index.html carries no data-rh and is not
    // Helmet's to replace. Dropping one would delete hand-authored markup.
    const hand = head(ld('{"@type":"FAQPage"}', false) + ld('{"@type":"FAQPage"}', false));
    const [out, n] = dedupeJsonLd(hand);
    check('never touches non-Helmet blocks', n === 0 && out === hand);
  }
  {
    const mixed = head(ld('{"@type":"FAQPage","a":1}', false) + ld('{"@type":"FAQPage","a":2}'));
    const [out, n] = dedupeJsonLd(mixed);
    check('a Helmet block does not evict a hand-authored one of the same type', n === 0 && out === mixed, out);
  }
  {
    const [out, n, types] = dedupeJsonLd('<head><title>x</title></head>');
    check('no JSON-LD at all: same string, zero, empty list',
      n === 0 && out === '<head><title>x</title></head>' && Array.isArray(types) && types.length === 0);
  }
  {
    const [, n] = dedupeJsonLd(head(ld('{"@type":"FAQPage"}') + FAQ_A + FAQ_B));
    check('three of a type drops two', n === 2, String(n));
  }
  {
    // The @type regex takes the FIRST match in the body, so two @graph blocks
    // whose first member differs are left alone. Recorded as the current
    // behaviour, not asserted as ideal.
    const g1 = ld('{"@graph":[{"@type":"WebSite"},{"@type":"FAQPage"}]}');
    const g2 = ld('{"@graph":[{"@type":"Organization"},{"@type":"FAQPage"}]}');
    const [, n] = dedupeJsonLd(head(g1 + g2));
    check('does not reach inside @graph', n === 0, String(n));
  }
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
