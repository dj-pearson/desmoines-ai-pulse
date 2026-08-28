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
import { stripLeafletRuntime, stripPrerenderSignal } from '../lazy-preload-patterns.mjs';

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

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
