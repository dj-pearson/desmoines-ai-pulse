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

    // GET /api-events - List events
    if (req.method === "GET" && !pathname.includes("/events/")) {
      // Validate query parameters
      const validationResult = validateQueryParams(url, {
        limit: { type: 'number', min: 1, max: 100, default: 20 },
        offset: { type: 'number', min: 0, default: 0 },
        category: { type: 'string', max: 50 },
        location: { type: 'string', max: 100 },
        search: { type: 'string', max: 200 },
        start_date: { type: 'string', max: 10 },
        end_date: { type: 'string', max: 10 },
        status: { type: 'string', max: 20, default: 'live' },
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
      const today = new Date().toISOString().split("T")[0];

      let query = supabase
        .from("events")
        .select(
          "id, title, date, time, location, venue, price, category, enhanced_description, original_description, image_url, event_url, event_start_utc, city, latitude, longitude, is_featured",
          { count: "exact" }
        )
        .gte("date", params.start_date || today)
        .order("date", { ascending: true });

      // Apply filters
      if (params.end_date) {
        query = query.lte("date", params.end_date);
      }

      if (params.category) {
        query = query.eq("category", params.category);
      }

      if (params.location) {
        query = query.or(
          `location.ilike.%${params.location}%,city.ilike.%${params.location}%,venue.ilike.%${params.location}%`
        );
      }

      if (params.search) {
        query = query.or(
          `title.ilike.%${params.search}%,enhanced_description.ilike.%${params.search}%,venue.ilike.%${params.search}%`
        );
      }

      // Pagination
      query = query.range(params.offset, params.offset + params.limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // Format response
      const events = (data || []).map((event) => ({
        id: event.id,
        title: event.title,
        date: event.date,
        time: event.time,
        venue: event.venue,
        location: event.location,
        city: event.city,
        price: event.price,
        category: event.category,
        description: event.enhanced_description || event.original_description,
        image_url: event.image_url,
        event_url: event.event_url,
        coordinates:
          event.latitude && event.longitude
            ? {
                latitude: event.latitude,
                longitude: event.longitude,
              }
            : null,
        is_featured: event.is_featured,
      }));

      const response = new Response(
        JSON.stringify({
          events,
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
    console.error("Error in api-events:", error);

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
