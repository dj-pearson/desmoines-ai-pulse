import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      throw new Error("OAuth authorization was denied");
    }

    if (!code || !state) {
      throw new Error("Missing required OAuth parameters");
    }

    // Parse and validate state
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      throw new Error("Invalid state parameter");
    }

    const provider = stateData.provider;

    // Validate state timestamp (reject if older than 10 minutes)
    if (stateData.timestamp) {
      const stateAge = Date.now() - stateData.timestamp;
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (stateAge > maxAge) {
        throw new Error("OAuth state has expired. Please try again.");
      }
    }

    if (!provider || typeof provider !== 'string') {
      throw new Error("Invalid state parameter");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Get provider configuration
    const { data: providerConfig, error: providerError } = await supabaseClient
      .from("oauth_providers")
      .select("*")
      .eq("provider_name", provider)
      .single();

    if (providerError || !providerConfig) {
      throw new Error("Provider not found");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(providerConfig.token_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: providerConfig.client_id,
        client_secret: providerConfig.client_secret,
        redirect_uri: `${url.origin}/admin/oauth/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenResponse.statusText);
      throw new Error("Token exchange failed");
    }

    const tokens = await tokenResponse.json();

    // Redirect to admin with success
    const redirectUrl = `${url.origin}/admin?oauth_success=true&provider=${encodeURIComponent(provider)}`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    const url = new URL(req.url);
    // Sanitize error message - don't expose internal details
    const safeMessage = "OAuth authentication failed. Please try again.";
    const redirectUrl = `${url.origin}/admin?oauth_error=${encodeURIComponent(safeMessage)}`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        ...corsHeaders,
      },
    });
  }
});
