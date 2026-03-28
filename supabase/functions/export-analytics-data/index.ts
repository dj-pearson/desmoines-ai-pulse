import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, getCorsHeaders, isOriginAllowed } from "../_shared/cors.ts";

/**
 * Escape a CSV value to prevent formula injection (SEC-023).
 * Prefixes cells starting with =, +, -, @, | with a single quote.
 * Wraps values containing commas, newlines, or quotes in double quotes.
 */
function csvEscapeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);

  // Prevent formula injection
  const formulaChars = ['=', '+', '-', '@', '|'];
  let escaped = str;
  if (formulaChars.some(c => escaped.startsWith(c))) {
    escaped = `'${escaped}`;
  }

  // Quote fields containing commas, newlines, or double quotes
  if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
    escaped = `"${escaped.replace(/"/g, '""')}"`;
  }

  return escaped;
}

/**
 * Validate date range parameters.
 */
function validateDateRange(startDate: string, endDate: string): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

  // Max 1 year range
  const maxRange = 365 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxRange) return false;

  return true;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { providers, start_date, end_date, format } = await req.json();

    // Validate date range (SEC-012)
    if (!start_date || !end_date || !validateDateRange(start_date, end_date)) {
      return new Response(
        JSON.stringify({ error: "Invalid date range. Provide valid dates within a 1-year range." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Generate CSV with injection protection
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
      JSON.stringify({ error: "Failed to export analytics data" }),
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
    const provider = csvEscapeValue(row.provider_name);
    const date = csvEscapeValue(row.metric_date);
    csv += `Traffic,${provider},${date},Sessions,${csvEscapeValue(row.sessions)}\n`;
    csv += `Traffic,${provider},${date},Users,${csvEscapeValue(row.users)}\n`;
    csv += `Traffic,${provider},${date},Pageviews,${csvEscapeValue(row.pageviews)}\n`;
    csv += `Traffic,${provider},${date},Bounce Rate,${csvEscapeValue(row.bounce_rate)}\n`;
  }

  // Search performance
  for (const row of searchData) {
    const provider = csvEscapeValue(row.provider_name);
    const date = csvEscapeValue(row.metric_date);
    const query = csvEscapeValue(row.query);
    csv += `Search,${provider},${date},Query,${query},Impressions,${csvEscapeValue(row.impressions)}\n`;
    csv += `Search,${provider},${date},Query,${query},Clicks,${csvEscapeValue(row.clicks)}\n`;
    csv += `Search,${provider},${date},Query,${query},CTR,${csvEscapeValue(row.ctr)}\n`;
  }

  return csv;
}
