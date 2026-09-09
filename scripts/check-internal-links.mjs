#!/usr/bin/env node
/**
 * Internal links must resolve to a route (WEB-ADS-014).
 *
 * scripts/__tests__/site-directory-routes.test.mjs already guards the footer
 * directory, which is the highest-leverage set of internal links. It is not
 * the only set. An href written anywhere else in src/ was checked by nothing,
 * and two were dead when this was written:
 *
 *   /advertising-policies, from the creative upload page - so an advertiser
 *   was told their creative is reviewed against "our advertising policies",
 *   given a link, and sent to a 404. The policies were neither published nor
 *   written.
 *
 *   /docs/scraping/README-SCRAPER-SETUP.md, from admin scraper settings. The
 *   file exists in the repo; docs/ is not copied into public/, so the SPA
 *   fallback answered with the app shell.
 *
 * Neither fails loudly. The SPA answers 200 with the app shell for any path,
 * so a dead internal link renders the 404 component rather than erroring, and
 * a crawler sees a soft 404.
 *
 * WHAT COUNTS AS RESOLVING: a literal path in App.tsx, a redirect source in
 * public/_redirects, or a child of a dynamic route (/events/:slug and the
 * like). External URLs, mailto:, tel: and template expressions are ignored -
 * this checks static, site-relative hrefs only.
 *
 * Run by `npm run check-internal-links`, and by `npm run validate`.
 */
import fs from 'node:fs';
import path from 'node:path';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const literal = new Set(
  [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => !p.includes(':') && p !== '*'),
);
const dynamicParents = [...app.matchAll(/path="([^"]*):[^"]*"/g)]
  .map((m) => m[1].replace(/\/$/, ''))
  .filter(Boolean);

const redirects = new Set(
  fs.readFileSync('public/_redirects', 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)[0]),
);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const found = new Map(); // href -> Set(file:line)
for (const file of walk('src')) {
  const src = fs.readFileSync(file, 'utf8');
  src.split('\n').forEach((line, i) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    for (const m of line.matchAll(/(?:to|href)=["'](\/[^"'{}?#]*)["']/g)) {
      const href = m[1].replace(/\/$/, '') || '/';
      if (!found.has(href)) found.set(href, new Set());
      found.get(href).add(`${file}:${i + 1}`);
    }
  });
}

const dead = [];
for (const [href, where] of found) {
  if (literal.has(href) || literal.has(href + '/')) continue;
  if (redirects.has(href)) continue;
  if (dynamicParents.some((p) => p && href.startsWith(p + '/'))) continue;
  // /events/<slug> style: a dynamic child of a literal parent
  const parent = href.slice(0, href.lastIndexOf('/'));
  if (parent && dynamicParents.includes(parent)) continue;
  dead.push({ href, where: [...where] });
}

if (dead.length) {
  console.error('\nX Internal links that resolve to no route (WEB-ADS-014)\n');
  for (const d of dead.sort((a, b) => a.href.localeCompare(b.href))) {
    console.error(`  ${d.href}`);
    console.error(`      ${d.where.slice(0, 4).join(', ')}${d.where.length > 4 ? ` (+${d.where.length - 4})` : ''}`);
  }
  console.error(
    '\nAdd the route, add a redirect in public/_redirects, or fix the href.\n' +
      'The SPA answers 200 for any path, so these render the 404 component\n' +
      'instead of failing, and a crawler sees a soft 404.\n',
  );
  process.exit(1);
}

console.log(
  `OK Internal links: ${found.size} static hrefs across src/ all resolve ` +
    `(${literal.size} literal routes + redirects + dynamic routes).`,
);
