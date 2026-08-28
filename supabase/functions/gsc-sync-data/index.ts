// ============================================================================
// GSC Sync Data Edge Function
// ============================================================================
// Purpose: Sync keyword and page performance data from Google Search Console
// Returns: Summary of synced data
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

import { errorResponse } from "../_shared/errorResponse.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

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

  // Runs as service_role and had no caller check. verify_jwt is not a gate:
  // it defaults to true, and true only means "a valid Supabase JWT" - which
  // the publishable anon key is, in every client bundle.
  //
  // Every caller is admin-gated already: SearchTrafficDashboard, mounted at
  // /admin/analytics-dashboard behind <ProtectedRoute requireAdmin>. No cron job posts here.
  // So the route assumed admin and the server did not enforce it; the admin
  // JWT that functions.invoke sends is what requireAdminOrApiKey checks.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  let propertyId: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SyncRequest = await req.json();
    propertyId = body.propertyId;
    const dateRange = body.dateRange ?? 28;

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

      // Persist refreshed token
      await supabase
        .from("gsc_oauth_credentials")
        .update({
          access_token: refreshData.access_token,
          expires_at: newExpiresAt.toISOString(),
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", credential.id);

      credential.access_token = refreshData.access_token;
      console.log("Token refreshed successfully, new expiry:", newExpiresAt.toISOString());
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

    // Use ["query", "date"] only — adding "page" creates an explosion of rows
    // (same keyword × many pages × many dates) that causes timeouts.
    const keywordResponse = await fetchWithTimeout(
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
          dimensions: ["query", "date"],
          rowLimit: 1000, // Top 1000 queries per day range is sufficient for analytics
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
    const BATCH_SIZE = 500;

    // Build records array
    const keywordRecords = keywordRows.map((row: any) => ({
      property_id: propertyId,
      query: row.keys[0],
      page_url: null,
      date: row.keys[1],
      impressions: row.impressions || 0,
      clicks: row.clicks || 0,
      ctr: row.ctr ? Math.round(row.ctr * 10000) / 100 : 0,
      position: row.position ? Math.round(row.position * 100) / 100 : null,
      country: "USA",
    }));

    // Batch upserts — dramatically faster than one-at-a-time
    for (let i = 0; i < keywordRecords.length; i += BATCH_SIZE) {
      const batch = keywordRecords.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("gsc_keyword_performance")
        .upsert(batch, {
          onConflict: "property_id,query,date,country",
          ignoreDuplicates: false,
        });

      if (!upsertError) {
        keywordsSynced += batch.length;
      } else {
        console.error(`Keyword batch ${i / BATCH_SIZE + 1} error:`, upsertError.message);
      }
    }

    // ========================================================================
    // Sync page performance data
    // ========================================================================
    console.log("Fetching page performance...");

    const pageResponse = await fetchWithTimeout(
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

    // Build aggregated page records and batch upsert
    const pageRecords = Array.from(pagesByPageAndDate.values()).map((entry: any) => {
      const avgPosition = entry.count > 0 ? entry.position / entry.count : 0;
      const ctr = entry.impressions > 0 ? (entry.clicks / entry.impressions) * 100 : 0;
      return {
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
      };
    });

    for (let i = 0; i < pageRecords.length; i += BATCH_SIZE) {
      const batch = pageRecords.slice(i, i + BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from("gsc_page_performance")
        .upsert(batch, {
          onConflict: "property_id,page_url,date,country",
          ignoreDuplicates: false,
        });

      if (!upsertError) {
        pagesSynced += batch.length;
      } else {
        console.error(`Page batch ${i / BATCH_SIZE + 1} error:`, upsertError.message);
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

    // Update property sync status on error (use already-parsed propertyId from outer scope)
    if (propertyId) {
      try {
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
      } catch { /* best-effort cleanup */ }
    }

    return errorResponse(error, {
      status: 500,
      headers: corsHeaders,
      logContext: "gsc-sync-data",
    });
  }
});
