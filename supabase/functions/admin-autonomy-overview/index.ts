/**
 * Admin Autonomy Overview
 *
 * Single aggregate endpoint behind the Admin Autonomy Dashboard (WEB-AUTO-014).
 * Answers one question — "is anything waiting on a human?" — by collecting, in
 * one server round-trip, every human-exception queue depth, automation job
 * health, the data-quality KPI, per-pipeline auto-approval rates, and recent
 * automation alerts. The web client makes ONE call instead of ~10.
 *
 * Security:
 * - Requires a verified admin / root_admin JWT (mirrors admin-home-stats).
 * - Light in-memory rate limit (this is a logged-in admin endpoint).
 * - Every sub-query is individually fault-tolerant: a missing table / view or a
 *   pipeline that hasn't shipped yet degrades that one section to a zero/empty
 *   value rather than failing the whole dashboard ("feature-tolerant queries").
 *
 * Story: WEB-AUTO-014
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  handleCors,
  getCorsHeaders,
  isOriginAllowed,
} from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";

type SupaClient = ReturnType<typeof createClient>;

const ADMIN_ROLES = ["admin", "root_admin"] as const;

interface QueueTile {
  key: string;
  label: string;
  count: number;
  /** True when these rows are genuinely waiting on a human decision. */
  needsHuman: boolean;
  href: string;
  /** Optional small sample (e.g. pending submissions with AI scores). */
  sample?: Array<Record<string, unknown>>;
}

interface JobHealthTile {
  job_name: string;
  last_status: string | null;
  last_run_at: string | null;
  runs_7d: number;
  successes_7d: number;
}

interface RateTile {
  key: string;
  label: string;
  approved: number;
  total: number;
  /** 0-100, or null when nothing has been decided in the window. */
  ratePercent: number | null;
}

interface AlertEntry {
  job_name: string;
  error: string | null;
  finished_at: string | null;
}

interface OverviewResponse {
  queues: QueueTile[];
  needsHumanTotal: number;
  jobHealth: {
    total: number;
    healthy: number;
    failing: number;
    jobs: JobHealthTile[];
  };
  dataQuality:
    | Record<string, { missingCoords: number; missingSeo: number; missingImage: number }>
    | null;
  autoApprovalRates: RateTile[];
  alerts: AlertEntry[];
  generatedAt: string;
}

/** Count rows matching an optional eq/neq filter; never throws. */
async function safeCount(
  supabase: SupaClient,
  table: string,
  build: (q: ReturnType<SupaClient["from"]>) => unknown,
): Promise<number> {
  try {
    const base = supabase.from(table).select("*", { count: "exact", head: true });
    const { count, error } = (await build(base as never)) as {
      count: number | null;
      error: { message: string } | null;
    };
    if (error) {
      console.warn(`safeCount(${table}) failed:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    console.warn(`safeCount(${table}) threw:`, e instanceof Error ? e.message : e);
    return 0;
  }
}

const num = (m: Record<string, unknown>, k: string): number =>
  typeof m[k] === "number" ? (m[k] as number) : 0;

/**
 * Per-pipeline reducer: turn one run's metadata into {approved, total}.
 * Handles both batch ("sweep") runs (which carry count fields) and single
 * real-time runs (which carry a `decision` string). Unknown shapes contribute
 * nothing, so a pipeline that changes its metadata never breaks the dashboard.
 */
type Reducer = (m: Record<string, unknown>) => { approved: number; total: number };

const decisionBucket = (
  m: Record<string, unknown>,
  approvedVals: string[],
  decidedVals: string[],
): { approved: number; total: number } => {
  const d = typeof m.decision === "string" ? m.decision : null;
  if (!d) return { approved: 0, total: 0 };
  return {
    approved: approvedVals.includes(d) ? 1 : 0,
    total: decidedVals.includes(d) ? 1 : 0,
  };
};

const PIPELINES: Array<{ job: string; label: string; reduce: Reducer }> = [
  {
    job: "triage-event-submission",
    label: "Event triage",
    reduce: (m) => decisionBucket(m, ["approved"], ["approved", "rejected", "pending"]),
  },
  {
    job: "moderate-content",
    label: "UGC moderation",
    reduce: (m) => {
      const total =
        num(m, "approved") + num(m, "rejected") + num(m, "flagged") + num(m, "pending");
      if (total > 0) return { approved: num(m, "approved"), total };
      return decisionBucket(m, ["approved"], ["approved", "rejected", "flagged", "pending"]);
    },
  },
  {
    job: "review-campaign-creative",
    label: "Creative review",
    reduce: (m) => {
      const total = num(m, "approved") + num(m, "failed");
      if (total > 0) return { approved: num(m, "approved"), total };
      // retry = still in flight → not counted as decided.
      return decisionBucket(m, ["approved"], ["approved", "failed"]);
    },
  },
  {
    job: "dedupe-content",
    label: "Duplicate merge",
    reduce: (m) => {
      const total = num(m, "autoMerged") + num(m, "queued");
      return { approved: num(m, "autoMerged"), total };
    },
  },
  {
    job: "auto-article-pipeline",
    label: "Article pipeline",
    reduce: (m) => decisionBucket(m, ["published"], ["published", "draft", "discarded"]),
  },
];

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  const rateLimit = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: "Too many dashboard requests. Please try again shortly.",
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

    // --- AuthN/AuthZ: verified admin JWT only (mirrors admin-home-stats) -----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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
    if (!profile || !ADMIN_ROLES.includes(profile.role as typeof ADMIN_ROLES[number])) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // --- Queue depths (parallel, fault-tolerant) ----------------------------
    const [
      pendingSubmissions,
      moderationRatings,
      moderationContact,
      mergeReview,
      creativeApprovals,
    ] = await Promise.all([
      safeCount(supabase, "user_submitted_events", (q) => q.eq("status", "pending")),
      safeCount(supabase, "user_ratings", (q) => q.neq("moderation_status", "approved")),
      safeCount(supabase, "contact_submissions", (q) => q.neq("moderation_status", "approved")),
      safeCount(supabase, "content_merge_candidates", (q) => q.eq("status", "pending")),
      safeCount(supabase, "campaign_creatives", (q) => q.eq("is_approved", false)),
    ]);

    // Small sample of pending submissions WITH their AI scores.
    let submissionSample: Array<Record<string, unknown>> = [];
    try {
      const { data } = await supabase
        .from("user_submitted_events")
        .select("id, title, quality_score, created_at")
        .eq("status", "pending")
        .order("quality_score", { ascending: false, nullsFirst: false })
        .limit(5);
      submissionSample = (data ?? []) as Array<Record<string, unknown>>;
    } catch (_e) {
      submissionSample = [];
    }

    const queues: QueueTile[] = [
      {
        key: "event_submissions",
        label: "Pending event submissions",
        count: pendingSubmissions,
        needsHuman: true,
        href: "/admin/event-submissions",
        sample: submissionSample,
      },
      {
        key: "moderation",
        label: "Flagged reviews & messages",
        count: moderationRatings + moderationContact,
        needsHuman: true,
        href: "/admin/content?tab=moderation",
      },
      {
        key: "merge_review",
        label: "Duplicate merge review",
        count: mergeReview,
        needsHuman: true,
        href: "/admin/content?tab=duplicates",
      },
      {
        key: "creative_approvals",
        label: "Ad creatives awaiting approval",
        count: creativeApprovals,
        needsHuman: true,
        href: "/admin/campaigns",
      },
    ];
    const needsHumanTotal = queues
      .filter((q) => q.needsHuman)
      .reduce((sum, q) => sum + q.count, 0);

    // --- Job health (single view query) -------------------------------------
    let jobs: JobHealthTile[] = [];
    try {
      const { data } = await supabase
        .from("automation_job_health")
        .select("job_name, last_status, last_run_at, runs_7d, successes_7d")
        .order("last_run_at", { ascending: false });
      jobs = (data ?? []) as unknown as JobHealthTile[];
    } catch (_e) {
      jobs = [];
    }
    const failing = jobs.filter((j) => j.last_status === "failed").length;
    const jobHealth = {
      total: jobs.length,
      healthy: jobs.filter((j) => j.last_status === "success").length,
      failing,
      jobs,
    };

    // --- Data-quality KPI (latest data-quality-heal run metadata) ------------
    let dataQuality: OverviewResponse["dataQuality"] = null;
    try {
      const { data } = await supabase
        .from("automation_job_runs")
        .select("metadata")
        .eq("job_name", "data-quality-heal")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const meta = (data as { metadata?: { kpi?: OverviewResponse["dataQuality"] } } | null)
        ?.metadata;
      dataQuality = meta?.kpi ?? null;
    } catch (_e) {
      dataQuality = null;
    }

    // --- Per-pipeline auto-approval rates (last 7 days) ---------------------
    const autoApprovalRates: RateTile[] = await Promise.all(
      PIPELINES.map(async (p) => {
        let approved = 0;
        let total = 0;
        try {
          const { data } = await supabase
            .from("automation_job_runs")
            .select("metadata")
            .eq("job_name", p.job)
            .gte("started_at", sevenDaysAgo)
            .limit(500);
          for (const row of (data ?? []) as Array<{ metadata: unknown }>) {
            const m = (row.metadata ?? {}) as Record<string, unknown>;
            const b = p.reduce(m);
            approved += b.approved;
            total += b.total;
          }
        } catch (_e) {
          /* leave at 0 */
        }
        return {
          key: p.job,
          label: p.label,
          approved,
          total,
          ratePercent: total > 0 ? Math.round((approved / total) * 100) : null,
        };
      }),
    );

    // --- Recent automation alerts (terminal failures, last 7 days) ----------
    let alerts: AlertEntry[] = [];
    try {
      const { data } = await supabase
        .from("automation_job_runs")
        .select("job_name, error, finished_at")
        .eq("status", "failed")
        .gte("started_at", sevenDaysAgo)
        .order("finished_at", { ascending: false })
        .limit(10);
      alerts = (data ?? []) as unknown as AlertEntry[];
    } catch (_e) {
      alerts = [];
    }

    const body: OverviewResponse = {
      queues,
      needsHumanTotal,
      jobHealth,
      dataQuality,
      autoApprovalRates,
      alerts,
      generatedAt: now.toISOString(),
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=20",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("admin-autonomy-overview error:", message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
