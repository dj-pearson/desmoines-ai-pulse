// ============================================================================
// GSC Sync Data Edge Function
// ============================================================================
// Purpose: Sync keyword and page performance data from Google Search Console
// Returns: Summary of synced data
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  propertyId: string;
  dateRange?: number; // Days to sync (default: 28)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { propertyId, dateRange = 28 }: SyncRequest = await req.json();

    if (!propertyId) {
      return new Response(
        JSON.stringify({ error: "propertyId is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Syncing GSC data for property: ${propertyId}`);
    const startTime = Date.now();

    // Get property and credential
    const { data: property, error: propertyError } = await supabase
      .from("gsc_properties")
      .select("*, gsc_oauth_credentials(*)")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property) {
      return new Response(
        JSON.stringify({ error: "Property not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const credential = property.gsc_oauth_credentials;
    if (!credential || !credential.is_active) {
      return new Response(
        JSON.stringify({ error: "No active credential for this property" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check token expiration
    if (new Date(credential.expires_at) <= new Date()) {
      return new Response(
        JSON.stringify({
          error: "Access token expired",
          requiresRefresh: true,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate date range
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 3); // GSC data has 3-day lag
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - dateRange);

    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    console.log(`Syncing data from ${startDateStr} to ${endDateStr}`);

    // Mark property as syncing
    await supabase
      .from("gsc_properties")
      .update({ is_syncing: true })
      .eq("id", propertyId);

    // ========================================================================
    // Sync keyword performance data
    // ========================================================================
    console.log("Fetching keyword performance...");

    const keywordResponse = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        property.property_url
      )}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startDateStr,
          endDate: endDateStr,
          dimensions: ["query", "page", "date"],
          rowLimit: 25000, // Max allowed
        }),
      }
    );

    if (!keywordResponse.ok) {
      const error = await keywordResponse.text();
      throw new Error(`GSC API error: ${error}`);
    }

    const keywordData = await keywordResponse.json();
    const keywordRows = keywordData.rows || [];

    console.log(`Processing ${keywordRows.length} keyword records...`);

    let keywordsSynced = 0;

    for (const row of keywordRows) {
      const query = row.keys[0];
      const pageUrl = row.keys[1];
      const date = row.keys[2];

      // Insert or update keyword performance
      const { error: upsertError } = await supabase
        .from("gsc_keyword_performance")
        .upsert(
          {
            property_id: propertyId,
            query,
            page_url: pageUrl,
            date,
            impressions: row.impressions || 0,
            clicks: row.clicks || 0,
            ctr: row.ctr ? Math.round(row.ctr * 10000) / 100 : 0, // Convert to percentage
            position: row.position ? Math.round(row.position * 100) / 100 : null,
            country: "USA", // Default, could be made dynamic
          },
          {
            onConflict: "property_id,query,date,country",
            ignoreDuplicates: false,
          }
        );

      if (!upsertError) {
        keywordsSynced++;
      }
    }

    // ========================================================================
    // Sync page performance data
    // ========================================================================
    console.log("Fetching page performance...");

    const pageResponse = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
        property.property_url
      )}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: startDateStr,
          endDate: endDateStr,
          dimensions: ["page", "date", "device"],
          rowLimit: 25000,
        }),
      }
    );

    if (!pageResponse.ok) {
      const error = await pageResponse.text();
      throw new Error(`GSC API error (pages): ${error}`);
    }

    const pageData = await pageResponse.json();
    const pageRows = pageData.rows || [];

    console.log(`Processing ${pageRows.length} page records...`);

    let pagesSynced = 0;

    // Group by page and date
    const pagesByPageAndDate = new Map();

    for (const row of pageRows) {
      const pageUrl = row.keys[0];
      const date = row.keys[1];
      const device = row.keys[2]; // MOBILE, DESKTOP, TABLET
      const key = `${pageUrl}|${date}`;

      if (!pagesByPageAndDate.has(key)) {
        pagesByPageAndDate.set(key, {
          pageUrl,
          date,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          position: 0,
          impressionsMobile: 0,
          impressionsDesktop: 0,
          impressionsTablet: 0,
          clicksMobile: 0,
          clicksDesktop: 0,
          clicksTablet: 0,
          count: 0,
        });
      }

      const entry = pagesByPageAndDate.get(key);
      entry.impressions += row.impressions || 0;
      entry.clicks += row.clicks || 0;
      entry.position += row.position || 0;
      entry.count++;

      if (device === "MOBILE") {
        entry.impressionsMobile += row.impressions || 0;
        entry.clicksMobile += row.clicks || 0;
      } else if (device === "DESKTOP") {
        entry.impressionsDesktop += row.impressions || 0;
        entry.clicksDesktop += row.clicks || 0;
      } else if (device === "TABLET") {
        entry.impressionsTablet += row.impressions || 0;
        entry.clicksTablet += row.clicks || 0;
      }
    }

    // Insert aggregated page data
    for (const entry of pagesByPageAndDate.values()) {
      const avgPosition = entry.count > 0 ? entry.position / entry.count : 0;
      const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;

      const { error: upsertError } = await supabase
        .from("gsc_page_performance")
        .upsert(
          {
            property_id: propertyId,
            page_url: entry.pageUrl,
            date: entry.date,
            impressions: entry.impressions,
            clicks: entry.clicks,
            ctr: Math.round(ctr * 100) / 100,
            position: Math.round(avgPosition * 100) / 100,
            impressions_mobile: entry.impressionsMobile,
            impressions_desktop: entry.impressionsDesktop,
            impressions_tablet: entry.impressionsTablet,
            clicks_mobile: entry.clicksMobile,
            clicks_desktop: entry.clicksDesktop,
            clicks_tablet: entry.clicksTablet,
            country: "USA",
          },
          {
            onConflict: "property_id,page_url,date,country",
            ignoreDuplicates: false,
          }
        );

      if (!upsertError) {
        pagesSynced++;
      }
    }

    // ========================================================================
    // Update property with sync status
    // ========================================================================
    const executionTime = Date.now() - startTime;

    await supabase
      .from("gsc_properties")
      .update({
        is_syncing: false,
        last_sync_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId);

    console.log(
      `Sync completed: ${keywordsSynced} keywords, ${pagesSynced} pages in ${executionTime}ms`
    );

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          keywordsSynced,
          pagesSynced,
          dateRange: {
            start: startDateStr,
            end: endDateStr,
            days: dateRange,
          },
          executionTime,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in gsc-sync-data function:", error);

    // Update property sync status on error
    try {
      const { propertyId } = await req.json();
      if (propertyId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        await supabase
          .from("gsc_properties")
          .update({
            is_syncing: false,
            status: "error",
            error_message: error.message,
          })
          .eq("id", propertyId);
      }
    } catch {}

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
