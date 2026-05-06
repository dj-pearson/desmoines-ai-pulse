/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  extractAllImagesFromHtml,
  type ImageCandidate,
} from "../_shared/imageStorage.ts";
import {
  findExistingVenueRecord,
  getGooglePlacesPhotos,
} from "../_shared/imageFallbacks.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Category = "events" | "restaurants" | "attractions" | "playgrounds";

interface RequestBody {
  category: Category;
  id: string;
}

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
  playgrounds: "id, name, image_url, latitude, longitude",
};

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    let bytesRead = 0;
    const MAX = 200 * 1024;
    while (bytesRead < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      bytesRead += value.byteLength;
    }
    reader.cancel();
    return html;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as Partial<RequestBody>;
    if (!body.category || !body.id) {
      return new Response(
        JSON.stringify({ error: "category and id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const category = body.category as Category;
    const { data: record, error: recordErr } = await supabase
      .from(category)
      .select(SELECT_COLS[category])
      .eq("id", body.id)
      .maybeSingle();

    if (recordErr || !record) {
      return new Response(
        JSON.stringify({ error: recordErr?.message ?? "Record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const name: string = (record as Record<string, unknown>)[NAME_COL[category]] as string;
    const pageUrl: string | null =
      ((record as Record<string, unknown>)[URL_COL[category]] as string) ?? null;
    const venueName: string | null =
      ((record as Record<string, unknown>).venue as string | null) ?? null;
    const lat: number | null =
      ((record as Record<string, unknown>).latitude as number | null) ?? null;
    const lng: number | null =
      ((record as Record<string, unknown>).longitude as number | null) ?? null;
    const lookupName = venueName || name;

    const candidates: ImageCandidate[] = [];

    // 1) Source page scrape — all candidates, not just the top one
    if (pageUrl) {
      const html = await fetchHtml(pageUrl);
      if (html) candidates.push(...extractAllImagesFromHtml(html, pageUrl));
    }

    // 2) Existing venue record + their website
    if (lookupName) {
      const venue = await findExistingVenueRecord(supabase, lookupName);
      if (venue?.imageUrl) candidates.push({ url: venue.imageUrl, source: "venue" });
      if (venue?.website) {
        const html = await fetchHtml(venue.website);
        if (html) {
          for (const c of extractAllImagesFromHtml(html, venue.website)) {
            candidates.push({ ...c, source: "venue" });
          }
        }
      }
    }

    // 3) Google Places photos (up to 6)
    if (lookupName) {
      const placesUrls = await getGooglePlacesPhotos(lookupName, lat, lng, 6);
      for (const url of placesUrls) candidates.push({ url, source: "places" });
    }

    // Final dedupe across all sources
    const seen = new Set<string>();
    const unique = candidates.filter((c) =>
      seen.has(c.url) ? false : (seen.add(c.url), true),
    );

    return new Response(
      JSON.stringify({
        record: {
          id: body.id,
          name,
          currentImageUrl: (record as Record<string, unknown>).image_url ?? null,
          sourceUrl: pageUrl,
          venue: venueName,
        },
        candidates: unique,
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
