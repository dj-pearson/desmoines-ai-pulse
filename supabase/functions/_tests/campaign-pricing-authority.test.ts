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

import { assert, assertFalse } from 'jsr:@std/assert@1';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const MIGRATION = 'supabase/migrations/20260902000008_campaign_pricing_authority.sql';
// The trigger function's CURRENT body. 20260902000008 called the text overload
// of calculate_campaign_pricing, which 20260822000004 had already dropped, so
// its body 42883s on every client insert. This file replaces it; the trigger
// itself is still the one 20260902000008 installed.
const TRIGGER_FN_MIGRATION = 'supabase/migrations/20260928000001_campaign_pricing_trigger_enum_arg.sql';
const MIGRATIONS_DIR = 'supabase/migrations/';

const TRIGGER_FN_RE =
  /CREATE OR REPLACE FUNCTION public\.enforce_campaign_placement_pricing\(\)[\s\S]*?\n\$\$;/;
const CHECKOUT = 'supabase/functions/create-campaign-checkout/index.ts';

Deno.test('a client-supplied price is overwritten before it is stored', async () => {
  const sql = await read(TRIGGER_FN_MIGRATION);
  const fn = sql.match(TRIGGER_FN_RE);
  assert(fn, 'the pricing trigger function must exist');
  const body = fn[0];

  assert(/NEW\.daily_cost := v_price\.daily_price;/.test(body), 'daily_cost is replaced');
  assert(/NEW\.total_cost := v_price\.total_price;/.test(body), 'total_cost is replaced');
  assert(/NEW\.days_count := v_days;/.test(body), 'days_count is derived, not accepted');
  assert(
    /FROM public\.calculate_campaign_pricing\(NEW\.placement_type, NEW\.days_count\)/.test(body),
    'the replacement value comes from the rate card, through the enum overload',
  );

  const installed = await read(MIGRATION);
  assert(
    /BEFORE INSERT OR UPDATE ON public\.campaign_placements/.test(installed),
    'it must run BEFORE the write, on both insert and update',
  );
});

Deno.test('the trigger calls the overload that exists, not the dropped text one', async () => {
  // 20260822000004 dropped calculate_campaign_pricing(text, integer). There is
  // no implicit cast from text to an enum, so a ::text argument is a 42883 on
  // every advertiser checkout. This test used to assert that cast.
  const repair = await read('supabase/migrations/20260822000004_repair_broken_rpcs.sql');
  assert(
    /DROP FUNCTION IF EXISTS public\.calculate_campaign_pricing\(text, integer\);/.test(repair),
    'the text overload is dropped upstream of this trigger',
  );

  const body = (await read(TRIGGER_FN_MIGRATION)).match(TRIGGER_FN_RE)![0];
  assertFalse(/calculate_campaign_pricing\([^)]*::text/.test(body), 'no ::text argument');

  // Whichever migration defines the function LAST is what runs. If a newer
  // file redefines it, this test must be pointed there.
  const definers: string[] = [];
  for await (const entry of Deno.readDir(new URL(MIGRATIONS_DIR, REPO))) {
    if (!entry.isFile || !entry.name.endsWith('.sql')) continue;
    const sql = await read(MIGRATIONS_DIR + entry.name);
    if (TRIGGER_FN_RE.test(sql)) definers.push(entry.name);
  }
  definers.sort();
  assert(
    TRIGGER_FN_MIGRATION.endsWith(definers[definers.length - 1]),
    `the newest definer is ${definers[definers.length - 1]}; read that one`,
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
});

Deno.test('the total on /advertise is the server\'s total, from the call checkout makes', async () => {
  // placementTotalPrice mirrored the TEXT overload that 20260822000004 dropped,
  // so the page and the charge came from two formulas. The page now asks
  // calculate_campaign_pricing itself, with the same argument names
  // create-campaign-checkout uses, and has no arithmetic of its own to drift.
  const page = await read('src/pages/Advertise.tsx');
  assertFalse(/placementTotalPrice\(/.test(page), 'the page must not total with the mirror');
  assertFalse(/calculateTotalCost/.test(page), 'nor with a local sum of daily rates');
  assert(/useCampaignQuote\(/.test(page), 'it totals through the server quote');

  const quote = await read('src/hooks/useCampaignQuote.ts');
  const checkout = await read(CHECKOUT);
  const call = /rpc\(\s*"calculate_campaign_pricing",\s*\{\s*p_placement_type: [\w.]+,\s*p_days_count: \w+,?\s*\}/;
  assert(call.test(quote), 'the quote calls calculate_campaign_pricing(p_placement_type, p_days_count)');
  assert(call.test(checkout), 'checkout calls the same function with the same arguments');
  assert(/total_price/.test(quote), 'and reads the same column checkout charges from');
});

Deno.test('a retry reuses an open session and never opens a second payable one', async () => {
  // Business plan WP4 item 7. The idempotency key used to be the campaign and
  // total only, while expires_at changed on every call, so a retry within
  // Stripe's 24-hour key window failed as a parameter mismatch.
  const src = await read(CHECKOUT);
  assert(
    /idempotencyKey: `campaign:\$\{campaignId\}:\$\{authoritativeTotal\.toFixed\(2\)\}:\$\{attempt\}`/.test(src),
    'the key carries a per-attempt part',
  );
  assert(/const attempt = crypto\.randomUUID\(\);/.test(src), 'a fresh nonce per attempt');
  assert(
    /previous\.status === "open"[\s\S]{0,120}previous\.amount_total === authoritativeCents/.test(src),
    'an open session at the same amount is handed back',
  );
  assert(/sessions\.expire\(previous\.id\)/.test(src), 'an open session at another amount is expired first');
  assert(/previous\.status === "complete"[\s\S]{0,200}status: 400/.test(src), 'a paid session is not paid twice');
  // Two concurrent attempts: only the one that records its session wins.
  assert(
    /claim\.eq\("stripe_session_id", previousSessionId\)\s*:\s*claim\.is\("stripe_session_id", null\)/.test(src),
    'the session is recorded with a compare-and-set',
  );
  assert(/sessions\.expire\(session\.id\)/.test(src), 'the loser withdraws its session');
  assert(
    src.indexOf('previous.status === "open"') < src.indexOf('stripe.checkout.sessions.create('),
    'the open session is checked before a new one is created',
  );
});

Deno.test('verify-campaign-payment checks the session is this campaign\'s and reports what was paid', async () => {
  const src = await read('supabase/functions/verify-campaign-payment/index.ts');
  assert(/session\.metadata\?\.campaignId !== campaignId/.test(src), 'the session must name this campaign');
  assert(
    src.indexOf('session.metadata?.campaignId !== campaignId') < src.indexOf('status: "pending_creative",\n'),
    'checked before the campaign is moved on',
  );
  assert(/session\.amount_total \/ 100/.test(src), 'amountPaid is Stripe\'s charged amount, in dollars');
  assert(/amountPaid,/.test(src), 'and it is returned');
  assert(/\.eq\("status", "pending_payment"\)/.test(src), 'the status write cannot overwrite the webhook');
});
