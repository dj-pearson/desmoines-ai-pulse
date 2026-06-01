/**
 * Admin Home Stats
 *
 * Returns KPI counts + 7-day deltas + recent admin activity feed for the
 * unified admin home dashboard.
 *
 * Security:
 * - Requires admin or root_admin role
 * - Rate limited
 * - 5-minute server-side Cache-Control header (also drives client staleTime)
 *
 * Story: ADMIN-HOME-001
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  handleCors,
  getCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";

interface KpiTile {
  key: string;
  label: string;
  total: number;
  deltaSevenDay: number;
  href: string;
}

interface ActivityEntry {
  id: string;
  timestamp: string;
  event_type: string;
  action: string | null;
  resource: string | null;
  user_id: string | null;
  severity: string;
  details: Record<string, unknown> | null;
}

interface AdminHomeStatsResponse {
  kpis: KpiTile[];
  activity: ActivityEntry[];
  generatedAt: string;
}

const ADMIN_ROLES = ["admin", "root_admin"] as const;

async function countSince(
  supabase: ReturnType<typeof createClient>,
  table: string,
  column: string,
  since: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .gte(column, since);
  if (error) {
    console.error(`countSince(${table}.${column}) failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

async function totalCount(
  supabase: ReturnType<typeof createClient>,
  table: string,
  filter?: { column: string; value: string },
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    query = query.eq(filter.column, filter.value);
  }
  const { count, error } = await query;
  if (error) {
    console.error(`totalCount(${table}) failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(
    isOriginAllowed(origin) ? origin : undefined,
  );

  // Light rate limit — this is a logged-in admin endpoint; 30 req / 15 min
  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: "Too many stats requests. Please try again shortly.",
  });
  if (!rateLimit.success && rateLimit.response) {
    return addRateLimitHeaders(rateLimit.response, rateLimit);
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (
      !profile ||
      !ADMIN_ROLES.includes(profile.role as typeof ADMIN_ROLES[number])
    ) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Run all count queries in parallel.
    const [
      eventsTotal,
      eventsDelta,
      restaurantsTotal,
      restaurantsDelta,
      articlesTotal,
      articlesDelta,
      signupsDelta,
      pendingSubmissions,
    ] = await Promise.all([
      totalCount(supabase, "events"),
      countSince(supabase, "events", "created_at", sevenDaysAgo),
      totalCount(supabase, "restaurants"),
      countSince(supabase, "restaurants", "created_at", sevenDaysAgo),
      totalCount(supabase, "articles"),
      countSince(supabase, "articles", "created_at", sevenDaysAgo),
      countSince(supabase, "profiles", "created_at", sevenDaysAgo),
      totalCount(supabase, "user_submitted_events", {
        column: "status",
        value: "pending",
      }),
    ]);

    const kpis: KpiTile[] = [
      {
        key: "events",
        label: "Events",
        total: eventsTotal,
        deltaSevenDay: eventsDelta,
        href: "/admin/content",
      },
      {
        key: "restaurants",
        label: "Restaurants",
        total: restaurantsTotal,
        deltaSevenDay: restaurantsDelta,
        href: "/admin/content",
      },
      {
        key: "articles",
        label: "Articles",
        total: articlesTotal,
        deltaSevenDay: articlesDelta,
        href: "/admin/content",
      },
      {
        key: "signups",
        label: "New signups (7d)",
        total: signupsDelta,
        deltaSevenDay: signupsDelta,
        href: "/admin/system",
      },
      {
        key: "pending_submissions",
        label: "Pending event submissions",
        total: pendingSubmissions,
        deltaSevenDay: 0,
        href: "/admin/content",
      },
    ];

    // Recent activity feed: last 20 entries from security_audit_logs.
    const { data: activityRows, error: activityError } = await supabase
      .from("security_audit_logs")
      .select(
        "id, timestamp, event_type, action, resource, user_id, severity, details",
      )
      .order("timestamp", { ascending: false })
      .limit(20);

    if (activityError) {
      console.error("Activity fetch failed:", activityError.message);
    }

    const activity: ActivityEntry[] = (activityRows ?? []).map((row) => ({
      id: row.id as string,
      timestamp: row.timestamp as string,
      event_type: row.event_type as string,
      action: (row.action as string | null) ?? null,
      resource: (row.resource as string | null) ?? null,
      user_id: (row.user_id as string | null) ?? null,
      severity: row.severity as string,
      details: (row.details as Record<string, unknown> | null) ?? null,
    }));

    const body: AdminHomeStatsResponse = {
      kpis,
      activity,
      generatedAt: now.toISOString(),
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("admin-home-stats error:", message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
