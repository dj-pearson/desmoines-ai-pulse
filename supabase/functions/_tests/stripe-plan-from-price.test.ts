/**
 * The plan a member pays for is the plan they get (pricing plan WP5 item 1).
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_tests/stripe-plan-from-price.test.ts
 *
 * A plan change updates the price on the existing Stripe subscription, and the
 * only event that reports it is customer.subscription.updated. That handler's
 * patch left plan_id out on purpose, so an Insider who clicked "Go VIP" paid
 * VIP and stayed Insider on web, server and both apps. plan_id now moves, and
 * only one way: from the price, looked up in our own subscription_plans.
 *
 * Also pins the two migrations that ship with WP5 (items 10 and 11), because
 * their acceptance is textual: no DROP, same signatures, service_role only.
 *
 * node:assert and no remote import: runs offline.
 */

import { strict as assert } from 'node:assert';
import {
  planIdForPrice,
  resolvePlanForSubscription,
  subscriptionUpdatePatch,
  type PlanPriceRow,
  type StripeSubscriptionLike,
} from '../_shared/stripeSubscriptionRow.ts';

const CATALOG: PlanPriceRow[] = [
  { id: 'plan-free', stripe_price_id_monthly: null, stripe_price_id_yearly: null },
  { id: 'plan-insider', stripe_price_id_monthly: 'price_insider_m', stripe_price_id_yearly: 'price_insider_y' },
  { id: 'plan-vip', stripe_price_id_monthly: 'price_vip_m', stripe_price_id_yearly: 'price_vip_y' },
];

function subAt(priceId: string | null): StripeSubscriptionLike {
  return {
    id: 'sub_1',
    status: 'active',
    current_period_start: 1_790_000_000,
    current_period_end: 1_792_592_000,
    items: { data: [{ price: { id: priceId, recurring: { interval: 'month' } } }] },
  };
}

Deno.test('an Insider-to-VIP price swap yields the VIP plan_id', () => {
  const patch = subscriptionUpdatePatch(subAt('price_vip_m'), CATALOG);
  assert.equal(patch.plan_id, 'plan-vip');
  assert.equal(patch.status, 'active');
});

Deno.test('the yearly price resolves to the same plan as the monthly one', () => {
  assert.equal(planIdForPrice('price_vip_y', CATALOG), 'plan-vip');
  assert.equal(planIdForPrice('price_insider_y', CATALOG), 'plan-insider');
});

Deno.test('an unknown price leaves plan_id out of the patch', () => {
  // A price made in the Stripe dashboard and never written back. Guessing
  // would move someone to a tier nobody sold them; the row keeps its plan.
  const patch = subscriptionUpdatePatch(subAt('price_from_the_dashboard'), CATALOG);
  assert.equal('plan_id' in patch, false);
  assert.equal(resolvePlanForSubscription(subAt('price_from_the_dashboard'), CATALOG).reason, 'no_plan');
});

Deno.test('a price two plans claim is ambiguous and moves nothing', () => {
  const broken: PlanPriceRow[] = [
    ...CATALOG,
    { id: 'plan-vip-copy', stripe_price_id_monthly: 'price_vip_m', stripe_price_id_yearly: null },
  ];
  assert.equal(planIdForPrice('price_vip_m', broken), null);
  assert.equal('plan_id' in subscriptionUpdatePatch(subAt('price_vip_m'), broken), false);
});

Deno.test('a subscription with no price, or no catalogue, keeps the old patch', () => {
  assert.equal('plan_id' in subscriptionUpdatePatch(subAt(null), CATALOG), false);
  assert.equal(resolvePlanForSubscription(subAt(null), CATALOG).reason, 'no_price');
  assert.equal('plan_id' in subscriptionUpdatePatch(subAt('price_vip_m')), false);
  assert.equal(planIdForPrice('price_vip_m', null), null);
  // The free plan's null prices must never match a null price id.
  assert.equal(planIdForPrice(null, CATALOG), null);
});

Deno.test('identity columns stay out even when plan_id moves', () => {
  const patch = subscriptionUpdatePatch(subAt('price_vip_m'), CATALOG);
  for (const forbidden of ['user_id', 'platform', 'stripe_customer_id']) {
    assert.equal(forbidden in patch, false, `${forbidden} must not be in the update patch`);
  }
});

const REPO = new URL('../../../', import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, REPO));
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

Deno.test('the webhook reads the catalogue and passes it to the patch', async () => {
  const code = stripComments(await read('supabase/functions/stripe-webhook/index.ts'));
  const handler = code.slice(code.indexOf('async function handleSubscriptionUpdated'));
  const body = handler.slice(0, handler.indexOf('\nasync function '));
  assert.ok(
    /\.from\("subscription_plans"\)\s*\n\s*\.select\("id, stripe_price_id_monthly, stripe_price_id_yearly"\)/.test(body),
    'handleSubscriptionUpdated must load the price catalogue',
  );
  assert.ok(/if \(catalogError\) \{[\s\S]*?throw catalogError;/.test(body), 'a failed catalogue read must throw so Stripe retries');
  assert.ok(/subscriptionUpdatePatch\(stripeLike, planCatalog\)/.test(body), 'the patch must be built with the catalogue');
  assert.ok(/PLAN NOT RESOLVED/.test(body), 'an unmatched price must be logged loudly');
});

/* ------------------------------------------------------------------------- *
 * The WP5 migrations (items 10 and 11).
 * ------------------------------------------------------------------------- */

const RPC = 'supabase/migrations/20260927000001_harden_subscription_price_rpc.sql';
const POLICY = 'supabase/migrations/20260927000002_subscription_plans_own_plan_read.sql';
const sqlCode = (sql: string) => sql.replace(/--[^\n]*/g, '');

Deno.test('neither migration drops anything', async () => {
  for (const path of [RPC, POLICY]) {
    assert.equal(/\bDROP\b/i.test(sqlCode(await read(path))), false, `${path} must not DROP`);
  }
});

Deno.test('both function signatures are kept', async () => {
  const sql = sqlCode(await read(RPC));
  assert.ok(
    /CREATE OR REPLACE FUNCTION public\.update_subscription_stripe_prices\(\s*p_plan_name TEXT,\s*p_stripe_price_id_monthly TEXT DEFAULT NULL,\s*p_stripe_price_id_yearly TEXT DEFAULT NULL\s*\)\s*RETURNS BOOLEAN/.test(sql),
  );
  assert.ok(/CREATE OR REPLACE FUNCTION public\.get_user_subscription_tier\(p_user_id UUID\)\s*RETURNS TEXT/.test(sql));
});

Deno.test('update_subscription_stripe_prices is granted only to service_role', async () => {
  const sql = sqlCode(await read(RPC));
  const grants = [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.update_subscription_stripe_prices\([^)]*\) TO ([^;]+);/g)]
    .map((m) => m[1].trim());
  assert.deepEqual(grants, ['service_role']);
  assert.ok(
    /REVOKE EXECUTE ON FUNCTION public\.update_subscription_stripe_prices\([^)]*\) FROM PUBLIC, anon, authenticated;/.test(sql),
  );
  assert.ok(/public\.is_admin_or_root\(\)/.test(sql), 'the body checks for an admin');
  assert.ok(/ERRCODE = '42501'/.test(sql));
  assert.equal((sql.match(/SET search_path = public, pg_temp/g) ?? []).length, 2, 'both SECURITY DEFINER bodies pin search_path');
});

Deno.test('get_user_subscription_tier answers for the caller and ranks by plan', async () => {
  const sql = sqlCode(await read(RPC));
  assert.ok(/p_user_id IS DISTINCT FROM auth\.uid\(\)/.test(sql));
  assert.ok(/ORDER BY sp\.sort_order DESC/.test(sql));
  assert.ok(/REVOKE EXECUTE ON FUNCTION public\.get_user_subscription_tier\(UUID\) FROM PUBLIC, anon;/.test(sql));
});

Deno.test('the plan-read policy only widens, and records the mobile contract', async () => {
  const raw = await read(POLICY);
  const sql = sqlCode(raw);
  assert.ok(/CREATE POLICY "Members can view the plan they hold"\s*\n\s*ON public\.subscription_plans\s*\n\s*FOR SELECT/.test(sql));
  assert.ok(/us\.user_id = auth\.uid\(\)/.test(sql));
  assert.equal(/ALTER POLICY|is_active\s*=\s*false/i.test(sql), false, 'the existing policy is not touched');
  assert.ok(/'insider' and 'vip'/.test(raw) && /never\s+(--\s*)?rename/.test(raw), 'the comment records that plan names are a mobile contract');
});
