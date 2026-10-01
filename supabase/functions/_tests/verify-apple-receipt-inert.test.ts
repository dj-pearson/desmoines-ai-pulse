/**
 * verify-apple-receipt stays inert (IOS-DD-MONETIZATION-01).
 *
 * The endpoint granted an active subscription row to any signed-in caller
 * without asking Apple. It now answers 410 and must never regain a database
 * write: validate-ios-receipt is the only path that turns an App Store
 * transaction into an entitlement.
 */

import { assert, assertFalse } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

const FN = 'supabase/functions/verify-apple-receipt/index.ts';

Deno.test('verify-apple-receipt never touches user_subscriptions', async () => {
  const src = await read(FN);
  assertFalse(src.includes('user_subscriptions'), 'must not read or write user_subscriptions');
});

Deno.test('verify-apple-receipt holds no service-role client', async () => {
  const src = await read(FN);
  assertFalse(src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'must not use the service role key');
  assertFalse(src.includes('createClient'), 'must not create a Supabase client');
});

Deno.test('verify-apple-receipt answers 410 and points at validate-ios-receipt', async () => {
  const src = await read(FN);
  assert(src.includes('410'), 'must answer 410 Gone');
  assert(src.includes('validate-ios-receipt'), 'must name the replacement endpoint');
});
