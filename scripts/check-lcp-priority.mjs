#!/usr/bin/env node
/**
 * WEB-PERF-040. The LCP image must not be lazy, and must carry a priority hint.
 *
 * OptimizedImage has supported `priority` (loading="eager" +
 * fetchpriority="high") since it was written and NO caller in the app passed
 * it. SocialEventCard - which renders every event listing on the site - was
 * hardcoded loading="lazy" with no way to opt out. So the largest element on
 * /events, /restaurants, and every SEO landing page was lazily loaded, which
 * is the one thing Chrome's guidance says not to do: the browser will not
 * start that fetch until layout has run.
 *
 * This checks the three DETAIL page heroes, where the LCP element is
 * unambiguous - one full-bleed image at the top of the page, above everything
 * else. The listing grids are not checked here: which card is above the fold
 * depends on the viewport, so a hard rule there would be guesswork.
 *
 * Usage: node scripts/check-lcp-priority.mjs
 */
import { readFileSync } from 'node:fs';

const HEROES = [
  'src/pages/EventDetails.tsx',
  'src/pages/RestaurantDetails.tsx',
  'src/pages/AttractionDetails.tsx',
];

const problems = [];
for (const file of HEROES) {
  const text = readFileSync(file, 'utf8');
  // The hero is the first <img> in the file; later ones are gallery thumbnails.
  const first = text.indexOf('<img');
  if (first === -1) {
    problems.push(`${file}: no <img> found - has the hero moved to a component?`);
    continue;
  }
  const tag = text.slice(first, text.indexOf('/>', first) + 2);
  if (/loading=["']lazy["']/.test(tag)) {
    problems.push(`${file}: the hero image is loading="lazy"`);
  }
  if (!/loading=["']eager["']/.test(tag)) {
    problems.push(`${file}: the hero image has no loading="eager"`);
  }
  if (!/fetchPriorityAttr\(\s*["']high["']\s*\)/.test(tag)) {
    problems.push(`${file}: the hero image has no fetchpriority="high" hint`);
  }
}

if (problems.length === 0) {
  console.log('OK Every detail-page hero image loads eagerly at high fetch priority.');
  process.exit(0);
}

console.error('\nX LCP image is not prioritised:\n');
for (const p of problems) console.error(`  ${p}`);
console.error(`
The hero on a detail page is the LCP element. loading="eager" removes the lazy
delay; fetchpriority="high" is what promotes the request past the scripts and
styles the browser found earlier in the document. Both are needed.

Use {...fetchPriorityAttr("high")} from @/lib/fetchPriority on a raw <img>, or
priority on <OptimizedImage>.
`);
process.exit(1);
