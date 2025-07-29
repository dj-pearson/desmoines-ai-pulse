import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GooglePlacesSearchRequest {
  location: string;
  radius: number;
}

interface GooglePlacesResult {
  place_id: string;
  name: string;
  formatted_address: string;
  business_status: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  types: string[];
  opening_hours?: {
    open_now: boolean;
  };
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  formatted_phone_number?: string;
  website?: string;
}

interface GooglePlace {
  place_id: string;
  name: string;
  formatted_address: string;
  business_status: string;
  types: string[];
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { location, radius }: GooglePlacesSearchRequest = await req.json();

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_SEARCH_API");
    if (!GOOGLE_API_KEY) {
      throw new Error("Google API key not configured");
    }

    // First, geocode the location to get coordinates
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        location
      )}&key=${GOOGLE_API_KEY}`
    );

    const geocodeData = await geocodeResponse.json();

    if (!geocodeData.results?.length) {
      throw new Error("Could not geocode location");
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;

    // Search for restaurants using Places API
    const placesResponse = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_API_KEY}`
    );

    const placesData = await placesResponse.json();

    if (placesData.status !== "OK") {
      throw new Error(`Google Places API error: ${placesData.status}`);
    }

    // Filter out fast food chains and already existing restaurants
    const filteredRestaurants = placesData.results.filter(
      (place: GooglePlace) => {
        // Skip fast food chains (common chain indicators)
        const fastFoodChains = [
          "mcdonald",
          "burger king",
          "kfc",
          "taco bell",
          "subway",
          "pizza hut",
          "domino",
          "papa john",
          "wendys",
          "arbys",
          "dairy queen",
          "sonic",
          "popeyes",
          "chipotle",
          "panera",
          "jimmy john",
          "starbucks",
          "dunkin",
        ];

        const nameLower = place.name.toLowerCase();
        const isChain = fastFoodChains.some((chain) =>
          nameLower.includes(chain)
        );

        // Only include actual restaurants (not just food)
        const isRestaurant =
          place.types.includes("restaurant") &&
          !place.types.includes("gas_station") &&
          !place.types.includes("convenience_store");

        return (
          !isChain && isRestaurant && place.business_status === "OPERATIONAL"
        );
      }
    );

    // Get detailed information for each restaurant
    const detailedRestaurants: GooglePlacesResult[] = [];

    for (const place of filteredRestaurants.slice(0, 20)) {
      // Limit to 20 to avoid API limits
      try {
        const detailsResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,price_level,types,business_status,opening_hours&key=${GOOGLE_API_KEY}`
        );

        const detailsData = await detailsResponse.json();

        if (detailsData.status === "OK") {
          detailedRestaurants.push(detailsData.result);
        }

        // Add small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Error getting details for ${place.name}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        restaurants: detailedRestaurants,
        total_found: filteredRestaurants.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in search-new-restaurants function:", error);
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
