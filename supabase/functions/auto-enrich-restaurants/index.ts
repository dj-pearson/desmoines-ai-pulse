import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAdminOrApiKey } from "../_shared/apiKeyAuth.ts";
import { runJob } from "../_shared/jobRunner.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Auto-Enrich Restaurants Function
 *
 * Automatically detects restaurants with missing critical data and enriches them
 * using the existing bulk-update-restaurants function.
 *
 * Runs daily via cron to maintain high data quality.
 *
 * Missing data criteria:
 * - phone number
 * - website
 * - rating
 * - image_url
 * - description
 * - latitude/longitude
 */

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // No caller check existed, and this runs as service_role. verify_jwt is not
  // a gate here: it defaults to true, and true only means "a valid Supabase
  // JWT" - which the publishable anon key is, in every client bundle.
  //
  // The ONLY caller is pg_cron (20260823000008:53), which sends
  // Bearer <service_role_key> and raises rather than posting unauthenticated.
  // requireAdminOrApiKey accepts that key explicitly, for exactly this case,
  // so the scheduled path is unchanged.
  const authFailure = await requireAdminOrApiKey(req, corsHeaders);
  if (authFailure) return authFailure;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔍 Starting auto-enrich process...');

    // Parse request body for configuration
    const body = await req.json().catch(() => ({}));
    const {
      batchSize = 20,  // Process 20 restaurants at a time
      prioritizeNew = true,  // Prioritize recently added restaurants
    } = body;

    // Find restaurants with missing critical data
    // Priority order: phone, website, rating, image, description, coordinates
    const { data: incompleteRestaurants, error: fetchError } = await supabase
      .from('restaurants')
      .select('id, name, phone, website, rating, image_url, description, latitude, longitude, created_at, data_quality_score')
      .or('phone.is.null,website.is.null,rating.is.null,image_url.is.null,description.is.null,latitude.is.null,longitude.is.null')
      .order(prioritizeNew ? 'created_at' : 'data_quality_score', { ascending: prioritizeNew ? false : true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch incomplete restaurants: ${fetchError.message}`);
    }

    if (!incompleteRestaurants || incompleteRestaurants.length === 0) {
      console.log('✅ All restaurants have complete data!');
      // WEB-BE-043: recorded, not just returned. "Nothing to enrich" and "this
      // function has not run in a week" are different facts and used to produce
      // the same evidence - none.
      const emptyRun = await runJob('auto-enrich-restaurants', async (ctx) => {
        ctx.meta({ sources: { restaurants: { fetched: 0, inserted: 0, duplicates: 0, errors: 0 } } });
      });
      return new Response(JSON.stringify({
        success: true,
        message: 'No restaurants need enrichment',
        processed: 0,
        enriched: 0,
        runId: emptyRun.runId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    console.log(`📊 Found ${incompleteRestaurants.length} restaurants with missing data`);

    // Log what's missing for each restaurant
    const missingDataSummary = incompleteRestaurants.map(r => ({
      name: r.name,
      missing: [
        !r.phone && 'phone',
        !r.website && 'website',
        !r.rating && 'rating',
        !r.image_url && 'image',
        !r.description && 'description',
        !r.latitude && 'coordinates'
      ].filter(Boolean)
    }));

    console.log('📋 Missing data summary:', JSON.stringify(missingDataSummary, null, 2));

    // Extract restaurant IDs to enrich
    const restaurantIds = incompleteRestaurants.map(r => r.id);

    // Call the existing bulk-update-restaurants function
    console.log(`🚀 Calling bulk-update-restaurants for ${restaurantIds.length} restaurants...`);

    // WEB-BE-043. `updated` here is the enrichment count, and it is the number
    // that goes dark first: Google Places stops answering, every restaurant
    // comes back unenriched, and the function keeps returning 200 with
    // "Auto-enrichment completed: 0 restaurants updated".
    let successCount = 0;
    let errorCount = 0;
    let updateResult: { updated?: number; errors?: number } | null = null;
    const job = await runJob('auto-enrich-restaurants', async (ctx) => {
      const { data, error: updateError } = await supabase.functions.invoke(
        'bulk-update-restaurants',
        {
          body: {
            restaurantIds,
            forceUpdate: true,  // Force update even if recently updated
            batchSize: restaurantIds.length
          }
        }
      );

      if (updateError) {
        throw new Error(`Bulk update failed: ${updateError.message}`);
      }

      updateResult = data;
      console.log('✅ Enrichment complete:', updateResult);

      successCount = updateResult?.updated || 0;
      errorCount = updateResult?.errors || 0;
      ctx.processed(successCount);
      ctx.failed(errorCount);
      ctx.meta({
        sources: {
          restaurants: {
            fetched: incompleteRestaurants.length,
            // An enrichment IS the write this job exists to make; there is no
            // insert path here, so counting `updated` as inserted is what makes
            // the zero-result rule mean anything for this job.
            inserted: successCount,
            duplicates: 0,
            errors: errorCount,
          },
        },
      });
    });

    // runJob SWALLOWS THE THROW - it records the failed run and returns
    // { ok: false } rather than propagating, so the catch below no longer sees
    // a bulk-update failure. Without this the function would answer 200
    // "Auto-enrichment completed: 0 restaurants updated" for a total failure,
    // which is the exact shape of the bug WEB-BE-043 exists to remove.
    if (!job.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: job.error ?? 'enrichment failed',
        processed: incompleteRestaurants.length,
        enriched: 0,
        runId: job.runId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }

    // Log detailed results
    const response = {
      success: true,
      message: `Auto-enrichment completed: ${successCount} restaurants updated`,
      processed: incompleteRestaurants.length,
      enriched: successCount,
      errors: errorCount,
      missingDataBefore: missingDataSummary,
      bulkUpdateResult: updateResult,
      runId: job.runId,
      ...(job.status === 'skipped' ? { paused: true } : {})
    };

    console.log('📊 Final results:', JSON.stringify(response, null, 2));

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error) {
    console.error('❌ Auto-enrich error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
