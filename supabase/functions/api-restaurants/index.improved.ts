import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, addCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, addRateLimitHeaders } from "../_shared/rateLimit.ts";
import { validateQueryParams } from "../_shared/validation.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) {
    return corsResponse;
  }

  // Check rate limit (100 requests per 15 minutes per IP)
  const rateLimitResult = checkRateLimit(req, {
    windowMs: 15 * 60 * 1000,
    max: 100,
  });

  if (!rateLimitResult.success) {
    return addCorsHeaders(rateLimitResult.response!);
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // GET /api-restaurants - List/search restaurants
    if (req.method === "GET" && !pathname.includes("/restaurants/")) {
      // Validate query parameters
      const validationResult = validateQueryParams(url, {
        limit: { type: 'number', min: 1, max: 100, default: 20 },
        offset: { type: 'number', min: 0, default: 0 },
        cuisine: { type: 'string', max: 50 },
        city: { type: 'string', max: 100 },
        location: { type: 'string', max: 100 },
        search: { type: 'string', max: 200 },
        term: { type: 'string', max: 200 },
        price: { type: 'string', max: 10 },
        price_range: { type: 'string', max: 10 },
        status: { type: 'string', max: 20 },
      });

      if (!validationResult.success) {
        const errorResponse = new Response(
          JSON.stringify({ error: 'Invalid parameters', details: validationResult.errors }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
        return addRateLimitHeaders(addCorsHeaders(errorResponse), rateLimitResult);
      }

      const params = validationResult.data!;

      // Handle aliases
      const city = params.city || params.location;
      const search = params.search || params.term;
      const priceRange = params.price || params.price_range;

      let query = supabase
        .from("restaurants")
        .select(
          "id, name, cuisine, description, location, city, rating, price_range, phone, website, image_url, opening_date, status, latitude, longitude, google_place_id, opening_timeframe",
          { count: "exact" }
        )
        .order("name", { ascending: true });

      // Apply filters
      if (params.cuisine) {
        query = query.ilike("cuisine", `%${params.cuisine}%`);
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

      if (params.status) {
        query = query.eq("status", params.status);
      }

      // Pagination
      query = query.range(params.offset, params.offset + params.limit - 1);

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
        status: restaurant.status,
        coordinates:
          restaurant.latitude && restaurant.longitude
            ? {
                latitude: restaurant.latitude,
                longitude: restaurant.longitude,
              }
            : null,
        google_place_id: restaurant.google_place_id,
        opening_timeframe: restaurant.opening_timeframe,
      }));

      const response = new Response(
        JSON.stringify({
          restaurants,
          pagination: {
            total: count || 0,
            limit: params.limit,
            offset: params.offset,
            hasMore: (params.offset + params.limit) < (count || 0),
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

      return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
    }

    // Method not allowed
    const response = new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );

    return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);

  } catch (error) {
    console.error("Error in api-restaurants:", error);

    const response = new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );

    return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
  }
});
