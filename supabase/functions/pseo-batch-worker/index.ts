/**
 * pseo-batch-worker — Self-driving pSEO Page Generation Worker
 *
 * Designed to be called by Make.com (or any scheduler) via HTTP POST.
 * On each invocation it:
 *   1. Resets any items stuck in "in_progress" for >5 minutes back to "pending"
 *   2. Seeds the generation queue from the full taxonomy (once, on first call)
 *   3. Picks the next N pending items ordered by tier → priority
 *   4. Calls generate-pseo-page for each item CONCURRENTLY (not sequentially)
 *   5. Updates queue status and logs results
 *   6. Returns a summary including how many pages remain
 *
 * Tier ordering (guaranteed correct):
 *   tier = number of dimensions in the page type (1-dim < 2-dim < 3-dim)
 *   priority = (page_type_priority × 10) + (max_dimension_tier - 1)
 *   This ensures location-guide pages are always generated before complex combos.
 *
 * Make.com setup:
 *   Method:  POST
 *   URL:     https://<project-ref>.supabase.co/functions/v1/pseo-batch-worker
 *   Headers: x-worker-secret: <PSEO_WORKER_SECRET>
 *             Content-Type: application/json
 *   Body:    {} (or { "batchSize": 3 } to override)
 *   Schedule: Every 1 hour
 *
 * SECURITY: verify_jwt = false
 * Protected by PSEO_WORKER_SECRET environment variable header check.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

// ---------------------------------------------------------------------------
// Taxonomy — embedded so the worker has no external TypeScript imports
// ---------------------------------------------------------------------------

interface DimValue {
  slug: string;
  name: string;
  dimension: string;
  tier: 1 | 2 | 3;
}

const CONTENT_TYPES: DimValue[] = [
  { slug: "things-to-do", name: "Things to Do", dimension: "content_type", tier: 1 },
  { slug: "events", name: "Events", dimension: "content_type", tier: 1 },
  { slug: "restaurants", name: "Restaurants", dimension: "content_type", tier: 1 },
  { slug: "attractions", name: "Attractions", dimension: "content_type", tier: 1 },
  { slug: "nightlife", name: "Nightlife", dimension: "content_type", tier: 2 },
  { slug: "outdoors", name: "Outdoor Activities", dimension: "content_type", tier: 2 },
];

const LOCATIONS: DimValue[] = [
  { slug: "downtown", name: "Downtown Des Moines", dimension: "location", tier: 1 },
  { slug: "east-village", name: "East Village", dimension: "location", tier: 1 },
  { slug: "valley-junction", name: "Valley Junction", dimension: "location", tier: 1 },
  { slug: "west-des-moines", name: "West Des Moines", dimension: "location", tier: 1 },
  { slug: "ankeny", name: "Ankeny", dimension: "location", tier: 1 },
  { slug: "drake", name: "Drake", dimension: "location", tier: 2 },
  { slug: "beaverdale", name: "Beaverdale", dimension: "location", tier: 2 },
  { slug: "ingersoll", name: "Ingersoll", dimension: "location", tier: 2 },
  { slug: "urbandale", name: "Urbandale", dimension: "location", tier: 2 },
  { slug: "waukee", name: "Waukee", dimension: "location", tier: 2 },
  { slug: "altoona", name: "Altoona", dimension: "location", tier: 2 },
  { slug: "johnston", name: "Johnston", dimension: "location", tier: 2 },
  { slug: "sherman-hill", name: "Sherman Hill", dimension: "location", tier: 2 },
  { slug: "clive", name: "Clive", dimension: "location", tier: 3 },
  { slug: "pleasant-hill", name: "Pleasant Hill", dimension: "location", tier: 3 },
  { slug: "windsor-heights", name: "Windsor Heights", dimension: "location", tier: 3 },
];

const AUDIENCES: DimValue[] = [
  { slug: "families", name: "For Families", dimension: "audience", tier: 1 },
  { slug: "date-night", name: "Date Night", dimension: "audience", tier: 1 },
  { slug: "foodies", name: "For Foodies", dimension: "audience", tier: 1 },
  { slug: "budget", name: "Budget-Friendly", dimension: "audience", tier: 1 },
  { slug: "tourists", name: "For Visitors", dimension: "audience", tier: 1 },
  { slug: "couples", name: "For Couples", dimension: "audience", tier: 2 },
  { slug: "groups", name: "For Groups", dimension: "audience", tier: 2 },
  { slug: "pet-friendly", name: "Pet-Friendly", dimension: "audience", tier: 2 },
  { slug: "seniors", name: "For Seniors", dimension: "audience", tier: 3 },
];

const TEMPORALS: DimValue[] = [
  { slug: "today", name: "Today", dimension: "temporal", tier: 1 },
  { slug: "this-weekend", name: "This Weekend", dimension: "temporal", tier: 1 },
  { slug: "summer", name: "Summer", dimension: "temporal", tier: 1 },
  { slug: "fall", name: "Fall", dimension: "temporal", tier: 1 },
  { slug: "winter", name: "Winter", dimension: "temporal", tier: 1 },
  { slug: "spring", name: "Spring", dimension: "temporal", tier: 1 },
  { slug: "august", name: "August", dimension: "temporal", tier: 1 },
  { slug: "december", name: "December", dimension: "temporal", tier: 1 },
  { slug: "this-week", name: "This Week", dimension: "temporal", tier: 2 },
  { slug: "january", name: "January", dimension: "temporal", tier: 2 },
  { slug: "february", name: "February", dimension: "temporal", tier: 2 },
  { slug: "march", name: "March", dimension: "temporal", tier: 2 },
  { slug: "april", name: "April", dimension: "temporal", tier: 2 },
  { slug: "may", name: "May", dimension: "temporal", tier: 2 },
  { slug: "june", name: "June", dimension: "temporal", tier: 2 },
  { slug: "july", name: "July", dimension: "temporal", tier: 2 },
  { slug: "september", name: "September", dimension: "temporal", tier: 2 },
  { slug: "october", name: "October", dimension: "temporal", tier: 2 },
  { slug: "november", name: "November", dimension: "temporal", tier: 2 },
];

const CATEGORIES: DimValue[] = [
  { slug: "live-music", name: "Live Music", dimension: "category", tier: 1 },
  { slug: "festivals", name: "Festivals", dimension: "category", tier: 1 },
  { slug: "italian", name: "Italian", dimension: "category", tier: 1 },
  { slug: "mexican", name: "Mexican", dimension: "category", tier: 1 },
  { slug: "asian", name: "Asian", dimension: "category", tier: 1 },
  { slug: "bbq", name: "BBQ & Smokehouse", dimension: "category", tier: 1 },
  { slug: "brunch", name: "Brunch", dimension: "category", tier: 1 },
  { slug: "arts-culture", name: "Arts & Culture", dimension: "category", tier: 2 },
  { slug: "sports", name: "Sports", dimension: "category", tier: 2 },
  { slug: "farmers-markets", name: "Farmers Markets", dimension: "category", tier: 2 },
  { slug: "museums", name: "Museums", dimension: "category", tier: 2 },
  { slug: "parks", name: "Parks & Nature", dimension: "category", tier: 2 },
  { slug: "coffee", name: "Coffee & Cafes", dimension: "category", tier: 2 },
  { slug: "steakhouse", name: "Steakhouses", dimension: "category", tier: 2 },
];

// ---------------------------------------------------------------------------
// Page type definitions
//
// tier  = number of dimensions (1, 2, or 3) — ensures simple pages first
// priority = base × 10 + (max_dim_tier - 1)
//   so same tier pages sort by page type importance first, dim quality second
// ---------------------------------------------------------------------------

interface PageTypeSpec {
  id: string;
  basePriority: number; // 10 = most important, 100 = least
  dims: Array<{ values: DimValue[]; maxTier?: 1 | 2 | 3 }>;
}

const PAGE_TYPES: PageTypeSpec[] = [
  { id: "location-guide",            basePriority: 10,  dims: [{ values: LOCATIONS }] },
  { id: "content-location",          basePriority: 20,  dims: [{ values: CONTENT_TYPES, maxTier: 1 }, { values: LOCATIONS, maxTier: 1 }] },
  { id: "content-category",          basePriority: 30,  dims: [{ values: CONTENT_TYPES, maxTier: 1 }, { values: CATEGORIES, maxTier: 1 }] },
  { id: "content-audience",          basePriority: 40,  dims: [{ values: CONTENT_TYPES, maxTier: 1 }, { values: AUDIENCES, maxTier: 1 }] },
  { id: "content-temporal",          basePriority: 50,  dims: [{ values: CONTENT_TYPES, maxTier: 1 }, { values: TEMPORALS, maxTier: 1 }] },
  { id: "category-location",         basePriority: 60,  dims: [{ values: CATEGORIES, maxTier: 1 }, { values: LOCATIONS, maxTier: 1 }] },
  { id: "audience-temporal",         basePriority: 70,  dims: [{ values: AUDIENCES, maxTier: 1 }, { values: TEMPORALS, maxTier: 1 }] },
  { id: "category-temporal",         basePriority: 80,  dims: [{ values: CATEGORIES, maxTier: 1 }, { values: TEMPORALS, maxTier: 1 }] },
  { id: "content-location-audience", basePriority: 90,  dims: [{ values: CONTENT_TYPES, maxTier: 1 }, { values: LOCATIONS, maxTier: 1 }, { values: AUDIENCES, maxTier: 1 }] },
  { id: "content-location-temporal", basePriority: 100, dims: [{ values: CONTENT_TYPES, maxTier: 1 }, { values: LOCATIONS, maxTier: 1 }, { values: TEMPORALS, maxTier: 1 }] },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildQueueId(pageTypeId: string, dims: DimValue[]): string {
  const sorted = [...dims].map((d) => d.slug).sort().join("_");
  return `${pageTypeId}__${sorted}`;
}

function crossProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]]
  );
}

function buildQueueRows(spec: PageTypeSpec) {
  const filteredDims = spec.dims.map(({ values, maxTier }) =>
    maxTier ? values.filter((v) => v.tier <= maxTier) : values
  );

  const combos = crossProduct(filteredDims);

  return combos.map((dims) => {
    const maxDimTier = Math.max(...dims.map((d) => d.tier));
    // tier = number of dimensions so 1-dim < 2-dim < 3-dim in the queue ordering
    const tier = dims.length as 1 | 2 | 3;
    // priority encodes page type importance + dimension quality as a tiebreaker
    const priority = spec.basePriority * 10 + (maxDimTier - 1);

    return {
      id: buildQueueId(spec.id, dims),
      page_type_id: spec.id,
      dimensions: dims,
      tier,
      priority,
      status: "pending",
    };
  });
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Runs as service_role and had no caller check. verify_jwt defaults to
  // true, which only means "a valid Supabase JWT" - the publishable anon
  // key is one and ships in every client bundle.
  //
  // Callers, enumerated before guarding:
  //   NO caller anywhere in src/, migrations, edge functions, workflows or mobile
  // requireAdminOrApiKey accepts EDGE_FUNCTION_API_KEY, the service-role
  // key and an admin JWT, so a manual or server-to-server call still works.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const workerSecret = Deno.env.get("PSEO_WORKER_SECRET");
  if (workerSecret) {
    const provided =
      req.headers.get("x-worker-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== workerSecret) {
      console.error("pseo-batch-worker: unauthorized request");
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    batchSize?: number;
    seed?: boolean;
    forceRegenerate?: boolean;
    dryRun?: boolean;
  } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text);
    }
  } catch {
    // empty body is fine
  }

  const batchSize = Math.min(Math.max(body.batchSize ?? 3, 1), 10);
  const forceRegenerate = body.forceRegenerate ?? false;
  const dryRun = body.dryRun ?? false;

  console.log(`pseo-batch-worker: starting — batchSize=${batchSize}, dryRun=${dryRun}`);

  // ── Supabase client ───────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: "Supabase env vars not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Step 1: Unstick items — reset in_progress items older than 5 min ──────
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count: unstuckCount, error: unstuckError } = await supabase
    .from("pseo_generation_queue")
    .update({ status: "pending", started_at: null, error_message: "Reset after timeout" })
    .eq("status", "in_progress")
    .lt("started_at", stuckCutoff)
    .select("*", { count: "exact", head: true } as never);

  if (unstuckError) {
    console.error("pseo-batch-worker: could not reset stuck items:", unstuckError.message);
  } else if (unstuckCount && unstuckCount > 0) {
    console.log(`pseo-batch-worker: reset ${unstuckCount} stuck in_progress items back to pending`);
  }

  // ── Step 2: Seed queue if needed ──────────────────────────────────────────
  // AN UNREADABLE COUNT MUST NOT LOOK LIKE AN EMPTY QUEUE. `!totalCount` was
  // true for a failed read as well as for zero, and the next line seeds the
  // queue - so a transient error re-seeded a queue that already had items,
  // duplicating generation jobs and the model spend behind them.
  const { count: totalCount, error: totalError } = await supabase
    .from("pseo_generation_queue")
    .select("*", { count: "exact", head: true });

  if (totalError) {
    console.error("pseo-batch-worker: could not size the queue:", totalError.message);
    return jsonResponse(
      { error: "Could not read the generation queue", details: totalError.message },
      503,
    );
  }

  const queueIsEmpty = !totalCount || totalCount === 0;
  const forceSeed = body.seed === true;

  let seedResult: { inserted: number; skipped: number } | null = null;

  if (queueIsEmpty || forceSeed) {
    const allRows = PAGE_TYPES.flatMap(buildQueueRows);

    if (dryRun) {
      return jsonResponse({
        dryRun: true,
        totalCombinations: allRows.length,
        byPageType: PAGE_TYPES.map((pt) => ({
          pageTypeId: pt.id,
          count: buildQueueRows(pt).length,
          tier: pt.dims.length,
          basePriority: pt.basePriority,
        })),
      });
    }

    const CHUNK = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("pseo_generation_queue")
        .upsert(chunk, { onConflict: "id", ignoreDuplicates: true, count: "exact" } as never);

      if (error) {
        console.error("pseo-batch-worker: queue seed error:", error);
        return jsonResponse({ error: "Failed to seed queue", details: error.message }, 500);
      }

      inserted += count ?? 0;
      skipped += chunk.length - (count ?? 0);
    }

    seedResult = { inserted, skipped };
    console.log(`pseo-batch-worker: seeded queue — ${inserted} inserted, ${skipped} already existed`);
  }

  // ── Step 3: Fetch next batch of pending items ─────────────────────────────
  const { data: pendingItems, error: fetchError } = await supabase
    .from("pseo_generation_queue")
    .select("id, page_type_id, dimensions, tier, priority, attempts, max_attempts")
    .eq("status", "pending")
    .order("tier", { ascending: true })
    .order("priority", { ascending: true })
    .limit(batchSize);

  if (fetchError) {
    console.error("pseo-batch-worker: fetch error:", fetchError);
    return jsonResponse({ error: "Failed to fetch queue", details: fetchError.message }, 500);
  }

  if (!pendingItems || pendingItems.length === 0) {
    // A COUNT THAT FAILED IS NOT A COUNT OF ZERO. `remainingCount ?? 0` below
    // logged "remaining=0" whether the queue was drained or the count errored,
    // which reads as "the backlog is clear" either way. The main queue fetch
    // above already checks its own error and 500s, so this is reporting only -
    // but a reporting number that lies about a backlog is how a stuck queue
    // goes unnoticed.
    const { count: remainingCount, error: remainingError } = await supabase
      .from("pseo_generation_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    console.log(
      `pseo-batch-worker: no pending items, remaining=${remainingError ? 'UNKNOWN (' + remainingError.message + ')' : remainingCount ?? 0}`,
    );
    return jsonResponse({
      success: true,
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: remainingCount ?? 0,
      hasMore: false,
      message: "Queue is empty — all pages have been generated.",
      seed: seedResult,
    });
  }

  console.log(`pseo-batch-worker: processing ${pendingItems.length} items concurrently`);

  // Mark all as in_progress before firing concurrent requests
  const batchIds = pendingItems.map((item) => item.id);
  await supabase
    .from("pseo_generation_queue")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .in("id", batchIds);

  // ── Step 4: Generate all items concurrently ───────────────────────────────
  const functionUrl = `${supabaseUrl}/functions/v1/generate-pseo-page`;

  const generateOne = async (item: typeof pendingItems[0]) => {
    const startTime = Date.now();
    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseKey}`,
          apikey: supabaseKey,
        },
        body: JSON.stringify({
          pageTypeId: item.page_type_id,
          dimensions: item.dimensions,
          forceRegenerate,
        }),
      });

      const resultJson = await response.json();
      const generationTimeMs = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(resultJson.error ?? `HTTP ${response.status}`);
      }

      // Mark completed (whether generated fresh or already existed/skipped)
      await supabase
        .from("pseo_generation_queue")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", item.id);

      if (!resultJson.skipped) {
        await supabase.from("pseo_generation_log").insert({
          page_id: resultJson.pageId ?? item.id,
          action: "generated",
          details: { queueId: item.id, pageTypeId: item.page_type_id },
          generation_time_ms: generationTimeMs,
          quality_score: 0.8,
        });
      }

      return {
        queueId: item.id,
        pageTypeId: item.page_type_id,
        status: resultJson.skipped ? "skipped" : "succeeded",
        slug: resultJson.slug,
        generationTimeMs,
      };
    } catch (err) {
      const generationTimeMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`pseo-batch-worker: failed ${item.id}: ${errorMessage}`);

      const newAttempts = (item.attempts ?? 0) + 1;
      const maxAttempts = item.max_attempts ?? 3;

      await supabase
        .from("pseo_generation_queue")
        .update({
          status: newAttempts >= maxAttempts ? "failed" : "pending",
          error_message: errorMessage,
          attempts: newAttempts,
          started_at: null,
        })
        .eq("id", item.id);

      await supabase.from("pseo_generation_log").insert({
        page_id: item.id,
        action: "failed",
        details: { queueId: item.id, pageTypeId: item.page_type_id, error: errorMessage, attempt: newAttempts },
        generation_time_ms: generationTimeMs,
      });

      return {
        queueId: item.id,
        pageTypeId: item.page_type_id,
        status: "failed" as const,
        error: errorMessage,
        generationTimeMs,
      };
    }
  };

  // Fire all items in parallel — each Claude call takes ~20s,
  // but concurrently they all finish in ~20-30s total (well within timeout)
  const settledResults = await Promise.allSettled(pendingItems.map(generateOne));

  const results = settledResults.map((r) =>
    r.status === "fulfilled" ? r.value : { status: "failed" as const, error: String(r.reason) }
  );

  // ── Step 5: Count remaining ───────────────────────────────────────────────
  // Same as above: distinguish a failed count from a drained queue.
  const { count: remainingCount, error: remainingError } = await supabase
    .from("pseo_generation_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const succeeded = results.filter((r) => r.status === "succeeded").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log(`pseo-batch-worker: done — succeeded=${succeeded}, skipped=${skippedCount}, failed=${failed}, remaining=${remainingError ? 'UNKNOWN' : remainingCount ?? 0}`);

  return jsonResponse({
    success: true,
    processed: results.length,
    succeeded,
    skipped: skippedCount,
    failed,
    remaining: remainingCount ?? 0,
    hasMore: (remainingCount ?? 0) > 0,
    seed: seedResult,
    results,
  });
});
