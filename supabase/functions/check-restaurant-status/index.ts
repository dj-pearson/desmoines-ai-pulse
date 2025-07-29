import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Restaurant {
  id: string;
  name: string;
  google_place_id?: string;
  status: string;
}

interface RestaurantStatus {
  id: string;
  name: string;
  current_status: string;
  google_status: string;
  needs_update: boolean;
}

interface CheckStatusRequest {
  restaurants: Restaurant[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { restaurants }: CheckStatusRequest = await req.json();

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_SEARCH_API");
    if (!GOOGLE_API_KEY) {
      throw new Error("Google API key not configured");
    }

    const closedRestaurants: RestaurantStatus[] = [];

    for (const restaurant of restaurants) {
      if (!restaurant.google_place_id) {
        continue; // Skip restaurants without Google Place ID
      }

      try {
        // Check restaurant status using Google Places API (New)
        const response = await fetch(
          `https://places.googleapis.com/v1/places/${restaurant.google_place_id}`,
          {
            method: 'GET',
            headers: {
              'X-Goog-Api-Key': GOOGLE_API_KEY,
              'X-Goog-FieldMask': 'id,name,businessStatus'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          const googleStatus = data.businessStatus;

          // Check if restaurant is permanently closed or temporarily closed
          if (
            googleStatus === "CLOSED_PERMANENTLY" ||
            googleStatus === "CLOSED_TEMPORARILY"
          ) {
            closedRestaurants.push({
              id: restaurant.id,
              name: restaurant.name,
              current_status: restaurant.status,
              google_status: googleStatus,
              needs_update: true,
            });
          }
        } else if (response.status === 404) {
          // Place no longer exists
          closedRestaurants.push({
            id: restaurant.id,
            name: restaurant.name,
            current_status: restaurant.status,
            google_status: "NOT_FOUND",
            needs_update: true,
          });
        }

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 150));
      } catch (error) {
        console.error(`Error checking status for ${restaurant.name}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        closedRestaurants,
        checked_count: restaurants.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in check-restaurant-status function:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "An unexpected error occurred",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
