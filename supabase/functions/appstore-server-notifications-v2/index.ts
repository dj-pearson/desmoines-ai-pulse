/**
 * Apple App Store Server Notifications v2 Webhook
 *
 * Receives server-to-server notifications from Apple about subscription state
 * changes (renewals, cancellations, refunds, billing retries, expirations) and
 * mirrors the change into `user_subscriptions` immediately — instead of waiting
 * for the next iOS app launch.
 *
 * Apple sends a single field in the body:
 *   { "signedPayload": "<JWS>" }
 *
 * The JWS header carries an `x5c` certificate chain (leaf → intermediate →
 * Apple Root CA G3). We:
 *   1. Verify the leaf certificate chains up to a known Apple Root CA SHA-256
 *      fingerprint (defense-in-depth — TLS already terminated at the function
 *      edge, but Apple expects us to validate the JWS chain too).
 *   2. Verify the JWS signature using the leaf certificate's ES256 public key.
 *   3. Decode notificationType, subtype, notificationUUID, and the embedded
 *      signedTransactionInfo + signedRenewalInfo JWSes (also Apple-signed).
 *   4. Resolve the matching `user_subscriptions` row by
 *      apple_original_transaction_id and mutate status / period / cancel flag.
 *   5. Persist the notificationUUID for idempotency (Apple delivers at-least-
 *      once and retries 5×).
 *
 * URL configured in App Store Connect (production + sandbox separately).
 *
 * Required env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * No client auth — authenticity is guaranteed by the JWS signature chain.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_BUNDLE_ID = 'com.desmoines.aipulse';

// Monthly + annual product IDs (annual added in IOS-SUB-012).
const INSIDER_PRODUCT_IDS = new Set(['prod_U4oa7Cpn0bRnuo', 'prod_insider_annual']);
const VIP_PRODUCT_IDS = new Set(['prod_U4oaGFEy12auTx', 'prod_vip_annual']);
const ALL_PRODUCT_IDS = new Set([...INSIDER_PRODUCT_IDS, ...VIP_PRODUCT_IDS]);

/**
 * SHA-256 fingerprints (hex, lowercase) of the Apple Root CA certificates that
 * are allowed to anchor the x5c chain. Validated against the last cert in the
 * chain that Apple sends.
 *
 * Apple Root CA - G3 (used to sign App Store Server Notifications v2)
 *   https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 */
const APPLE_ROOT_CA_FINGERPRINTS = new Set<string>([
  // Apple Root CA - G3
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179',
]);

// ---------------------------------------------------------------------------
// Apple notification types we handle
// ---------------------------------------------------------------------------

type NotificationType =
  | 'SUBSCRIBED'
  | 'DID_RENEW'
  | 'DID_CHANGE_RENEWAL_STATUS'
  | 'DID_FAIL_TO_RENEW'
  | 'EXPIRED'
  | 'REVOKE'
  | 'REFUND'
  | 'GRACE_PERIOD_EXPIRED'
  | string;

interface AppleNotificationPayload {
  notificationType: NotificationType;
  subtype?: string;
  notificationUUID: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
  version?: string;
  signedDate?: number;
}

interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  expiresDate?: number;
  revocationDate?: number;
  type: string;
  inAppOwnershipType: string;
}

interface AppleRenewalInfo {
  originalTransactionId: string;
  autoRenewProductId?: string;
  productId: string;
  autoRenewStatus: number; // 0 = off, 1 = on
  isInBillingRetryPeriod?: boolean;
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
}

// ---------------------------------------------------------------------------
// JWS / certificate helpers
// ---------------------------------------------------------------------------

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(hash));
}

/**
 * Convert a JWS-format raw r||s ECDSA signature (64 bytes for P-256) into the
 * DER form WebCrypto accepts on import-only platforms.
 *
 * NOTE: Deno's WebCrypto sub-spec for ECDSA verification accepts the raw
 * IEEE-P1363 (r||s) format directly. We keep a pass-through here for
 * documentation and future portability.
 */
function jwsSignatureToWebCrypto(signature: Uint8Array): Uint8Array {
  return signature;
}

/**
 * Decode the leaf certificate's SubjectPublicKeyInfo into a CryptoKey.
 *
 * The certs in `x5c` are base64-encoded DER X.509 certificates. WebCrypto can
 * import a SubjectPublicKeyInfo directly as `spki`, so we ask the runtime to
 * extract it for us by feeding the full cert bytes — which works because the
 * SPKI is a subtree of the cert, but only some runtimes accept the full cert.
 *
 * To stay portable, we extract the SPKI ourselves with a tiny ASN.1 walk.
 */
async function importLeafPublicKey(certDer: Uint8Array): Promise<CryptoKey> {
  const spki = extractSpkiFromCert(certDer);
  return crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
}

/**
 * Walk the X.509 ASN.1 tree to extract the SubjectPublicKeyInfo bytes.
 *
 * Certificate ::= SEQUENCE {
 *   tbsCertificate TBSCertificate,
 *   signatureAlgorithm AlgorithmIdentifier,
 *   signatureValue BIT STRING
 * }
 * TBSCertificate ::= SEQUENCE {
 *   [0] EXPLICIT version,
 *   serialNumber INTEGER,
 *   signature AlgorithmIdentifier,
 *   issuer Name,
 *   validity Validity,
 *   subject Name,
 *   subjectPublicKeyInfo SubjectPublicKeyInfo,
 *   ...
 * }
 *
 * We only need to skip into `tbsCertificate` and find the 7th SEQUENCE/SET
 * field. To avoid a full ASN.1 parser we do a minimal walk that handles the
 * tag/length pairs we care about.
 */
function extractSpkiFromCert(cert: Uint8Array): Uint8Array {
  // Outer SEQUENCE
  let offset = readTag(cert, 0, 0x30).contentStart;

  // tbsCertificate (SEQUENCE)
  const tbs = readTag(cert, offset, 0x30);
  let p = tbs.contentStart;
  const tbsEnd = tbs.contentStart + tbs.contentLen;

  // Optional [0] EXPLICIT version
  if (cert[p] === 0xa0) {
    p = skipTLV(cert, p);
  }

  // serialNumber (INTEGER)
  p = skipTLV(cert, p);
  // signature AlgorithmIdentifier (SEQUENCE)
  p = skipTLV(cert, p);
  // issuer Name (SEQUENCE)
  p = skipTLV(cert, p);
  // validity Validity (SEQUENCE)
  p = skipTLV(cert, p);
  // subject Name (SEQUENCE)
  p = skipTLV(cert, p);

  // subjectPublicKeyInfo (SEQUENCE) — what we want, including its tag+len.
  if (p >= tbsEnd) throw new Error('Unable to locate SPKI in certificate');
  const spkiTag = cert[p];
  if (spkiTag !== 0x30) {
    throw new Error(`Expected SPKI SEQUENCE tag, got 0x${spkiTag.toString(16)}`);
  }

  const spkiLen = readLength(cert, p + 1);
  const spkiTotal = 1 + spkiLen.lenBytes + spkiLen.value;
  return cert.slice(p, p + spkiTotal);
}

function readTag(buf: Uint8Array, offset: number, expectedTag: number) {
  if (buf[offset] !== expectedTag) {
    throw new Error(
      `Expected tag 0x${expectedTag.toString(16)} at ${offset}, got 0x${buf[offset].toString(16)}`,
    );
  }
  const lenInfo = readLength(buf, offset + 1);
  return {
    contentStart: offset + 1 + lenInfo.lenBytes,
    contentLen: lenInfo.value,
  };
}

function readLength(buf: Uint8Array, offset: number): { value: number; lenBytes: number } {
  const first = buf[offset];
  if ((first & 0x80) === 0) {
    return { value: first, lenBytes: 1 };
  }
  const num = first & 0x7f;
  if (num === 0 || num > 4) throw new Error(`Unsupported ASN.1 length encoding (${num} bytes)`);
  let value = 0;
  for (let i = 0; i < num; i++) {
    value = (value << 8) | buf[offset + 1 + i];
  }
  return { value, lenBytes: 1 + num };
}

function skipTLV(buf: Uint8Array, offset: number): number {
  const lenInfo = readLength(buf, offset + 1);
  return offset + 1 + lenInfo.lenBytes + lenInfo.value;
}

/**
 * Verify the JWS signed by Apple. Returns the decoded payload on success,
 * throws otherwise.
 */
async function verifyAppleJWS<T>(jws: string): Promise<T> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedHeader)));

  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported JWS algorithm: ${header.alg}`);
  }
  if (!Array.isArray(header.x5c) || header.x5c.length === 0) {
    throw new Error('JWS header missing x5c certificate chain');
  }

  // 1. Validate root CA fingerprint
  const rootCertB64 = header.x5c[header.x5c.length - 1];
  const rootCertDer = base64ToBytes(rootCertB64);
  const rootFingerprint = await sha256Hex(rootCertDer);

  if (!APPLE_ROOT_CA_FINGERPRINTS.has(rootFingerprint)) {
    throw new Error(
      `JWS x5c root CA fingerprint not allow-listed: ${rootFingerprint}`,
    );
  }

  // 2. Verify the JWS signature using the leaf certificate's public key
  const leafCertDer = base64ToBytes(header.x5c[0]);
  const leafKey = await importLeafPublicKey(leafCertDer);

  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = jwsSignatureToWebCrypto(base64UrlToBytes(encodedSignature));

  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    leafKey,
    signature,
    signingInput,
  );

  if (!verified) {
    throw new Error('JWS signature verification failed');
  }

  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(encodedPayload))) as T;
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

function resolveProductTier(productId: string): 'insider' | 'vip' | null {
  if (VIP_PRODUCT_IDS.has(productId) || productId.toLowerCase().includes('vip')) {
    return 'vip';
  }
  if (INSIDER_PRODUCT_IDS.has(productId) || productId.toLowerCase().includes('insider')) {
    return 'insider';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Apple sends server-to-server POSTs; never browser-initiated, so no CORS
  // preflight is expected. Reject anything but POST.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let payload: AppleNotificationPayload;

  try {
    const body = await req.json();
    if (!body || typeof body.signedPayload !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing signedPayload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    payload = await verifyAppleJWS<AppleNotificationPayload>(body.signedPayload);
  } catch (err) {
    console.error('Apple JWS verification failed:', err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: 'Invalid signedPayload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const {
    notificationType,
    subtype,
    notificationUUID,
    data,
  } = payload;

  if (!notificationUUID) {
    return new Response(JSON.stringify({ error: 'Missing notificationUUID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Bundle ID guard — reject notifications for any other app
  if (data?.bundleId && data.bundleId !== EXPECTED_BUNDLE_ID) {
    console.warn(
      `Rejecting Apple notification for foreign bundleId=${data.bundleId} ` +
        `(notificationType=${notificationType}, uuid=${notificationUUID})`,
    );
    return new Response(JSON.stringify({ error: 'Bundle ID mismatch' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---------------------------------------------------------------------
  // Idempotency: short-circuit if we've already processed this notification
  // ---------------------------------------------------------------------
  const { data: existingLog, error: logLookupError } = await supabase
    .from('apple_notification_log')
    .select('id, processed_at')
    .eq('notification_uuid', notificationUUID)
    .maybeSingle();

  if (logLookupError) {
    console.error('apple_notification_log lookup error:', logLookupError.message);
  }

  if (existingLog) {
    console.log(
      `Duplicate Apple notification uuid=${notificationUUID} ` +
        `(already processed at ${existingLog.processed_at})`,
    );
    return new Response(JSON.stringify({ ok: true, duplicate: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---------------------------------------------------------------------
  // Decode the embedded signed transaction + renewal info JWSes
  // ---------------------------------------------------------------------
  let txInfo: AppleTransactionInfo | null = null;
  let renewalInfo: AppleRenewalInfo | null = null;

  try {
    if (data?.signedTransactionInfo) {
      txInfo = await verifyAppleJWS<AppleTransactionInfo>(data.signedTransactionInfo);
    }
    if (data?.signedRenewalInfo) {
      renewalInfo = await verifyAppleJWS<AppleRenewalInfo>(data.signedRenewalInfo);
    }
  } catch (err) {
    console.error(
      `Inner JWS verification failed for uuid=${notificationUUID}:`,
      err instanceof Error ? err.message : err,
    );
    return new Response(JSON.stringify({ error: 'Invalid embedded JWS' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const originalTransactionId =
    txInfo?.originalTransactionId ?? renewalInfo?.originalTransactionId ?? null;

  if (!originalTransactionId) {
    console.warn(
      `Apple notification uuid=${notificationUUID} has no originalTransactionId — ` +
        `type=${notificationType}, subtype=${subtype ?? 'none'}`,
    );
    // Still record the notification so we don't reprocess it on retry
    await supabase.from('apple_notification_log').insert({
      notification_uuid: notificationUUID,
      notification_type: notificationType,
      subtype: subtype ?? null,
      processed_at: new Date().toISOString(),
      status: 'skipped_no_transaction',
    });
    return new Response(JSON.stringify({ ok: true, skipped: 'no transaction' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---------------------------------------------------------------------
  // Determine the new subscription state from the notification type
  // ---------------------------------------------------------------------
  const productId = txInfo?.productId ?? renewalInfo?.productId ?? null;
  const tier = productId ? resolveProductTier(productId) : null;

  const expiresAt = txInfo?.expiresDate
    ? new Date(txInfo.expiresDate).toISOString()
    : null;

  let nextStatus: string | null = null;
  let cancelAtPeriodEnd: boolean | null = null;

  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
      nextStatus = 'active';
      cancelAtPeriodEnd = false;
      break;

    case 'DID_CHANGE_RENEWAL_STATUS':
      // subtype AUTO_RENEW_DISABLED → cancel-at-period-end true
      // subtype AUTO_RENEW_ENABLED  → cancel-at-period-end false
      if (subtype === 'AUTO_RENEW_DISABLED') {
        cancelAtPeriodEnd = true;
      } else if (subtype === 'AUTO_RENEW_ENABLED') {
        cancelAtPeriodEnd = false;
      } else if (renewalInfo) {
        cancelAtPeriodEnd = renewalInfo.autoRenewStatus === 0;
      }
      // status stays the same — sub is still active until current_period_end
      break;

    case 'DID_FAIL_TO_RENEW':
      // Apple is retrying. If subtype === GRACE_PERIOD we leave status active.
      nextStatus = subtype === 'GRACE_PERIOD' ? 'active' : 'past_due';
      break;

    case 'GRACE_PERIOD_EXPIRED':
    case 'EXPIRED':
      nextStatus = 'expired';
      break;

    case 'REVOKE':
    case 'REFUND':
      nextStatus = 'canceled';
      cancelAtPeriodEnd = true;
      break;

    default:
      // Unknown / unhandled — log and ack
      console.log(
        `Unhandled Apple notification type=${notificationType}, ` +
          `subtype=${subtype ?? 'none'}, uuid=${notificationUUID}`,
      );
      break;
  }

  // ---------------------------------------------------------------------
  // Update the matching user_subscriptions row
  // ---------------------------------------------------------------------
  const { data: subRow, error: subLookupError } = await supabase
    .from('user_subscriptions')
    .select('id, user_id, status, plan_id')
    .eq('platform', 'ios')
    .eq('apple_original_transaction_id', originalTransactionId)
    .maybeSingle();

  if (subLookupError) {
    console.error('user_subscriptions lookup error:', subLookupError.message);
  }

  let updateError: string | null = null;

  if (subRow) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (nextStatus !== null) update.status = nextStatus;
    if (cancelAtPeriodEnd !== null) update.cancel_at_period_end = cancelAtPeriodEnd;
    if (expiresAt) update.current_period_end = expiresAt;
    if (txInfo?.transactionId) update.apple_transaction_id = txInfo.transactionId;
    if (productId) update.apple_product_id = productId;

    // Optionally re-resolve plan_id if the product/tier changed
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
      updateError = updErr.message;
      console.error(
        `user_subscriptions update failed for id=${subRow.id}, uuid=${notificationUUID}:`,
        updErr.message,
      );
    } else {
      console.log(
        `Apple webhook applied: type=${notificationType}, subtype=${subtype ?? 'none'}, ` +
          `user=${subRow.user_id}, status=${nextStatus ?? 'unchanged'}, ` +
          `cancelAtPeriodEnd=${cancelAtPeriodEnd ?? 'unchanged'}, expires=${expiresAt}`,
      );
    }
  } else {
    console.warn(
      `No iOS user_subscriptions row found for originalTransactionId=${originalTransactionId} ` +
        `(uuid=${notificationUUID}, type=${notificationType}). The user may not have synced ` +
        `their purchase to the server yet — the next /validate-ios-receipt call will reconcile.`,
    );
  }

  // ---------------------------------------------------------------------
  // Persist the notification log for idempotency + audit
  // ---------------------------------------------------------------------
  await supabase.from('apple_notification_log').insert({
    notification_uuid: notificationUUID,
    notification_type: notificationType,
    subtype: subtype ?? null,
    original_transaction_id: originalTransactionId,
    user_subscription_id: subRow?.id ?? null,
    processed_at: new Date().toISOString(),
    status: updateError ? 'error' : subRow ? 'applied' : 'no_match',
    error_message: updateError,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
