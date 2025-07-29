import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_SEARCH_API");

    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "Google API key not configured",
          status: "missing_key",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    // Test basic geocoding
    const testLocation = "Des Moines, IA";
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      testLocation
    )}&key=${GOOGLE_API_KEY}`;

    console.log("Testing geocoding API...");
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();

    // Test Places API
    let placesTest = null;
    if (geocodeData.status === "OK" && geocodeData.results?.length > 0) {
      const { lat, lng } = geocodeData.results[0].geometry.location;
      const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=1000&type=restaurant&key=${GOOGLE_API_KEY}`;

      console.log("Testing Places API...");
      const placesResponse = await fetch(placesUrl);
      const placesData = await placesResponse.json();

      placesTest = {
        status: placesData.status,
        results_count: placesData.results?.length || 0,
        error_message: placesData.error_message,
      };
    }

    return new Response(
      JSON.stringify({
        api_key_configured: true,
        geocoding: {
          status: geocodeData.status,
          results_count: geocodeData.results?.length || 0,
          error_message: geocodeData.error_message,
          coordinates:
            geocodeData.results?.length > 0
              ? geocodeData.results[0].geometry.location
              : null,
        },
        places: placesTest,
        test_location: testLocation,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in test-google-api function:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "An unexpected error occurred",
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
