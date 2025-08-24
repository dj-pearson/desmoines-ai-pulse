import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tables = ["restaurants", "events", "attractions", "playgrounds"];
    let results: Record<string, any> = {};
    let totalUpdated = 0;

    console.log('Starting coordinate backfill for all tables...');

    for (const tableName of tables) {
      console.log(`Processing ${tableName} table...`);
      
      // Get records with null coordinates but valid location
      const { data, error } = await supabase
        .from(tableName)
        .select("id, location")
        .is("latitude", null)
        .not("location", "is", null)
        .neq("location", "");

      if (error) {
        console.error(`Error fetching from ${tableName}:`, error);
        results[tableName] = { error: error.message };
        continue;
      }

      if (!data || data.length === 0) {
        console.log(`No records to update in ${tableName}`);
        results[tableName] = { updated: 0, skipped: 0, errors: 0 };
        continue;
      }

      console.log(`Found ${data.length} records to update in ${tableName}`);
      
      let updated = 0;
      let skipped = 0;
      let errors = 0;

      // Process records in batches to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (record) => {
          try {
            // Call geocoding function
            const geocodeResponse = await supabase.functions.invoke('geocode-location', {
              body: { location: record.location }
            });

            // Check if this is a 404 error (no coordinates found) - treat as skipped, not error
            if (geocodeResponse.error) {
              // Check if the error context indicates a 404 status
              const errorContext = geocodeResponse.error.context;
              if (errorContext && errorContext.status === 404) {
                console.log(`No coordinates available for ${record.location} in ${tableName}`);
                skipped++;
                return;
              } else {
                console.error(`Geocoding error for ${record.location}:`, geocodeResponse.error);
                errors++;
                return;
              }
            }

            const { latitude, longitude } = geocodeResponse.data;

            if (latitude && longitude) {
              // Update coordinates
              const { error: updateError } = await supabase
                .from(tableName)
                .update({ 
                  latitude: latitude,
                  longitude: longitude 
                })
                .eq("id", record.id);

              if (updateError) {
                console.error(`Update error for ${record.id}:`, updateError);
                errors++;
              } else {
                console.log(`Updated coordinates for ${record.id} in ${tableName}`);
                updated++;
              }
            } else {
              console.log(`No coordinates found for ${record.location} in ${tableName}`);
              skipped++;
            }
          } catch (err) {
            // Handle 404 errors gracefully
            const errorMessage = err.message || '';
            if (errorMessage.includes('404') || errorMessage.includes('No coordinates found')) {
              console.log(`No coordinates available for ${record.location} in ${tableName}`);
              skipped++;
            } else {
              console.error(`Processing error for ${record.id}:`, err);
              errors++;
            }
          }
        }));

        // Small delay between batches to be respectful to geocoding service
        if (i + batchSize < data.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      results[tableName] = { updated, skipped, errors };
      totalUpdated += updated;
      
      console.log(`Completed ${tableName}: ${updated} updated, ${skipped} skipped, ${errors} errors`);
    }

    console.log(`Backfill complete. Total records updated: ${totalUpdated}`);

    return new Response(
      JSON.stringify({ 
        status: "complete", 
        results,
        totalUpdated,
        message: `Successfully updated coordinates for ${totalUpdated} records across all tables`
      }), 
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ 
        status: "error", 
        error: error.message 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});