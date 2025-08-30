import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CleanupRequest {
  retentionMonths?: number;
  dryRun?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('🧹 Event cleanup function called');

    let requestBody: CleanupRequest = {};
    
    if (req.method === 'POST') {
      try {
        requestBody = await req.json();
      } catch (error) {
        console.log('No JSON body provided, using defaults');
      }
    }

    const { 
      retentionMonths = 6, 
      dryRun = false 
    } = requestBody;

    console.log(`🧹 Running event cleanup - Retention: ${retentionMonths} months, Dry run: ${dryRun}`);

    if (dryRun) {
      // Calculate what would be deleted
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
      
      const { count: eventsToDelete } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .lt('date', cutoffDate.toISOString());

      console.log(`🧹 DRY RUN: Would delete ${eventsToDelete} events older than ${cutoffDate.toDateString()}`);

      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          retentionMonths,
          cutoffDate: cutoffDate.toISOString(),
          eventsToDelete: eventsToDelete || 0,
          message: `Dry run complete. Would delete ${eventsToDelete || 0} events.`
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Execute the actual cleanup using the database function
    const { data, error } = await supabase.rpc('purge_old_events', {
      retention_months: retentionMonths
    });

    if (error) {
      console.error('❌ Error running cleanup:', error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    console.log('✅ Event cleanup completed:', data);

    return new Response(
      JSON.stringify({
        success: true,
        retentionMonths,
        result: data,
        message: 'Event cleanup completed successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('❌ Unexpected error in cleanup function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});