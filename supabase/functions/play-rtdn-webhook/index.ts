/**
 * Google Play Real-Time Developer Notifications (RTDN) Webhook
 *
 * Receives Pub/Sub push messages from Google about Android subscription state
 * changes (cancellations, account holds, recoveries, refunds) and mirrors the
 * change into `user_subscriptions` immediately — instead of waiting for the
 * next Android app launch.
 *
 * Setup (out of band, in GCP console):
 *   1. Create a Pub/Sub topic, e.g. `play-rtdn`.
 *   2. Grant `google-play-developer-notifications@system.gserviceaccount.com`
 *      Pub/Sub Publisher on the topic.
 *   3. Configure RTDN in Play Console pointing at the topic.
 *   4. Create a Pub/Sub *push* subscription whose endpoint is this edge
 *      function URL, with OIDC auth enabled, audience set to that URL, and
 *      service account that has `roles/iam.serviceAccountTokenCreator`.
 *
 * Pub/Sub envelope:
 *   {
 *     "message": {
 *       "data": "<base64 SubscriptionNotification>",
 *       "messageId": "...",
 *       "publishTime": "...",
 *       "attributes": { ... }
 *     },
 *     "subscription": "projects/.../subscriptions/play-rtdn-push"
 *   }
 *
 * The `data` field decodes to a DeveloperNotification:
 *   {
 *     "version": "1.0",
 *     "packageName": "com.desmoines.aipulse",
 *     "eventTimeMillis": "1672531199000",
 *     "subscriptionNotification"?: { version, notificationType, purchaseToken, subscriptionId },
 *     "voidedPurchaseNotification"?: { purchaseToken, orderId, productType, refundType },
 *     "testNotification"?: { version }
 *   }
 *
 * Required env vars:
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_KEY  — JSON service account key for Play Developer API
 *   PLAY_RTDN_AUDIENCE               — expected `aud` for the OIDC push token (this fn's URL)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_PACKAGE_NAME = 'com.desmoines.aipulse';

const INSIDER_PRODUCT_IDS = new Set(['insider_monthly']);
const VIP_PRODUCT_IDS = new Set(['vip_monthly']);

const GOOGLE_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_OAUTH_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_OIDC_ISSUERS = new Set([
  'https://accounts.google.com',
  'accounts.google.com',
]);

// RTDN subscriptionNotification.notificationType enum
const NOTIFICATION_TYPES: Record<number, string> = {
  1: 'SUBSCRIPTION_RECOVERED',
  2: 'SUBSCRIPTION_RENEWED',
  3: 'SUBSCRIPTION_CANCELED',
  4: 'SUBSCRIPTION_PURCHASED',
  5: 'SUBSCRIPTION_ON_HOLD',
  6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
  7: 'SUBSCRIPTION_RESTARTED',
  8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
  9: 'SUBSCRIPTION_DEFERRED',
  10: 'SUBSCRIPTION_PAUSED',
  11: 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED',
  12: 'SUBSCRIPTION_REVOKED',
  13: 'SUBSCRIPTION_EXPIRED',
};

// ---------------------------------------------------------------------------
// Pub/Sub envelope types
// ---------------------------------------------------------------------------

interface PubSubEnvelope {
  message?: {
    data?: string;
    messageId?: string;
    message_id?: string;
    publishTime?: string;
    publish_time?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
  voidedPurchaseNotification?: {
    purchaseToken: string;
    orderId?: string;
    productType?: number;
    refundType?: number;
  };
  testNotification?: { version?: string };
}

interface GoogleSubscriptionPurchase {
  kind?: string;
  startTimeMillis?: string;
  expiryTimeMillis?: string;
  autoRenewing?: boolean;
  paymentState?: number;
  cancelReason?: number;
  orderId?: string;
  acknowledgementState?: number;
  linkedPurchaseToken?: string;
}

// ---------------------------------------------------------------------------
// Transient upstream failures
// ---------------------------------------------------------------------------

/**
 * Signals a *transient* failure talking to Google (network error, timeout, 5xx,
 * 408, 429). These are safe — and desirable — to retry, so the webhook returns a
 * non-2xx status and lets Pub/Sub redeliver the notification. Permanent failures
 * (bad request, auth/config, 404) throw a plain Error / return null instead and
 * are acked (200), because redelivery wouldn't help.
 */
class TransientPlayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientPlayApiError';
  }
}

/** HTTP statuses from Google that are worth retrying. */
function isTransientHttpStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64StdDecodeToString(b64: string): string {
  // Pub/Sub data is std base64 (with +/=) — decode as UTF-8 string
  return new TextDecoder().decode(
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
  );
}

// ---------------------------------------------------------------------------
// OIDC verification of Pub/Sub push token
// ---------------------------------------------------------------------------

interface GoogleJwk {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
  use?: string;
}

let cachedJwks: { fetchedAt: number; keys: GoogleJwk[] } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

async function fetchGoogleJwks(): Promise<GoogleJwk[]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) {
    return cachedJwks.keys;
  }
  const res = await fetchWithTimeout(GOOGLE_OAUTH_CERTS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Google JWKS: HTTP ${res.status}`);
  const body = await res.json();
  cachedJwks = { fetchedAt: Date.now(), keys: body.keys ?? [] };
  return cachedJwks.keys;
}

async function importJwkRs256(jwk: GoogleJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      alg: jwk.alg,
      n: jwk.n,
      e: jwk.e,
      ext: true,
    } as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

interface OidcClaims {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  exp: number;
  iat: number;
}

/**
 * Verify the OIDC bearer token Google attaches to push messages.
 * Returns the decoded claims on success, throws on failure.
 */
async function verifyOidcToken(token: string, expectedAudience: string): Promise<OidcClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported OIDC alg: ${header.alg}`);
  }

  const jwks = await fetchGoogleJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`Unknown OIDC key id: ${header.kid}`);

  const key = await importJwkRs256(jwk);
  const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);

  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    signingInput,
  );
  if (!ok) throw new Error('OIDC token signature verification failed');

  const claims = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(parts[1])),
  ) as OidcClaims;

  if (!GOOGLE_OIDC_ISSUERS.has(claims.iss)) {
    throw new Error(`Unexpected OIDC issuer: ${claims.iss}`);
  }
  if (claims.aud !== expectedAudience) {
    throw new Error(`OIDC audience mismatch: expected=${expectedAudience}, got=${claims.aud}`);
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp < now - 60) {
    throw new Error('OIDC token expired');
  }
  if (typeof claims.iat !== 'number' || claims.iat > now + 300) {
    throw new Error('OIDC token issued-at is in the future');
  }

  return claims;
}

// ---------------------------------------------------------------------------
// Service account auth → Play Developer API access token
// ---------------------------------------------------------------------------

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

async function importServiceAccountKey(pemContents: string): Promise<CryptoKey> {
  const stripped = pemContents
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');

  const binaryDer = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getGoogleAccessToken(sa: ServiceAccountKey): Promise<string> {
  const privateKey = await importServiceAccountKey(sa.private_key);
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 60 * 60,
  };
  const signingInput = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(payload))}`;
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
  } catch (err) {
    // Network error / timeout reaching Google's OAuth endpoint — transient.
    throw new TransientPlayApiError(
      `Google token endpoint unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (isTransientHttpStatus(res.status)) {
      throw new TransientPlayApiError(
        `Google token exchange transient failure: ${res.status} ${body}`,
      );
    }
    throw new Error(`Google token exchange failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

async function fetchSubscriptionState(
  accessToken: string,
  packageName: string,
  subscriptionId: string,
  purchaseToken: string,
): Promise<GoogleSubscriptionPurchase | null> {
  const url = `${GOOGLE_API_BASE}/applications/${packageName}/purchases/subscriptions/${subscriptionId}/tokens/${purchaseToken}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    // Network error / timeout reaching the Play Developer API — transient.
    throw new TransientPlayApiError(
      `Play subscriptions.get unreachable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (res.status === 200) return (await res.json()) as GoogleSubscriptionPurchase;
  const body = await res.text().catch(() => '');
  if (isTransientHttpStatus(res.status)) {
    // 5xx/429/408 — Google is temporarily unavailable; signal a retry.
    throw new TransientPlayApiError(
      `Play subscriptions.get transient failure: status=${res.status}, body=${body}`,
    );
  }
  // Permanent (4xx): the purchase can't be retrieved, but the notification is
  // still handled below via the notificationType-derived status. Ack (200).
  console.error(`Play API permanent error: status=${res.status}, body=${body}`);
  return null;
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

function resolveProductTier(productId: string): 'insider' | 'vip' | null {
  if (VIP_PRODUCT_IDS.has(productId) || productId.toLowerCase().includes('vip')) return 'vip';
  if (INSIDER_PRODUCT_IDS.has(productId) || productId.toLowerCase().includes('insider')) {
    return 'insider';
  }
  return null;
}

function statusForNotificationType(typeName: string): {
  status: string | null;
  cancelAtPeriodEnd: boolean | null;
} {
  switch (typeName) {
    case 'SUBSCRIPTION_PURCHASED':
    case 'SUBSCRIPTION_RENEWED':
    case 'SUBSCRIPTION_RECOVERED':
    case 'SUBSCRIPTION_RESTARTED':
      return { status: 'active', cancelAtPeriodEnd: false };

    case 'SUBSCRIPTION_CANCELED':
      // User canceled — sub is still active until expiry, but won't renew
      return { status: null, cancelAtPeriodEnd: true };

    case 'SUBSCRIPTION_ON_HOLD':
    case 'SUBSCRIPTION_IN_GRACE_PERIOD':
      return { status: 'past_due', cancelAtPeriodEnd: null };

    case 'SUBSCRIPTION_PAUSED':
      return { status: 'paused', cancelAtPeriodEnd: null };

    case 'SUBSCRIPTION_REVOKED':
      return { status: 'canceled', cancelAtPeriodEnd: true };

    case 'SUBSCRIPTION_EXPIRED':
      return { status: 'expired', cancelAtPeriodEnd: null };

    default:
      return { status: null, cancelAtPeriodEnd: null };
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // -------------------------------------------------------------------------
  // 1. Verify the OIDC token Google attaches to the push request
  // -------------------------------------------------------------------------
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing OIDC bearer token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const expectedAudience = Deno.env.get('PLAY_RTDN_AUDIENCE');
  if (!expectedAudience) {
    console.error('PLAY_RTDN_AUDIENCE env var not set');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await verifyOidcToken(authHeader.slice(7).trim(), expectedAudience);
  } catch (err) {
    console.error('OIDC verification failed:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: 'Invalid OIDC token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // -------------------------------------------------------------------------
  // 2. Parse the Pub/Sub envelope
  // -------------------------------------------------------------------------
  let envelope: PubSubEnvelope;
  try {
    envelope = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messageId = envelope.message?.messageId ?? envelope.message?.message_id ?? null;
  const dataB64 = envelope.message?.data;
  if (!messageId || !dataB64) {
    return new Response(JSON.stringify({ error: 'Malformed Pub/Sub message' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let notification: DeveloperNotification;
  try {
    notification = JSON.parse(base64StdDecodeToString(dataB64));
  } catch (err) {
    console.error('Failed to decode message data:', err);
    // Ack with 200 — non-decodable message would otherwise loop forever
    return new Response(JSON.stringify({ ok: true, skipped: 'undecodable' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test ping from Play Console — ack and bail
  if (notification.testNotification) {
    console.log(`Play RTDN test notification received: ${JSON.stringify(notification.testNotification)}`);
    return new Response(JSON.stringify({ ok: true, test: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Bundle / package guard
  if (notification.packageName && notification.packageName !== EXPECTED_PACKAGE_NAME) {
    console.warn(`Foreign packageName=${notification.packageName} — ignoring`);
    return new Response(JSON.stringify({ ok: true, skipped: 'foreign package' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // -------------------------------------------------------------------------
  // 3. Idempotency — short-circuit if we've already processed this messageId
  // -------------------------------------------------------------------------
  const { data: existingLog } = await supabase
    .from('play_rtdn_log')
    .select('id, processed_at')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existingLog) {
    console.log(`Duplicate Pub/Sub message_id=${messageId}, already processed at ${existingLog.processed_at}`);
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // -------------------------------------------------------------------------
  // 4. Branch on subscription / voided
  // -------------------------------------------------------------------------
  const sn = notification.subscriptionNotification;
  const vn = notification.voidedPurchaseNotification;

  if (!sn && !vn) {
    console.log(`Play RTDN message ${messageId} has no subscription/voided payload`);
    await supabase.from('play_rtdn_log').insert({
      message_id: messageId,
      notification_type: null,
      processed_at: new Date().toISOString(),
      status: 'skipped_no_payload',
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // -------------------------------------------------------------------------
  // 4a. Voided purchase notification (refund / chargeback)
  // -------------------------------------------------------------------------
  if (vn) {
    const purchaseToken = vn.purchaseToken;
    const { data: subRow } = await supabase
      .from('user_subscriptions')
      .select('id, user_id')
      .eq('platform', 'android')
      .eq('google_purchase_token', purchaseToken)
      .maybeSingle();

    if (subRow) {
      await supabase
        .from('user_subscriptions')
        .update({
          status: 'canceled',
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subRow.id);
    }

    await supabase.from('play_rtdn_log').insert({
      message_id: messageId,
      notification_type: 'VOIDED_PURCHASE',
      purchase_token: purchaseToken,
      user_subscription_id: subRow?.id ?? null,
      processed_at: new Date().toISOString(),
      status: subRow ? 'applied' : 'no_match',
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // -------------------------------------------------------------------------
  // 4b. Subscription notification — fetch fresh state from Play API
  // -------------------------------------------------------------------------
  const subNotif = sn!;
  const typeName = NOTIFICATION_TYPES[subNotif.notificationType] ?? `UNKNOWN_${subNotif.notificationType}`;

  // Load service account key
  const saKeyJson = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY');
  if (!saKeyJson) {
    console.error('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY env var not set');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let sa: ServiceAccountKey;
  try {
    sa = JSON.parse(saKeyJson) as ServiceAccountKey;
  } catch (err) {
    console.error('Service account key is not valid JSON:', err);
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let purchase: GoogleSubscriptionPurchase | null = null;
  let fetchError: string | null = null;
  let transientFailure = false;
  try {
    const accessToken = await getGoogleAccessToken(sa);
    purchase = await fetchSubscriptionState(
      accessToken,
      notification.packageName ?? EXPECTED_PACKAGE_NAME,
      subNotif.subscriptionId,
      subNotif.purchaseToken,
    );
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
    transientFailure = err instanceof TransientPlayApiError;
    console.error(`Play API fetch failed for messageId=${messageId}:`, fetchError);
  }

  // TRANSIENT upstream failure (network / timeout / 5xx / 429) reaching the
  // Google Play Developer API. Return a non-2xx so Pub/Sub REDELIVERS this
  // notification and we retry against fresh state. Crucially we do NOT insert a
  // play_rtdn_log row (nor mutate user_subscriptions) here: leaving message_id
  // unrecorded keeps the idempotency guard from short-circuiting the retry, and
  // avoids persisting a half-applied state. Permanent failures fall through and
  // are acked (200) below. As a backstop, the next /validate-android-receipt
  // call from the app reconciles any state we couldn't fetch here.
  if (transientFailure) {
    console.error(
      `Transient Play API failure for messageId=${messageId}; returning 503 so Pub/Sub retries`,
    );
    return new Response(
      JSON.stringify({ error: 'Upstream temporarily unavailable, retry', retry: true }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Resolve the user_subscriptions row (Android, by purchaseToken)
  const { data: subRow } = await supabase
    .from('user_subscriptions')
    .select('id, user_id, plan_id')
    .eq('platform', 'android')
    .eq('google_purchase_token', subNotif.purchaseToken)
    .maybeSingle();

  const { status: nextStatus, cancelAtPeriodEnd } = statusForNotificationType(typeName);

  if (subRow) {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (nextStatus !== null) update.status = nextStatus;
    if (cancelAtPeriodEnd !== null) update.cancel_at_period_end = cancelAtPeriodEnd;
    if (purchase?.expiryTimeMillis) {
      update.current_period_end = new Date(parseInt(purchase.expiryTimeMillis, 10)).toISOString();
    }
    if (purchase?.orderId) update.google_order_id = purchase.orderId;
    update.google_product_id = subNotif.subscriptionId;

    const tier = resolveProductTier(subNotif.subscriptionId);
    if (tier) {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('id')
        .ilike('name', `%${tier}%`)
        .limit(1)
        .single();
      if (plan?.id) update.plan_id = plan.id;
    }

    const { error: updErr } = await supabase
      .from('user_subscriptions')
      .update(update)
      .eq('id', subRow.id);

    if (updErr) {
      console.error(`user_subscriptions update failed id=${subRow.id}:`, updErr.message);
    } else {
      console.log(
        `Play RTDN applied: type=${typeName}, user=${subRow.user_id}, ` +
          `status=${nextStatus ?? 'unchanged'}, cancelAtPeriodEnd=${cancelAtPeriodEnd ?? 'unchanged'}, ` +
          `expires=${update.current_period_end ?? 'unchanged'}`,
      );
    }
  } else {
    console.warn(
      `No Android user_subscriptions row found for purchaseToken=${subNotif.purchaseToken} ` +
        `(messageId=${messageId}, type=${typeName}). The user may not have synced their purchase ` +
        `to the server yet — the next /validate-android-receipt call will reconcile.`,
    );
  }

  // -------------------------------------------------------------------------
  // 5. Persist the log
  // -------------------------------------------------------------------------
  await supabase.from('play_rtdn_log').insert({
    message_id: messageId,
    notification_type: typeName,
    purchase_token: subNotif.purchaseToken,
    subscription_id: subNotif.subscriptionId,
    user_subscription_id: subRow?.id ?? null,
    processed_at: new Date().toISOString(),
    status: fetchError ? 'fetch_error' : subRow ? 'applied' : 'no_match',
    error_message: fetchError,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
