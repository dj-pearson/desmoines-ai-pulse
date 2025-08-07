import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UpdateEventRequest {
  eventId: string;
  eventStartLocal: string;
  eventTimezone: string;
  eventStartUtc: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      const body: UpdateEventRequest = await req.json();
      const { eventId, eventStartLocal, eventTimezone, eventStartUtc } = body;

      console.log(`Updating event ${eventId} with datetime:`, {
        eventStartLocal,
        eventTimezone,
        eventStartUtc
      });

      // Update the event with service role privileges
      const { data, error } = await supabase
        .from('events')
        .update({
          date: eventStartUtc, // Also update the legacy date field
          event_start_local: eventStartLocal,
          event_timezone: eventTimezone,
          event_start_utc: eventStartUtc,
          updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)
        .select();

      if (error) {
        console.error('Database update error:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (!data || data.length === 0) {
        console.error('No rows affected in update');
        return new Response(
          JSON.stringify({ success: false, error: 'No rows were updated' }),
          { 
            status: 404, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      console.log('Successfully updated event:', data[0]);
      return new Response(
        JSON.stringify({ success: true, data: data[0] }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});