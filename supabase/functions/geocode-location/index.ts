import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";
const APP_USER_AGENT = "DesMoinesInsider/1.0 (https://desmoinesinsider.com; mailto:admin@desmoinesinsider.com)";

serve(async (req) => {
  try {
    const { location } = await req.json();

    if (!location) {
      return new Response(
        JSON.stringify({ error: "Location is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )
    }

    const url = new URL(NOMINATIM_API);
    url.searchParams.set("q", location);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: { "User-Agent": APP_USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const { lat, lon } = data[0];
      return new Response(
        JSON.stringify({ latitude: parseFloat(lat), longitude: parseFloat(lon) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    } else {
      return new Response(
        JSON.stringify({ error: "No coordinates found for the location" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
})