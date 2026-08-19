/**
 * Validate iOS Receipt Edge Function
 *
 * Server-side StoreKit 2 receipt validation using Apple's App Store Server API v2.
 * Verifies transactions directly with Apple, then upserts the subscription status
 * in the database.
 *
 * Required env vars:
 *   APPLE_PRIVATE_KEY    - ES256 private key (.p8 contents) from App Store Connect
 *   APPLE_KEY_ID         - Key ID from App Store Connect
 *   APPLE_ISSUER_ID      - Issuer ID from App Store Connect
 *   SUPABASE_URL         - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase service role key
 *
 * Accepts POST: { transactionId, originalTransactionId, productId, userId }
 * Returns: { valid: true, entitlement: { tier, expiresAt } } on success
 *          { valid: false, reason: string } on failure
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { handleCors, getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { checkRateLimit, addRateLimitHeaders } from '../_shared/rateLimit.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPECTED_BUNDLE_ID = 'com.desmoines.aipulse';

/** Product IDs from App Store Connect (monthly + annual — IOS-SUB-012). */
const INSIDER_PRODUCT_IDS = new Set(['prod_U4oa7Cpn0bRnuo', 'prod_insider_annual']);
const VIP_PRODUCT_IDS = new Set(['prod_U4oaGFEy12auTx', 'prod_vip_annual']);
const ALL_PRODUCT_IDS = new Set([...INSIDER_PRODUCT_IDS, ...VIP_PRODUCT_IDS]);

/** Apple App Store Server API base URLs. */
const APPLE_API_PRODUCTION = 'https://api.storekit.itunes.apple.com';
const APPLE_API_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com';

// ---------------------------------------------------------------------------
// Apple JWT generation (ES256)
// ---------------------------------------------------------------------------

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncode(new TextEncoder().encode(str));
}

/**
 * Import an Apple .p8 private key (PKCS#8 PEM) as a CryptoKey for ES256 signing.
 */
async function importApplePrivateKey(pemContents: string): Promise<CryptoKey> {
  // Strip PEM header/footer and whitespace
  const stripped = pemContents
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binaryDer = Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

/**
 * Generate a short-lived JWT for the App Store Server API.
 * See: https://developer.apple.com/documentation/appstoreserverapi/generating_tokens_for_api_requests
 */
async function generateAppleJWT(
  privateKey: CryptoKey,
  keyId: string,
  issuerId: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT',
  };

  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 20 * 60, // 20 minutes
    aud: 'appstoreconnect-v1',
    bid: EXPECTED_BUNDLE_ID,
  };

  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(signingInput)
  );

  // Convert DER signature to raw r||s format expected by JWS
  const rawSignature = derToRaw(new Uint8Array(signature));
  const encodedSignature = base64UrlEncode(rawSignature);

  return `${signingInput}.${encodedSignature}`;
}

/**
 * Convert a DER-encoded ECDSA signature to the raw r||s format (64 bytes for P-256).
 * WebCrypto on some runtimes returns DER; others return raw. Handle both.
 */
function derToRaw(signature: Uint8Array): Uint8Array {
  // If it's already 64 bytes, assume it's raw r||s
  if (signature.length === 64) return signature;

  // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  if (signature[0] !== 0x30) return signature; // Not DER, return as-is

  let offset = 2; // skip 0x30 and total length

  // Read r
  if (signature[offset] !== 0x02) throw new Error('Invalid DER signature');
  offset++;
  const rLen = signature[offset];
  offset++;
  let r = signature.slice(offset, offset + rLen);
  offset += rLen;

  // Read s
  if (signature[offset] !== 0x02) throw new Error('Invalid DER signature');
  offset++;
  const sLen = signature[offset];
  offset++;
  let s = signature.slice(offset, offset + sLen);

  // Trim leading zeros (DER may pad with 0x00 for positive sign)
  if (r.length === 33 && r[0] === 0) r = r.slice(1);
  if (s.length === 33 && s[0] === 0) s = s.slice(1);

  // Pad to 32 bytes each
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

// ---------------------------------------------------------------------------
// Apple App Store Server API helpers
// ---------------------------------------------------------------------------

interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  expiresDate?: number; // milliseconds
  revocationDate?: number;
  type: string;
  inAppOwnershipType: string;
}

/**
 * Decode a JWS (signed transaction) payload without signature verification
 * (Apple's response is already authenticated via TLS + our server-to-server JWT).
 */
function decodeJWSPayload<T>(jws: string): T {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');
  const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(payloadJson) as T;
}

/**
 * Fetch a transaction from Apple's App Store Server API.
 * Tries production first, then falls back to sandbox.
 */
async function fetchTransactionFromApple(
  transactionId: string,
  appleJWT: string
): Promise<{ signedTransactionInfo: string; environment: string } | null> {
  const headers = {
    Authorization: `Bearer ${appleJWT}`,
    'Content-Type': 'application/json',
  };

  // Try production first
  let response = await fetch(
    `${APPLE_API_PRODUCTION}/inApps/v1/transactions/${transactionId}`,
    { headers }
  );

  if (response.status === 200) {
    const data = await response.json();
    return { signedTransactionInfo: data.signedTransactionInfo, environment: 'Production' };
  }

  // If 404 on production, try sandbox (common during development/TestFlight)
  if (response.status === 404) {
    response = await fetch(
      `${APPLE_API_SANDBOX}/inApps/v1/transactions/${transactionId}`,
      { headers }
    );

    if (response.status === 200) {
      const data = await response.json();
      return { signedTransactionInfo: data.signedTransactionInfo, environment: 'Sandbox' };
    }
  }

  // Log non-200 responses for debugging
  const errorBody = await response.text().catch(() => 'Unable to read body');
  console.error(
    `Apple API error: status=${response.status}, body=${errorBody}`
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
    const { transactionId, originalTransactionId, productId, userId } = body;

    if (!transactionId || typeof transactionId !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, reason: 'transactionId is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!originalTransactionId || typeof originalTransactionId !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, reason: 'originalTransactionId is required and must be a string' }),
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

    // Verify the userId matches the authenticated user (prevent spoofing)
    if (userId !== user.id) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'userId does not match authenticated user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    // 3. Load Apple credentials and generate JWT
    // -----------------------------------------------------------------------
    const applePrivateKeyPem = Deno.env.get('APPLE_PRIVATE_KEY');
    const appleKeyId = Deno.env.get('APPLE_KEY_ID');
    const appleIssuerId = Deno.env.get('APPLE_ISSUER_ID');

    if (!applePrivateKeyPem || !appleKeyId || !appleIssuerId) {
      console.error('Missing Apple API credentials in environment');
      return new Response(
        JSON.stringify({ valid: false, reason: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const applePrivateKey = await importApplePrivateKey(applePrivateKeyPem);
    const appleJWT = await generateAppleJWT(applePrivateKey, appleKeyId, appleIssuerId);

    // -----------------------------------------------------------------------
    // 4. Verify the transaction with Apple
    // -----------------------------------------------------------------------
    const appleResult = await fetchTransactionFromApple(transactionId, appleJWT);

    if (!appleResult) {
      console.warn(`Apple verification failed for transactionId=${transactionId}, user=${user.id}`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'Transaction not found with Apple' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode the signed transaction info
    const txInfo = decodeJWSPayload<AppleTransactionInfo>(appleResult.signedTransactionInfo);

    // -----------------------------------------------------------------------
    // 5. Validate transaction fields
    // -----------------------------------------------------------------------

    // Verify bundle ID
    if (txInfo.bundleId !== EXPECTED_BUNDLE_ID) {
      console.warn(
        `Bundle ID mismatch: expected=${EXPECTED_BUNDLE_ID}, got=${txInfo.bundleId}, user=${user.id}`
      );
      return new Response(
        JSON.stringify({ valid: false, reason: 'Bundle ID mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify product ID matches what the client sent
    if (txInfo.productId !== productId) {
      console.warn(
        `Product ID mismatch: client=${productId}, apple=${txInfo.productId}, user=${user.id}`
      );
      return new Response(
        JSON.stringify({ valid: false, reason: 'Product ID mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify productId is a known subscription product (from Apple's response)
    if (!ALL_PRODUCT_IDS.has(txInfo.productId)) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Product not recognized as a valid subscription' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for revocation
    if (txInfo.revocationDate) {
      console.warn(`Transaction ${transactionId} has been revoked for user ${user.id}`);
      return new Response(
        JSON.stringify({ valid: false, reason: 'Transaction has been revoked' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine tier
    const tier = resolveProductTier(txInfo.productId);
    if (!tier) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Unable to determine subscription tier' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate expiration
    const expiresAt = txInfo.expiresDate
      ? new Date(txInfo.expiresDate).toISOString()
      : null;

    // Determine subscription status
    let status = 'active';
    if (txInfo.expiresDate && txInfo.expiresDate < Date.now()) {
      status = 'expired';
    }

    console.log(
      `Apple verification OK: user=${user.id}, tier=${tier}, product=${txInfo.productId}, ` +
      `env=${appleResult.environment}, expires=${expiresAt}, status=${status}`
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
      apple_transaction_id: transactionId,
      apple_original_transaction_id: originalTransactionId,
      apple_product_id: txInfo.productId,
      platform: 'ios',
      current_period_end: expiresAt,
      updated_at: new Date().toISOString(),
      ...(plan?.id ? { plan_id: plan.id } : {}),
    };

    // Check if user already has an iOS subscription record. Scoped to
    // platform='ios' so we don't clobber a web/Stripe or Android row.
    //
    // WEB-BE-032: the error is captured, not discarded. maybeSingle() returns
    // null data and null error for the genuine no-row case, so ANY error here
    // is a real read failure - and a discarded one made this branch take the
    // insert path, which then violates UNIQUE(user_id, platform)
    // (20260506000003) and 500s with the wrong reason. Fail here instead, so
    // the log names the actual cause and the client can retry.
    const { data: existing, error: existingError } = await supabase
      .from('user_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('platform', 'ios')
      .maybeSingle();

    if (existingError) {
      console.error(
        'validate-ios-receipt: could not read existing subscription',
        existingError.code,
        existingError.message,
      );
      return new Response(
        JSON.stringify({ valid: false, reason: 'Failed to read subscription record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
    console.error('validate-ios-receipt error:', error);
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
