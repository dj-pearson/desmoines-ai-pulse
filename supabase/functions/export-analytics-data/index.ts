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
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { providers, start_date, end_date, format } = await req.json();

    // Get traffic metrics
    let trafficQuery = supabaseClient
      .from("traffic_metrics")
      .select("*")
      .eq("user_id", user.id)
      .gte("metric_date", start_date)
      .lte("metric_date", end_date);

    if (providers.length > 0 && !providers.includes("all")) {
      trafficQuery = trafficQuery.in("provider_name", providers);
    }

    const { data: trafficData } = await trafficQuery;

    // Get search performance
    let searchQuery = supabaseClient
      .from("search_performance")
      .select("*")
      .eq("user_id", user.id)
      .gte("metric_date", start_date)
      .lte("metric_date", end_date);

    if (providers.length > 0 && !providers.includes("all")) {
      searchQuery = searchQuery.in("provider_name", providers);
    }

    const { data: searchData } = await searchQuery;

    // Generate CSV
    const csv = generateCSV(trafficData || [], searchData || []);

    return new Response(
      JSON.stringify({ csv }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Export error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateCSV(trafficData: any[], searchData: any[]): string {
  let csv = "Type,Provider,Date,Metric,Value\n";

  // Traffic metrics
  for (const row of trafficData) {
    csv += `Traffic,${row.provider_name},${row.metric_date},Sessions,${row.sessions}\n`;
    csv += `Traffic,${row.provider_name},${row.metric_date},Users,${row.users}\n`;
    csv += `Traffic,${row.provider_name},${row.metric_date},Pageviews,${row.pageviews}\n`;
    csv += `Traffic,${row.provider_name},${row.metric_date},Bounce Rate,${row.bounce_rate}\n`;
  }

  // Search performance
  for (const row of searchData) {
    csv += `Search,${row.provider_name},${row.metric_date},Query,"${row.query}",Impressions,${row.impressions}\n`;
    csv += `Search,${row.provider_name},${row.metric_date},Query,"${row.query}",Clicks,${row.clicks}\n`;
    csv += `Search,${row.provider_name},${row.metric_date},Query,"${row.query}",CTR,${row.ctr}\n`;
  }

  return csv;
}
