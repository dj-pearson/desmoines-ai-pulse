/**
 * SECURITY: verify_jwt = false
 * Reason: Must accept anonymous, sampled Real-User-Monitoring (RUM) web-vitals
 * beacons sent via navigator.sendBeacon (which cannot attach an Authorization
 * header). Same public-by-design posture as log-content-metrics.
 * Alternative measures: strict enum/range validation on every field, a small
 * per-request batch cap, no PII collected, RLS admin-read only on the table.
 * Risk level: LOW (write-only telemetry; nothing is reflected back).
 *
 * WEB-PERF-007.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Core Web Vitals + supporting metrics we accept.
const ALLOWED_METRICS = new Set(["LCP", "CLS", "INP", "TTFB", "FCP"]);

// Normalized route buckets the client may report. Anything else is coerced to
// "other" so the table stays clean and the page-group cardinality is bounded.
const ALLOWED_PAGE_GROUPS = new Set([
  "home",
  "events-list",
  "event-detail",
  "restaurants-list",
  "restaurant-detail",
  "attractions-list",
  "attraction-detail",
  "articles-list",
  "article-detail",
  "playgrounds",
  "trip-planner",
  "search",
  "auth",
  "profile",
  "dashboard",
  "admin",
  "other",
]);

const ALLOWED_RATINGS = new Set(["good", "needs-improvement", "poor"]);
const ALLOWED_NAV_TYPES = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back_forward",
  "prerender",
  "restore",
]);

const MAX_BATCH = 20;
// Generous upper bound (ms) — anything beyond this is a bogus/overflow value.
const MAX_VALUE = 3_600_000;

interface VitalSample {
  metric: string;
  value: number;
  rating?: string;
  page_group?: string;
  navigation_type?: string;
  connection_type?: string;
}

function clean(s: unknown, max = 40): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max);
  return t.length ? t : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      // Never surface internals to an anonymous caller.
      return new Response(JSON.stringify({ success: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // sendBeacon sends a text/plain Blob (to avoid a CORS preflight it cannot
    // perform), so parse the raw text as JSON rather than relying on req.json().
    const raw = await req.text();
    let body: unknown = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    const samples: VitalSample[] = Array.isArray(body)
      ? (body as VitalSample[])
      : Array.isArray((body as { samples?: VitalSample[] }).samples)
        ? (body as { samples: VitalSample[] }).samples
        : [body as VitalSample];

    const rows = samples
      .slice(0, MAX_BATCH)
      .filter((s) => s && typeof s === "object")
      .map((s) => {
        const metric = clean(s.metric, 8);
        const value = typeof s.value === "number" ? s.value : Number(s.value);
        const rating = clean(s.rating, 20);
        const pageGroup = clean(s.page_group, 40);
        const navType = clean(s.navigation_type, 20);
        const conn = clean(s.connection_type, 12);
        return {
          metric: metric && ALLOWED_METRICS.has(metric) ? metric : null,
          value,
          rating: rating && ALLOWED_RATINGS.has(rating) ? rating : null,
          page_group:
            pageGroup && ALLOWED_PAGE_GROUPS.has(pageGroup) ? pageGroup : "other",
          navigation_type:
            navType && ALLOWED_NAV_TYPES.has(navType) ? navType.replace("_", "-") : null,
          connection_type: conn,
        };
      })
      .filter(
        (s): s is {
          metric: string;
          value: number;
          rating: string | null;
          page_group: string;
          navigation_type: string | null;
          connection_type: string | null;
        } =>
          s.metric !== null &&
          Number.isFinite(s.value) &&
          s.value >= 0 &&
          s.value <= MAX_VALUE,
      );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: true, count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await supabase.from("web_vitals_samples").insert(rows);
    if (error) {
      console.error("web-vitals-collector insert failed:", error.message);
      return new Response(JSON.stringify({ success: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("web-vitals-collector error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
