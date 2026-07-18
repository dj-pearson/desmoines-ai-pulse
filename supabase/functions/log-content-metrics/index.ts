/**
 * SECURITY: verify_jwt = false
 * Reason: Must accept metrics from unauthenticated visitors to track page views and content engagement
 * Alternative measures: rate limit + batch cap + metric_value clamp + enum allowlist (WEB-SEC-022)
 * Risk level: LOW
 *
 * Staying unauthenticated is correct — page-view tracking has to work for
 * anonymous visitors, so adding an auth guard here would simply delete the
 * feature. What was missing was any bound at all: this was the only
 * verify_jwt=false function in the project with no rate limit (geocode-location,
 * image-transform, og-image and version-check are all limited), it accepted an
 * unbounded `events` array, and it took an attacker-controlled `metric_value`
 * — then wrote all of it with the SERVICE-ROLE key. One request could drive an
 * arbitrary number of privileged upserts.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";

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

/**
 * Max events accepted per request. The only caller (src/hooks/useAnalytics.ts)
 * flushes its queue every 10s, so a real batch is a handful of interactions;
 * 100 is far above any legitimate flush while still bounding one request to a
 * fixed number of privileged upserts. Excess events are dropped, not rejected —
 * failing the whole batch would lose good data over one bad client.
 */
const MAX_EVENTS_PER_REQUEST = 100;

/**
 * metric_value is client-supplied. The real client always sends 1; the clamp
 * exists so a hostile caller cannot write an arbitrarily large number into a
 * counter the admin analytics dashboard reads.
 */
const MAX_METRIC_VALUE = 1000;

/**
 * Deliberately loose. This limit is keyed by IP (there is no verified user on
 * an anonymous endpoint), and the caller flushes every 10s — that is ~90
 * requests per 15-minute window PER TAB. Shared NAT (offices, campuses, cafes)
 * multiplies that across unrelated visitors, so a tight limit would silently
 * delete analytics for exactly the busiest real traffic. 600 still bounds a
 * single IP to a fixed ceiling instead of the previous unlimited.
 */
const RATE_LIMIT_MAX = 600;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const rateLimit = checkRateLimit(req, {
    max: RATE_LIMIT_MAX,
    endpoint: "log-content-metrics",
    message: "Metrics rate limit exceeded.",
  });
  if (!rateLimit.success) return rateLimit.response!;

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

    // Three accepted shapes, all still supported: a bare array, {events: [...]},
    // or a single event object. The declared union previously omitted the array
    // form, so `deno check` failed on this file — the casts hid it at runtime
    // but the type error was real and pre-existing.
    const body: unknown = await req.json().catch(() => ({}));

    const events: MetricEvent[] = Array.isArray(body)
      ? (body as MetricEvent[])
      : Array.isArray((body as { events?: unknown })?.events)
      ? ((body as { events: MetricEvent[] }).events)
      : [body as MetricEvent];

    // Validate and normalize. The slice bounds how many privileged upserts a
    // single request can drive; the clamp bounds what any one of them can write.
    const rows = events
      .slice(0, MAX_EVENTS_PER_REQUEST)
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        content_type: String(e.content_type || ""),
        content_id: String(e.content_id || ""),
        metric_type: String(e.metric_type || ""),
        metric_value:
          typeof e.metric_value === "number" && Number.isFinite(e.metric_value)
            ? Math.min(Math.max(Math.trunc(e.metric_value), 0), MAX_METRIC_VALUE)
            : 1,
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
