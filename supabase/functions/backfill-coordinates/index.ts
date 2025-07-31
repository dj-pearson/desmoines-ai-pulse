// Supabase Edge Function: backfill-coordinates
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const tables = ["restaurants", "events", "attractions", "playgrounds"];
  let results: Record<string, any> = {};

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
    for (const record of data) {
      const { error: updateError } = await supabase
        .from(tableName)
        .update({ location: record.location })
        .eq("id", record.id);
      if (!updateError) updated++;
    }
    results[tableName] = { updated };
  }

  return new Response(JSON.stringify({ status: "complete", results }), {
    headers: { "Content-Type": "application/json" },
  });
});
