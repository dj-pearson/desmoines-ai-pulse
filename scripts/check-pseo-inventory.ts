#!/usr/bin/env node
/**
 * WEB-SEO-013 AC5 - the inventory gate.
 *
 * "Enforce an inventory gate before publishing any page: at least 8 distinct
 *  qualifying events (or 6 restaurants) in the current window, else 301 to the
 *  parent. This is the single control that separates this from doorway pages."
 *
 * This is the REPORTING half. The measurement moved to scripts/lib/pseoShippable.ts
 * when the sitemap generator started selecting from it - see that file for why
 * the two must not compute it separately, and for what RENDERED, ATTAINABLE and
 * the canonical rule mean.
 *
 * RENDERED 0 / ATTAINABLE 0 is a page with no inventory: unpublish it.
 * RENDERED 0 / ATTAINABLE 20 is a page whose inventory exists but is not
 * addressable by the fields we store. Collapsing them loses which fix applies.
 *
 * Run it with tsx, not node - it imports a TypeScript module by design.
 *
 * IT READS PRODUCTION, so it does not run in CI: there is no key in a PR job,
 * and pseo_pages is data rather than code. Run it before a generation batch and
 * after one. `npm run check-pseo-inventory`.
 *
 * Exit code is always 0. This reports; it does not gate. What to do with a thin
 * page - 301 to the parent, unpublish, or hold the batch - is the owner's call
 * under AC5/AC6.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePseoShippable, FLOOR } from './lib/pseoShippable';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function env() {
  let text = '';
  try {
    text = readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch {
    text = '';
  }
  const out = { ...process.env };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !out[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

const E = env();
const BASE = (E.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = E.VITE_SUPABASE_ANON_KEY;
if (!BASE || !KEY) {
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required (read from .env or the environment).');
  process.exit(1);
}

const now = new Date();
const nowIso = now.toISOString();

const { pages, data, results, canonical, shadowed, dupes, claims, temporalOnlyByClaim } = await computePseoShippable({
  base: BASE,
  key: KEY,
  now,
  withAttainable: true,
});

console.log(
  `[pseo-inventory] ${pages.length} published page(s) against ${data.events.length} events, ` +
    `${data.restaurants.length} restaurants, ${data.attractions.length} attractions (${nowIso.slice(0, 10)})`,
);
console.log(
  `[pseo-inventory] floors: ${FLOOR.events} events / ${FLOOR.restaurants} restaurants / ${FLOOR.attractions} attractions`,
);
console.log('[pseo-inventory] RENDERED replays PseoLiveListings; ATTAINABLE is the same dimensions against the real data shape.\n');

const empties = results.filter((r) => r.rendered === 0);
const brokenFilter = empties.filter((r) => r.attainable > 0);
const noInventory = empties.filter((r) => r.attainable === 0);
const thin = results.filter((r) => r.rendered > 0 && !r.passes);
const pass = results.filter((r) => r.passes);

function show(title, rows, limit = 1000) {
  if (!rows.length) return;
  console.log(`${title}  (${rows.length})`);
  for (const r of rows.slice(0, limit)) {
    console.log(
      `  ${r.slug.padEnd(42)} rendered ${String(r.rendered).padStart(4)}  attainable ${String(r.attainable).padStart(4)}  ${r.entityType}${r.unfilterable ? '  [audience-only]' : ''}${r.error ? `  !! ${r.error}` : ''}`,
    );
  }
  if (rows.length > limit) console.log(`  ... and ${rows.length - limit} more`);
  console.log('');
}

show('EMPTY - the filter finds nothing but the inventory exists', brokenFilter, 25);
show('EMPTY - no inventory to find', noInventory, 25);
show('THIN - below the floor', thin, 25);
show('PASS', pass, 10);

const dupePages = dupes.reduce((n, s) => n + s.length, 0);
console.log(`IDENTICAL LISTINGS  (${dupes.length} group(s), ${dupePages} page(s) sharing a listing with another URL)`);
for (const slugs of dupes.slice(0, 6)) {
  console.log(`  ${slugs.length} URLs render the same entities:`);
  for (const s of slugs) console.log(`      ${s}`);
}
if (dupes.length > 6) console.log(`  ... and ${dupes.length - 6} more group(s)`);

console.log('');
console.log(`SHIPPABLE  (${canonical.length} of ${results.length} published)`);
console.log('  Clears the floor and is the only URL rendering its listing.');
console.log('  This is the set sitemap-pseo.xml submits - see scripts/lib/pseoShippable.ts.');
for (const s of canonical.slice(0, 25)) console.log(`      ${s}`);
if (canonical.length > 25) console.log(`  ... and ${canonical.length - 25} more`);
if (shadowed.length) {
  console.log('');
  console.log(`  ${shadowed.length} page(s) clear the floor and duplicate a shippable page's listing:`);
  for (const s of shadowed.slice(0, 15)) console.log(`      ${s}`);
  if (shadowed.length > 15) console.log(`  ... and ${shadowed.length - 15} more`);
}

console.log('');
console.log(
  `CLAIMED BY ANOTHER ROUTE  (${claims.claimed.size}: ${claims.exact.length} exact, ${claims.shadowed.length} under a parameterised route)`,
);
console.log('  These URLs never render the pSEO page, so they are never shippable. See AC7.');

if (temporalOnlyByClaim.length) {
  console.log('');
  console.log(`SEASONAL BY DEFAULT  (${temporalOnlyByClaim.length})`);
  console.log('  Shippable only under a temporal slug, because the evergreen URL is claimed:');
  for (const t of temporalOnlyByClaim.slice(0, 10)) {
    console.log(`      ${t.canonical.padEnd(34)} evergreen sibling claimed: ${t.claimed.join(', ')}`);
  }
  if (temporalOnlyByClaim.length > 10) console.log(`  ... and ${temporalOnlyByClaim.length - 10} more`);
}

const errored = results.filter((r) => r.error);
if (errored.length) {
  console.log('');
  console.log(`⚠️ ${errored.length} page(s) errored and count as rendered 0 - the numbers above understate.`);
}

console.log(
  `\n[pseo-inventory] ${pass.length} pass, ${thin.length} thin, ${empties.length} empty ` +
    `(${brokenFilter.length} broken filter, ${noInventory.length} no inventory) - ` +
    `${Math.round(((results.length - pass.length) / results.length) * 100)}% of published pages do not clear AC5's floor.`,
);
