/**
 * SECURITY: verify_jwt = false
 * Reason: Must accept metrics from unauthenticated visitors to track page views and content engagement
 * Alternative measures: Enum whitelist validation restricts metric types to known safe values
 * Risk level: LOW
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allowed enums to keep data clean
const ALLOWED_METRIC_TYPES = new Set([
  "view",
  "search",
  "click",
  "share",
  "bookmark",
  "hover",
  "scroll",
  "filter",
]);

const ALLOWED_CONTENT_TYPES = new Set([
  "event",
  "restaurant",
  "attraction",
  "playground",
  "page",
  "search_result",
]);

interface MetricEvent {
  content_type: string;
  content_id: string;
  metric_type: string;
  metric_value?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing Supabase env vars");
      return new Response(
        JSON.stringify({ error: "Missing Supabase configuration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const input: MetricEvent | { events: MetricEvent[] } = body;

    const events: MetricEvent[] = Array.isArray((input as any))
      ? (input as MetricEvent[])
      : Array.isArray((input as any).events)
      ? (input as any).events
      : [input as MetricEvent];

    // Validate and normalize
    const rows = events
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        content_type: String(e.content_type || ""),
        content_id: String(e.content_id || ""),
        metric_type: String(e.metric_type || ""),
        metric_value: typeof e.metric_value === "number" ? e.metric_value : 1,
      }))
      .filter(
        (e) =>
          ALLOWED_CONTENT_TYPES.has(e.content_type) &&
          ALLOWED_METRIC_TYPES.has(e.metric_type) &&
          // Basic UUID format check (loosely)
          /[0-9a-fA-F-]{36}/.test(e.content_id),
      );

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "No valid metric events" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upsert aggregated metrics by (content_type, content_id, metric_type, date, hour)
    const { error } = await supabase
      .from("content_metrics")
      .upsert(rows, {
        onConflict: "content_type,content_id,metric_type,date,hour",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("Error upserting content_metrics:", error);
      return new Response(
        JSON.stringify({ error: "Failed to log metrics", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, count: rows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("Unexpected error in log-content-metrics:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
