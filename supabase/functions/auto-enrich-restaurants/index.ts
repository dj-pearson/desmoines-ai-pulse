import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
      return new Response(JSON.stringify({
        success: true,
        message: 'No restaurants need enrichment',
        processed: 0,
        enriched: 0
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

    const { data: updateResult, error: updateError } = await supabase.functions.invoke(
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

    console.log('✅ Enrichment complete:', updateResult);

    // Calculate improvement stats
    const successCount = updateResult?.updated || 0;
    const errorCount = updateResult?.errors || 0;

    // Log detailed results
    const response = {
      success: true,
      message: `Auto-enrichment completed: ${successCount} restaurants updated`,
      processed: incompleteRestaurants.length,
      enriched: successCount,
      errors: errorCount,
      missingDataBefore: missingDataSummary,
      bulkUpdateResult: updateResult
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
