import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SearchRequest {
  location: string;
  radius: number;
  offset?: number;
}

interface HotelResult {
  place_id: string;
  name: string;
  formatted_address: string;
  business_status: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  types: string[];
  opening_hours?: { open_now: boolean };
  formatted_phone_number?: string;
  website?: string;
  // Hotel-specific fields extracted from Google Places
  star_rating?: number;
  hotel_type?: string;
  brand_parent?: string;
  chain_name?: string;
}

/**
 * Maps a Google Places hotel to its parent brand company.
 * Returns { chain_name, brand_parent } or nulls if not a known chain.
 */
function detectBrand(name: string): { chain_name: string | null; brand_parent: string | null } {
  const n = name.toLowerCase();

  // Hilton brands
  if (n.includes("waldorf astoria")) return { chain_name: "Waldorf Astoria", brand_parent: "Hilton" };
  if (n.includes("lxr")) return { chain_name: "LXR Hotels", brand_parent: "Hilton" };
  if (n.includes("signia")) return { chain_name: "Signia", brand_parent: "Hilton" };
  if (n.includes("conrad")) return { chain_name: "Conrad", brand_parent: "Hilton" };
  if (n.includes("canopy by hilton")) return { chain_name: "Canopy", brand_parent: "Hilton" };
  if (n.includes("curio collection") || n.includes("curio")) return { chain_name: "Curio Collection", brand_parent: "Hilton" };
  if (n.includes("tapestry collection") || n.includes("tapestry")) return { chain_name: "Tapestry Collection", brand_parent: "Hilton" };
  if (n.includes("embassy suites")) return { chain_name: "Embassy Suites", brand_parent: "Hilton" };
  if (n.includes("hilton garden inn")) return { chain_name: "Hilton Garden Inn", brand_parent: "Hilton" };
  if (n.includes("hampton inn") || n.includes("hampton by hilton")) return { chain_name: "Hampton Inn", brand_parent: "Hilton" };
  if (n.includes("tru by hilton")) return { chain_name: "Tru by Hilton", brand_parent: "Hilton" };
  if (n.includes("homewood suites")) return { chain_name: "Homewood Suites", brand_parent: "Hilton" };
  if (n.includes("home2 suites")) return { chain_name: "Home2 Suites", brand_parent: "Hilton" };
  if (n.includes("doubletree")) return { chain_name: "DoubleTree", brand_parent: "Hilton" };
  if (n.includes("hilton")) return { chain_name: "Hilton", brand_parent: "Hilton" };

  // Marriott brands
  if (n.includes("ritz-carlton") || n.includes("ritz carlton")) return { chain_name: "Ritz-Carlton", brand_parent: "Marriott" };
  if (n.includes("st. regis") || n.includes("st regis")) return { chain_name: "St. Regis", brand_parent: "Marriott" };
  if (n.includes("edition")) return { chain_name: "EDITION", brand_parent: "Marriott" };
  if (n.includes("jw marriott")) return { chain_name: "JW Marriott", brand_parent: "Marriott" };
  if (n.includes("autograph collection")) return { chain_name: "Autograph Collection", brand_parent: "Marriott" };
  if (n.includes("tribute portfolio")) return { chain_name: "Tribute Portfolio", brand_parent: "Marriott" };
  if (n.includes("renaissance")) return { chain_name: "Renaissance", brand_parent: "Marriott" };
  if (n.includes("westin")) return { chain_name: "Westin", brand_parent: "Marriott" };
  if (n.includes("sheraton")) return { chain_name: "Sheraton", brand_parent: "Marriott" };
  if (n.includes("delta hotel")) return { chain_name: "Delta Hotels", brand_parent: "Marriott" };
  if (n.includes("le meridien") || n.includes("le méridien")) return { chain_name: "Le Méridien", brand_parent: "Marriott" };
  if (n.includes("ac hotel")) return { chain_name: "AC Hotel", brand_parent: "Marriott" };
  if (n.includes("aloft")) return { chain_name: "Aloft", brand_parent: "Marriott" };
  if (n.includes("moxy")) return { chain_name: "Moxy", brand_parent: "Marriott" };
  if (n.includes("element")) return { chain_name: "Element", brand_parent: "Marriott" };
  if (n.includes("courtyard")) return { chain_name: "Courtyard", brand_parent: "Marriott" };
  if (n.includes("springhill suites")) return { chain_name: "SpringHill Suites", brand_parent: "Marriott" };
  if (n.includes("fairfield")) return { chain_name: "Fairfield Inn", brand_parent: "Marriott" };
  if (n.includes("residence inn")) return { chain_name: "Residence Inn", brand_parent: "Marriott" };
  if (n.includes("towneplace suites")) return { chain_name: "TownePlace Suites", brand_parent: "Marriott" };
  if (n.includes("four points")) return { chain_name: "Four Points", brand_parent: "Marriott" };
  if (n.includes("marriott")) return { chain_name: "Marriott", brand_parent: "Marriott" };

  // IHG brands
  if (n.includes("intercontinental")) return { chain_name: "InterContinental", brand_parent: "IHG" };
  if (n.includes("kimpton")) return { chain_name: "Kimpton", brand_parent: "IHG" };
  if (n.includes("hotel indigo")) return { chain_name: "Hotel Indigo", brand_parent: "IHG" };
  if (n.includes("even hotel")) return { chain_name: "EVEN Hotels", brand_parent: "IHG" };
  if (n.includes("crowne plaza")) return { chain_name: "Crowne Plaza", brand_parent: "IHG" };
  if (n.includes("holiday inn express")) return { chain_name: "Holiday Inn Express", brand_parent: "IHG" };
  if (n.includes("holiday inn")) return { chain_name: "Holiday Inn", brand_parent: "IHG" };
  if (n.includes("staybridge")) return { chain_name: "Staybridge Suites", brand_parent: "IHG" };
  if (n.includes("candlewood")) return { chain_name: "Candlewood Suites", brand_parent: "IHG" };
  if (n.includes("avid hotel")) return { chain_name: "Avid Hotels", brand_parent: "IHG" };

  // Hyatt brands
  if (n.includes("park hyatt")) return { chain_name: "Park Hyatt", brand_parent: "Hyatt" };
  if (n.includes("andaz")) return { chain_name: "Andaz", brand_parent: "Hyatt" };
  if (n.includes("grand hyatt")) return { chain_name: "Grand Hyatt", brand_parent: "Hyatt" };
  if (n.includes("hyatt regency")) return { chain_name: "Hyatt Regency", brand_parent: "Hyatt" };
  if (n.includes("hyatt place")) return { chain_name: "Hyatt Place", brand_parent: "Hyatt" };
  if (n.includes("hyatt house")) return { chain_name: "Hyatt House", brand_parent: "Hyatt" };
  if (n.includes("hyatt centric")) return { chain_name: "Hyatt Centric", brand_parent: "Hyatt" };
  if (n.includes("caption by hyatt")) return { chain_name: "Caption by Hyatt", brand_parent: "Hyatt" };
  if (n.includes("hyatt")) return { chain_name: "Hyatt", brand_parent: "Hyatt" };

  // Choice brands
  if (n.includes("cambria")) return { chain_name: "Cambria Hotel", brand_parent: "Choice" };
  if (n.includes("ascend collection") || n.includes("ascend hotel")) return { chain_name: "Ascend Collection", brand_parent: "Choice" };
  if (n.includes("comfort suites")) return { chain_name: "Comfort Suites", brand_parent: "Choice" };
  if (n.includes("comfort inn")) return { chain_name: "Comfort Inn", brand_parent: "Choice" };
  if (n.includes("sleep inn")) return { chain_name: "Sleep Inn", brand_parent: "Choice" };
  if (n.includes("quality inn")) return { chain_name: "Quality Inn", brand_parent: "Choice" };
  if (n.includes("clarion")) return { chain_name: "Clarion", brand_parent: "Choice" };
  if (n.includes("econo lodge")) return { chain_name: "Econo Lodge", brand_parent: "Choice" };
  if (n.includes("rodeway inn")) return { chain_name: "Rodeway Inn", brand_parent: "Choice" };
  if (n.includes("mainstay suites")) return { chain_name: "MainStay Suites", brand_parent: "Choice" };
  if (n.includes("suburban")) return { chain_name: "Suburban Studios", brand_parent: "Choice" };

  // Wyndham brands
  if (n.includes("wyndham grand")) return { chain_name: "Wyndham Grand", brand_parent: "Wyndham" };
  if (n.includes("dolce")) return { chain_name: "Dolce Hotels", brand_parent: "Wyndham" };
  if (n.includes("tryp by wyndham")) return { chain_name: "TRYP", brand_parent: "Wyndham" };
  if (n.includes("la quinta")) return { chain_name: "La Quinta", brand_parent: "Wyndham" };
  if (n.includes("wingate")) return { chain_name: "Wingate", brand_parent: "Wyndham" };
  if (n.includes("hawthorn suites")) return { chain_name: "Hawthorn Suites", brand_parent: "Wyndham" };
  if (n.includes("microtel")) return { chain_name: "Microtel", brand_parent: "Wyndham" };
  if (n.includes("ramada")) return { chain_name: "Ramada", brand_parent: "Wyndham" };
  if (n.includes("days inn")) return { chain_name: "Days Inn", brand_parent: "Wyndham" };
  if (n.includes("super 8")) return { chain_name: "Super 8", brand_parent: "Wyndham" };
  if (n.includes("baymont")) return { chain_name: "Baymont", brand_parent: "Wyndham" };
  if (n.includes("americinn")) return { chain_name: "AmericInn", brand_parent: "Wyndham" };
  if (n.includes("howard johnson")) return { chain_name: "Howard Johnson", brand_parent: "Wyndham" };
  if (n.includes("travelodge")) return { chain_name: "Travelodge", brand_parent: "Wyndham" };
  if (n.includes("wyndham")) return { chain_name: "Wyndham", brand_parent: "Wyndham" };

  // Best Western brands
  if (n.includes("best western premier")) return { chain_name: "Best Western Premier", brand_parent: "Best Western" };
  if (n.includes("best western plus")) return { chain_name: "Best Western Plus", brand_parent: "Best Western" };
  if (n.includes("best western")) return { chain_name: "Best Western", brand_parent: "Best Western" };

  // Drury
  if (n.includes("drury")) return { chain_name: "Drury Inn", brand_parent: "Drury" };

  return { chain_name: null, brand_parent: null };
}

/**
 * Determine hotel_type from Google place types and name.
 */
function detectHotelType(name: string, types: string[]): string {
  const n = name.toLowerCase();
  if (n.includes("resort") || n.includes("spa & resort")) return "Resort";
  if (n.includes("b&b") || n.includes("bed and breakfast") || n.includes("bed & breakfast")) return "B&B";
  if (n.includes("motel")) return "Motel";
  if (n.includes("extended stay") || n.includes("residence inn") || n.includes("towneplace") ||
      n.includes("homewood") || n.includes("home2") || n.includes("staybridge") ||
      n.includes("candlewood") || n.includes("element") || n.includes("mainstay")) return "Extended Stay";
  if (n.includes("boutique") || n.includes("autograph") || n.includes("curio") ||
      n.includes("tapestry") || n.includes("surety") || n.includes("ac hotel") ||
      n.includes("aloft") || n.includes("moxy") || n.includes("kimpton") ||
      n.includes("hotel indigo")) return "Boutique Hotel";
  return "Hotel";
}

/**
 * Map Google price level (1-4) to our price range format ($-$$$$)
 */
function mapPriceLevel(priceLevel?: number): string {
  if (!priceLevel) return "$$";
  return "$".repeat(Math.min(Math.max(priceLevel, 1), 4));
}

/**
 * Generate a URL slug from a hotel name.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Determine area from the formatted address.
 */
function detectArea(address: string): string {
  const a = address.toLowerCase();
  if (a.includes("altoona")) return "Altoona";
  if (a.includes("ankeny")) return "Ankeny";
  if (a.includes("ames")) return "Ames";
  if (a.includes("waukee")) return "Waukee";
  if (a.includes("grimes")) return "Grimes";
  if (a.includes("clive")) return "Clive";
  if (a.includes("urbandale")) return "Urbandale";
  if (a.includes("johnston")) return "Johnston";
  if (a.includes("west des moines")) return "West Des Moines";
  if (a.includes("pleasant hill")) return "Pleasant Hill";
  if (a.includes("bondurant")) return "Bondurant";
  if (a.includes("norwalk")) return "Norwalk";
  if (a.includes("indianola")) return "Indianola";
  // Check for airport area (Fleur Dr is the airport corridor)
  if (a.includes("fleur dr") || a.includes("fleur drive")) return "Airport";
  return "Des Moines";
}

/**
 * Extract city from formatted address.
 */
function extractCity(address: string): string {
  const area = detectArea(address);
  if (area === "Airport" || area === "Des Moines") return "Des Moines";
  return area;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { location, radius, offset = 0 }: SearchRequest = await req.json();

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_SEARCH_API");
    if (!GOOGLE_API_KEY) {
      throw new Error("Google API key not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    console.log(`Searching for hotels near: ${location}, radius: ${radius}m, offset: ${offset}`);

    // 1. Geocode the location
    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`;
    const geocodeResponse = await fetch(geocodeUrl);

    if (!geocodeResponse.ok) {
      throw new Error(`Geocoding failed: ${geocodeResponse.status}`);
    }

    const geocodeData = await geocodeResponse.json();
    if (geocodeData.status !== "OK" || !geocodeData.results?.length) {
      throw new Error(`Geocoding error: ${geocodeData.status}`);
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;
    console.log(`Geocoded to: ${lat}, ${lng}`);

    // 2. Search Google Places for hotels (using New API)
    const placesUrl = "https://places.googleapis.com/v1/places:searchNearby";

    const placesRequestBody = {
      includedTypes: ["hotel", "lodging"],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radius,
        },
      },
      languageCode: "en",
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
      const errorText = await placesResponse.text();
      throw new Error(`Places API failed: ${placesResponse.status} - ${errorText}`);
    }

    const placesData = await placesResponse.json();
    const places = placesData.places || [];
    console.log(`Google returned ${places.length} places`);

    // 3. Get existing hotels from database
    const { data: existingHotels, error: dbError } = await supabase
      .from("hotels")
      .select("name, google_place_id")
      .eq("is_active", true);

    if (dbError) {
      console.error("Error fetching existing hotels:", dbError);
    }

    const existingPlaceIds = new Set(
      existingHotels?.filter((h) => h.google_place_id).map((h) => h.google_place_id) || []
    );
    const existingNames = new Set(
      existingHotels?.map((h) => h.name.toLowerCase()) || []
    );
    console.log(`Found ${existingPlaceIds.size} existing hotels by place_id, ${existingNames.size} by name`);

    // 4. Get blacklisted places
    const now = new Date().toISOString();
    const { data: blacklistedPlaces, error: blacklistError } = await supabase
      .from("hotel_blacklist")
      .select("google_place_id, hotel_name")
      .or(`expires_at.is.null,expires_at.gt.${now}`);

    if (blacklistError) {
      console.error("Error fetching hotel blacklist:", blacklistError);
    }

    const blacklistedPlaceIds = new Set(
      blacklistedPlaces?.filter((b) => b.google_place_id).map((b) => b.google_place_id) || []
    );
    const blacklistedNames = new Set(
      blacklistedPlaces?.map((b) => b.hotel_name.toLowerCase()) || []
    );
    console.log(`Found ${blacklistedPlaces?.length || 0} blacklisted entries`);

    // 5. Filter results
    const filteredPlaces = places.filter((place: any) => {
      const name = (place.displayName?.text || place.displayName || place.name || "").toLowerCase();

      // Check if it's actually a hotel/lodging
      const isLodging = place.types?.some((t: string) =>
        ["hotel", "lodging", "resort_hotel", "extended_stay_hotel", "motel"].includes(t)
      ) || false;

      // Skip if already in database
      const isExisting = existingPlaceIds.has(place.id) || existingNames.has(name);

      // Skip if blacklisted
      const isBlacklisted = blacklistedPlaceIds.has(place.id) || blacklistedNames.has(name);

      // Only include operational hotels
      const isOperational = place.businessStatus === "OPERATIONAL";

      console.log(`Filter: ${name} | lodging=${isLodging}, existing=${isExisting}, blacklisted=${isBlacklisted}, operational=${isOperational}`);

      return isLodging && !isExisting && !isBlacklisted && isOperational;
    });

    // 6. Map to our format with brand detection
    const hotels: HotelResult[] = filteredPlaces.map((place: any) => {
      const name = place.displayName?.text || place.displayName || place.name || "Unknown Hotel";
      const brand = detectBrand(name);
      const hotelType = detectHotelType(name, place.types || []);

      return {
        place_id: place.id,
        name: name,
        formatted_address: place.formattedAddress,
        business_status: place.businessStatus,
        rating: place.rating,
        user_ratings_total: place.userRatingCount,
        price_level: place.priceLevel,
        types: place.types || [],
        opening_hours: place.currentOpeningHours
          ? { open_now: place.currentOpeningHours.openNow }
          : undefined,
        formatted_phone_number: place.nationalPhoneNumber,
        website: place.websiteUri,
        star_rating: place.rating ? Math.round(place.rating * 2) / 2 : undefined,
        hotel_type: hotelType,
        brand_parent: brand.brand_parent,
        chain_name: brand.chain_name,
      };
    });

    console.log(`Filtered to ${hotels.length} new hotels`);

    return new Response(
      JSON.stringify({
        hotels,
        total_found: hotels.length,
        total_places_searched: places.length,
        offset,
        existing_hotels_count: existingPlaceIds.size + existingNames.size,
        has_more: places.length === 20,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in search-new-hotels:", error);
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
