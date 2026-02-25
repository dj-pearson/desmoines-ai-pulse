/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  fetchAndStoreImage,
  extractImageFromHtml,
  CONTENT_TYPE_MAP,
} from "../_shared/imageStorage.ts";
import { requireApiKey } from "../_shared/apiKeyAuth.ts";

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

// ─── Image extraction from a page URL ────────────────────────────────────────

async function scrapeImageUrl(pageUrl: string): Promise<string | null> {
  if (!pageUrl) return null;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Require API key for this data-processing endpoint
  const authError = requireApiKey(req, corsHeaders);
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
    const supabaseStorageBase = `${supabaseUrl}/storage/v1/object/public/media/`;

    console.log(
      `🖼️ backfill-images: category=${category} batchSize=${batchSize} offset=${offset} dryRun=${dryRun}`
    );

    // Fetch records that have no image_url OR whose image_url is NOT already
    // hosted on Supabase Storage (i.e., external URLs that need migrating).
    const { data: records, error: fetchError } = await supabase
      .from(table)
      .select(`id, ${namecol}, ${urlCol}, image_url`)
      .or(`image_url.is.null,image_url.not.ilike.${supabaseStorageBase}%`)
      .range(offset, offset + batchSize - 1)
      .order("created_at", { ascending: true });

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

    // Check total remaining so we know whether there's a next page
    const { count: totalRemaining } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .or(`image_url.is.null,image_url.not.ilike.${supabaseStorageBase}%`);

    const result: BackfillResult = {
      category,
      offset,
      batchSize,
      processed: records.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      nextOffset:
        offset + batchSize < (totalRemaining ?? 0)
          ? offset + batchSize
          : null,
      dryRun,
      details: [],
    };

    for (const record of records) {
      const id: string = record.id;
      const name: string = record[namecol] ?? id;
      const pageUrl: string | null = record[urlCol] ?? null;

      if (dryRun) {
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: null,
          status: "dry_run",
          reason: pageUrl ? "Would scrape and store" : "No source URL available",
        });
        continue;
      }

      if (!pageUrl) {
        result.skipped++;
        result.details.push({
          id,
          name,
          sourceUrl: null,
          imageUrl: null,
          status: "skipped",
          reason: `No ${urlCol} to scrape`,
        });
        continue;
      }

      console.log(`🔍 Processing [${category}] "${name}" — ${pageUrl}`);

      // Step 1: scrape the source page for an image URL
      const rawImageUrl = await scrapeImageUrl(pageUrl);

      if (!rawImageUrl) {
        result.failed++;
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: null,
          status: "failed",
          reason: "No image found on source page",
        });
        continue;
      }

      // Step 2: download and store in Supabase Storage
      const cdnUrl = await fetchAndStoreImage(supabase, rawImageUrl, category, id);

      if (!cdnUrl) {
        result.failed++;
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: rawImageUrl,
          status: "failed",
          reason: "Image download or storage upload failed",
        });
        continue;
      }

      // Step 3: update the record
      const { error: updateError } = await supabase
        .from(table)
        .update({ image_url: cdnUrl, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (updateError) {
        result.failed++;
        result.details.push({
          id,
          name,
          sourceUrl: pageUrl,
          imageUrl: cdnUrl,
          status: "failed",
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
      });
    }

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
