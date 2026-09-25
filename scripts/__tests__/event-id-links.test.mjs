#!/usr/bin/env node
/**
 * Events pass 2 WP6 item 6 (docs/page-plans/events-pass2.md): no new
 * `/events/${something.id}` link in src/.
 *
 * An event's URL is its Central dated slug, built by
 * createEventSlugWithCentralTime (src/lib/timezone.ts). /events/<uuid> still
 * resolves, because the detail page redirects it, but every such link costs
 * a redirect, puts a URL in the address bar and in shares that is not the
 * canonical one, and in email or an admin table it outlives the redirect if
 * that ever changes. The first pass fixed these one at a time; this keeps
 * them fixed.
 *
 * WHAT COUNTS. A template literal whose `/events/${...}` interpolation is a
 * bare member chain ending in `id` or `<name>_id`: `${event.id}`,
 * `${row.live_event_id}`, `${post?.content_id}`. A slug with an id fallback
 * (`${item.slug ?? item.id}`) is not counted; it links by slug whenever there
 * is one.
 *
 * BASELINE may only shrink. When you convert a file, take it out.
 *
 * Run by `npm run test:offline`.
 */
import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `  -> ${detail}` : ''}`);
  }
};

const ID_LINK = /\/events\/\$\{\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*\??\.(?:[\w$]*_)?id\s*\}/g;

/** Files with id links as of 2026-09-25, and how many. May only shrink. */
const BASELINE = new Map([
  // Handed off to Account: select title, date, event_start_utc and link by slug.
  ['components/account/SubmissionTimeline.tsx', 1],
  // Handed off to Business, same fix.
  ['components/business/YourEvents.tsx', 1],
  // A canonical built from the id, in SEOGenerator. Nothing in src/ imports
  // seoUtils today (SEOTools.tsx declares its own unrelated SEOGenerator
  // interface); delete the file or fix the line, then drop this entry.
  ['lib/seoUtils.ts', 1],
]);

const SRC = path.resolve('src');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const found = new Map();
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const hits = src.match(ID_LINK);
  if (hits) found.set(path.relative(SRC, file).replace(/\\/g, '/'), hits);
}

console.log('\nevent links by id');

const unexpected = [...found.entries()].filter(([rel, hits]) => hits.length > (BASELINE.get(rel) ?? 0));
check(
  'no new /events/${...id} link',
  unexpected.length === 0,
  unexpected.map(([rel, hits]) => `${rel}: ${hits.join(', ')}`).join('; ') +
    ' - link with createEventSlugWithCentralTime(event.title, event) from @/lib/timezone',
);

const shrunk = [...BASELINE.entries()].filter(([rel, n]) => (found.get(rel)?.length ?? 0) < n);
check('BASELINE lists only links that still exist', shrunk.length === 0, `lower or remove: ${shrunk.map(([r]) => r).join(', ')}`);

check('SocialPostQueue links events by slug', !found.has('components/admin/SocialPostQueue.tsx'));

console.log('\nthe scan is not vacuous');
const hit = (s) => (s.match(ID_LINK) ?? []).length > 0;
check('fires on ${event.id}', hit('to={`/events/${event.id}`}'));
check('fires on ${row.live_event_id}', hit('`/events/${row.live_event_id}`'));
check('fires on ${post?.content_id}', hit('`/events/${post?.content_id}`'));
check('does not fire on a slug', !hit('`/events/${createEventSlugWithCentralTime(e.title, e)}`'));
check('does not fire on slug ?? id', !hit('`/events/${item.slug ?? item.id}`'));
check('does not fire on /events/${slug}', !hit('`/events/${slug}`'));
check('found the baselined links', found.size > 0, 'zero hits with a non-empty BASELINE means the scan broke');

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: event-id-links - ${failures} failing check(s)\n`);
process.exit(failures === 0 ? 0 : 1);
