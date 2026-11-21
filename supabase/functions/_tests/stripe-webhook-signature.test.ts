/**
 * WEB-BE-061. stripe-webhook verified signatures with the synchronous
 * `stripe.webhooks.constructEvent`. On the Deno/worker build of stripe@14.21.0
 * that call throws CryptoProviderOnlySupportsAsyncError for every input, and
 * the handler's catch answered 401 "Invalid signature" - so a correctly signed
 * delivery was refused the same as a forged one.
 *
 * These tests run the real Stripe library (stripe@14.21.0, imported by the
 * helper; this file imports nothing from esm.sh) through the function the
 * handler calls, with a payload signed by WebCrypto exactly as Stripe signs it
 * (`t=<ts>,v1=hex(HMAC-SHA256(secret, "<ts>.<body>"))`). Stripe's own
 * generateTestHeaderString is not used: on this build it signs synchronously
 * and throws for the same reason.
 */

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import { verifyStripeWebhookRequest } from '../_shared/stripeWebhookSignature.ts';

const SECRET = 'whsec_test_web_be_061';
const HEADERS = { 'Content-Type': 'application/json' };

const PAYLOAD = JSON.stringify({
  id: 'evt_test_web_be_061',
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', object: 'checkout.session' } },
});

async function sign(body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

function post(body: string, signature?: string) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (signature) headers.set('stripe-signature', signature);
  return new Request('http://localhost/stripe-webhook', { method: 'POST', body, headers });
}

// Quiet the expected console.error lines from the refusal paths.
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

Deno.test('a payload signed with the webhook secret verifies and yields the event', async () => {
  const result = await verifyStripeWebhookRequest(post(PAYLOAD, await sign(PAYLOAD, SECRET)), SECRET, HEADERS);
  assert(result.ok, 'a correctly signed delivery must verify');
  assertEquals(result.event.id, 'evt_test_web_be_061');
  assertEquals(result.event.type, 'checkout.session.completed');
});

Deno.test('a tampered body is refused with 401 Invalid signature', async () => {
  const signature = await sign(PAYLOAD, SECRET);
  const tampered = PAYLOAD.replace('cs_test_1', 'cs_test_2');
  const result = await quietly(() => verifyStripeWebhookRequest(post(tampered, signature), SECRET, HEADERS));
  assertFalse(result.ok);
  assertEquals(result.response.status, 401);
  assertEquals(await result.response.json(), { error: 'Invalid signature' });
});

Deno.test('a signature made with another secret is refused with 401', async () => {
  const signature = await sign(PAYLOAD, 'whsec_someone_else');
  const result = await quietly(() => verifyStripeWebhookRequest(post(PAYLOAD, signature), SECRET, HEADERS));
  assertFalse(result.ok);
  assertEquals(result.response.status, 401);
});

Deno.test('a signature older than the tolerance is refused with 401', async () => {
  const stale = Math.floor(Date.now() / 1000) - 3600;
  const signature = await sign(PAYLOAD, SECRET, stale);
  const result = await quietly(() => verifyStripeWebhookRequest(post(PAYLOAD, signature), SECRET, HEADERS));
  assertFalse(result.ok);
  assertEquals(result.response.status, 401);
});

Deno.test('the existing 400 and 500 answers are unchanged', async () => {
  const noHeader = await quietly(() => verifyStripeWebhookRequest(post(PAYLOAD), SECRET, HEADERS));
  assertFalse(noHeader.ok);
  assertEquals(noHeader.response.status, 400);
  assertEquals(await noHeader.response.json(), { error: 'No signature' });

  const noSecret = await quietly(async () =>
    verifyStripeWebhookRequest(post(PAYLOAD, await sign(PAYLOAD, SECRET)), undefined, HEADERS)
  );
  assertFalse(noSecret.ok);
  assertEquals(noSecret.response.status, 500);
  assertEquals(await noSecret.response.json(), { error: 'Webhook secret not configured' });
});

// ---- Source guard: the sync call must not come back anywhere ----

const FUNCTIONS = new URL('../', import.meta.url);
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*$/gm, '');

/** `.constructEvent(` but not `.constructEventAsync(`. */
const SYNC_CONSTRUCT = /\.constructEvent\s*\(/;

async function* sourceFiles(dir: URL): AsyncGenerator<URL> {
  for await (const entry of Deno.readDir(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
    if (entry.isDirectory) {
      if (entry.name === '_tests' || entry.name === 'node_modules') continue;
      yield* sourceFiles(url);
    } else if (/\.(ts|js|mjs|tsx)$/.test(entry.name)) {
      yield url;
    }
  }
}

Deno.test('no edge function calls the synchronous constructEvent', async () => {
  const offenders: string[] = [];
  let scanned = 0;
  for await (const file of sourceFiles(FUNCTIONS)) {
    scanned++;
    if (SYNC_CONSTRUCT.test(stripComments(await Deno.readTextFile(file)))) {
      offenders.push(file.pathname.slice(FUNCTIONS.pathname.length));
    }
  }
  assert(scanned > 50, `scanned only ${scanned} files; the walk is not reaching supabase/functions`);
  assertEquals(offenders, [], 'use constructEventAsync with Stripe.createSubtleCryptoProvider()');
});

Deno.test('the guard pattern fires on the sync call and not on the async one', () => {
  assert(SYNC_CONSTRUCT.test('event = stripe.webhooks.constructEvent(body, sig, secret);'));
  assertFalse(SYNC_CONSTRUCT.test('event = await stripe.webhooks.constructEventAsync(body, sig, secret);'));
});

Deno.test('stripe-webhook verifies through the shared async helper before any processing', async () => {
  const src = stripComments(await Deno.readTextFile(new URL('stripe-webhook/index.ts', FUNCTIONS)));
  const verify = src.indexOf('await verifyStripeWebhookRequest(');
  assert(verify > 0, 'stripe-webhook must call verifyStripeWebhookRequest');
  assert(/if \(!verified\.ok\) return verified\.response;/.test(src), 'a failed check must return its response');
  const ledger = src.indexOf('stripe_webhook_events');
  assert(ledger > verify, 'verification must run before the idempotency ledger is read');

  const helper = await Deno.readTextFile(new URL('_shared/stripeWebhookSignature.ts', FUNCTIONS));
  assert(/Stripe\.createSubtleCryptoProvider\(\)/.test(helper), 'the helper must pass a SubtleCrypto provider');
});
