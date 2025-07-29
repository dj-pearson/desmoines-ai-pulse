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

    console.log("Starting search for location:", location, "radius:", radius);
    console.log("API key configured:", GOOGLE_API_KEY ? "Yes" : "No");

    // First, geocode the location to get coordinates
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      location
    )}&key=${GOOGLE_API_KEY}`;

    console.log("Geocoding URL:", geocodeUrl.replace(GOOGLE_API_KEY, "***"));

    const geocodeResponse = await fetch(geocodeUrl);

    if (!geocodeResponse.ok) {
      console.error(
        "Geocode response not OK:",
        geocodeResponse.status,
        geocodeResponse.statusText
      );
      throw new Error(
        `Geocoding request failed with status: ${geocodeResponse.status}`
      );
    }

    const geocodeData = await geocodeResponse.json();
    console.log("Geocode response status:", geocodeData.status);
    console.log("Geocode results count:", geocodeData.results?.length || 0);

    if (geocodeData.status !== "OK") {
      console.error(
        "Geocoding API error:",
        geocodeData.status,
        geocodeData.error_message
      );
      throw new Error(
        `Geocoding API error: ${geocodeData.status} - ${
          geocodeData.error_message || "Unknown error"
        }`
      );
    }

    if (!geocodeData.results?.length) {
      throw new Error("Could not geocode location - no results returned");
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;
    console.log("Geocoded coordinates:", lat, lng);

    // Search for restaurants using Places API
    const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_API_KEY}`;
    console.log("Places search URL:", placesUrl.replace(GOOGLE_API_KEY, "***"));

    const placesResponse = await fetch(placesUrl);

    if (!placesResponse.ok) {
      console.error(
        "Places response not OK:",
        placesResponse.status,
        placesResponse.statusText
      );
      throw new Error(
        `Places API request failed with status: ${placesResponse.status}`
      );
    }

    const placesData = await placesResponse.json();
    console.log("Places API response status:", placesData.status);
    console.log("Places found:", placesData.results?.length || 0);

    if (placesData.status !== "OK") {
      console.error(
        "Places API error:",
        placesData.status,
        placesData.error_message
      );
      throw new Error(
        `Google Places API error: ${placesData.status} - ${
          placesData.error_message || "Unknown error"
        }`
      );
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
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    return new Response(
      JSON.stringify({
        error: error.message || "An unexpected error occurred",
        details:
          process.env.NODE_ENV === "development" ? error.stack : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
