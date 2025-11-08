// ============================================================================
// GSC Fetch Properties Edge Function
// ============================================================================
// Purpose: Fetch verified Google Search Console properties
// Returns: List of verified properties for the authenticated account
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

    // Check if token is expired
    const expiresAt = new Date(credential.expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      return new Response(
        JSON.stringify({
          error: "Access token expired. Please refresh the token.",
          requiresRefresh: true,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Fetching GSC properties...");

    // Fetch properties from GSC API
    const response = await fetch(
      "https://www.googleapis.com/webmasters/v3/sites",
      {
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();

      // Update error count
      await supabase
        .from("gsc_oauth_credentials")
        .update({
          error_count: (credential.error_count || 0) + 1,
          last_error: error,
          last_error_at: new Date().toISOString(),
        })
        .eq("id", credentialId);

      throw new Error(`GSC API error: ${error}`);
    }

    const data = await response.json();
    const properties = data.siteEntry || [];

    console.log(`Found ${properties.length} properties`);

    // Update last used time
    await supabase
      .from("gsc_oauth_credentials")
      .update({
        last_used_at: new Date().toISOString(),
      })
      .eq("id", credentialId);

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
      const { data: existing } = await supabase
        .from("gsc_properties")
        .select("id")
        .eq("property_url", propertyUrl)
        .single();

      if (existing) {
        // Update existing property
        const { data: updated } = await supabase
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

        savedProperties.push(updated);
      } else {
        // Insert new property
        const { data: inserted } = await supabase
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
    console.error("Error in gsc-fetch-properties function:", error);

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
