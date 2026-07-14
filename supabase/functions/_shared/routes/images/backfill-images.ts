/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  fetchAndStoreImage,
  extractImageFromHtml,
  CONTENT_TYPE_MAP,
} from "../../imageStorage.ts";
import { requireAdminOrApiKey } from "../../apiKeyAuth.ts";
import { validateURLForSSRF } from "../../validation.ts";
import { runAgent } from "../../agentRun.ts";
import {
  findExistingVenueRecord,
  scrapeImageFromWebsite,
  getGooglePlacesPhoto,
  getCategoryDefaultImage,
} from "../../imageFallbacks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

type Category = "events" | "restaurants" | "attractions" | "playgrounds";

interface BackfillRequest {
  /** Which table to backfill. Defaults to "events". */
  category?: Category;
  /** Records to process in this single invocation. Keep low (5–10) to avoid timeouts. Default: 5 */
  batchSize?: number;
  /** Row offset for pagination — pass back nextOffset from the previous response. Default: 0 */
  offset?: number;
  /** If true, only count and preview records without updating anything. */
  dryRun?: boolean;
}

type ImageSource =
  | "source_url"
  | "venue_existing"
  | "venue_website"
  | "google_places"
  | "category_default"
  | "none";

interface BackfillResult {
  category: Category;
  offset: number;
  batchSize: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  /** Pass this as `offset` in your next call to continue. null when no more records remain. */
  nextOffset: number | null;
  dryRun: boolean;
  details: Array<{
    id: string;
    name: string;
    sourceUrl: string | null;
    imageUrl: string | null;
    status: "updated" | "skipped" | "failed" | "dry_run";
    source?: ImageSource;
    reason?: string;
  }>;
}

// ─── Table/column mapping per category ───────────────────────────────────────

const TABLE: Record<Category, string> = {
  events: "events",
  restaurants: "restaurants",
  attractions: "attractions",
  playgrounds: "playgrounds",
};

// Column that holds the display name for logging
const NAME_COL: Record<Category, string> = {
  events: "title",
  restaurants: "name",
  attractions: "name",
  playgrounds: "name",
};

// Column that holds the URL we'll scrape for images
const URL_COL: Record<Category, string> = {
  events: "source_url",
  restaurants: "website",
  attractions: "website",
  playgrounds: "source_url",
};

// Per-category SELECT lists. Includes coords + venue/category for events so
// the fallback chain can hit Google Places without a second query.
const SELECT_COLS: Record<Category, string> = {
  events: "id, title, source_url, image_url, venue, category, latitude, longitude",
  restaurants: "id, name, website, image_url, latitude, longitude",
  attractions: "id, name, website, image_url, latitude, longitude",
  playgrounds: "id, name, image_url, latitude, longitude",
};

// ─── Image extraction from a page URL ────────────────────────────────────────

async function scrapeImageUrl(pageUrl: string): Promise<string | null> {
  if (!pageUrl) return null;

  // SSRF guard — pageUrl comes from a DB row (scraped source_url/website).
  const ssrf = validateURLForSSRF(pageUrl, {
    allowedProtocols: ["http:", "https:"],
    blockPrivateIPs: true,
  });
  if (!ssrf.valid) {
    console.warn(`⚠️ Refusing unsafe page URL (${ssrf.error}): ${pageUrl}`);
    return null;
  }

  try {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn(`⚠️ Page fetch failed (${response.status}): ${pageUrl}`);
      return null;
    }

    // Only read up to 200KB of HTML — enough to find meta tags and hero images
    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = "";
    let bytesRead = 0;
    const MAX_HTML_BYTES = 200 * 1024;

    while (bytesRead < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      bytesRead += value.byteLength;
    }
    reader.cancel();

    return extractImageFromHtml(html, pageUrl);
  } catch (error) {
    console.warn(`⚠️ scrapeImageUrl error for ${pageUrl}:`, error.message);
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Accept either the cron API key OR an admin user JWT (admin UI)
  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: BackfillRequest = await req.json().catch(() => ({}));
    const category: Category = body.category ?? "events";
    const batchSize = Math.min(body.batchSize ?? 5, 25); // hard cap at 25
    const offset = body.offset ?? 0;
    const dryRun = body.dryRun ?? false;

    const table = TABLE[category];
    const namecol = NAME_COL[category];
    const urlCol = URL_COL[category];

    // Today's date (YYYY-MM-DD) for filtering past events out of the backfill —
    // there's no point fetching images for events that have already happened.
    const todayIso = new Date().toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    // Re-try a row that previously failed at most once a week (its source page
    // may have gained an image since) — but never every run. Drop milliseconds
    // so the timestamp parses cleanly inside a PostgREST .or() filter.
    const retryBefore = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    console.log(
      `🖼️ backfill-images: category=${category} batchSize=${batchSize} offset=${offset} dryRun=${dryRun}${
        category === "events" ? ` (events on or after ${todayIso} only)` : ""
      }`
    );

    // Only process records that have NO image at all (null or empty string).
    // We deliberately skip records that already have an external image URL —
    // the goal is to fill in missing images, not re-pull or migrate existing ones.
    let recordsQuery = supabase
      .from(table)
      .select(SELECT_COLS[category])
      .or("image_url.is.null,image_url.eq.")
      // Skip rows attempted within the retry window so permanent failures don't
      // get re-tried every run (image_checked_at stamped below on each attempt).
      .or(`image_checked_at.is.null,image_checked_at.lt."${retryBefore}"`)
      // Never-checked rows first, then oldest-checked — drains new backlog fast.
      .order("image_checked_at", { ascending: true, nullsFirst: true });

    if (category === "events") {
      recordsQuery = recordsQuery.gte("date", todayIso).order("date", { ascending: true });
    } else {
      recordsQuery = recordsQuery.order("created_at", { ascending: true });
    }

    const { data: records, error: fetchError } = await recordsQuery.range(
      offset,
      offset + batchSize - 1,
    );

    if (fetchError) {
      console.error("❌ Failed to fetch records:", fetchError.message);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!records || records.length === 0) {
      return new Response(
        JSON.stringify({
          category,
          offset,
          batchSize,
          processed: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          nextOffset: null,
          dryRun,
          details: [],
          message: "All done — no more records need image backfill.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check total remaining so we know whether there's a next page.
    // Mirrors the records query filters (esp. the future-events filter).
    let countQuery = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .or("image_url.is.null,image_url.eq.")
      .or(`image_checked_at.is.null,image_checked_at.lt."${retryBefore}"`);
    if (category === "events") {
      countQuery = countQuery.gte("date", todayIso);
    }
    const { count: totalRemaining } = await countQuery;

    const result: BackfillResult = {
      category,
      offset,
      batchSize,
      processed: records.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      // On a real run every processed row leaves the working set (image filled,
      // or image_checked_at stamped), so keep draining from offset 0 rather than
      // advancing past rows that shifted up. Dry runs change nothing, so they
      // page normally.
      nextOffset: dryRun
        ? (offset + batchSize < (totalRemaining ?? 0) ? offset + batchSize : null)
        : ((totalRemaining ?? 0) - records.length > 0 ? 0 : null),
      dryRun,
      details: [],
    };

    // Record this invocation in the unified agent run ledger (AOS-CORE-002).
    // Fail-open: runAgent never throws, so a ledger hiccup can't break the
    // backfill itself. Dry runs are marked skipped (no writes happen).
    await runAgent("backfill-images", async (ctx) => {
      if (dryRun) ctx.skip("dry run — preview only, no writes");

    for (const record of records) {
      const id: string = record.id;
      const name: string = record[namecol] ?? id;
      const pageUrl: string | null = record[urlCol] ?? null;
      const venueName: string | null = record.venue ?? null;
      const recordCategory: string | null = record.category ?? null;
      const lat: number | null = record.latitude ?? null;
      const lng: number | null = record.longitude ?? null;
      // For Places lookup: events use venue, other categories use the row's own name
      const lookupName = venueName || (category === "events" ? name : name);

      if (dryRun) {
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: null,
          status: "dry_run",
          reason: `Would try: source_url${venueName ? ", venue lookup" : ""}, Places, default`,
        });
        continue;
      }

      console.log(`🔍 Processing [${category}] "${name}" — ${pageUrl ?? "no source_url"}`);

      // ── Fallback chain ──────────────────────────────────────────────────
      let rawImageUrl: string | null = null;
      let source: ImageSource = "none";

      // 1) source_url scrape (primary)
      if (pageUrl) {
        rawImageUrl = await scrapeImageUrl(pageUrl);
        if (rawImageUrl) source = "source_url";
      }

      // 2) Look up venue/business in our DB by name
      if (!rawImageUrl && lookupName) {
        const venueRecord = await findExistingVenueRecord(supabase, lookupName);
        if (venueRecord?.imageUrl) {
          rawImageUrl = venueRecord.imageUrl;
          source = "venue_existing";
        } else if (venueRecord?.website) {
          const fromWebsite = await scrapeImageFromWebsite(venueRecord.website);
          if (fromWebsite) {
            rawImageUrl = fromWebsite;
            source = "venue_website";
          }
        }
      }

      // 3) Google Places photo by venue/business name
      if (!rawImageUrl && lookupName) {
        const placesPhoto = await getGooglePlacesPhoto(lookupName, lat, lng);
        if (placesPhoto) {
          rawImageUrl = placesPhoto;
          source = "google_places";
        }
      }

      // 4) Category default
      if (!rawImageUrl) {
        const defaultUrl = getCategoryDefaultImage(category, recordCategory);
        if (defaultUrl) {
          rawImageUrl = defaultUrl;
          source = "category_default";
        }
      }

      if (!rawImageUrl) {
        result.failed++;
        // Stamp the attempt so this row drops out of the working set for the
        // retry window instead of being re-scraped every single run.
        await supabase.from(table).update({ image_checked_at: nowIso }).eq("id", id);
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: null,
          status: "failed",
          source: "none",
          reason: pageUrl
            ? "No image from source, venue lookup, Places, or default"
            : "No source_url, and venue/Places/default all empty",
        });
        continue;
      }

      // Download and store in Supabase Storage
      const cdnUrl = await fetchAndStoreImage(supabase, rawImageUrl, category, id);

      if (!cdnUrl) {
        result.failed++;
        await supabase.from(table).update({ image_checked_at: nowIso }).eq("id", id);
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: rawImageUrl,
          status: "failed",
          source,
          reason: "Image download or storage upload failed",
        });
        continue;
      }

      // Update the record (stamp image_checked_at so we don't re-process it)
      const { error: updateError } = await supabase
        .from(table)
        .update({ image_url: cdnUrl, image_checked_at: nowIso, updated_at: nowIso })
        .eq("id", id);

      if (updateError) {
        result.failed++;
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: cdnUrl,
          status: "failed",
          source,
          reason: `DB update failed: ${updateError.message}`,
        });
        continue;
      }

      result.updated++;
      result.details.push({
        id,
        name,
        sourceUrl: pageUrl,
        imageUrl: cdnUrl,
        status: "updated",
        source,
      });
    }

      // Report outcome to the ledger. Image work uses no LLM tokens; cost is
      // effectively storage/egress, left at 0 here.
      ctx.processed(result.updated);
      ctx.failed(result.failed);
      ctx.meta({
        category,
        batchSize,
        offset,
        skippedCount: result.skipped,
        nextOffset: result.nextOffset,
      });
      ctx.summary(
        `[${category}] updated ${result.updated}, failed ${result.failed}, skipped ${result.skipped} of ${result.processed} processed`,
      );
      return result;
    }, { client: supabase });

    console.log(
      `✅ backfill-images done: updated=${result.updated} skipped=${result.skipped} failed=${result.failed} nextOffset=${result.nextOffset}`
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("❌ Unexpected error in backfill-images:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
