import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GooglePlacesSearchRequest {
  location: string;
  radius: number;
  offset?: number;
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
    const {
      location,
      radius,
      offset = 0,
    }: GooglePlacesSearchRequest = await req.json();

    const GOOGLE_API_KEY = globalThis.Deno?.env?.get("GOOGLE_SEARCH_API");
    if (!GOOGLE_API_KEY) {
      throw new Error("Google API key not configured");
    }

    // Initialize Supabase client
    const supabaseUrl = globalThis.Deno?.env?.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey =
      globalThis.Deno?.env?.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log(
      "Starting search for location:",
      location,
      "radius:",
      radius,
      "offset:",
      offset
    );
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

    // Search for restaurants using Places API (New)
    const placesUrl = `https://places.googleapis.com/v1/places:searchNearby`;
    console.log("Places search URL (New API):", placesUrl);

    const placesRequestBody = {
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: {
            latitude: lat,
            longitude: lng,
          },
          radius: radius,
        },
      },
      languageCode: "en",
      // Add ranking preference to get more diverse results
      rankPreference: offset > 0 ? "DISTANCE" : "POPULARITY",
    };

    const placesResponse = await fetch(placesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_API_KEY,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.businessStatus,places.rating,places.userRatingCount,places.priceLevel,places.types,places.currentOpeningHours,places.nationalPhoneNumber,places.websiteUri",
      },
      body: JSON.stringify(placesRequestBody),
    });

    if (!placesResponse.ok) {
      console.error(
        "Places response not OK:",
        placesResponse.status,
        placesResponse.statusText
      );
      const errorText = await placesResponse.text();
      console.error("Places API error response:", errorText);
      throw new Error(
        `Places API request failed with status: ${placesResponse.status} - ${errorText}`
      );
    }

    const placesData = await placesResponse.json();
    console.log("Places API response received");
    console.log("Places found:", placesData.places?.length || 0);
    console.log("First place sample:", placesData.places?.[0]);

    if (!placesData.places) {
      console.log("No places found in response");
      placesData.places = [];
    }

    // Get existing restaurants from database to avoid duplicates
    console.log("Fetching existing restaurants from database...");
    const { data: existingRestaurants, error: dbError } = await supabase
      .from("restaurants")
      .select("name, location, google_place_id")
      .not("google_place_id", "is", null);

    if (dbError) {
      console.error("Error fetching existing restaurants:", dbError);
      // Continue without filtering if database error
    }

    const existingPlaceIds = new Set(
      existingRestaurants?.map((r) => r.google_place_id) || []
    );
    const existingNames = new Set(
      existingRestaurants?.map((r) => r.name.toLowerCase()) || []
    );
    console.log(
      "Found",
      existingPlaceIds.size,
      "existing restaurants in database"
    );

    // Filter out fast food chains and already existing restaurants
    const filteredRestaurants = placesData.places.filter((place: any) => {
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
        "casey's",
        "kwik trip",
        "hy-vee",
        "walmart",
        "target",
      ];

      const nameLower = (
        place.displayName?.text ||
        place.displayName ||
        place.name ||
        ""
      ).toLowerCase();

      const isChain = fastFoodChains.some((chain) => nameLower.includes(chain));

      // Only include actual restaurants (not just food)
      const isRestaurant = place.types?.includes("restaurant") || false;

      // Check if restaurant already exists in database
      const isExisting =
        existingPlaceIds.has(place.id) || existingNames.has(nameLower);

      console.log(
        `Filtering ${nameLower}: chain=${isChain}, restaurant=${isRestaurant}, existing=${isExisting}, operational=${
          place.businessStatus === "OPERATIONAL"
        }`
      );

      return (
        !isChain &&
        isRestaurant &&
        !isExisting &&
        place.businessStatus === "OPERATIONAL"
      );
    });

    // Convert the new API format to our expected format
    const detailedRestaurants: GooglePlacesResult[] = filteredRestaurants.map(
      (place: any) => {
        const mapped = {
          place_id: place.id,
          name:
            place.displayName?.text ||
            place.displayName ||
            place.name ||
            "Unknown Restaurant",
          formatted_address: place.formattedAddress,
          business_status: place.businessStatus,
          rating: place.rating,
          user_ratings_total: place.userRatingCount,
          price_level: place.priceLevel,
          types: place.types || [],
          opening_hours: place.currentOpeningHours
            ? {
                open_now: place.currentOpeningHours.openNow,
              }
            : undefined,
          formatted_phone_number: place.nationalPhoneNumber,
          website: place.websiteUri,
        };
        console.log("Mapped restaurant:", mapped);
        return mapped;
      }
    );

    console.log(
      `Filtered results: ${filteredRestaurants.length} new restaurants found (${placesData.places.length} total places returned)`
    );

    return new Response(
      JSON.stringify({
        restaurants: detailedRestaurants,
        total_found: filteredRestaurants.length,
        total_places_searched: placesData.places.length,
        offset: offset,
        existing_restaurants_count: existingPlaceIds.size,
        has_more: placesData.places.length === 20, // Suggest there might be more if we got max results
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
          globalThis.Deno?.env?.get("NODE_ENV") === "development"
            ? error.stack
            : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
