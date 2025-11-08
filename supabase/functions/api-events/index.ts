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
        city: { type: 'string', max: 100 },
        search: { type: 'string', max: 200 },
        start_date: { type: 'string', max: 10 },
        end_date: { type: 'string', max: 10 },
        status: { type: 'string', max: 20, default: 'live' },
      });

      if (!validationResult.success) {
        const errorResponse = new Response(
          JSON.stringify({
            success: false,
            error: 'Invalid parameters',
            details: validationResult.errors
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
        return addRateLimitHeaders(addCorsHeaders(errorResponse), rateLimitResult);
      }

      const params = validationResult.data!;
      const location = params.location || params.city;
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

      if (location) {
        query = query.or(
          `location.ilike.%${location}%,city.ilike.%${location}%,venue.ilike.%${location}%`
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
          success: true,
          data: events,
          pagination: {
            total: count || 0,
            limit: params.limit,
            offset: params.offset,
            has_more: params.offset + params.limit < (count || 0),
          },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }
      );

      return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
    }

    // GET /api-events/{id} - Get event details
    if (req.method === "GET" && pathname.includes("/")) {
      const pathParts = pathname.split("/").filter(Boolean);
      const eventId = pathParts[pathParts.length - 1];

      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          const errorResponse = new Response(
            JSON.stringify({
              success: false,
              error: "Event not found",
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 404,
            }
          );
          return addRateLimitHeaders(addCorsHeaders(errorResponse), rateLimitResult);
        }
        throw error;
      }

      const event = {
        id: data.id,
        title: data.title,
        date: data.date,
        time: data.time,
        venue: data.venue,
        location: data.location,
        city: data.city,
        price: data.price,
        category: data.category,
        description: data.enhanced_description || data.original_description,
        image_url: data.image_url,
        event_url: data.event_url,
        event_start_utc: data.event_start_utc,
        coordinates:
          data.latitude && data.longitude
            ? {
                latitude: data.latitude,
                longitude: data.longitude,
              }
            : null,
        is_featured: data.is_featured,
        ai_writeup: data.ai_writeup,
        source: data.source,
      };

      const response = new Response(
        JSON.stringify({
          success: true,
          data: event,
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }
      );

      return addRateLimitHeaders(addCorsHeaders(response), rateLimitResult);
    }

    // Method not allowed
    const methodNotAllowedResponse = new Response(
      JSON.stringify({
        success: false,
        error: "Method not allowed",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 405,
      }
    );

    return addRateLimitHeaders(addCorsHeaders(methodNotAllowedResponse), rateLimitResult);
  } catch (error) {
    console.error("API Error:", error);

    const errorResponse = new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );

    return addRateLimitHeaders(addCorsHeaders(errorResponse), rateLimitResult);
  }
});
