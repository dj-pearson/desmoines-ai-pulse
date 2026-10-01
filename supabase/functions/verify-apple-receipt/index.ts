/**
 * Verify Apple Receipt Edge Function (DEPRECATED, inert)
 *
 * IOS-DD-MONETIZATION-01. This endpoint used to write an ACTIVE subscription row
 * for any signed-in caller without ever asking Apple: the
 * tier came from `productId.includes('vip')`, the row carried no platform (so
 * the column default 'web' applied and the grant showed up on every surface),
 * and the existing-row lookup had no platform filter. Anyone with an account
 * could POST {transactionId:'x', productId:'vip'} and get permanent VIP.
 *
 * validate-ios-receipt is the real path: it verifies the transaction with the
 * App Store Server API and binds it to one account. No shipped client calls
 * this endpoint (grep over ios/, android/ and src/, plus git history), so the
 * name is kept and the body answers 410 without touching the database. The
 * warning below makes any legacy caller visible in the function logs.
 *
 * Returns: 410 { success: false, error: "deprecated", use: "validate-ios-receipt" }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Read the `sub` claim for logging only. The token is NOT verified: nothing
 * here grants anything, so an attacker-chosen id just mislabels a log line.
 */
function unverifiedSubject(authHeader: string | null): string | null {
  if (!authHeader) return null;
  try {
    const parts = authHeader.replace("Bearer ", "").split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Authorization required" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let productId: unknown = null;
  try {
    const body = await req.json();
    productId = body?.productId ?? null;
  } catch {
    // An unreadable body is still a legacy call worth logging.
  }

  console.warn(
    `[verify-apple-receipt] deprecated endpoint called: user=${
      unverifiedSubject(authHeader) ?? "unknown"
    } (unverified), productId=${String(productId)}`,
  );

  return new Response(
    JSON.stringify({
      success: false,
      error: "deprecated",
      use: "validate-ios-receipt",
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
