import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  providers: string[];
  start_date: string;
  end_date: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get the user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { providers, start_date, end_date }: SyncRequest = await req.json();

    let totalRecordsSynced = 0;
    let providerssynced = 0;

    // Create sync jobs for each provider
    for (const providerName of providers) {
      try {
        // Get OAuth token for this provider
        const { data: tokenData, error: tokenError } = await supabaseClient
          .from("user_oauth_tokens")
          .select("*")
          .eq("user_id", user.id)
          .eq("provider_name", providerName)
          .single();

        if (tokenError || !tokenData) {
          console.error(`No token found for ${providerName}`);
          continue;
        }

        // Check if token is expired and refresh if needed
        if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
          console.log(`Token expired for ${providerName}, refreshing...`);
          // TODO: Implement token refresh
        }

        // Create sync job
        const { data: jobData, error: jobError } = await supabaseClient
          .from("analytics_sync_jobs")
          .insert({
            user_id: user.id,
            provider_name: providerName,
            property_id: tokenData.property_id,
            job_type: "incremental_sync",
            status: "running",
            start_date,
            end_date,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (jobError) {
          console.error(`Failed to create job for ${providerName}:`, jobError);
          continue;
        }

        let recordsSynced = 0;

        // Sync data based on provider
        switch (providerName) {
          case "google_analytics":
            recordsSynced = await syncGoogleAnalytics(
              supabaseClient,
              user.id,
              tokenData,
              start_date,
              end_date
            );
            break;
          case "google_search_console":
            recordsSynced = await syncGoogleSearchConsole(
              supabaseClient,
              user.id,
              tokenData,
              start_date,
              end_date
            );
            break;
          case "bing_webmaster":
            recordsSynced = await syncBingWebmaster(
              supabaseClient,
              user.id,
              tokenData,
              start_date,
              end_date
            );
            break;
          case "yandex_webmaster":
            recordsSynced = await syncYandexWebmaster(
              supabaseClient,
              user.id,
              tokenData,
              start_date,
              end_date
            );
            break;
        }

        // Update sync job
        await supabaseClient
          .from("analytics_sync_jobs")
          .update({
            status: "completed",
            records_synced: recordsSynced,
            completed_at: new Date().toISOString(),
          })
          .eq("id", jobData.id);

        totalRecordsSynced += recordsSynced;
        providerssynced++;
      } catch (error) {
        console.error(`Error syncing ${providerName}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        providers_synced: providerssynced,
        records_synced: totalRecordsSynced,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Sync functions for each provider
async function syncGoogleAnalytics(
  supabaseClient: any,
  userId: string,
  tokenData: any,
  startDate: string,
  endDate: string
): Promise<number> {
  // Make API call to Google Analytics
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${tokenData.property_id}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }, { name: "deviceCategory" }, { name: "country" }],
        metrics: [
          { name: "sessions" },
          { name: "totalUsers" },
          { name: "screenPageViews" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Google Analytics API error: ${response.statusText}`);
  }

  const data = await response.json();

  // Process and insert data
  let recordsInserted = 0;
  for (const row of data.rows || []) {
    const date = row.dimensionValues[0].value;
    const deviceCategory = row.dimensionValues[1].value;
    const country = row.dimensionValues[2].value;
    const sessions = parseInt(row.metricValues[0].value);
    const users = parseInt(row.metricValues[1].value);
    const pageviews = parseInt(row.metricValues[2].value);
    const bounceRate = parseFloat(row.metricValues[3].value);
    const avgSessionDuration = parseFloat(row.metricValues[4].value);

    const { error } = await supabaseClient.from("traffic_metrics").upsert({
      user_id: userId,
      provider_name: "google_analytics",
      property_id: tokenData.property_id,
      metric_date: date,
      sessions,
      users,
      pageviews,
      bounce_rate: bounceRate,
      avg_session_duration: avgSessionDuration,
      device_category: deviceCategory,
      country,
    });

    if (!error) recordsInserted++;
  }

  return recordsInserted;
}

async function syncGoogleSearchConsole(
  supabaseClient: any,
  userId: string,
  tokenData: any,
  startDate: string,
  endDate: string
): Promise<number> {
  const siteUrl = tokenData.property_id;

  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      siteUrl
    )}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["date", "query", "page", "device", "country"],
        rowLimit: 25000,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Search Console API error: ${response.statusText}`);
  }

  const data = await response.json();

  let recordsInserted = 0;
  for (const row of data.rows || []) {
    const { error } = await supabaseClient.from("search_performance").upsert({
      user_id: userId,
      provider_name: "google_search_console",
      property_id: siteUrl,
      metric_date: row.keys[0],
      query: row.keys[1],
      page: row.keys[2],
      device: row.keys[3],
      country: row.keys[4],
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr * 100,
      position: row.position,
    });

    if (!error) recordsInserted++;
  }

  return recordsInserted;
}

async function syncBingWebmaster(
  supabaseClient: any,
  userId: string,
  tokenData: any,
  startDate: string,
  endDate: string
): Promise<number> {
  // Bing Webmaster Tools API implementation
  // Note: Bing API might have different endpoint structure
  return 0; // Placeholder
}

async function syncYandexWebmaster(
  supabaseClient: any,
  userId: string,
  tokenData: any,
  startDate: string,
  endDate: string
): Promise<number> {
  // Yandex Webmaster API implementation
  return 0; // Placeholder
}
