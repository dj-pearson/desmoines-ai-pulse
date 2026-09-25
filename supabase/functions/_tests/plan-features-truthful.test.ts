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
 * owns a list of the keys that currently have a gate, and fails when any
 * premium surface or the stored plan row promises something outside it.
 *
 * docs/page-plans/pricing.md WP1 widened it. It used to read only `text: "..."`
 * literals in Pricing.tsx and the featureDescriptions keys in UpgradeModal, so
 * the same withdrawn claims survived on the modal's tier lists, the success
 * screen, the portal and the SEO description. It now reads the whole text of
 * every surface, and requires each line in src/lib/planBenefits.ts (the one
 * list the surfaces render) to map to the code that enforces it.
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

/** Every surface that shows a benefit line, read as whole files. */
const SURFACES = [
  'src/pages/Pricing.tsx',
  'src/components/UpgradeModal.tsx',
  'src/pages/SubscriptionSuccess.tsx',
  'src/pages/SubscriptionPortal.tsx',
  'src/lib/planBenefits.ts',
  // The site-wide "View Plans" band, on every page including /pricing.
  'src/components/Footer.tsx',
];

/**
 * Phrases that were false when they were sold. Matched case-insensitively
 * against the whole file, comments included, so a line can't come back as a
 * string in a new array, a JSX child or an SEO description. A comment that
 * needs to talk about one names the entitlement key (early_access) instead.
 */
const WITHDRAWN = [
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
  // The planner quota is shown only from TRIP_PLANNER_MONTHLY_QUOTA in
  // planBenefits.ts, which the quota test below ties to generate-itinerary.
  '5 trips/month',
  'Early access',
  'early event access',
  'VIP perks',
  'Priority support',
  'Reservation assistance',
  'Exclusive VIP events',
  'BEST VALUE',
  'Best Value',
];

Deno.test('no premium surface sells anything that was withdrawn', async () => {
  for (const file of SURFACES) {
    const src = (await read(file)).toLowerCase();
    for (const claim of WITHDRAWN) {
      assertFalse(
        src.includes(claim.toLowerCase()),
        `${file} still says "${claim}", which nothing delivers`,
      );
    }
  }
});

/** The `key:` literals of one list in planBenefits.ts, in order. */
function listKeys(src: string, listName: string): string[] {
  const start = src.indexOf(`const ${listName}`);
  assert(start >= 0, `planBenefits.ts has no ${listName}`);
  const body = src.slice(start, src.indexOf('\n];', start));
  return [...body.matchAll(/key: "([a-z_]+)"/g)].map((m) => m[1]);
}

/**
 * Free lines are not entitlements, so each one names the code that makes it
 * true for an account with no plan.
 */
const FREE_EVIDENCE: Record<string, [file: string, proof: RegExp, why: string]> = {
  browse: [
    'src/App.tsx',
    /^(?=[\s\S]*path="\/events")(?=[\s\S]*path="\/restaurants")(?=[\s\S]*path="\/attractions")(?=[\s\S]*path="\/stay")/,
    'public routes for events, restaurants, attractions and hotels',
  ],
  keyword_search: ['src/App.tsx', /path="\/search"/, 'a public /search route'],
  favorites_limit: [
    'supabase/migrations/20260316000001_update_subscription_tier_limits.sql',
    /'favorites', 3/,
    'the free plan row caps favorites at 3',
  ],
  view_reviews: [
    'src/components/RatingSystem.tsx',
    /feature="write_reviews"/,
    'only writing a review is gated, so reading is free',
  ],
  weekly_digest: [
    'supabase/functions/send-weekly-digest/index.ts',
    /^(?![\s\S]*subscription_plans)[\s\S]+$/,
    'send-weekly-digest applies no plan check',
  ],
};

/**
 * VIP lines, each tied to a limit the server enforces. "Everything in Insider"
 * is true by construction: every Insider gate admits VIP (premiumFeatures.ts).
 */
const VIP_ENFORCED: Record<string, [file: string, proof: RegExp, why: string][]> = {
  everything_in_insider: [
    ['src/lib/premiumFeatures.ts', /return tier === 'insider' \|\| tier === 'vip'/, 'insider gates admit vip'],
  ],
  unlimited_saved_searches: [
    [
      'supabase/migrations/20251126000000_add_newsletter_and_subscriptions.sql',
      /\('vip'[\s\S]*?"saved_searches": -1/,
      'the vip plan row has saved_searches -1',
    ],
    [
      'supabase/migrations/20260925000002_saved_search_rpc_uses_plan_limit.sql',
      /entitled_plan_limit\(v_user, 'saved_searches'\)/,
      'create_event_saved_search reads the plan row limit',
    ],
  ],
  unlimited_trip_plans: [
    ['supabase/functions/generate-itinerary/index.ts', /vip: -1,/, 'generate-itinerary gives vip no cap'],
  ],
};

Deno.test('every planBenefits line maps to code that enforces it', async () => {
  const src = await read('src/lib/planBenefits.ts');

  for (const key of listKeys(src, 'FREE_BENEFITS')) {
    const evidence = FREE_EVIDENCE[key];
    assert(evidence, `free line "${key}" has no evidence in FREE_EVIDENCE; add the proof or drop the line`);
    const [file, proof, why] = evidence;
    assert(proof.test(await read(file)), `free line "${key}" is no longer true: expected ${why} in ${file}`);
  }

  for (const key of listKeys(src, 'INSIDER_BENEFITS')) {
    assert(key in DELIVERED, `Insider line "${key}" is not a DELIVERED entitlement`);
  }

  const vipKeys = listKeys(src, 'VIP_BENEFITS');
  assertEquals(vipKeys[0], 'everything_in_insider', 'VIP lists what it adds after "Everything in Insider"');
  for (const key of vipKeys) {
    const checks = VIP_ENFORCED[key];
    assert(checks, `VIP line "${key}" maps to no enforced limit; a VIP line needs a gate shipped with it`);
    for (const [file, proof, why] of checks) {
      assert(proof.test(await read(file)), `VIP line "${key}" is no longer enforced: expected ${why} in ${file}`);
    }
  }
});

Deno.test('the displayed trip planner quota is the one generate-itinerary enforces', async () => {
  const quota = (src: string, file: string) => {
    const at = src.indexOf('TRIP_PLANNER_MONTHLY_QUOTA');
    assert(at >= 0, `${file} has no TRIP_PLANNER_MONTHLY_QUOTA`);
    const block = src.slice(at, src.indexOf('}', at));
    const insider = block.match(/insider: (-?\d+)/)?.[1];
    const vip = block.match(/vip: (-?\d+)/)?.[1];
    return { insider, vip };
  };
  const server = quota(await read('supabase/functions/generate-itinerary/index.ts'), 'generate-itinerary');
  const shown = quota(await read('src/lib/planBenefits.ts'), 'planBenefits.ts');

  assertEquals(server, { insider: '5', vip: '-1' }, 'generate-itinerary quota changed; update planBenefits.ts and this test together');
  assertEquals(shown, server, 'planBenefits.ts shows a trip planner quota the server does not enforce');
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
