#!/usr/bin/env node
/**
 * Every purchasable placement must exist in the DB enum AND have a rate-card
 * row (WEB-ADS-007, WEB-ADS-010).
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
 * THE SECOND REQUIREMENT IS THE PRICE, and it is the same defect one step
 * further along. calculate_campaign_pricing() reads ad_rate_card, and when a
 * placement has no active row it does NOT fail - it invents one:
 *
 *     v_base_rate := CASE p_placement_type
 *       WHEN 'top_banner' THEN 10.00
 *       WHEN 'featured_spot' THEN 5.00
 *       WHEN 'below_fold' THEN 5.00
 *       ELSE 5.00
 *     END;
 *
 * So a placement on sale with no rate-card row is CHARGED $5 a day from a
 * fallback nobody chose, while fetchRateCard() - which selects only active rows
 * - hands the client nothing to display. The advertiser sees no price and the
 * server picks one. That is WEB-ADS-003's shape exactly: two formulas for one
 * price, and the one that wins is the one the buyer never saw.
 *
 * All four purchasable placements are seeded today, so this requirement passes
 * on arrival. It is here for the fifth.
 *
 * Read from the migrations' INSERT statements rather than from the database,
 * because there are no credentials in a PR job - so this proves the seed
 * exists, not that the row is present and active in production. `npm run
 * check-schema:probe` is what answers the latter.
 *
 * Exit 0 when every spec has an enum value and a seeded rate, 1 otherwise.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();
const SPECS = join(ROOT, 'src', 'lib', 'placementSpecs.ts');
const TYPES = join(ROOT, 'src', 'integrations', 'supabase', 'types.ts');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

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

/**
 * Placements seeded into ad_rate_card by any migration.
 *
 * Every seed in this repo is `INSERT INTO ad_rate_card (...) VALUES (...)` with
 * the placement_type first, so the first quoted string of each VALUES row is
 * the placement. A migration that stopped following that shape would read as
 * zero seeds, which is why zero is refused below rather than passed.
 */
export function ratedPlacements(dir = MIGRATIONS) {
  if (!existsSync(dir)) return [];
  const rated = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    // SQL comments, not JS ones. stripComments() above handles /* */ and //,
    // and a commented-out seed in a migration starts with `--` - so without
    // this line a seed somebody disabled still reads as a price. Found by the
    // test rather than by review, which is the twelfth time a check in this
    // repo has been caught reading its own commentary.
    const sql = stripComments(readFileSync(join(dir, file), 'utf8')).replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/INSERT\s+INTO\s+(?:public\.)?ad_rate_card\b[\s\S]*?VALUES([\s\S]*?);/gi)) {
      for (const row of m[1].matchAll(/\(\s*'([a-z_]+)'/g)) rated.add(row[1]);
    }
  }
  return [...rated];
}

/**
 * Guarded so ratedPlacements() can be imported by
 * scripts/__tests__/placement-rate-card.test.mjs without this running the whole
 * check - and process.exit()-ing out of the test - as a side effect.
 */
function main() {
  const specs = specPlacements();
  const enums = enumPlacements();
  const rated = ratedPlacements();

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

  if (rated.length === 0) {
    console.error(
      '[placement-enum] found no ad_rate_card seeds in supabase/migrations.\n' +
        'Zero is not a pass: it means the INSERT shape changed, not that pricing is fine.'
    );
    process.exit(1);
  }

  const unpriced = specs.filter((p) => !rated.includes(p));

  if (unpriced.length > 0) {
    console.error(
      `\n[placement-enum] ${unpriced.length} purchasable placement(s) have no ad_rate_card row:\n`
    );
    for (const p of unpriced) console.error(`  ${p}`);
    console.error(
      `\n  specs: ${specs.join(', ')}\n  rated: ${rated.join(', ')}\n\n` +
        'calculate_campaign_pricing() does not fail on a missing rate-card row - it falls\n' +
        'back to $5 a day ($10 for top_banner). fetchRateCard() selects only active rows,\n' +
        'so the client has no price to show while the server charges one nobody chose.\n' +
        'Seed the placement in ad_rate_card by additive migration, or take it out of\n' +
        'PLACEMENT_SPECS.'
    );
    process.exit(1);
  }

  const retired = enums.filter((p) => !specs.includes(p));
  console.log(
    `[placement-enum] ${specs.length} purchasable placement(s) all exist in the enum and have a seeded rate` +
      (retired.length > 0 ? `; ${retired.length} enum value(s) not on sale: ${retired.join(', ')}` : '')
  );
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith('check-placement-enum.mjs');
if (invokedDirectly) main();
