/**
 * Validate Android Receipt Edge Function
 *
 * Server-side Google Play subscription validation using the Android Publisher API v3.
 * Verifies purchase tokens with Google, then upserts the subscription status
 * in the database.
 *
 * Required env vars:
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_KEY - JSON service account key for Google Play Developer API
 *   SUPABASE_URL                    - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY       - Supabase service role key
 *
 * Accepts POST: { purchaseToken, productId, userId, packageName }
 * Returns: { valid: true, entitlement: { tier, expiresAt } } on success
 *          { valid: false, reason: string } on failure
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleCors, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { checkRateLimit, addRateLimitHeaders } from '../_shared/rateLimit.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_PACKAGE_NAME = 'com.desmoines.aipulse';

/** Product IDs from Google Play Console. */
const INSIDER_PRODUCT_IDS = new Set(['insider_monthly']);
const VIP_PRODUCT_IDS = new Set(['vip_monthly']);
const ALL_PRODUCT_IDS = new Set([...INSIDER_PRODUCT_IDS, ...VIP_PRODUCT_IDS]);

/** Google Play Developer API base URL. */
const GOOGLE_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

/** Google OAuth2 token endpoint. */
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ---------------------------------------------------------------------------
// Google Service Account JWT generation (RS256)
// ---------------------------------------------------------------------------

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

/**
 * Import a PKCS#8 PEM private key as a CryptoKey for RS256 signing.
 */
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
    ['sign']
  );
}

/**
 * Generate a short-lived JWT for Google Service Account authentication.
 * See: https://developers.google.com/identity/protocols/oauth2/service-account
 */
async function generateServiceAccountJWT(
  privateKey: CryptoKey,
  clientEmail: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 60 * 60, // 1 hour
  };

  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Exchange a service account JWT for a Google OAuth2 access token.
 */
async function getGoogleAccessToken(
  privateKey: CryptoKey,
  clientEmail: string
): Promise<string> {
  const jwt = await generateServiceAccountJWT(privateKey, clientEmail);

  const response = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unable to read body');
    throw new Error(`Google token exchange failed: status=${response.status}, body=${errorBody}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Google Play Developer API helpers
// ---------------------------------------------------------------------------

interface GoogleSubscriptionPurchase {
  kind: string;
  startTimeMillis?: string;
  expiryTimeMillis?: string;
  autoRenewing?: boolean;
  priceCurrencyCode?: string;
  priceAmountMicros?: string;
  countryCode?: string;
  paymentState?: number; // 0=pending, 1=received, 2=free_trial, 3=pending_deferred
  cancelReason?: number; // 0=user, 1=system, 2=replaced, 3=developer
  orderId?: string;
  acknowledgementState?: number; // 0=not_acknowledged, 1=acknowledged
  linkedPurchaseToken?: string;
}

/**
 * Verify a subscription purchase with Google Play Developer API.
 */
async function verifySubscriptionWithGoogle(
  packageName: string,
  productId: string,
  purchaseToken: string,
  accessToken: string
): Promise<GoogleSubscriptionPurchase | null> {
  const url = `${GOOGLE_API_BASE}/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;

  const response = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 200) {
    return await response.json() as GoogleSubscriptionPurchase;
  }

  const errorBody = await response.text().catch(() => 'Unable to read body');
  console.error(
    `Google Play API error: status=${response.status}, body=${errorBody}`
  );

  return null;
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

/**
 * Determine subscription status from Google's purchase data.
 */
function resolveSubscriptionStatus(purchase: GoogleSubscriptionPurchase): string {
  const now = Date.now();
  const expiryMs = purchase.expiryTimeMillis ? parseInt(purchase.expiryTimeMillis, 10) : 0;

  // Check if expired
  if (expiryMs && expiryMs < now) {
    return 'expired';
  }

  // Check for cancellation (but still active until expiry)
  if (purchase.cancelReason !== undefined && purchase.cancelReason !== null) {
    // Cancelled but not yet expired — still active until period end
    if (expiryMs && expiryMs > now) {
      return 'canceled';
    }
    return 'expired';
  }

  // Check payment state
  if (purchase.paymentState === 0) {
    return 'past_due'; // Payment pending
  }

  if (purchase.paymentState === 2) {
    return 'trialing'; // Free trial
  }

  return 'active';
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get('origin') || '';
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Rate limiting: 30 requests per 15 min (write operation tier)
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Too many validation requests. Please try again later.',
  });

  if (!rateLimit.success && rateLimit.response) {
    return addRateLimitHeaders(rateLimit.response, rateLimit);
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ valid: false, reason: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Authenticate the calling user
    // -----------------------------------------------------------------------
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -----------------------------------------------------------------------
    // 2. Parse and validate input
    // -----------------------------------------------------------------------
    const body = await req.json();
    const { purchaseToken, productId, userId, packageName } = body;

    if (!purchaseToken || typeof purchaseToken !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, reason: 'purchaseToken is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!productId || typeof productId !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, reason: 'productId is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, reason: 'userId is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!packageName || typeof packageName !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, reason: 'packageName is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the userId matches the authenticated user (prevent spoofing)
    if (userId !== user.id) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'userId does not match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify packageName matches expected
    if (packageName !== EXPECTED_PACKAGE_NAME) {
      return new Response(
        JSON.stringify({ valid: false, reason: `Invalid package name: ${packageName}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify productId is a known subscription product
    if (!ALL_PRODUCT_IDS.has(productId)) {
      return new Response(
        JSON.stringify({ valid: false, reason: `Unknown product ID: ${productId}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -----------------------------------------------------------------------
    // 3. Load Google service account credentials and get access token
    // -----------------------------------------------------------------------
    const serviceAccountKeyJson = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY');
    if (!serviceAccountKeyJson) {
      console.error('Missing GOOGLE_PLAY_SERVICE_ACCOUNT_KEY in environment');
      return new Response(
        JSON.stringify({ valid: false, reason: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let serviceAccountKey: { client_email: string; private_key: string };
    try {
      serviceAccountKey = JSON.parse(serviceAccountKeyJson);
    } catch {
      console.error('Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_KEY as JSON');
      return new Response(
        JSON.stringify({ valid: false, reason: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!serviceAccountKey.client_email || !serviceAccountKey.private_key) {
      console.error('Service account key missing client_email or private_key');
      return new Response(
        JSON.stringify({ valid: false, reason: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const privateKey = await importServiceAccountKey(serviceAccountKey.private_key);
    const accessToken = await getGoogleAccessToken(privateKey, serviceAccountKey.client_email);

    // -----------------------------------------------------------------------
    // 4. Verify the purchase with Google Play
    // -----------------------------------------------------------------------
    const googleResult = await verifySubscriptionWithGoogle(
      packageName,
      productId,
      purchaseToken,
      accessToken
    );

    if (!googleResult) {
      console.warn(`Google Play verification failed for user=${user.id}, productId=${productId}`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'Purchase not found with Google Play' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -----------------------------------------------------------------------
    // 5. Validate purchase fields
    // -----------------------------------------------------------------------

    // Determine tier
    const tier = resolveProductTier(productId);
    if (!tier) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Unable to determine subscription tier' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate expiration
    const expiresAt = googleResult.expiryTimeMillis
      ? new Date(parseInt(googleResult.expiryTimeMillis, 10)).toISOString()
      : null;

    // Determine subscription status
    const status = resolveSubscriptionStatus(googleResult);

    console.log(
      `Google Play verification OK: user=${user.id}, tier=${tier}, product=${productId}, ` +
      `status=${status}, expires=${expiresAt}, autoRenewing=${googleResult.autoRenewing}`
    );

    // -----------------------------------------------------------------------
    // 6. Upsert subscription in the database
    // -----------------------------------------------------------------------

    // Look up the matching subscription plan
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('id')
      .ilike('name', `%${tier}%`)
      .limit(1)
      .single();

    const subscriptionData = {
      user_id: user.id,
      status,
      google_purchase_token: purchaseToken,
      google_product_id: productId,
      google_order_id: googleResult.orderId || null,
      platform: 'android',
      current_period_end: expiresAt,
      current_period_start: googleResult.startTimeMillis
        ? new Date(parseInt(googleResult.startTimeMillis, 10)).toISOString()
        : null,
      cancel_at_period_end: googleResult.cancelReason !== undefined && googleResult.cancelReason !== null,
      updated_at: new Date().toISOString(),
      ...(plan?.id ? { plan_id: plan.id } : {}),
    };

    // Check if user already has an Android subscription record. Scoped to
    // platform='android' so we don't clobber a web/Stripe or iOS row.
    const { data: existing } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'android')
      .maybeSingle();

    if (existing) {
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update(subscriptionData)
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating subscription:', updateError.message);
        return new Response(
          JSON.stringify({ valid: false, reason: 'Failed to update subscription record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      const { error: insertError } = await supabase
        .from('user_subscriptions')
        .insert({
          ...subscriptionData,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('Error inserting subscription:', insertError.message);
        return new Response(
          JSON.stringify({ valid: false, reason: 'Failed to create subscription record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // -----------------------------------------------------------------------
    // 7. Return success
    // -----------------------------------------------------------------------
    const response = new Response(
      JSON.stringify({
        valid: true,
        entitlement: {
          tier,
          expiresAt,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    return addRateLimitHeaders(response, rateLimit);
  } catch (error) {
    console.error('validate-android-receipt error:', error);
    return new Response(
      JSON.stringify({
        valid: false,
        reason: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
