#!/usr/bin/env node
/**
 * Structured data may state only what a column holds (WEB-SEO-024).
 *
 * Attraction and playground nodes published `addressLocality: Des Moines` and
 * `postalCode: 50309` for every row, on tables that have NO city and NO
 * postal_code column -- so every attraction in Ames, Ankeny, Waukee and Altoona
 * was published as being downtown. Coordinates fell back to 41.5868,-93.625,
 * the middle of downtown, so a row without a location got a pin on a street
 * corner it is not on. A wrong pin is worse than no pin: a user navigates to it.
 *
 * `touristType` listed Family, Couples, Solo travelers and Groups for every row
 * -- a claim that says nothing and is false the moment one attraction is not
 * suitable for one of them -- and `paymentAccepted` asserted card acceptance
 * for every restaurant including the cash-only ones.
 *
 * WHAT THIS CHECKS AND WHAT IT DOES NOT. It reads the JSON-LD-building source,
 * not built HTML, because a built page only shows the rows that happened to be
 * prerendered. It looks for a hard-coded value in a NODE ABOUT AN ENTITY. The
 * publisher/site nodes on the same pages legitimately carry the city's
 * coordinates -- the publisher really is in Des Moines -- so a file is scanned
 * only up to the point where the entity node ends.
 *
 * OFFLINE. No database, no network.
 *
 *   node scripts/check-schema-placeholders.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each entry names the file, the entity node to scan, and where that node ends.
 * Scanning the whole file would flag the publisher node, which is allowed to say
 * Des Moines because the publisher is in Des Moines.
 */
const ENTITY_NODES = [
  {
    file: 'src/components/EnhancedAttractionSEO.tsx',
    start: 'const attractionSchema',
    end: 'publisher:',
  },
  {
    file: 'src/components/EnhancedPlaygroundSEO.tsx',
    start: 'const playgroundSchema',
    end: 'publisher:',
  },
  {
    file: 'src/pages/RestaurantDetails.tsx',
    start: 'const restaurantSchema',
    end: 'areaServed:',
  },
];

/** Values that are asserted rather than read. */
const PLACEHOLDERS = [
  { pattern: /postalCode:\s*["']\d{5}["']/, why: 'a hard-coded postcode; no column holds one' },
  {
    pattern: /latitude:\s*[\w.]+\s*\|\|\s*41\.58/,
    why: 'a coordinate falling back to downtown Des Moines',
  },
  {
    pattern: /longitude:\s*[\w.]+\s*\|\|\s*-93\.6/,
    why: 'a coordinate falling back to downtown Des Moines',
  },
  { pattern: /touristType:/, why: 'touristType; no column backs it' },
  { pattern: /paymentAccepted:/, why: 'paymentAccepted; no column backs it' },
  {
    pattern: /addressLocality:\s*BRAND\.city/,
    why: 'a city asserted for every row on a table with no city column',
  },
];

/** Strip comments: these files explain the removed values in prose. */
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const failures = [];

for (const node of ENTITY_NODES) {
  const src = codeOnly(readFileSync(resolve(ROOT, node.file), 'utf8'));
  const from = src.indexOf(node.start);
  if (from < 0) {
    failures.push(`${node.file}: cannot find "${node.start}" — this check has drifted from the source`);
    continue;
  }
  const to = src.indexOf(node.end, from);
  const block = src.slice(from, to > from ? to : undefined);

  for (const { pattern, why } of PLACEHOLDERS) {
    if (pattern.test(block)) {
      failures.push(`${node.file}: ${why}`);
    }
  }
}

if (failures.length > 0) {
  console.error('\n✗ Placeholder values in entity structured data:\n');
  for (const f of failures) console.error(`    ${f}`);
  console.error(
    '\nEmit a property only when its column is non-null. A property that is\n' +
      'absent is read as unknown; a property that is wrong is read as a fact.\n',
  );
  process.exit(1);
}

console.log(`✅ Schema: ${ENTITY_NODES.length} entity nodes carry no placeholder geography or invented properties.`);
