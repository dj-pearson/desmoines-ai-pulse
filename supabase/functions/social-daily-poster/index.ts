/**
 * social-daily-poster (WEB-AUTO-012)
 *
 * Zero-touch daily social posting. Owns SELECTION + OBSERVABILITY + PAUSE while
 * delegating copy generation + webhook publishing to the existing
 * social-media-manager function (called with the additive `targetContentId`):
 *
 *   - Picks the highest-signal upcoming event (featured first, then soonest) and
 *     a featured/popular restaurant, each NOT posted in the last 30 days.
 *   - Skips per content type when paused via the `social_daily_poster` row in
 *     system_settings (admin-editable in Admin → Social → Automation).
 *   - Wrapped in the WEB-AUTO-001 jobRunner: runs recorded in automation_job_runs,
 *     one auto-retry on failure, terminal failure alerts the admin.
 *
 * The social-media-manager records each post in social_media_posts (platform,
 * content id, posted_at, status), which is what the 30-day no-repeat window reads
 * and what the admin post-history queue shows.
 *
 * Auth: verify_jwt=false in config.toml; does its own auth via requireAdminOrApiKey
 * (cron service-role key or admin JWT). Trigger: pg_cron daily.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";

const NO_REPEAT_DAYS = 30;

interface PosterConfig {
  enabled: boolean;
  pause_events: boolean;
  pause_restaurants: boolean;
}

type Supa = ReturnType<typeof createClient>;

/**
 * THROWS RATHER THAN DEFAULTING. This reads the kill switch, and it used to
 * discard the error and fall back to `{}` - which resolves to enabled: true,
 * pause_events: false, pause_restaurants: false. So an unreadable settings row
 * turned the poster ON and un-paused both content types. An operator who had
 * paused posting would have found it posting anyway, and the run would have
 * reported success.
 *
 * A job that cannot read its own configuration has not been told to run.
 */
async function loadConfig(supabase: Supa): Promise<PosterConfig> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("settings")
    .eq("setting_type", "social_daily_poster")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`social-daily-poster: could not read its configuration: ${error.message}`);
  }
  const s = (data?.settings ?? {}) as Partial<PosterConfig>;
  return {
    enabled: s.enabled !== false, // default on
    pause_events: s.pause_events === true,
    pause_restaurants: s.pause_restaurants === true,
  };
}

/**
 * Also throws. An empty set means "nothing has been posted recently", and an
 * unreadable query produced exactly that - so the no-repeat window silently
 * stopped applying and the poster could re-feature the same event or
 * restaurant. Posting nothing today is recoverable; posting the same thing
 * twice to a public account is not.
 */
/** content_ids posted (status='posted') within the no-repeat window. */
async function recentlyPostedIds(supabase: Supa, contentType: string): Promise<Set<string>> {
  const since = new Date(Date.now() - NO_REPEAT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("social_media_posts")
    .select("content_id")
    .eq("content_type", contentType)
    .eq("status", "posted")
    .gte("posted_at", since);
  if (error) {
    throw new Error(`social-daily-poster: could not read recent posts for ${contentType}: ${error.message}`);
  }
  const set = new Set<string>();
  for (const r of data ?? []) if ((r as any).content_id) set.add((r as any).content_id);
  return set;
}

async function pickEvent(supabase: Supa): Promise<string | null> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, date, is_featured")
    .gte("date", new Date().toISOString())
    .neq("is_hidden", true)
    .order("is_featured", { ascending: false, nullsFirst: false })
    .order("date", { ascending: true })
    .limit(50);
  // Returning null here means "nothing to post", which is a legitimate
  // outcome; it must not also be what an unreadable event list looks like.
  if (error) {
    throw new Error(`social-daily-poster: could not read events to pick from: ${error.message}`);
  }
  const posted = await recentlyPostedIds(supabase, "event");
  for (const ev of data ?? []) {
    if (!posted.has((ev as any).id)) return (ev as any).id;
  }
  return null;
}

async function pickRestaurant(supabase: Supa): Promise<string | null> {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name, is_featured, popularity_score")
    .order("is_featured", { ascending: false, nullsFirst: false })
    .order("popularity_score", { ascending: false, nullsFirst: false })
    .limit(50);
  // Returning null here means "nothing to post", which is a legitimate
  // outcome; it must not also be what an unreadable restaurant list looks like.
  if (error) {
    throw new Error(`social-daily-poster: could not read restaurants to pick from: ${error.message}`);
  }
  const posted = await recentlyPostedIds(supabase, "restaurant");
  for (const r of data ?? []) {
    if (!posted.has((r as any).id)) return (r as any).id;
  }
  return null;
}

/** Delegate copy generation + publishing to the live social-media-manager. */
async function postViaManager(
  supabaseUrl: string,
  serviceKey: string,
  contentType: "event" | "restaurant",
  subjectType: string,
  targetContentId: string,
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${supabaseUrl}/functions/v1/social-media-manager`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      action: "generate_and_publish",
      contentType,
      subjectType,
      triggerSource: "daily-poster",
      targetContentId,
    }),
  });
  // Drain the body so the connection is released; status is what we branch on.
  await res.text().catch(() => null);
  return { ok: res.ok, status: res.status };
}

/**
 * Post one content item, retrying ONCE on failure. We retry per-item (not via a
 * whole-job throw) so a restaurant failure never re-triggers the event post.
 */
async function postWithRetry(
  supabaseUrl: string,
  serviceKey: string,
  contentType: "event" | "restaurant",
  subjectType: string,
  targetContentId: string,
): Promise<{ ok: boolean; status: number; attempts: number }> {
  let last = { ok: false, status: 0 };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      last = await postViaManager(supabaseUrl, serviceKey, contentType, subjectType, targetContentId);
      if (last.ok) return { ...last, attempts: attempt };
    } catch (err) {
      last = { ok: false, status: 0 };
      console.error(`[social-daily-poster] ${contentType} attempt ${attempt} threw:`, err);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
  }
  return { ...last, attempts: 2 };
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin") || undefined);

  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const job = await runJob(
    "social-daily-poster",
    async (ctx) => {
      const config = await loadConfig(supabase);
      if (!config.enabled) {
        ctx.meta({ skipped: "disabled" });
        return { skipped: "disabled" };
      }

      const outcomes: Record<string, unknown> = {};
      let posted = 0;
      let failed = 0;

      // Event of the day
      if (!config.pause_events) {
        const eventId = await pickEvent(supabase);
        if (eventId) {
          const r = await postWithRetry(supabaseUrl, serviceKey, "event", "event_of_the_day", eventId);
          outcomes.event = { contentId: eventId, ok: r.ok, status: r.status, attempts: r.attempts };
          if (r.ok) posted++;
          else failed++;
        } else {
          outcomes.event = { skipped: "no_eligible_event" };
        }
      } else {
        outcomes.event = { skipped: "paused" };
      }

      // Restaurant of the day
      if (!config.pause_restaurants) {
        const restaurantId = await pickRestaurant(supabase);
        if (restaurantId) {
          const r = await postWithRetry(supabaseUrl, serviceKey, "restaurant", "restaurant_of_the_day", restaurantId);
          outcomes.restaurant = { contentId: restaurantId, ok: r.ok, status: r.status, attempts: r.attempts };
          if (r.ok) posted++;
          else failed++;
        } else {
          outcomes.restaurant = { skipped: "no_eligible_restaurant" };
        }
      } else {
        outcomes.restaurant = { skipped: "paused" };
      }

      ctx.processed(posted);
      ctx.failed(failed);
      ctx.meta({ outcomes, noRepeatDays: NO_REPEAT_DAYS });
      return { posted, outcomes };
    },
    { maxAttempts: 1 }, // per-item retry handled internally; don't re-run the whole job
  );

  return new Response(
    JSON.stringify({ ok: job.ok, status: job.status, runId: job.runId, result: job.result, error: job.error }),
    { status: job.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
