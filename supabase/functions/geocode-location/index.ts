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

    // Try multiple geocoding strategies
    const geocodingStrategies = [
      // 1. Try exact address first
      location,
      // 2. Remove suite/unit numbers
      location.replace(/\b(Suite|Ste|Unit|#)\s*[\w\-#]*\b/gi, '').replace(/\s+/g, ' ').trim(),
      // 3. Try just street + city + state
      location.replace(/\b(Suite|Ste|Unit|#)\s*[\w\-#]*\b/gi, '').replace(/,?\s*\d{5}(-\d{4})?\s*,?\s*USA\s*$/i, '').replace(/\s+/g, ' ').trim(),
      // 4. For playgrounds, try removing specific venue name and just use address
      location.includes('Park') || location.includes('Playground') ? 
        location.replace(/^[^,]+,\s*/, '').replace(/\s+/g, ' ').trim() : null
    ].filter(Boolean);

    for (let i = 0; i < geocodingStrategies.length; i++) {
      const searchLocation = geocodingStrategies[i];
      console.log(`Trying geocoding strategy ${i + 1}: "${searchLocation}"`);
      
      const url = new URL(NOMINATIM_API);
      url.searchParams.set("q", searchLocation);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");

      console.log(`Making request to Nominatim: ${url.toString()}`);

      const response = await fetch(url, {
        headers: { "User-Agent": APP_USER_AGENT },
      });

      if (!response.ok) {
        console.error(`Nominatim API request failed: ${response.status} ${response.statusText}`);
        continue; // Try next strategy
      }

      const data = await response.json();
      console.log(`Nominatim response for strategy ${i + 1}:`, data);

      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        const result = { latitude: parseFloat(lat), longitude: parseFloat(lon) };
        console.log(`Geocoding successful with strategy ${i + 1}:`, result);
        
        return new Response(
          JSON.stringify(result),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      
      // Add a small delay between requests to be respectful to Nominatim
      if (i < geocodingStrategies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`No coordinates found for location after trying all strategies: ${location}`);
    return new Response(
      JSON.stringify({ error: "No coordinates found for the location" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error(`Geocoding error:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})