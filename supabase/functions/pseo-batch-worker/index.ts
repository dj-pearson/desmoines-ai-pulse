/**
 * pseo-batch-worker — Self-driving pSEO Page Generation Worker
 *
 * Designed to be called by Make.com (or any scheduler) via HTTP POST.
 * On each invocation it:
 *   1. Seeds the generation queue from the full taxonomy (once, on first call)
 *   2. Picks the next N pending items ordered by tier → priority
 *   3. Calls the existing generate-pseo-page function for each item
 *   4. Updates queue status and logs results
 *   5. Returns a summary including how many pages remain
 *
 * Make.com setup:
 *   Method:  POST
 *   URL:     https://<project-ref>.supabase.co/functions/v1/pseo-batch-worker
 *   Headers: x-worker-secret: <PSEO_WORKER_SECRET>
 *             Content-Type: application/json
 *   Body:    {} (or { "batchSize": 5 } to override)
 *   Schedule: Every 1 hour
 *
 * SECURITY: verify_jwt = false
 * Protected by PSEO_WORKER_SECRET environment variable header check.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
};

// ---------------------------------------------------------------------------
// Taxonomy — embedded so the worker has no external TypeScript imports
// Only includes fields needed for queue seeding: slug, name, dimension, tier
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
// Page type definitions: which dimension arrays to cross-product
// Priority drives ordering within the queue (lower = generated first)
// ---------------------------------------------------------------------------

interface PageTypeSpec {
  id: string;
  priority: number;
  // Each entry is a DimValue[] to cross-product. Arrays are cross-multiplied in order.
  // Filters limit which tier values are included per dimension.
  dims: Array<{ values: DimValue[]; maxTier?: 1 | 2 | 3 }>;
}

const PAGE_TYPES: PageTypeSpec[] = [
  // Tier-1 priority: location-guide hub pages (one per neighborhood)
  {
    id: "location-guide",
    priority: 10,
    dims: [{ values: LOCATIONS }],
  },
  // Tier-2: content × location  ("restaurants in east village")
  {
    id: "content-location",
    priority: 20,
    dims: [
      { values: CONTENT_TYPES, maxTier: 1 },
      { values: LOCATIONS, maxTier: 1 },
    ],
  },
  // Tier-3: content × category ("best italian restaurants des moines")
  {
    id: "content-category",
    priority: 30,
    dims: [
      { values: CONTENT_TYPES, maxTier: 1 },
      { values: CATEGORIES, maxTier: 1 },
    ],
  },
  // Tier-4: content × audience ("date night restaurants des moines")
  {
    id: "content-audience",
    priority: 40,
    dims: [
      { values: CONTENT_TYPES, maxTier: 1 },
      { values: AUDIENCES, maxTier: 1 },
    ],
  },
  // Tier-5: content × temporal ("events this weekend des moines")
  {
    id: "content-temporal",
    priority: 50,
    dims: [
      { values: CONTENT_TYPES, maxTier: 1 },
      { values: TEMPORALS, maxTier: 1 },
    ],
  },
  // Tier-6: category × location ("italian east village")
  {
    id: "category-location",
    priority: 60,
    dims: [
      { values: CATEGORIES, maxTier: 1 },
      { values: LOCATIONS, maxTier: 1 },
    ],
  },
  // Tier-7: audience × temporal ("family things to do this weekend")
  {
    id: "audience-temporal",
    priority: 70,
    dims: [
      { values: AUDIENCES, maxTier: 1 },
      { values: TEMPORALS, maxTier: 1 },
    ],
  },
  // Tier-8: category × temporal ("live music summer des moines")
  {
    id: "category-temporal",
    priority: 80,
    dims: [
      { values: CATEGORIES, maxTier: 1 },
      { values: TEMPORALS, maxTier: 1 },
    ],
  },
  // Tier-9: 3-dim — content × location × audience (only tier-1 × tier-1 × tier-1)
  {
    id: "content-location-audience",
    priority: 90,
    dims: [
      { values: CONTENT_TYPES, maxTier: 1 },
      { values: LOCATIONS, maxTier: 1 },
      { values: AUDIENCES, maxTier: 1 },
    ],
  },
  // Tier-10: 3-dim — content × location × temporal (only tier-1 × tier-1 × tier-1)
  {
    id: "content-location-temporal",
    priority: 100,
    dims: [
      { values: CONTENT_TYPES, maxTier: 1 },
      { values: LOCATIONS, maxTier: 1 },
      { values: TEMPORALS, maxTier: 1 },
    ],
  },
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

/** Build every queue row for a given page type spec */
function buildQueueRows(
  spec: PageTypeSpec
): Array<{
  id: string;
  page_type_id: string;
  dimensions: DimValue[];
  tier: number;
  priority: number;
}> {
  // Filter each dim array by maxTier
  const filteredDims = spec.dims.map(({ values, maxTier }) =>
    maxTier ? values.filter((v) => v.tier <= maxTier) : values
  );

  const combos = crossProduct(filteredDims);

  return combos.map((dims) => {
    // Tier = max tier across all dimensions in the combo
    const tier = Math.max(...dims.map((d) => d.tier)) as 1 | 2 | 3;
    return {
      id: buildQueueId(spec.id, dims),
      page_type_id: spec.id,
      dimensions: dims,
      tier,
      priority: spec.priority,
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

  // ── Auth ──────────────────────────────────────────────────────────────────
  const workerSecret = Deno.env.get("PSEO_WORKER_SECRET");
  if (workerSecret) {
    const provided =
      req.headers.get("x-worker-secret") ??
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (provided !== workerSecret) {
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
      body = await req.json();
    }
  } catch {
    // empty body is fine
  }

  const batchSize = Math.min(body.batchSize ?? 5, 20); // cap at 20 per invocation
  const forceRegenerate = body.forceRegenerate ?? false;
  const dryRun = body.dryRun ?? false;

  // ── Supabase client ───────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: "Supabase env vars not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Check queue state ─────────────────────────────────────────────────────
  const { count: totalCount } = await supabase
    .from("pseo_generation_queue")
    .select("*", { count: "exact", head: true });

  const queueIsEmpty = !totalCount || totalCount === 0;
  const forceSeed = body.seed === true;

  // ── Seed queue if needed ──────────────────────────────────────────────────
  let seedResult: { inserted: number; skipped: number } | null = null;

  if (queueIsEmpty || forceSeed) {
    // Build all rows
    const allRows = PAGE_TYPES.flatMap(buildQueueRows);

    if (dryRun) {
      return jsonResponse({
        dryRun: true,
        totalCombinations: allRows.length,
        byPageType: PAGE_TYPES.map((pt) => ({
          pageTypeId: pt.id,
          count: buildQueueRows(pt).length,
        })),
      });
    }

    // Insert in chunks of 500 to avoid request size limits
    const CHUNK = 500;
    let inserted = 0;
    let skipped = 0;

    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error, count } = await supabase
        .from("pseo_generation_queue")
        .upsert(chunk, {
          onConflict: "id",
          ignoreDuplicates: true,
          count: "exact",
        });

      if (error) {
        console.error("Queue seed error:", error);
        return jsonResponse({ error: "Failed to seed queue", details: error.message }, 500);
      }

      inserted += count ?? 0;
      skipped += chunk.length - (count ?? 0);
    }

    seedResult = { inserted, skipped };
    console.log(`Queue seeded: ${inserted} inserted, ${skipped} already existed`);
  }

  // ── Fetch next batch of pending items ─────────────────────────────────────
  const { data: pendingItems, error: fetchError } = await supabase
    .from("pseo_generation_queue")
    .select("id, page_type_id, dimensions, tier, priority, attempts, max_attempts")
    .eq("status", "pending")
    .order("tier", { ascending: true })
    .order("priority", { ascending: true })
    .limit(batchSize);

  if (fetchError) {
    return jsonResponse({ error: "Failed to fetch queue", details: fetchError.message }, 500);
  }

  if (!pendingItems || pendingItems.length === 0) {
    // Check overall remaining counts
    const { count: remainingCount } = await supabase
      .from("pseo_generation_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

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

  // Mark batch as in_progress
  const batchIds = pendingItems.map((item) => item.id);
  await supabase
    .from("pseo_generation_queue")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .in("id", batchIds);

  // ── Process each item ─────────────────────────────────────────────────────
  const functionUrl = `${supabaseUrl}/functions/v1/generate-pseo-page`;
  const results: Array<{
    queueId: string;
    pageTypeId: string;
    status: "succeeded" | "failed" | "skipped";
    slug?: string;
    error?: string;
    generationTimeMs?: number;
  }> = [];

  for (const item of pendingItems) {
    const startTime = Date.now();
    try {
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Pass service role key so generate-pseo-page can access DB
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

      if (resultJson.skipped) {
        // Page already existed — mark completed anyway
        await supabase
          .from("pseo_generation_queue")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", item.id);

        results.push({ queueId: item.id, pageTypeId: item.page_type_id, status: "skipped", slug: resultJson.slug });
        continue;
      }

      // Success
      await supabase
        .from("pseo_generation_queue")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", item.id);

      // Log to audit table
      await supabase.from("pseo_generation_log").insert({
        page_id: resultJson.pageId,
        action: "generated",
        details: { queueId: item.id, pageTypeId: item.page_type_id },
        generation_time_ms: generationTimeMs,
        quality_score: 0.8,
      });

      results.push({
        queueId: item.id,
        pageTypeId: item.page_type_id,
        status: "succeeded",
        slug: resultJson.slug,
        generationTimeMs,
      });
    } catch (err) {
      const generationTimeMs = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to generate ${item.id}:`, errorMessage);

      // Increment attempts, mark failed if max reached
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

      // Log the failure
      await supabase.from("pseo_generation_log").insert({
        page_id: item.id,
        action: "failed",
        details: { queueId: item.id, pageTypeId: item.page_type_id, error: errorMessage, attempt: newAttempts },
        generation_time_ms: generationTimeMs,
      });

      results.push({
        queueId: item.id,
        pageTypeId: item.page_type_id,
        status: "failed",
        error: errorMessage,
        generationTimeMs,
      });
    }
  }

  // ── Count remaining ───────────────────────────────────────────────────────
  const { count: remainingCount } = await supabase
    .from("pseo_generation_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const succeeded = results.filter((r) => r.status === "succeeded").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

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
