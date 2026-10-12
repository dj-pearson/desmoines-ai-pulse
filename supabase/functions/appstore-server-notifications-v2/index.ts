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
 *   1-2. verifyAppleJWS (_shared/appleJws.ts) checks the whole chain against
 *      a pinned Apple Root CA - G3: each certificate signed by the next,
 *      validity at signedDate, the intermediate a CA, Apple's marker OIDs on
 *      leaf and intermediate, then the ES256 signature with the leaf key.
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
import { verifyAppleJWS } from '../_shared/appleJws.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_BUNDLE_ID = 'com.desmoines.aipulse';

// Monthly + annual product IDs (annual added in IOS-SUB-012).
const INSIDER_PRODUCT_IDS = new Set(['prod_U4oa7Cpn0bRnuo', 'prod_insider_annual']);
const VIP_PRODUCT_IDS = new Set(['prod_U4oaGFEy12auTx', 'prod_vip_annual']);
const ALL_PRODUCT_IDS = new Set([...INSIDER_PRODUCT_IDS, ...VIP_PRODUCT_IDS]);

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
  // Update EVERY matching user_subscriptions row
  // ---------------------------------------------------------------------
  // IOS-DD-MONETIZATION-02: this used .maybeSingle(), which errors when more
  // than one account holds the same original transaction. That was exactly
  // the shared-subscription case, so a refund or expiry revoked nobody. There
  // is no unique index on apple_original_transaction_id yet, so apply the
  // same update to all of them.
  const { data: subRows, error: subLookupError } = await supabase
    .from('user_subscriptions')
    .select('id, user_id, status, plan_id')
    .eq('platform', 'ios')
    .eq('apple_original_transaction_id', originalTransactionId);

  if (subLookupError) {
    console.error('user_subscriptions lookup error:', subLookupError.message);
  }

  const matchedRows: Array<{ id: string; user_id: string }> = subRows ?? [];
  const subRow = matchedRows[0] ?? null;

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
      .in('id', matchedRows.map((r) => r.id));

    if (updErr) {
      updateError = updErr.message;
      console.error(
        `user_subscriptions update failed for ids=${matchedRows.map((r) => r.id).join(',')}, uuid=${notificationUUID}:`,
        updErr.message,
      );
    } else {
      console.log(
        `Apple webhook applied: type=${notificationType}, subtype=${subtype ?? 'none'}, ` +
          `users=${matchedRows.map((r) => r.user_id).join(',')}, rows=${matchedRows.length}, ` +
          `status=${nextStatus ?? 'unchanged'}, ` +
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
