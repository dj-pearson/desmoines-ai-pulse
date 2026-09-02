/**
 * Campaign pricing authority (WEB-ADS-003).
 *
 * The browser used to decide what Stripe was asked for. useCampaigns inserted
 * daily_cost, days_count and total_cost into campaign_placements, a table with
 * no RLS policy in any migration, and create-campaign-checkout built the line
 * items from placement.total_cost. PATCHing that column to 0.01 between
 * creating a campaign and opening checkout bought a campaign for a cent.
 *
 * Three things have to hold together for that to stay closed, in three
 * languages: the trigger that rewrites client-supplied prices, the edge
 * function that recomputes before charging, and the page that shows the buyer
 * the same number. This pins all three.
 */

import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const MIGRATION = 'supabase/migrations/20260902000008_campaign_pricing_authority.sql';
const CHECKOUT = 'supabase/functions/create-campaign-checkout/index.ts';

Deno.test('a client-supplied price is overwritten before it is stored', async () => {
  const sql = await read(MIGRATION);
  const fn = sql.match(
    /CREATE OR REPLACE FUNCTION public\.enforce_campaign_placement_pricing\(\)[\s\S]*?\n\$\$;/,
  );
  assert(fn, 'the pricing trigger function must exist');
  const body = fn[0];

  assert(/NEW\.daily_cost := v_price\.daily_price;/.test(body), 'daily_cost is replaced');
  assert(/NEW\.total_cost := v_price\.total_price;/.test(body), 'total_cost is replaced');
  assert(/NEW\.days_count := v_days;/.test(body), 'days_count is derived, not accepted');
  assert(
    /FROM public\.calculate_campaign_pricing\(NEW\.placement_type::text, NEW\.days_count\)/.test(body),
    'the replacement value comes from the rate card',
  );
  assert(
    /BEFORE INSERT OR UPDATE ON public\.campaign_placements/.test(sql),
    'it must run BEFORE the write, on both insert and update',
  );
});

Deno.test('days_count is the campaign span, so a 30-day run cannot be sold as 7', async () => {
  const sql = await read(MIGRATION);
  assert(/v_days := \(v_end - v_start\) \+ 1;/.test(sql), 'inclusive of both end dates');
  assert(
    /RAISE EXCEPTION 'campaign % ends before it starts'/.test(sql),
    'an inverted pair must be refused, not priced',
  );

  const checkout = await read(CHECKOUT);
  assert(
    /authoritativeDays = Math\.round\(spanMs \/ 86_400_000\) \+ 1;/.test(checkout),
    'the edge function derives the same span rather than trusting days_count',
  );
});

Deno.test('THE ATTACK: a tampered total is not what Stripe is asked to charge', async () => {
  const src = await read(CHECKOUT);

  // The bug, verbatim. It must not come back in any form.
  assertFalse(
    /unit_amount: Math\.round\(placement\.total_cost \* 100\)/.test(src),
    'the Stripe amount must never be read from the stored row',
  );
  assert(
    /unit_amount: Math\.round\(p\.total \* 100\)/.test(src),
    'it must come from the recomputed value',
  );

  // And the recomputed value must come from the database, not from the request.
  assert(
    /supabase\.rpc\(\s*\n?\s*"calculate_campaign_pricing"/.test(src),
    'the amount is computed by the pricing RPC',
  );

  // The order matters: pricing has to be resolved before the line items exist.
  const rpcAt = src.indexOf('"calculate_campaign_pricing"');
  const lineItemsAt = src.indexOf('const lineItems = priced.map');
  assert(rpcAt > 0 && lineItemsAt > rpcAt, 'line items are built from the priced list');
});

Deno.test('a disagreement is refused with a 409 rather than charged quietly', async () => {
  const src = await read(CHECKOUT);
  assert(
    /Math\.abs\(authoritativeTotal - storedTotal\) > 0\.01/.test(src),
    'one cent of tolerance, for float noise only',
  );
  assert(/status: 409/.test(src), 'the mismatch must be a 409');
  assert(/"PRICE_CHANGED"/.test(src), 'with a code the UI can act on');
  // Silently charging the correct amount would be worse than refusing: it lets
  // an attacker probe the pricing rules without ever seeing an error.
  assert(
    src.indexOf('status: 409') < src.indexOf('const lineItems = priced.map'),
    'the refusal must come before the session is built',
  );
});

Deno.test('the price is written back, so the row and the invoice agree', async () => {
  const src = await read(CHECKOUT);
  assert(
    /\.from\("campaign_placements"\)\s*\n\s*\.update\(\{ days_count: p\.days, total_cost: p\.total \}\)/.test(src),
    'the authoritative amount is persisted',
  );
  const sql = await read(MIGRATION);
  assert(
    /CREATE OR REPLACE FUNCTION public\.sync_campaign_total_cost\(\)/.test(sql),
    'campaigns.total_cost must follow its placements',
  );
  assert(/AFTER INSERT OR UPDATE OR DELETE ON public\.campaign_placements/.test(sql));
});

Deno.test('sponsored_listing is priced from the rate card like every other placement', async () => {
  const sql = await read(MIGRATION);
  assert(
    /INSERT INTO public\.ad_rate_card \(placement_type, base_daily_rate, is_active\)\s*\n\s*SELECT 'sponsored_listing'/.test(sql),
    'its rate-card row must be seeded',
  );
  assert(/WHERE NOT EXISTS/.test(sql), 'and seeding must be idempotent');

  const hook = await read('src/hooks/useCampaigns.ts');
  assertFalse(
    /sponsored_listing pricing is flat-rate/.test(hook),
    'the hardcoded flat rate and its excuse must be gone',
  );
});

Deno.test('no price is hardcoded in the bundle any more', async () => {
  const specs = await read('src/lib/placementSpecs.ts');
  assertFalse(/^\s*dailyCost: \d+,$/m.test(specs), 'placementSpecs must carry no prices');
  assertFalse(/dailyCost: number;/.test(specs), 'nor the field itself');

  const page = await read('src/pages/Advertise.tsx');
  assertFalse(/option\.dailyCost/.test(page), 'the page must not read a spec price');
  assert(/placementTotalPrice\(/.test(page), 'it totals through the shared helper');
});

Deno.test('the displayed total applies the same discount the server charges', async () => {
  const hook = await read('src/hooks/useCampaigns.ts');
  const fn = hook.match(/export function placementTotalPrice[\s\S]*?\n\}/);
  assert(fn, 'the shared helper must exist');
  const body = fn[0];

  // calculate_campaign_pricing rounds the TOTAL once:
  //   ROUND(base * (1 - d/100) * days, 2)
  // Multiplying a rounded daily rate by days gives a different answer on some
  // inputs, which is how a display and a charge drift apart by pennies.
  assert(
    /Math\.round\(rate\.base_daily_rate \* \(1 - discount \/ 100\) \* days \* 100\) \/ 100/.test(body),
    'the helper must round once at the end, as the SQL does',
  );
  for (const [threshold, field] of [
    ['30', 'discount_30_day'],
    ['14', 'discount_14_day'],
    ['7', 'discount_7_day'],
  ] as const) {
    assert(
      new RegExp(`days >= ${threshold} \\? \\(rate\\.${field}`).test(body),
      `the ${threshold}-day tier must match the SQL`,
    );
  }
});
