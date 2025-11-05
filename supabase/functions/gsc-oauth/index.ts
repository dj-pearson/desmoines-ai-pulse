// ============================================================================
// Google Search Console OAuth Edge Function
// ============================================================================
// Purpose: Handle OAuth flow for Google Search Console API
// Returns: OAuth tokens for accessing GSC data
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const googleRedirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");

    if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
      return new Response(
        JSON.stringify({
          error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const action = url.searchParams.get("action") || "callback";

    // Generate authorization URL
    if (action === "authorize") {
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.append("client_id", googleClientId);
      authUrl.searchParams.append("redirect_uri", googleRedirectUri);
      authUrl.searchParams.append("response_type", "code");
      authUrl.searchParams.append("scope", "https://www.googleapis.com/auth/webmasters.readonly");
      authUrl.searchParams.append("access_type", "offline");
      authUrl.searchParams.append("prompt", "consent");
      authUrl.searchParams.append("state", crypto.randomUUID());

      return new Response(
        JSON.stringify({
          success: true,
          authorizationUrl: authUrl.toString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle OAuth callback
    if (action === "callback" && code) {
      console.log("Exchanging authorization code for tokens...");

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: googleRedirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        throw new Error(`Token exchange failed: ${error}`);
      }

      const tokenData = await tokenResponse.json();

      // Calculate expiration time
      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in || 3600) * 1000
      );

      // Get user from authorization header
      const authHeader = req.headers.get("Authorization");
      let userId = null;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;
      }

      // Save credentials to database
      const { data: credential, error: insertError } = await supabase
        .from("gsc_oauth_credentials")
        .insert({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type,
          expires_at: expiresAt.toISOString(),
          scope: tokenData.scope,
          user_id: userId,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to save credentials: ${insertError.message}`);
      }

      console.log("OAuth credentials saved successfully");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Successfully connected to Google Search Console",
          credentialId: credential.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Refresh access token
    if (action === "refresh") {
      const { credentialId } = await req.json();

      if (!credentialId) {
        return new Response(
          JSON.stringify({ error: "credentialId is required for refresh" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get credential
      const { data: credential, error: fetchError } = await supabase
        .from("gsc_oauth_credentials")
        .select("*")
        .eq("id", credentialId)
        .single();

      if (fetchError || !credential) {
        throw new Error("Credential not found");
      }

      if (!credential.refresh_token) {
        throw new Error("No refresh token available");
      }

      console.log("Refreshing access token...");

      // Refresh token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          refresh_token: credential.refresh_token,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();

        // If refresh token is invalid, mark credential as inactive
        await supabase
          .from("gsc_oauth_credentials")
          .update({
            is_active: false,
            last_error: `Refresh failed: ${error}`,
            last_error_at: new Date().toISOString(),
          })
          .eq("id", credentialId);

        throw new Error(`Token refresh failed: ${error}`);
      }

      const tokenData = await tokenResponse.json();

      // Calculate new expiration
      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in || 3600) * 1000
      );

      // Update credential
      await supabase
        .from("gsc_oauth_credentials")
        .update({
          access_token: tokenData.access_token,
          expires_at: expiresAt.toISOString(),
          last_refreshed_at: new Date().toISOString(),
          error_count: 0,
          last_error: null,
        })
        .eq("id", credentialId);

      console.log("Access token refreshed successfully");

      return new Response(
        JSON.stringify({
          success: true,
          message: "Access token refreshed",
          expiresAt: expiresAt.toISOString(),
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        error: "Invalid action. Use ?action=authorize, ?action=callback, or ?action=refresh",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in gsc-oauth function:", error);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
