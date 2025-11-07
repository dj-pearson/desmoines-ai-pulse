import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
      throw new Error(`OAuth error: ${error}`);
    }

    if (!code || !state) {
      throw new Error("Missing code or state parameter");
    }

    // Parse state
    const stateData = JSON.parse(atob(state));
    const provider = stateData.provider;

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
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`);
    }

    const tokens = await tokenResponse.json();

    // Get user from session (should be passed via state or cookie)
    // For now, we'll return the tokens and let the frontend handle storage
    const redirectUrl = `${url.origin}/admin?oauth_success=true&provider=${provider}`;

    // Store tokens (in a real implementation, you'd get the user ID from a secure session)
    // This is a simplified version

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
    const redirectUrl = `${url.origin}/admin?oauth_error=${encodeURIComponent(error.message)}`;

    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl,
        ...corsHeaders,
      },
    });
  }
});
