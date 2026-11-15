/**
 * OAuth Callback Edge Function (DEPRECATED, inert)
 *
 * WEB-SEC-078. This endpoint is public (no bearer: the caller would be a
 * provider redirecting a browser) and it used to take `provider` from base64
 * JSON `state` that nothing signed, look the provider up in oauth_providers
 * with the service role, and POST the caller's `code` together with that
 * provider's client_secret to its token_url. The tokens that came back were
 * thrown away. So anyone could make it spend a stored client secret on a code
 * of their choosing, and a successful exchange stored nothing.
 *
 * It also never worked for a real provider. The redirect_uri it sent was
 * `${url.origin}/admin/oauth/callback` with url.origin being the functions
 * host, while every authorize URL the site builds (OAuthProviderSetup,
 * gsc-oauth) registers the site's own /admin/oauth/callback, a web route that
 * AdminGscCallback serves by calling gsc-oauth. A provider rejects a
 * token request whose redirect_uri differs from the authorize request's.
 *
 * Callers enumerated 2026-11-15: none. No reference in src/, ios/, android/
 * or supabase/functions/; no authorize URL anywhere points at
 * /functions/v1/oauth-callback. The name is kept (endpoint deprecation flow in
 * CLAUDE.md) and the body answers 410 without reading the database, so a
 * stale caller is visible in the function logs instead of 404ing. Delete the
 * directory in a later release once the logs show nothing.
 *
 * Returns: 410 { error: "deprecated", use: "gsc-oauth" }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

serve((req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Log that a call arrived and which params it carried, never their values:
  // `code` is a live authorization code until it expires.
  const url = new URL(req.url);
  console.warn(
    `[oauth-callback] deprecated endpoint called: code=${url.searchParams.has("code")}, state=${url.searchParams.has("state")}`,
  );

  return new Response(
    JSON.stringify({ error: "deprecated", use: "gsc-oauth" }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
