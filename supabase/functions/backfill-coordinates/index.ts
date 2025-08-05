// Supabase Edge Function: backfill-coordinates
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const tables = ["restaurants", "events", "attractions", "playgrounds"];
  let results: Record<string, any> = {};

  const googleApiKey = Deno.env.get("GOOGLE_MAPS_KEY")!;
  for (const tableName of tables) {
    const { data, error } = await supabase
      .from(tableName)
      .select("id, location")
      .is("latitude", null);

    if (error) {
      results[tableName] = { error: error.message };
      continue;
    }
    if (!data || data.length === 0) {
      results[tableName] = { updated: 0 };
      continue;
    }
    let updated = 0;
    let debug = [];
    for (const record of data) {
      if (!record.location) {
        debug.push({ id: record.id, reason: "No location string" });
        continue;
      }
      // Geocode location using Google Geocoding API
      debug.push({ id: record.id, location: record.location });
      const geoRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          record.location
        )}&key=${googleApiKey}`
      );
      const geoData = await geoRes.json();
      debug[debug.length - 1].geocode = geoData;
      const result = geoData.results && geoData.results[0];
      if (result && result.geometry && result.geometry.location) {
        const lat = result.geometry.location.lat;
        const lng = result.geometry.location.lng;
        const { error: updateError } = await supabase
          .from(tableName)
          .update({ latitude: lat, longitude: lng })
          .eq("id", record.id);
        debug[debug.length - 1].updateError = updateError || null;
        if (!updateError) updated++;
      } else {
        debug[debug.length - 1].reason = "No geocode result";
      }
    }
    results[tableName] = { updated, debug };
  }

  return new Response(JSON.stringify({ status: "complete", results }), {
    headers: { "Content-Type": "application/json" },
  });
});
