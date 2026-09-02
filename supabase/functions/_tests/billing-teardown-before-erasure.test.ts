/**
 * Billing stops before the account is erased (WEB-AUTH-006).
 *
 * delete-user-account purges user_subscriptions -- the only mapping from a user
 * to their Stripe customer and subscription -- and never called Stripe.
 * `grep -ci stripe` on that function returned 0. The charge kept recurring, and
 * the webhook that would react to a cancellation could no longer find a user to
 * react for. The account was gone; the money was not.
 *
 * These RUN the teardown against a fake client, so the ordering and the refusal
 * are exercised rather than read.
 */

import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  cancelBillingBeforeErasure,
  isLive,
  STORE_MANAGE_URLS,
  type BillingClient,
} from '../_shared/cancelBillingBeforeErasure.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (rel: string) => Deno.readTextFile(new URL(rel, REPO));

/** Records what was called, in order. */
function fakeStripe(opts: { failOn?: string } = {}) {
  const calls: string[] = [];
  const client: BillingClient = {
    subscriptions: {
      cancel(id: string) {
        calls.push(`cancel:${id}`);
        if (opts.failOn === 'cancel') return Promise.reject(new Error('card_declined'));
        return Promise.resolve({});
      },
    },
    customers: {
      del(id: string) {
        calls.push(`delCustomer:${id}`);
        if (opts.failOn === 'customer') return Promise.reject(new Error('customer locked'));
        return Promise.resolve({});
      },
    },
  };
  return { client, calls };
}

Deno.test('a live web subscription is cancelled and its customer deleted', async () => {
  const { client, calls } = fakeStripe();
  const out = await cancelBillingBeforeErasure(client, [
    { platform: 'web', status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' },
  ]);

  assertEquals(out.cancelled, ['sub_1']);
  assertEquals(out.customersDeleted, ['cus_1']);
  assertEquals(out.error, undefined);
  // The subscription goes first: deleting the customer while a subscription is
  // still attached is the wrong order to leave a half-finished teardown in.
  assertEquals(calls, ['cancel:sub_1', 'delCustomer:cus_1']);
});

Deno.test('a Stripe failure returns an error instead of continuing', async () => {
  // The whole point. Continuing would erase the mapping and leave the charge
  // running with nothing to trace it back to.
  const { client } = fakeStripe({ failOn: 'cancel' });
  const out = await cancelBillingBeforeErasure(client, [
    { platform: 'web', status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' },
  ]);

  assert(out.error, 'a failed cancel must be reported');
  assertStringIncludes(out.error!, 'sub_1');
  assertEquals(out.customersDeleted, [], 'nothing may proceed past the failure');
});

Deno.test('a customer that cannot be deleted is also fatal', async () => {
  // A customer left behind keeps the payment method and billing address --
  // personal data the erasure was supposed to remove.
  const { client } = fakeStripe({ failOn: 'customer' });
  const out = await cancelBillingBeforeErasure(client, [
    { platform: 'web', status: 'active', stripe_subscription_id: 'sub_1', stripe_customer_id: 'cus_1' },
  ]);
  assert(out.error);
  assertEquals(out.cancelled, ['sub_1'], 'the cancel still happened and is reported');
});

Deno.test('store subscriptions are reported, never silently ignored', async () => {
  // AC3. Apple and Google own these; a server has no API to end them. Saying
  // nothing would let the user believe deleting the account stopped the charge.
  const { client, calls } = fakeStripe();
  const out = await cancelBillingBeforeErasure(client, [
    { platform: 'ios', status: 'active' },
    { platform: 'android', status: 'active' },
  ]);

  assertEquals(calls, [], 'Stripe has nothing to do for a store subscription');
  assertEquals(out.storeSubscriptions.length, 2);
  assertEquals(out.storeSubscriptions.find((s) => s.platform === 'ios')?.manageUrl, STORE_MANAGE_URLS.ios);
  assertEquals(out.storeSubscriptions.find((s) => s.platform === 'android')?.manageUrl, STORE_MANAGE_URLS.android);
});

Deno.test('an already-cancelled subscription is left alone', async () => {
  const { client, calls } = fakeStripe();
  const out = await cancelBillingBeforeErasure(client, [
    { platform: 'web', status: 'canceled', stripe_subscription_id: 'sub_old', stripe_customer_id: 'cus_1' },
  ]);
  assertEquals(calls, []);
  assertEquals(out.cancelled, []);
  assertEquals(out.error, undefined);

  assertEquals(isLive({ status: 'active' }), true);
  assertEquals(isLive({ status: 'canceled' }), false);
  assertEquals(isLive({ status: 'CANCELLED' }), false, 'case and spelling both');
  assertEquals(isLive({}), true, 'an unknown status is treated as live, which is the safe default');
});

Deno.test('a missing Stripe key refuses rather than proceeding', async () => {
  const out = await cancelBillingBeforeErasure(null, [
    { platform: 'web', status: 'active', stripe_subscription_id: 'sub_1' },
  ]);
  assert(out.error, 'no client plus something to cancel must be an error');
  assertStringIncludes(out.error!, 'refused');
});

Deno.test('a user with no subscription at all needs no Stripe client', async () => {
  const out = await cancelBillingBeforeErasure(null, []);
  assertEquals(out.error, undefined);
  assertEquals(out.cancelled, []);
});

Deno.test('the teardown runs before the purge loop in the handler', async () => {
  // Ordering is the criterion. After the loop, user_subscriptions is gone and
  // there is nothing left to read the subscription id from.
  const src = await read('supabase/functions/delete-user-account/index.ts');
  const teardown = src.indexOf('cancelBillingBeforeErasure(stripe');
  const purge = src.indexOf('for (const table of PURGE_TABLES)');
  const authDelete = src.indexOf('supabase.auth.admin.deleteUser');

  assert(teardown > 0, 'the handler must call the teardown');
  assert(purge > 0 && authDelete > 0);
  assert(teardown < purge, 'billing must stop before any table is purged');
  assert(teardown < authDelete, 'and before the auth user is deleted');

  // And the read that feeds it must also precede the purge.
  const readRows = src.indexOf('.from("user_subscriptions")');
  assert(readRows > 0 && readRows < purge, 'the subscription rows must be read before they are deleted');
});

Deno.test('a billing failure refuses the deletion with a status the client can act on', async () => {
  const src = await read('supabase/functions/delete-user-account/index.ts');
  const branch = src.slice(src.indexOf('if (billing.error)'));
  assertStringIncludes(branch.slice(0, 900), 'status: 409');
  assertStringIncludes(branch.slice(0, 900), 'BILLING_TEARDOWN_FAILED');
});

Deno.test('user_subscriptions is still purged, just not first', async () => {
  // Cancelling must not turn into a reason to keep the row.
  const tables = await read('supabase/functions/_shared/userDataTables.ts');
  const purge = tables.slice(tables.indexOf('PURGE_TABLES'), tables.indexOf('RETAINED_TABLES'));
  assert(/"user_subscriptions"/.test(purge));
});

Deno.test('the web client tells the user about a subscription it cannot cancel', async () => {
  // AC3's other half. The server can only report; the client has to say it.
  const src = await read('src/components/PrivacyControls.tsx');
  assert(
    /store_subscriptions_still_active/.test(src),
    'the confirmation flow must read the field',
  );
  assertStringIncludes(src, 'only ${where} can cancel it');
  assert(/s\.manageUrl/.test(src), 'and must show the link');
});
