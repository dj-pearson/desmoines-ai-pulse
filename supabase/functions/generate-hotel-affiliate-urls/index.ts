import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Affiliate network configurations by hotel brand parent company.
 *
 * PRIMARY SOURCE: the `hotel_affiliate_programs` table (HOTEL-AFF-001).
 * Brand credentials are edited in /admin/hotels -> Affiliate Programs and the
 * link is built by the `build_hotel_affiliate_url` SQL function, so adding a
 * brand no longer needs a code change or a secret rotation.
 *
 * The env-var map below is retained as a FALLBACK for any brand that has no
 * enabled row in that table, so existing deployments keep working unchanged.
 * Once every brand is configured in the table, these secrets can be retired.
 *
 * Fallback environment variables (set via `supabase secrets set`):
 *   MARRIOTT_PARTNERIZE_CAMREF   - Partnerize campaign reference
 *   HILTON_AWIN_AFF_ID           - Awin affiliate ID
 *   HILTON_AWIN_MID              - Hilton's Awin merchant ID
 *   IHG_CJ_PID                   - CJ publisher ID
 *   IHG_CJ_AID                   - IHG's CJ advertiser link ID
 *   HYATT_AWIN_AFF_ID            - Awin affiliate ID for Hyatt
 *   HYATT_AWIN_MID               - Hyatt's Awin merchant ID
 *   CHOICE_CJ_PID                - CJ publisher ID for Choice
 *   CHOICE_CJ_AID                - Choice Hotels' CJ advertiser link ID
 *   WYNDHAM_CJ_PID               - CJ publisher ID for Wyndham
 *   WYNDHAM_CJ_AID               - Wyndham's CJ advertiser link ID
 *   BESTWESTERN_CJ_PID           - CJ publisher ID for Best Western
 *   BESTWESTERN_CJ_AID           - Best Western's CJ advertiser link ID
 */

interface AffiliateConfig {
  network: "partnerize" | "awin" | "cj";
  envKeys: {
    id: string;
    mid?: string;
  };
}

const BRAND_CONFIGS: Record<string, AffiliateConfig> = {
  Marriott: {
    network: "partnerize",
    envKeys: { id: "MARRIOTT_PARTNERIZE_CAMREF" },
  },
  Hilton: {
    network: "awin",
    envKeys: { id: "HILTON_AWIN_AFF_ID", mid: "HILTON_AWIN_MID" },
  },
  IHG: {
    network: "cj",
    envKeys: { id: "IHG_CJ_PID", mid: "IHG_CJ_AID" },
  },
  Hyatt: {
    network: "awin",
    envKeys: { id: "HYATT_AWIN_AFF_ID", mid: "HYATT_AWIN_MID" },
  },
  Choice: {
    network: "cj",
    envKeys: { id: "CHOICE_CJ_PID", mid: "CHOICE_CJ_AID" },
  },
  Wyndham: {
    network: "cj",
    envKeys: { id: "WYNDHAM_CJ_PID", mid: "WYNDHAM_CJ_AID" },
  },
  "Best Western": {
    network: "cj",
    envKeys: { id: "BESTWESTERN_CJ_PID", mid: "BESTWESTERN_CJ_AID" },
  },
};

/**
 * Generate an affiliate-wrapped URL for a given brand and destination URL.
 */
function generateAffiliateUrl(
  brandParent: string,
  destinationUrl: string,
  subTracking?: string
): string | null {
  const config = BRAND_CONFIGS[brandParent];
  if (!config) return null;

  const affiliateId = Deno.env.get(config.envKeys.id);
  if (!affiliateId) return null;

  const trackingRef = subTracking || "desmoines-insider";

  switch (config.network) {
    case "partnerize": {
      // Marriott: https://prf.hn/click/camref:{CAMREF}/pubref:{REF}/destination:{URL}
      return `https://prf.hn/click/camref:${affiliateId}/pubref:${trackingRef}/destination:${destinationUrl}`;
    }
    case "awin": {
      // Hilton/Hyatt: https://www.awin1.com/cread.php?awinmid={MID}&awinaffid={AFF_ID}&clickref={REF}&ued={ENCODED_URL}
      const merchantId = Deno.env.get(config.envKeys.mid!);
      if (!merchantId) return null;
      const encoded = encodeURIComponent(destinationUrl);
      return `https://www.awin1.com/cread.php?awinmid=${merchantId}&awinaffid=${affiliateId}&clickref=${trackingRef}&ued=${encoded}`;
    }
    case "cj": {
      // IHG/Choice/Wyndham/BW: https://www.anrdoezrs.net/click-{PID}-{AID}?sid={REF}&url={ENCODED_URL}
      const advertiserId = Deno.env.get(config.envKeys.mid!);
      if (!advertiserId) return null;
      const encoded = encodeURIComponent(destinationUrl);
      return `https://www.anrdoezrs.net/click-${affiliateId}-${advertiserId}?sid=${trackingRef}&url=${encoded}`;
    }
    default:
      return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body (optional filters)
    let hotelId: string | null = null;
    let hotelIds: string[] | null = null;
    let brandParent: string | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      hotelId = body.hotel_id || null;
      // Bulk variant added for the admin HotelManager regen action
      // (ADMIN-HOTEL-003). Accepts an array of hotel UUIDs.
      hotelIds = Array.isArray(body.hotel_ids) ? body.hotel_ids : null;
      brandParent = body.brand_parent || null;
    }

    // Build query
    let query = supabase
      .from("hotels")
      .select("id, name, website, brand_parent, affiliate_url")
      .eq("is_active", true);

    if (hotelIds && hotelIds.length > 0) {
      query = query.in("id", hotelIds);
    } else if (hotelId) {
      query = query.eq("id", hotelId);
    }
    if (brandParent) {
      query = query.eq("brand_parent", brandParent);
    }

    // Only process hotels with a website and brand_parent
    query = query.not("website", "is", null).not("brand_parent", "is", null);

    const { data: hotels, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch hotels: ${fetchError.message}`);
    }

    if (!hotels || hotels.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No hotels to process",
          updated: 0,
          skipped: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load the DB-backed brand programs once. These take precedence over the
    // env-var fallback map. A failure here is non-fatal — we simply fall back.
    const dbPrograms = new Map<string, { display_name: string | null; network: string }>();
    const { data: programRows, error: programError } = await supabase
      .from("hotel_affiliate_programs")
      .select("brand_parent, display_name, network")
      .eq("is_enabled", true);

    if (programError) {
      console.warn(
        `hotel_affiliate_programs unavailable, falling back to env vars: ${programError.message}`
      );
    } else {
      for (const row of programRows ?? []) {
        dbPrograms.set(row.brand_parent, {
          display_name: row.display_name,
          network: row.network,
        });
      }
    }

    let updated = 0;
    let skipped = 0;
    const results: Array<{
      id: string;
      name: string;
      brand_parent: string;
      affiliate_url: string | null;
      status: string;
      /** Additive field: which config path produced the URL. */
      source?: "database" | "env";
    }> = [];

    for (const hotel of hotels) {
      // 1. Try the DB-backed builder (exact brand row, then the '*' fallback).
      let affiliateUrl: string | null = null;
      let source: "database" | "env" = "database";

      const { data: builtUrl, error: buildError } = await supabase.rpc(
        "build_hotel_affiliate_url",
        {
          p_brand_parent: hotel.brand_parent,
          p_destination: hotel.website,
        }
      );

      if (buildError) {
        console.warn(
          `build_hotel_affiliate_url failed for ${hotel.name}: ${buildError.message}`
        );
      } else if (builtUrl) {
        affiliateUrl = builtUrl as string;
      }

      // 2. Fall back to the legacy env-var map.
      if (!affiliateUrl) {
        affiliateUrl = generateAffiliateUrl(hotel.brand_parent, hotel.website);
        source = "env";
      }

      if (affiliateUrl) {
        // Determine the affiliate provider name
        const config = BRAND_CONFIGS[hotel.brand_parent];
        const providerMap: Record<string, string> = {
          partnerize: "Partnerize",
          awin: "Awin",
          cj: "Commission Junction",
          impact: "impact.com",
          sovrn: "Sovrn Commerce",
          custom: hotel.brand_parent,
        };

        const dbProgram =
          dbPrograms.get(hotel.brand_parent) ?? dbPrograms.get("*");
        const affiliateProvider =
          source === "database" && dbProgram
            ? dbProgram.display_name ?? providerMap[dbProgram.network] ?? hotel.brand_parent
            : config
              ? providerMap[config.network]
              : hotel.brand_parent;

        const { error: updateError } = await supabase
          .from("hotels")
          .update({
            affiliate_url: affiliateUrl,
            affiliate_provider: affiliateProvider,
            // Tracking column added by 20260520000001 — used by the admin
            // HotelManager "Last regen" column.
            affiliate_url_updated_at: new Date().toISOString(),
          })
          .eq("id", hotel.id);

        if (updateError) {
          results.push({
            id: hotel.id,
            name: hotel.name,
            brand_parent: hotel.brand_parent,
            affiliate_url: null,
            status: `error: ${updateError.message}`,
          });
          skipped++;
        } else {
          results.push({
            id: hotel.id,
            name: hotel.name,
            brand_parent: hotel.brand_parent,
            affiliate_url: affiliateUrl,
            status: "updated",
            source,
          });
          updated++;
        }
      } else {
        results.push({
          id: hotel.id,
          name: hotel.name,
          brand_parent: hotel.brand_parent,
          affiliate_url: null,
          status: "skipped - no affiliate credentials configured",
        });
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${hotels.length} hotels: ${updated} updated, ${skipped} skipped`,
        updated,
        skipped,
        results,
        // Brands with credentials available from EITHER source. Kept as the
        // same string[] shape older callers already read.
        configured_brands: Array.from(
          new Set([
            ...Object.keys(BRAND_CONFIGS).filter((brand) =>
              Boolean(Deno.env.get(BRAND_CONFIGS[brand].envKeys.id))
            ),
            ...dbPrograms.keys(),
          ])
        ),
        unconfigured_brands: Object.keys(BRAND_CONFIGS).filter(
          (brand) =>
            !Deno.env.get(BRAND_CONFIGS[brand].envKeys.id) &&
            !dbPrograms.has(brand)
        ),
        // Additive: brands configured in hotel_affiliate_programs.
        database_brands: Array.from(dbPrograms.keys()),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
