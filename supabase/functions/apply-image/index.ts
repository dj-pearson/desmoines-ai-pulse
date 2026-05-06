/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchAndStoreImage } from "../_shared/imageStorage.ts";
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Category = "events" | "restaurants" | "attractions" | "playgrounds";

interface ApplyImageRequest {
  category: Category;
  id: string;
  imageUrl: string;
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

    const body = (await req.json().catch(() => ({}))) as Partial<ApplyImageRequest>;
    if (!body.category || !body.id || !body.imageUrl) {
      return new Response(
        JSON.stringify({ error: "category, id, and imageUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Manual override: drop any existing media_assets row for this record so
    // fetchAndStoreImage doesn't short-circuit on "this content already has an
    // asset". The previous storage object stays (cheap, may be shared via dedup).
    const CONTENT_TYPE_MAP: Record<Category, string> = {
      events: "event",
      restaurants: "restaurant",
      attractions: "attraction",
      playgrounds: "playground",
    };
    await supabase
      .from("media_assets")
      .delete()
      .eq("content_type", CONTENT_TYPE_MAP[body.category])
      .eq("content_id", body.id);

    // fetchAndStoreImage handles dedup (source URL + content hash) and writes
    // the media_assets row. It returns the public CDN URL we should set on the
    // content row.
    const cdnUrl = await fetchAndStoreImage(
      supabase,
      body.imageUrl,
      body.category,
      body.id,
    );

    if (!cdnUrl) {
      return new Response(
        JSON.stringify({ error: "Failed to download or store the chosen image" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updateErr } = await supabase
      .from(body.category)
      .update({ image_url: cdnUrl, updated_at: new Date().toISOString() })
      .eq("id", body.id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: `DB update failed: ${updateErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ imageUrl: cdnUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("apply-image error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
