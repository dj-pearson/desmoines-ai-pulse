/**
 * Stripe webhook signature check, shared so it can be tested (WEB-BE-061).
 *
 * The edge runtime loads stripe@14.21.0's worker build (package.json maps the
 * `deno`, `worker` and `browser` conditions to esm/stripe.esm.worker.js). Its
 * only crypto provider is SubtleCrypto, and the synchronous
 * `webhooks.constructEvent` throws CryptoProviderOnlySupportsAsyncError there
 * on every call, including a correctly signed one. stripe-webhook used the
 * sync call, and its catch turned that throw into 401 "Invalid signature", so
 * a valid delivery could never get through.
 *
 * `constructEventAsync` with an explicit SubtleCrypto provider is the form
 * Stripe and Supabase document for Deno. The status codes and bodies below
 * are the ones the handler already returned (500 no secret, 400 no header,
 * 401 bad signature): Stripe retries on any non-2xx, so they are unchanged.
 *
 * It uses the static `Stripe.webhooks`, which needs no API key, so callers
 * (and the Deno test, which cannot import from esm.sh) pass no client.
 */

import Stripe from "https://esm.sh/stripe@14.21.0";

/** Async-only crypto, built once: the worker build has no sync HMAC. */
const cryptoProvider = Stripe.createSubtleCryptoProvider();

export type StripeSignatureResult =
  | { ok: true; event: Stripe.Event }
  | { ok: false; response: Response };

/**
 * Reads the raw body and verifies the `stripe-signature` header against
 * `webhookSecret`. On failure returns the response the handler sends as is.
 */
export async function verifyStripeWebhookRequest(
  req: Request,
  webhookSecret: string | undefined,
  headers: Record<string, string>,
): Promise<StripeSignatureResult> {
  const signature = req.headers.get("stripe-signature");

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured - rejecting webhook");
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        { status: 500, headers },
      ),
    };
  }

  if (!signature) {
    console.error("No Stripe signature found");
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "No signature" }), {
        status: 400,
        headers,
      }),
    };
  }

  // The raw body, byte for byte: the signature is over exactly this text.
  const body = await req.text();

  try {
    const event = await Stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider,
    );
    return { ok: true, event };
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers,
      }),
    };
  }
}
