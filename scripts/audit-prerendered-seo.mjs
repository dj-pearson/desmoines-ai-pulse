/**
 * WEB-SEO-002 audit: inspect the SEO head of every prerendered route in dist/.
 *
 * Reads the shipped HTML rather than the source, because the source lies. Pages
 * can render two head managers (SEOEnhancedHead and SEOStructure both emit
 * <title> and <meta name="description">), Helmet resolves last-mount-wins, and
 * Helmet APPENDS meta tags rather than replacing the unmanaged ones baked into
 * index.html. The net effect is that an edit to the "wrong" component compiles,
 * reads correctly in review, and changes nothing in the output — which is
 * exactly how the homepage ended up shipping a title nobody had written.
 *
 * Usage:  node scripts/audit-prerendered-seo.mjs [--json]
 * Requires a build first (npm run build, or vite build && node scripts/prerender.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { PRERENDER_ROUTES } from './prerender-routes.mjs';

const DIST = path.resolve('dist');
const JSON_OUT = process.argv.includes('--json');

const rx = {
  title: /<title>(.*?)<\/title>/is,
  description: /<meta[^>]+name="description"[^>]+content="([^"]*)"/gi,
  canonical: /<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i,
  robots: /<meta[^>]+name="robots"[^>]+content="([^"]*)"/i,
  ogTitle: /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i,
  h1: /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi,
};

const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
const normPath = (p) => (p && p.length > 1 ? p.replace(/\/+$/, '') : p);

function auditRoute(route) {
  const file = route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, route, 'index.html');
  if (!fs.existsSync(file)) return { route, missing: true };

  const html = fs.readFileSync(file, 'utf8');
  const title = decode(rx.title.exec(html)?.[1]?.trim() ?? '');
  const descriptions = [...html.matchAll(rx.description)].map((m) => decode(m[1].trim()));
  const canonicalRaw = rx.canonical.exec(html)?.[1] ?? null;
  let canonicalPath = null;
  if (canonicalRaw) {
    try {
      canonicalPath = new URL(canonicalRaw, 'https://desmoinesinsider.com').pathname;
    } catch {
      canonicalPath = canonicalRaw;
    }
  }
  const h1s = [...html.matchAll(rx.h1)].map((m) => stripTags(m[1])).filter(Boolean);

  return {
    route,
    missing: false,
    bytes: html.length,
    title,
    titleLen: title.length,
    descriptions,
    descCount: descriptions.length,
    canonical: canonicalRaw,
    canonicalPath,
    canonicalOk: canonicalPath !== null && normPath(canonicalPath) === normPath(route),
    robots: rx.robots.exec(html)?.[1] ?? null,
    ogTitle: decode(rx.ogTitle.exec(html)?.[1] ?? ''),
    h1Count: h1s.length,
    h1: h1s[0] ?? null,
  };
}

const results = PRERENDER_ROUTES.map(auditRoute);
const present = results.filter((r) => !r.missing);

// Group by value to find duplicates across routes.
const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const v = typeof key === 'function' ? key(r) : r[key];
    if (!v) continue;
    if (!m.has(v)) m.set(v, []);
    m.get(v).push(r.route);
  }
  return [...m.entries()].filter(([, routes]) => routes.length > 1);
};

const dupTitles = groupBy(present, 'title');
// Compare the LAST description: Helmet appends, so the page's own value is last
// while index.html's static fallback is first.
const dupOwnDesc = groupBy(present, (r) => r.descriptions[r.descriptions.length - 1] ?? null);
const dupCanonical = groupBy(present, 'canonicalPath');

if (JSON_OUT) {
  console.log(JSON.stringify({ results, dupTitles, dupOwnDesc, dupCanonical }, null, 2));
  process.exit(0);
}

if (present.length === 0) {
  console.error('No prerendered routes found in dist/. Build first.');
  process.exit(1);
}

console.log(`\nSEO head audit — ${present.length}/${PRERENDER_ROUTES.length} prerendered routes\n`);
console.log(
  'route'.padEnd(30) + 'canon  desc  h1  title',
);
console.log('-'.repeat(110));
for (const r of results) {
  if (r.missing) {
    console.log(`${r.route.padEnd(30)}  MISSING FROM dist/`);
    continue;
  }
  const canon = r.canonicalPath === null ? ' none' : r.canonicalOk ? '   ok' : ' WRONG';
  const h1 = r.h1Count === 1 ? '  1' : ` ${r.h1Count}!`;
  console.log(
    `${r.route.padEnd(30)}${canon}  ${String(r.descCount).padStart(4)}  ${h1}  ${r.title.slice(0, 58)}`,
  );
}

const noCanonical = present.filter((r) => r.canonicalPath === null);
const wrongCanonical = present.filter((r) => r.canonicalPath !== null && !r.canonicalOk);
const multiDesc = present.filter((r) => r.descCount > 1);
const noDesc = present.filter((r) => r.descCount === 0);
const badH1 = present.filter((r) => r.h1Count !== 1);
const longTitles = present.filter((r) => r.titleLen > 60);

console.log('\nSummary');
console.log('-'.repeat(110));
const line = (label, rows) =>
  console.log(`  ${String(rows.length).padStart(3)}  ${label}${rows.length ? ': ' + rows.map((r) => r.route ?? r).slice(0, 8).join(', ') + (rows.length > 8 ? ' …' : '') : ''}`);
line('routes with no canonical', noCanonical);
line('routes whose canonical points elsewhere', wrongCanonical);
line('routes with >1 meta description (Helmet appends over index.html)', multiDesc);
line('routes with no meta description at all', noDesc);
line('routes without exactly one h1', badH1);
line('titles longer than 60 chars (Google truncates)', longTitles);
console.log(`  ${String(dupTitles.length).padStart(3)}  duplicate title groups`);
for (const [t, routes] of dupTitles) console.log(`         "${t.slice(0, 60)}" -> ${routes.join(', ')}`);
console.log(`  ${String(dupOwnDesc.length).padStart(3)}  duplicate own-description groups`);
for (const [, routes] of dupOwnDesc) console.log(`         ${routes.join(', ')}`);
console.log(`  ${String(dupCanonical.length).padStart(3)}  duplicate canonical groups`);
for (const [c, routes] of dupCanonical) console.log(`         ${c} -> ${routes.join(', ')}`);
console.log('');
