import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // GET /api-restaurants - List/search restaurants
    if (req.method === "GET" && !pathname.includes("/restaurants/")) {
      const searchParams = url.searchParams;

      // Query parameters
      const limit = parseInt(searchParams.get("limit") || "20");
      const offset = parseInt(searchParams.get("offset") || "0");
      const cuisine = searchParams.get("cuisine");
      const city = searchParams.get("city") || searchParams.get("location");
      const search = searchParams.get("search") || searchParams.get("term");
      const priceRange =
        searchParams.get("price") || searchParams.get("price_range");
      const status = searchParams.get("status");

      let query = supabase
        .from("restaurants")
        .select(
          "id, name, cuisine, description, location, city, rating, price_range, phone, website, image_url, opening_date, status, latitude, longitude, google_place_id, opening_timeframe",
          { count: "exact" }
        )
        .order("name", { ascending: true });

      // Apply filters
      if (cuisine) {
        query = query.ilike("cuisine", `%${cuisine}%`);
      }

      if (city) {
        query = query.or(`city.ilike.%${city}%,location.ilike.%${city}%`);
      }

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,description.ilike.%${search}%,cuisine.ilike.%${search}%`
        );
      }

      if (priceRange) {
        query = query.eq("price_range", priceRange);
      }

      if (status) {
        query = query.eq("status", status);
      }

      // Pagination
      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // Format response
      const restaurants = (data || []).map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        cuisine: restaurant.cuisine,
        description: restaurant.description,
        location: restaurant.location,
        city: restaurant.city,
        rating: restaurant.rating,
        price_range: restaurant.price_range,
        phone: restaurant.phone,
        website: restaurant.website,
        image_url: restaurant.image_url,
        opening_date: restaurant.opening_date,
        opening_timeframe: restaurant.opening_timeframe,
        status: restaurant.status,
        coordinates:
          restaurant.latitude && restaurant.longitude
            ? {
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
              }
            : null,
      }));

      return new Response(
        JSON.stringify({
          success: true,
          data: restaurants,
          pagination: {
            total: count || 0,
            limit,
            offset,
            has_more: offset + limit < (count || 0),
          },
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // GET /api-restaurants/{id} - Get restaurant details
    if (req.method === "GET" && pathname.includes("/")) {
      const pathParts = pathname.split("/").filter(Boolean);
      const restaurantId = pathParts[pathParts.length - 1];

      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("id", restaurantId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Restaurant not found",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 404,
            }
          );
        }
        throw error;
      }

      const restaurant = {
        id: data.id,
        name: data.name,
        cuisine: data.cuisine,
        description: data.description,
        location: data.location,
        city: data.city,
        rating: data.rating,
        price_range: data.price_range,
        phone: data.phone,
        website: data.website,
        image_url: data.image_url,
        opening_date: data.opening_date,
        opening_timeframe: data.opening_timeframe,
        status: data.status,
        coordinates:
          data.latitude && data.longitude
            ? {
                latitude: data.latitude,
                longitude: data.longitude,
              }
            : null,
        google_place_id: data.google_place_id,
        ai_writeup: data.ai_writeup,
        hours: data.hours,
        menu_url: data.menu_url,
      };

      return new Response(
        JSON.stringify({
          success: true,
          data: restaurant,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    // Method not allowed
    return new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      }
    );
  } catch (error) {
    console.error("API Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
