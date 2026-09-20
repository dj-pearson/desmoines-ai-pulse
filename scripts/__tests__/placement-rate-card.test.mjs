#!/usr/bin/env node
/**
 * Every purchasable placement needs a PRICE, not just an enum value
 * (WEB-ADS-007, WEB-ADS-010).
 *
 *   npx tsx scripts/__tests__/placement-rate-card.test.mjs
 *
 * calculate_campaign_pricing() does not fail on a missing ad_rate_card row - it
 * invents $5 a day ($10 for top_banner) - while fetchRateCard() selects only
 * active rows and so hands the client nothing to display. A placement on sale
 * with no rate is therefore charged a price the buyer never saw, which is
 * WEB-ADS-003's shape: two formulas for one price, and the silent one wins.
 *
 * All four placements are seeded today, so the check passes on arrival. These
 * cases are what make it mean something when the fifth arrives.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ratedPlacements } from '../check-placement-enum.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`  FAIL ${name}${detail ? ' :: ' + detail : ''}`);
  }
};

const dirWith = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'ratecard-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(d, name), body);
  return d;
};

console.log('[placement-rate-card] reading the seeded rate card');

check(
  'a single-row seed is read',
  JSON.stringify(
    ratedPlacements(dirWith({ 'a.sql': "INSERT INTO ad_rate_card (placement_type, base_daily_rate) VALUES ('top_banner', 10.00);" })),
  ) === JSON.stringify(['top_banner']),
);

check(
  'a multi-row seed is read',
  ratedPlacements(
    dirWith({
      'a.sql':
        "INSERT INTO ad_rate_card (placement_type, base_daily_rate) VALUES\n  ('top_banner', 10.00),\n  ('featured_spot', 5.00),\n  ('below_fold', 5.00)\nON CONFLICT (placement_type) DO NOTHING;",
    }),
  ).length === 3,
);

check(
  'seeds across several migrations are merged',
  ratedPlacements(
    dirWith({
      'a.sql': "INSERT INTO ad_rate_card (placement_type) VALUES ('top_banner');",
      'b.sql': "INSERT INTO public.ad_rate_card (placement_type) VALUES ('sidebar');",
    }),
  ).sort().join(',') === 'sidebar,top_banner',
);

check('the public. prefix is accepted', ratedPlacements(dirWith({ 'a.sql': "INSERT INTO public.ad_rate_card (placement_type) VALUES ('x_y');" })).includes('x_y'));

// A commented-out seed is not a seed. These migrations carry long comments
// about pricing, and a check that reads them would report a price that does
// not exist - the trap this repo has hit twelve times.
check(
  'a commented-out seed does not count',
  ratedPlacements(
    dirWith({ 'a.sql': "-- INSERT INTO ad_rate_card (placement_type) VALUES ('ghost');\n/* ('phantom', 1) */" }),
  ).length === 0,
);

// Another table's INSERT must not be read as a rate.
check(
  'a different table is not read',
  ratedPlacements(dirWith({ 'a.sql': "INSERT INTO ad_price_list (product_key) VALUES ('featured_listing');" })).length === 0,
);

check('a directory that does not exist is empty, not a throw', ratedPlacements(join(tmpdir(), 'nope-does-not-exist')).length === 0);

// And the real tree: the four on sale are all seeded.
{
  const real = ratedPlacements();
  check('the real migrations seed a rate card', real.length > 0, String(real.length));
  for (const p of ['top_banner', 'featured_spot', 'below_fold', 'sponsored_listing']) {
    check(`${p} has a seeded rate`, real.includes(p));
  }
}

if (failures > 0) {
  console.error(`[placement-rate-card] ${failures} failure(s)`);
  process.exit(1);
}
console.log('[placement-rate-card] all checks passed');
