/**
 * customer.subscription.updated writes Stripe's live state, not the payload.
 *
 * Stripe does not order deliveries and retries for up to three days. The
 * handler used to build the row from event.data.object, so an "updated"
 * (active) retried after "deleted" flipped a canceled row back to active. The
 * event-id ledger can't catch it: the two events have different ids.
 *
 * Source assertions, like stripe-plan-from-price.test.ts: the handler is not
 * exported and needs a live Stripe client to run.
 */

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const REPO = new URL('../../../', import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, REPO));
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

async function handlerBody(): Promise<string> {
  const code = stripComments(await read('supabase/functions/stripe-webhook/index.ts'));
  const handler = code.slice(code.indexOf('async function handleSubscriptionUpdated'));
  return handler.slice(0, handler.indexOf('\nasync function '));
}

Deno.test('the handler retrieves the live subscription before writing', async () => {
  const body = await handlerBody();
  const retrieve = body.indexOf('await stripe.subscriptions.retrieve(eventSubscription.id)');
  const write = body.indexOf('subscriptionUpdatePatch(');
  assert(retrieve > 0, 'handleSubscriptionUpdated must retrieve the subscription from Stripe');
  assert(write > retrieve, 'the patch must be built after, and from, the retrieved subscription');
});

Deno.test('the patch is not built from the event payload', async () => {
  const body = await handlerBody();
  assert(
    /const subscription = await stripe\.subscriptions\.retrieve\(eventSubscription\.id\)/.test(body),
    '`subscription` must be the live object',
  );
  assert(!/eventSubscription as unknown as StripeSubscriptionLike/.test(body), 'the payload must not reach the patch');
  assert(!/try\s*\{[^}]*subscriptions\.retrieve/.test(body), 'a failed retrieve must throw so Stripe redelivers');
});

Deno.test('the dispatcher passes the Stripe client', async () => {
  const code = stripComments(await read('supabase/functions/stripe-webhook/index.ts'));
  assert(/await handleSubscriptionUpdated\(supabase, stripe, subscription\);/.test(code));
});
