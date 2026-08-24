// ============================================================================
// GSC Fetch Properties Edge Function
// ============================================================================
// Purpose: Fetch verified Google Search Console properties
// Returns: List of verified properties for the authenticated account
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { credentialId } = await req.json();

    if (!credentialId) {
      return new Response(
        JSON.stringify({ error: "credentialId is required" }),
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
      .eq("is_active", true)
      .single();

    if (fetchError || !credential) {
      return new Response(
        JSON.stringify({ error: "Invalid or inactive credential" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Auto-refresh token if expired
    if (new Date(credential.expires_at) <= new Date()) {
      console.log("Access token expired — attempting refresh...");

      if (!credential.refresh_token) {
        return new Response(
          JSON.stringify({
            error: "Access token expired and no refresh token available. Please reconnect.",
            requiresRefresh: true,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

      const refreshResponse = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: googleClientId!,
          client_secret: googleClientSecret!,
          refresh_token: credential.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!refreshResponse.ok) {
        const refreshError = await refreshResponse.text();
        console.error("Token refresh failed:", refreshError);
        return new Response(
          JSON.stringify({
            error: "Token refresh failed — please reconnect Google Search Console.",
            details: refreshError,
            requiresRefresh: true,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const refreshData = await refreshResponse.json();
      const newExpiresAt = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000);

      await supabase
        .from("gsc_oauth_credentials")
        .update({
          access_token: refreshData.access_token,
          expires_at: newExpiresAt.toISOString(),
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", credentialId);

      credential.access_token = refreshData.access_token;
      console.log("Token refreshed successfully, new expiry:", newExpiresAt.toISOString());
    }

    console.log(`Fetching GSC properties for credential ${credentialId}...`);

    // Fetch properties from GSC API
    const response = await fetchWithTimeout(
      "https://www.googleapis.com/webmasters/v3/sites",
      {
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`GSC API response status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("GSC API error body:", errorBody);

      // Record the error on the credential but don't fail the whole flow —
      // the OAuth connection succeeded; the user can sync properties later.
      await supabase
        .from("gsc_oauth_credentials")
        .update({
          error_count: (credential.error_count || 0) + 1,
          last_error: errorBody,
          last_error_at: new Date().toISOString(),
        })
        .eq("id", credentialId);

      return new Response(
        JSON.stringify({
          success: true,
          properties: [],
          count: 0,
          warning: `GSC API returned ${response.status}. Check that the Search Console API is enabled in your Google Cloud project and that your account has verified properties.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const allProperties = data.siteEntry || [];

    console.log(`Found ${allProperties.length} total properties in GSC account`);

    // Filter to only the target site domain so we don't import other verified sites
    const siteUrl = Deno.env.get("SITE_URL") || Deno.env.get("VITE_SITE_URL") || "";
    const siteDomain = siteUrl
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/\/$/, "")
      .toLowerCase();

    const properties = siteDomain
      ? allProperties.filter((p: any) => {
          const propUrl = (p.siteUrl || "").toLowerCase();
          return propUrl.includes(siteDomain);
        })
      : allProperties;

    console.log(
      `Filtered to ${properties.length} properties matching domain "${siteDomain}" (SITE_URL=${siteUrl})`
    );

    // Update last used time
    await supabase
      .from("gsc_oauth_credentials")
      .update({
        last_used_at: new Date().toISOString(),
      })
      .eq("id", credentialId);

    // Remove any existing properties for this credential that are NOT in the filtered list
    // (cleans up properties from previous unfiltered runs)
    const keepUrls = properties.map((p: any) => p.siteUrl);
    const { data: existingProps, error: existingPropsError } = await supabase
      .from("gsc_properties")
      .select("id, property_url")
      .eq("oauth_credential_id", credentialId);

    // Logged rather than thrown: an unreadable list means the CLEANUP does not
    // run - `idsToRemove` comes out empty and nothing is deleted, which is the
    // safe direction - but the sync below is the primary work and should still
    // happen. What was wrong is that a skipped cleanup was indistinguishable
    // from a cleanup with nothing to do, so stale properties would accumulate
    // silently.
    if (existingPropsError) {
      console.error("[gsc-fetch-properties] could not list existing properties; skipping cleanup:", existingPropsError.message);
    }

    const idsToRemove = (existingProps || [])
      .filter((ep: any) => !keepUrls.includes(ep.property_url))
      .map((ep: any) => ep.id);

    if (idsToRemove.length > 0) {
      await supabase.from("gsc_properties").delete().in("id", idsToRemove);
      console.log(`Removed ${idsToRemove.length} non-target properties from previous runs`);
    }

    // Save properties to database
    const savedProperties = [];

    for (const property of properties) {
      const propertyUrl = property.siteUrl;
      const permissionLevel = property.permissionLevel;

      // Determine property type
      let propertyType = "URL_PREFIX";
      if (propertyUrl.startsWith("sc-domain:")) {
        propertyType = "DOMAIN";
      }

      // Check if property already exists
      // PGRST116 IS THE SUCCESS CASE. .single() reports "no rows" as an error,
      // and no rows is exactly what "this property is new" looks like. Any
      // other error used to land in the same place, because the result was
      // destructured without `error`: existing came back null and the else
      // branch INSERTED, so a transient read failure created a duplicate
      // gsc_properties row for a property that was already there.
      const { data: existing, error: existingError } = await supabase
        .from("gsc_properties")
        .select("id")
        .eq("property_url", propertyUrl)
        .single();

      if (existingError && existingError.code !== "PGRST116") {
        throw new Error(`Could not check for existing property ${propertyUrl}: ${existingError.message}`);
      }

      if (existing) {
        // Update existing property
        const { data: updated, error: updatedError } = await supabase
          .from("gsc_properties")
          .update({
            property_type: propertyType,
            permission_level: permissionLevel,
            is_verified: true,
            oauth_credential_id: credentialId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        // savedProperties becomes the response's list of what was saved. A
        // failed update pushed NULL into it, so the caller was told a property
        // had been synced and handed nothing.
        if (updatedError) {
          throw new Error(`Could not update property ${propertyUrl}: ${updatedError.message}`);
        }
        savedProperties.push(updated);
      } else {
        // Insert new property
        const { data: inserted, error: insertedError } = await supabase
          .from("gsc_properties")
          .insert({
            property_url: propertyUrl,
            property_type: propertyType,
            permission_level: permissionLevel,
            is_verified: true,
            oauth_credential_id: credentialId,
            sync_enabled: true,
            sync_frequency_hours: 24,
          })
          .select()
          .single();

        if (insertedError) {
          throw new Error(`Could not insert property ${propertyUrl}: ${insertedError.message}`);
        }
        savedProperties.push(inserted);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        properties: savedProperties,
        count: savedProperties.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error in gsc-fetch-properties function:", msg);

    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
