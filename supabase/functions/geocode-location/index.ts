import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";
const APP_USER_AGENT = "DesMoinesInsider/1.0 (https://desmoinesinsider.com; mailto:admin@desmoinesinsider.com)";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log(`Geocode request: ${req.method} ${req.url}`);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    console.log(`Request body: ${body}`);
    
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    
    const { location } = parsedBody;
    console.log(`Geocoding location: ${location}`);

    if (!location) {
      return new Response(
        JSON.stringify({ error: "Location is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const url = new URL(NOMINATIM_API);
    url.searchParams.set("q", location);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    console.log(`Making request to Nominatim: ${url.toString()}`);

    const response = await fetch(url, {
      headers: { "User-Agent": APP_USER_AGENT },
    });

    if (!response.ok) {
      console.error(`Nominatim API request failed: ${response.status} ${response.statusText}`);
      throw new Error(`Nominatim API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Nominatim response:`, data);

    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      const result = { latitude: parseFloat(lat), longitude: parseFloat(lon) };
      console.log(`Geocoding successful:`, result);
      
      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    } else {
      console.log(`No coordinates found for location: ${location}`);
      return new Response(
        JSON.stringify({ error: "No coordinates found for the location" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }
  } catch (error) {
    console.error(`Geocoding error:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})