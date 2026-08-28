#!/usr/bin/env node
/**
 * Every static asset a page advertises must answer with its own content type
 * (WEB-SEO-006).
 *
 * THE FAILURE THIS EXISTS FOR IS A 200, NOT A 404. Cloudflare serves the SPA
 * shell for any path it does not recognise, so a missing static file answers:
 *
 *     GET /og-image.png  ->  200  text/html  <!DOCTYPE html>...
 *
 * /og-image.png was never in public/. Six prerendered pages advertised it as
 * their og:image - it was BRAND.ogImage, so every page that did not pass its own
 * image inherited it - and a social crawler asking for the card got a web page.
 * No 404, no error, nothing in any log, and the link preview simply had no
 * image. The other 37 pages passed DMI-Logo.png explicitly, so the majority
 * looked right, which is why it survived.
 *
 * WHY NOTHING ELSE CATCHES IT:
 *   check-prerender-head asserts og:image is PRESENT, not that it resolves.
 *   Any check that asks "does this URL answer?" passes - it answers 200.
 *   A build-time existence check misses assets served by a Pages Function
 *     (/media/**) and misses anything the deploy drops.
 * The only question that separates the two is what CONTENT TYPE came back.
 *
 * OFFLINE BY DEFAULT, WHICH IS WHY IT CAN GATE A PR. Locally the equivalent
 * signal is stronger than a content-type: public/ is copied into dist/, so a
 * file that does not exist is simply absent from the build. No network, no
 * dependence on what production happens to be serving today, and it fails on
 * the PR that introduces the bad reference rather than the night after.
 *
 * --live additionally fetches every reference (including remote ones - Supabase
 * storage event images) and checks the content type that comes back. That is the
 * production-side question and needs the network, so it is opt-in.
 *
 * /media/** is skipped: it is served by a Cloudflare Pages Function, not from
 * dist/, so absence there means nothing. Hashed /assets/ chunks are skipped too -
 * a missing one breaks the page far more loudly than this check would.
 *
 *   node scripts/check-asset-content-types.mjs           # offline, gates PRs
 *   node scripts/check-asset-content-types.mjs --live    # + fetch each one
 *   node scripts/check-asset-content-types.mjs --live --base https://staging...
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, sep } from 'node:path';

const DIST = 'dist';
const LIVE = process.argv.includes('--live');
const baseArg = process.argv.indexOf('--base');
const BASE = (baseArg !== -1 ? process.argv[baseArg + 1] : 'https://desmoinesinsider.com').replace(/\/$/, '');

if (!existsSync(DIST)) {
  console.error('[asset-types] dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name === 'index.html') out.push(path);
  }
  return out;
}

const pages = walk(DIST).filter((f) => !f.includes(`${sep}assets${sep}`));
if (pages.length === 0) {
  console.error('[asset-types] no index.html under dist/ - refusing to pass.');
  process.exit(1);
}

/** asset path -> the first route that referenced it, for the report. */
const refs = new Map();
// ABSOLUTE URLS ARE KEPT ABSOLUTE. The first version matched
// https://<any-host><path> and captured only the path, then fetched it against
// BASE - so every Supabase storage image
// (https://<project>.supabase.co/storage/v1/object/public/...) was requested
// from desmoinesinsider.com, hit the SPA fallback, and reported as a broken
// image. Seven confident false positives on the first run, all mine.
//
// Keeping the origin also makes the check cover event hero images, which are
// exactly the kind of asset that can go missing without anyone noticing.
const PATTERNS = [
  /(?:href|src|content)="(\/[^"?#]+\.[a-z0-9]{2,5})"/gi,
  /(?:href|src|content)="(https:\/\/[^"?#]+\.[a-z0-9]{2,5})"/gi,
];
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  let route = '/' + file.slice(DIST.length + 1).split(sep).join('/');
  route = route.replace(/index\.html$/, '').replace(/(.)\/$/, '$1');
  for (const pattern of PATTERNS) {
    for (const m of html.matchAll(pattern)) {
      // Bundler chunks are content-hashed; if one were missing the page would
      // not render at all, which is a louder failure than this check.
      if (m[1].startsWith('/assets/')) continue;
      // Served by functions/media, not from dist/ - absence proves nothing.
      if (m[1].startsWith('/media/')) continue;
      // Fonts and analytics hosts are somebody else's uptime, not ours.
      if (/^https:\/\/(fonts\.|www\.googletagmanager|www\.google-analytics)/.test(m[1])) continue;
      if (!refs.has(m[1])) refs.set(m[1], route);
    }
  }
}

// ROBOTS.TXT DECLARES SITEMAPS, AND NO PAGE LINKS TO THEM. They are advertised
// to every crawler and referenced from nowhere in the HTML, so the page sweep
// above cannot see them. A Sitemap: line pointing at a file the build does not
// contain is the same defect as the og:image: Cloudflare answers 200 text/html,
// and a crawler asked for XML and got a web page.
const robots = join(DIST, 'robots.txt');
if (existsSync(robots)) {
  for (const m of readFileSync(robots, 'utf8').matchAll(/^\s*Sitemap:\s*(\S+)\s*$/gim)) {
    if (!refs.has(m[1])) refs.set(m[1], '/robots.txt');
  }
}

// A CHECK THAT PARSED NOTHING MUST NOT PASS. Several checks in this repo have
// reported a clean result while reading zero inputs; see check-edge-types.mjs.
if (refs.size === 0) {
  console.error('[asset-types] parsed no asset references out of dist/ - refusing to pass.');
  process.exit(1);
}

/** extension -> the substring the content-type must contain. */
const EXPECTED = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image',
  svg: 'image', ico: 'image', avif: 'image',
  xml: 'xml', json: 'json', webmanifest: 'json',
  txt: 'text/plain', css: 'css', js: 'javascript',
  woff: 'font', woff2: 'font', ttf: 'font',
  pdf: 'pdf', mp4: 'video', webm: 'video',
};

const problems = [];
let checked = 0;
let fetched = 0;

for (const [path, route] of refs) {
  const ext = path.split('.').pop().toLowerCase();
  const want = EXPECTED[ext];
  if (!want) continue; // an extension we have no expectation for

  // OFFLINE: an asset served by THIS site must be in the build.
  //
  // "Served by this site" includes absolute URLs on our own origin, and that
  // distinction is the whole check. SEOHead builds og:image as
  // `${baseUrl}${BRAND.ogImage}`, so the reference that actually broke is
  // ABSOLUTE - https://desmoinesinsider.com/og-image.png. A first version tested
  // only root-relative paths, and its control proved it would have missed the
  // very bug it was written for: 11 assets checked out of 70, none of them the
  // one that mattered.
  const localPath = path.startsWith(BASE + '/') ? path.slice(BASE.length) : path.startsWith('http') ? null : path;
  if (localPath && !localPath.startsWith('/media/')) {
    checked++;
    if (!existsSync(join(DIST, localPath))) {
      problems.push({ path, route, status: 'MISSING', got: 'not in dist/' });
      continue;
    }
  }

  if (!LIVE) continue;
  const url = path.startsWith('http') ? path : BASE + path;
  fetched++;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (err) {
    problems.push({ path, route, status: 'FETCH', got: String(err.message).slice(0, 40) });
    continue;
  }
  const got = (res.headers.get('content-type') || '').toLowerCase();
  if (!res.ok || !got.includes(want)) {
    problems.push({ path, route, status: res.status, got: got.slice(0, 34) || '(none)' });
  }
}

console.log(
  `[asset-types] ${pages.length} page(s), ${checked} local asset(s) checked` +
    (LIVE ? `, ${fetched} fetched from ${BASE}.` : '. Pass --live to also fetch each one.')
);

if (problems.length === 0) {
  console.log(
  LIVE
    ? 'OK Every advertised asset exists and answers with its own content type.'
    : 'OK Every advertised asset is present in the build.'
);
  process.exit(0);
}

console.error(`\nX ${problems.length} asset(s) do not answer as the type they claim to be:`);
for (const p of problems) {
  console.error(`  ${String(p.status).padEnd(5)} ${p.got.padEnd(34)} ${p.path}`);
  console.error(`        first advertised by ${p.route}`);
}
console.error(
  '\n  A 200 of text/html here is the SPA fallback answering for a file that does\n' +
    '  not exist. Nothing errors: the crawler or browser asks for an image and gets\n' +
    '  a web page, and the only visible symptom is a link preview with no picture.\n' +
    '  Either add the file to public/ or point the reference at one that is there.\n'
);
process.exit(1);
