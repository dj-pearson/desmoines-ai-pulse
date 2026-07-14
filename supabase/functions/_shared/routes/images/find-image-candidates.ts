/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

// find-image-candidates
//
// Powers the admin manual-override image picker (ImagePickerDialog.tsx). Given a
// content record, returns every plausible image candidate — page metadata
// (og/twitter/JSON-LD/img), an existing venue record, and Google Places photos —
// so a human can pick the right one when the automatic backfill chose wrong or
// found nothing. Read-only: it never mutates content (apply-image does that).
//
// This was referenced by the UI but never implemented, so the manual escape
// hatch was dead. All the heavy lifting already exists in _shared helpers.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  extractAllImagesFromHtml,
  type ImageCandidate,
} from "../../imageStorage.ts";
import {
  findExistingVenueRecord,
  getGooglePlacesPhotos,
} from "../../imageFallbacks.ts";
import { requireAdminOrApiKey } from "../../apiKeyAuth.ts";
import { validateURLForSSRF } from "../../validation.ts";
import { fetchTextWithSizeCap } from "../../fetchGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Category = "events" | "restaurants" | "attractions" | "playgrounds";

const NAME_COL: Record<Category, string> = {
  events: "title",
  restaurants: "name",
  attractions: "name",
  playgrounds: "name",
};

const URL_COL: Record<Category, string> = {
  events: "source_url",
  restaurants: "website",
  attractions: "website",
  playgrounds: "source_url",
};

const SELECT_COLS: Record<Category, string> = {
  events: "id, title, source_url, image_url, venue, latitude, longitude",
  restaurants: "id, name, website, image_url, latitude, longitude",
  attractions: "id, name, website, image_url, latitude, longitude",
  playgrounds: "id, name, source_url, image_url, latitude, longitude",
};

const MAX_HTML_BYTES = 200 * 1024; // enough for meta tags + hero images
const MAX_CANDIDATES = 24;

interface FindRequest {
  category?: Category;
  id?: string;
}

/** Scrape a page through the SSRF guard + size cap and return its image candidates. */
async function candidatesFromPage(pageUrl: string): Promise<ImageCandidate[]> {
  const ssrf = validateURLForSSRF(pageUrl, {
    allowedProtocols: ["http:", "https:"],
    blockPrivateIPs: true,
  });
  if (!ssrf.valid) {
    console.warn(`find-image-candidates: refusing unsafe URL ${pageUrl}: ${ssrf.error}`);
    return [];
  }

  try {
    const { ok, status, text } = await fetchTextWithSizeCap(
      pageUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(15_000),
      },
      MAX_HTML_BYTES,
    );
    if (!ok || !text) {
      console.warn(`find-image-candidates: page fetch failed (${status}) for ${pageUrl}`);
      return [];
    }
    return extractAllImagesFromHtml(text, pageUrl);
  } catch (err) {
    console.warn(`find-image-candidates: scrape error for ${pageUrl}:`, (err as Error).message);
    return [];
  }
}

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authError = await requireAdminOrApiKey(req, corsHeaders);
  if (authError) return authError;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as FindRequest;
    const category = body.category;
    const id = body.id;
    if (!category || !id || !(category in NAME_COL)) {
      return new Response(
        JSON.stringify({ error: "category and id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: record, error: recErr } = await supabase
      .from(category)
      .select(SELECT_COLS[category])
      .eq("id", id)
      .maybeSingle();

    if (recErr) {
      return new Response(JSON.stringify({ error: recErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!record) {
      return new Response(JSON.stringify({ error: "Record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name: string = (record as Record<string, unknown>)[NAME_COL[category]] as string ?? id;
    const pageUrl: string | null =
      ((record as Record<string, unknown>)[URL_COL[category]] as string | null) ?? null;
    const venue: string | null = ((record as Record<string, unknown>).venue as string | null) ?? null;
    const lat: number | null = ((record as Record<string, unknown>).latitude as number | null) ?? null;
    const lng: number | null = ((record as Record<string, unknown>).longitude as number | null) ?? null;
    const lookupName = venue || name;

    const candidates: ImageCandidate[] = [];

    // 1) Page metadata + hero images from the record's own source page.
    if (pageUrl) {
      candidates.push(...(await candidatesFromPage(pageUrl)));
    }

    // 2) An existing venue/business record we already stored an image for.
    if (lookupName) {
      const venueRecord = await findExistingVenueRecord(supabase, lookupName);
      if (venueRecord?.imageUrl) {
        candidates.push({ url: venueRecord.imageUrl, source: "venue" });
      }
    }

    // 3) Google Places photos (best for restaurants/attractions/venues).
    if (lookupName) {
      const placePhotos = await getGooglePlacesPhotos(lookupName, lat, lng, 6);
      for (const url of placePhotos) candidates.push({ url, source: "places" });
    }

    // Dedupe by URL, preserving discovery order (best sources first), cap output.
    const seen = new Set<string>();
    const deduped = candidates
      .filter((c) => c.url && !seen.has(c.url) && seen.add(c.url))
      .slice(0, MAX_CANDIDATES);

    return new Response(
      JSON.stringify({
        record: {
          id,
          name,
          currentImageUrl:
            ((record as Record<string, unknown>).image_url as string | null) ?? null,
          sourceUrl: pageUrl,
          venue,
        },
        candidates: deduped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("find-image-candidates error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
