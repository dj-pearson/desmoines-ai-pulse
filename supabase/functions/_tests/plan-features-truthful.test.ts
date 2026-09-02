/**
 * Advertised plan benefits must be deliverable (WEB-FEAT-016).
 *
 * VIP listed eight benefits at $12.99/month and delivered none of them. Five --
 * vip_events, reservation_assistance, sms_alerts, concierge, local_perks --
 * existed only as keys in entitlements.ts and copy in UpgradeModal, with no
 * component reading any of them. No XP multiplier existed anywhere, so "2x" and
 * "3x earning rate" were invented outright. Insider's "Daily personalized
 * digest" was a WEEKLY digest sent to everyone including free accounts.
 *
 * This test is the guard against the copy drifting back ahead of the code. It
 * owns a list of the keys that currently have a gate, and fails when the
 * pricing page or the stored plan row promises something outside it.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/**
 * Entitlement keys with a component that reads them, and the file that does.
 * Adding a key here without its consumer is the mistake this test exists to
 * catch, so the consumer is asserted rather than trusted.
 */
const DELIVERED: Record<string, string> = {
  unlimited_favorites: 'src/components/FavoriteButton.tsx',
  advanced_filters: 'src/components/AdvancedSearchFilters.tsx',
  ad_free: 'src/components/AdBanner.tsx',
  trip_planner: 'src/pages/TripPlanner.tsx',
  write_reviews: 'src/components/RatingSystem.tsx',
  save_searches: 'src/components/SaveSearchButton.tsx',
};

/** Keys that are declared but delivered by nothing. Selling these is the bug. */
const UNDELIVERED = [
  'vip_events',
  'reservation_assistance',
  'sms_alerts',
  'concierge',
  'local_perks',
  'early_access',
  'daily_digest',
  'priority_support',
];

Deno.test('every benefit claimed as delivered really has a consumer', async () => {
  for (const [key, file] of Object.entries(DELIVERED)) {
    const src = await read(file);
    assert(
      new RegExp(`["']${key}["']`).test(src),
      `${key} is listed as delivered but ${file} does not read it`,
    );
  }
});

Deno.test('the undelivered keys still have no consumer, so the copy must not return', async () => {
  // If one of these gains a real gate, move it into DELIVERED and put its line
  // back on the pricing page in the same change.
  const consumerFiles = [
    'src/components/FavoriteButton.tsx',
    'src/components/AdvancedSearchFilters.tsx',
    'src/components/AdBanner.tsx',
    'src/pages/TripPlanner.tsx',
    'src/components/RatingSystem.tsx',
    'src/components/SaveSearchButton.tsx',
    'src/components/HouseAd.tsx',
  ];
  const sources = await Promise.all(consumerFiles.map(read));
  for (const key of UNDELIVERED) {
    for (const [i, src] of sources.entries()) {
      assertFalse(
        new RegExp(`hasFeature\\(["']${key}["']\\)`).test(src),
        `${key} now has a gate in ${consumerFiles[i]}; update DELIVERED and the pricing copy together`,
      );
    }
  }
});

Deno.test('the pricing page sells nothing that is not delivered', async () => {
  const pricing = await read('src/pages/Pricing.tsx');

  // The exact strings that were false. Each is checked as displayed copy.
  const mustNotAppear = [
    'Exclusive VIP-only events',
    'Restaurant reservation help',
    'SMS alerts for your interests',
    'Monthly local business perks',
    'Concierge support',
    'Exclusive VIP badge',
    'Early access to hot events',
    'Daily personalized digest',
    '2x XP earning rate',
    '3x XP earning rate',
    // No quota is enforced, so the figure was untrue in both directions.
    '5 trips/month',
  ];
  for (const claim of mustNotAppear) {
    assertFalse(
      pricing.includes(`text: "${claim}"`),
      `Pricing.tsx still sells "${claim}", which nothing delivers`,
    );
  }
});

Deno.test('VIP claims no benefit over Insider, because it grants none', async () => {
  const pricing = await read('src/pages/Pricing.tsx');
  const vip = pricing.slice(pricing.indexOf('id: "vip"'), pricing.indexOf('];', pricing.indexOf('id: "vip"')));
  const claims = [...vip.matchAll(/\{ text: "([^"]+)"/g)].map((m) => m[1]);

  assertEquals(
    claims,
    ['Everything in Insider'],
    'VIP delivers nothing Insider does not; a line here needs a gate shipped with it',
  );
});

Deno.test('the stored plan rows say the same thing as the page', async () => {
  const sql = await read('supabase/migrations/20260902000010_truthful_plan_features.sql');

  assert(
    /WHERE name = 'vip';/.test(sql) && /'\["Everything in Insider"\]'::jsonb/.test(sql),
    'the VIP row must be trimmed too, or anything reading the plan keeps the old promise',
  );
  for (const gone of ['VIP-exclusive events', 'Concierge support', '3x XP earning rate', 'Daily personalized digest']) {
    assertFalse(
      new RegExp(`features = '\\[[^\\n]*${gone}`).test(sql),
      `${gone} must not be written back into subscription_plans.features`,
    );
  }
  // The keys stay so no shipped mobile build loses a feature it can ask about.
  assertFalse(/entitlements/.test(sql.split('\n').filter((l) => !l.startsWith('--')).join('\n')));
});

Deno.test('the upgrade modal stops offering upgrades to nothing', async () => {
  const modal = await read('src/components/UpgradeModal.tsx');
  for (const key of ['vip_events', 'reservation_assistance', 'sms_alerts', 'concierge', 'early_access']) {
    assertFalse(
      new RegExp(`^  ${key}: \\{`, 'm').test(modal),
      `UpgradeModal still describes ${key}, which nothing delivers`,
    );
  }
  assert(/unlimited_favorites: \{/.test(modal), 'the real ones stay');
});

Deno.test('the entitlement keys are left in place for shipped clients', async () => {
  // Removing the KEYS would change what a mobile binary can ask about. Only the
  // promise is withdrawn, not the plumbing.
  const entitlements = await read('supabase/functions/_shared/entitlements.ts');
  for (const key of ['vip_events', 'reservation_assistance', 'sms_alerts', 'concierge', 'local_perks']) {
    assert(
      new RegExp(`${key}: 'vip'`).test(entitlements),
      `${key} must remain in the entitlement map for backward compatibility`,
    );
  }
});
