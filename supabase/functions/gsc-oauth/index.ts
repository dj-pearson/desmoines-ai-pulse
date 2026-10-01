// ============================================================================
// Google Search Console OAuth Edge Function
// ============================================================================
// Purpose: Handle OAuth flow for Google Search Console API
// Returns: OAuth tokens for accessing GSC data
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { requireAdminOrApiKey, type AdminCaller } from "../_shared/apiKeyAuth.ts";

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Rate limiting: 10 requests per 15 minutes per client (SEC-015)
  const rateLimit = checkRateLimit(req, {
    max: 10,
    message: "Too many OAuth requests. Please try again later.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return rateLimit.response;
  }

  // SEO-050: admin-only, like gsc-sync-data and gsc-fetch-properties. This
  // runs as service_role and writes OAuth credentials, and it had no caller
  // check, so any holder of the public anon key could call action=refresh
  // against any credential id. Both callers (OAuthProviderSetup for
  // authorize, AdminGscCallback for callback) already send the admin's
  // session JWT, and no mobile binary calls this function.
  const caller: AdminCaller = { user: null };
  const authFailure = await requireAdminOrApiKey(req, corsHeaders, caller);
  if (authFailure) return authFailure;

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
      const tokenResponse = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
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
        const errorBody = await tokenResponse.text();
        console.error("Token exchange failed — Google response:", errorBody);
        console.error("redirect_uri used:", googleRedirectUri);

        // Parse Google's error for a readable message
        let googleError = "token_exchange_failed";
        let googleErrorDesc = errorBody;
        try {
          const parsed = JSON.parse(errorBody);
          googleError = parsed.error || googleError;
          googleErrorDesc = parsed.error_description || googleErrorDesc;
        } catch { /* not JSON */ }

        return new Response(
          JSON.stringify({
            error: googleError,
            error_description: googleErrorDesc,
            hint: googleError === "redirect_uri_mismatch"
              ? `The GOOGLE_REDIRECT_URI secret (${googleRedirectUri}) must exactly match the authorized redirect URI in Google Cloud Console.`
              : `Google rejected the token exchange. Check Supabase edge function logs for details.`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const tokenData = await tokenResponse.json();

      // Calculate expiration time
      const expiresAt = new Date(
        Date.now() + (tokenData.expires_in || 3600) * 1000
      );

      // requireAdminOrApiKey above resolved the caller. A machine caller
      // (API key / service role) has no user, and its credential is saved
      // without one, as before.
      const userId: string | null = caller.user?.id ?? null;

      console.log(`Saving credentials for user_id: ${userId ?? "machine caller"}`);
      console.log(`Token fields received: access_token=${!!tokenData.access_token}, refresh_token=${!!tokenData.refresh_token}, expires_in=${tokenData.expires_in}`);

      // SEO-050: SAVE FIRST, THEN RETIRE THE OLD ONES. This used to deactivate
      // the user's old credentials and DELETE every gsc_properties row linked
      // to them before inserting the new credential. gsc_keyword_performance
      // and gsc_page_performance reference gsc_properties ON DELETE CASCADE,
      // so a reconnect by the admin who owns the linked credential (all five
      // rows belong to one user, measured 2026-10-01) would have deleted
      // 24,015 keyword rows and 18,598 page rows - a year of history that
      // Search Console no longer retains in full. And a failed insert after
      // the delete left the user with nothing connected at all.
      //
      // Now: insert, re-point that user's properties at the new credential,
      // then deactivate the old credentials. gsc-fetch-properties re-links by
      // property_url as well, so the property row and its history survive.
      const { data: credential, error: insertError } = await supabase
        .from("gsc_oauth_credentials")
        .insert({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? null,
          token_type: tokenData.token_type ?? "Bearer",
          expires_at: expiresAt.toISOString(),
          scope: tokenData.scope ?? null,
          user_id: userId,
          is_active: true,
        })
        // id only: the representation used to be logged in full, which put
        // the access and refresh tokens into the function logs.
        .select("id")
        .single();

      if (insertError || !credential?.id) {
        throw new Error(
          `Failed to save credentials: ${insertError?.message ?? "no row returned"}`
        );
      }

      if (userId) {
        const { data: oldCreds, error: oldCredsError } = await supabase
          .from("gsc_oauth_credentials")
          .select("id")
          .eq("user_id", userId)
          .neq("id", credential.id);

        if (oldCredsError) {
          // The new credential is saved and active; leaving old ones active
          // is untidy, not broken, because sync resolves the credential
          // through gsc_properties.oauth_credential_id.
          console.error("Could not list previous credentials; leaving them active:", oldCredsError.message);
        } else {
          const oldCredIds = (oldCreds ?? []).map((c: { id: string }) => c.id);
          if (oldCredIds.length > 0) {
            const { error: relinkError } = await supabase
              .from("gsc_properties")
              .update({
                oauth_credential_id: credential.id,
                status: "active",
                error_message: null,
                updated_at: new Date().toISOString(),
              })
              .in("oauth_credential_id", oldCredIds);
            if (relinkError) {
              // Do not deactivate what the properties still point at.
              console.error("Could not re-link properties to the new credential; old credentials left active:", relinkError.message);
            } else {
              const { error: deactivateError } = await supabase
                .from("gsc_oauth_credentials")
                .update({ is_active: false })
                .in("id", oldCredIds);
              if (deactivateError) {
                console.error("Could not deactivate previous credentials:", deactivateError.message);
              } else {
                console.log(`Re-linked properties and deactivated ${oldCredIds.length} previous credential(s) for user ${userId}`);
              }
            }
          }
        }
      }

      console.log("OAuth credentials saved successfully, id:", credential.id);

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
      const tokenResponse = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
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
        const errorText = await tokenResponse.text();
        console.error("Token refresh failed:", errorText);

        // If refresh token is invalid, mark credential as inactive
        await supabase
          .from("gsc_oauth_credentials")
          .update({
            is_active: false,
            last_error: `Refresh failed`,
            last_error_at: new Date().toISOString(),
          })
          .eq("id", credentialId);

        throw new Error("Token refresh failed");
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error in gsc-oauth function:", msg);

    return new Response(
      JSON.stringify({
        error: msg || "An internal error occurred during OAuth processing",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
