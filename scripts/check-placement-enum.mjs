#!/usr/bin/env node
/**
 * Every purchasable placement must exist in the DB enum (WEB-ADS-007).
 *
 * WHAT WENT WRONG. src/lib/placementSpecs.ts defined five placements and
 * /advertise renders every one of them as purchasable. The `placement_type`
 * enum has four. So Sidebar Skyscraper was on sale, and buying it created the
 * campaigns row and then failed the campaign_placements insert - the advertiser
 * got an error, the database got an orphan draft campaign, and nothing
 * anywhere compared the two lists.
 *
 * It was invisible in review because each file is internally consistent: the
 * spec reads like a product decision, the enum reads like a schema, and the
 * only place they meet is an INSERT at runtime.
 *
 * TWO DIRECTIONS, and only one of them is an error:
 *   a spec with no enum value   FATAL. It is on sale and cannot be bought.
 *   an enum value with no spec   fine. A placement can be retired from the rate
 *                                card while the enum keeps its value - Postgres
 *                                cannot remove an enum value anyway, and
 *                                CLAUDE.md forbids trying.
 *
 * Reads the GENERATED types rather than the migrations: that file is what the
 * client actually compiles against, and an enum value added by a migration that
 * never applied would be a lie in the other direction (see
 * check-migrations-parse).
 *
 * Exit 0 when every spec has an enum value, 1 otherwise.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SPECS = join(ROOT, 'src', 'lib', 'placementSpecs.ts');
const TYPES = join(ROOT, 'src', 'integrations', 'supabase', 'types.ts');

for (const f of [SPECS, TYPES]) {
  if (!existsSync(f)) {
    console.error(`[placement-enum] missing ${f}. Refusing to pass without reading both sides.`);
    process.exit(1);
  }
}

/** Comments name the retired placement; they must not count as declaring it. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

/** The PlacementType union in placementSpecs.ts. */
function specPlacements() {
  const src = stripComments(readFileSync(SPECS, 'utf8'));
  const m = src.match(/export type PlacementType\s*=\s*([^;]+);/);
  if (!m) {
    console.error(
      '[placement-enum] could not find the PlacementType union in src/lib/placementSpecs.ts.\n' +
        'The file changed shape; fix the matcher rather than deleting this check.'
    );
    process.exit(1);
  }
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/**
 * The placement_type enum in the generated Supabase types.
 *
 * ANCHORED ON THE `Enums:` BLOCK, not on the first `placement_type:` in the
 * file. My first version searched from the top and found a COLUMN declaration -
 * `placement_type: Database["public"]["Enums"]["placement_type"]` inside a table
 * Row - then read the following lines as if they were enum members, which
 * produced a list of foreign-key names and failed every real placement. The
 * generated file uses the same key at both levels; only the section
 * disambiguates them.
 */
function enumPlacements() {
  const src = readFileSync(TYPES, 'utf8');
  const enumsAt = src.indexOf('\n    Enums: {');
  if (enumsAt === -1) {
    console.error('[placement-enum] no Enums block in the generated types.');
    process.exit(1);
  }
  const at = src.indexOf('      placement_type:', enumsAt);
  if (at === -1) {
    console.error('[placement-enum] no placement_type in the generated types\' Enums block.');
    process.exit(1);
  }
  // The union runs until the next key at the same indent.
  const rest = src.slice(at + '      placement_type:'.length);
  const end = rest.search(/\n {6}[a-z_]+:/);
  return [...rest.slice(0, end === -1 ? 400 : end).matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

const specs = specPlacements();
const enums = enumPlacements();

if (specs.length === 0 || enums.length === 0) {
  console.error(
    `[placement-enum] read ${specs.length} spec(s) and ${enums.length} enum value(s). ` +
      'Zero on either side is not a pass.'
  );
  process.exit(1);
}

const missing = specs.filter((p) => !enums.includes(p));

if (missing.length > 0) {
  console.error(
    `\n[placement-enum] ${missing.length} purchasable placement(s) are not in the placement_type enum:\n`
  );
  for (const p of missing) console.error(`  ${p}`);
  console.error(
    `\n  specs: ${specs.join(', ')}\n  enum:  ${enums.join(', ')}\n\n` +
      '/advertise renders every PLACEMENT_SPECS entry as purchasable. A placement the\n' +
      'enum does not have fails the campaign_placements insert AFTER the campaigns row\n' +
      'is created, so the advertiser sees an error and the database keeps an orphan\n' +
      'draft. Either add the value by additive migration (and give it a rate-card row\n' +
      'and a checkout label), or remove it from PLACEMENT_SPECS.'
  );
  process.exit(1);
}

const retired = enums.filter((p) => !specs.includes(p));
console.log(
  `[placement-enum] ${specs.length} purchasable placement(s) all exist in the enum` +
    (retired.length > 0 ? `; ${retired.length} enum value(s) not on sale: ${retired.join(', ')}` : '')
);
