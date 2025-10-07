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

    // GET /api-events - List events
    if (req.method === "GET" && !pathname.includes("/events/")) {
      const searchParams = url.searchParams;

      // Query parameters
      const limit = parseInt(searchParams.get("limit") || "20");
      const offset = parseInt(searchParams.get("offset") || "0");
      const category = searchParams.get("category");
      const location = searchParams.get("location");
      const search = searchParams.get("search");
      const startDate = searchParams.get("start_date");
      const endDate = searchParams.get("end_date");
      const status = searchParams.get("status") || "live";

      const today = new Date().toISOString().split("T")[0];

      let query = supabase
        .from("events")
        .select(
          "id, title, date, time, location, venue, price, category, enhanced_description, original_description, image_url, event_url, event_start_utc, city, latitude, longitude, is_featured",
          { count: "exact" }
        )
        .gte("date", startDate || today)
        .order("date", { ascending: true });

      // Apply filters
      if (endDate) {
        query = query.lte("date", endDate);
      }

      if (category) {
        query = query.eq("category", category);
      }

      if (location || searchParams.get("city")) {
        const cityFilter = location || searchParams.get("city");
        query = query.or(
          `location.ilike.%${cityFilter}%,city.ilike.%${cityFilter}%,venue.ilike.%${cityFilter}%`
        );
      }

      if (search) {
        query = query.or(
          `title.ilike.%${search}%,enhanced_description.ilike.%${search}%,venue.ilike.%${search}%`
        );
      }

      // Pagination
      query = query.range(offset, offset + limit - 1);

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

      return new Response(
        JSON.stringify({
          success: true,
          data: events,
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
          return new Response(
            JSON.stringify({
              success: false,
              error: "Event not found",
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 404,
            }
          );
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

      return new Response(
        JSON.stringify({
          success: true,
          data: event,
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
