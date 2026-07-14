import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, getCorsHeaders, isOriginAllowed } from "../../cors.ts";
import { requireApiKey } from "../../apiKeyAuth.ts";

interface UpdateEventRequest {
  eventId: string;
  eventStartLocal: string;
  eventTimezone: string;
  eventStartUtc: string;
}

// UUID v4 format validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Basic ISO datetime validation
function isValidISODate(str: string): boolean {
  const d = new Date(str);
  return !isNaN(d.getTime());
}

// Common IANA timezone validation (non-exhaustive but covers common patterns)
function isValidTimezone(tz: string): boolean {
  if (!tz || tz.length > 50) return false;
  // Check basic format: Area/Location or UTC/GMT
  return /^[A-Za-z_]+\/[A-Za-z_\/]+$/.test(tz) || /^(UTC|GMT)([+-]\d{1,2})?$/.test(tz);
}

export default (async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = getCorsHeaders(isOriginAllowed(origin) ? origin : undefined);

  // Require API key or admin authentication (SEC-018)
  const authResponse = requireApiKey(req, corsHeaders);
  if (authResponse) return authResponse;

  try {
    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (req.method === 'POST') {
      const body: UpdateEventRequest = await req.json();
      const { eventId, eventStartLocal, eventTimezone, eventStartUtc } = body;

      // Input validation (SEC-018)
      if (!eventId || !UUID_REGEX.test(eventId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid eventId: must be a valid UUID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!eventStartLocal || !isValidISODate(eventStartLocal)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid eventStartLocal: must be a valid ISO datetime' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!eventTimezone || !isValidTimezone(eventTimezone)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid eventTimezone: must be a valid IANA timezone' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
          JSON.stringify({ success: false, error: 'Failed to update event' }),
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
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
