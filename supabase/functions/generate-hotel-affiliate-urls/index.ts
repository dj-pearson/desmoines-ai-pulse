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
 * Networks:
 *   - Marriott: Partnerize (prf.hn)
 *   - Hilton: Awin (awin1.com)
 *   - IHG: CJ Affiliate (anrdoezrs.net)
 *   - Hyatt: Awin (awin1.com)
 *   - Choice: CJ Affiliate (anrdoezrs.net)
 *   - Wyndham: CJ Affiliate (anrdoezrs.net)
 *   - Best Western: CJ Affiliate (anrdoezrs.net)
 *
 * Environment variables (set via `supabase secrets set`):
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
    let brandParent: string | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      hotelId = body.hotel_id || null;
      brandParent = body.brand_parent || null;
    }

    // Build query
    let query = supabase
      .from("hotels")
      .select("id, name, website, brand_parent, affiliate_url")
      .eq("is_active", true);

    if (hotelId) {
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

    let updated = 0;
    let skipped = 0;
    const results: Array<{
      id: string;
      name: string;
      brand_parent: string;
      affiliate_url: string | null;
      status: string;
    }> = [];

    for (const hotel of hotels) {
      const affiliateUrl = generateAffiliateUrl(
        hotel.brand_parent,
        hotel.website
      );

      if (affiliateUrl) {
        // Determine the affiliate provider name
        const config = BRAND_CONFIGS[hotel.brand_parent];
        const providerMap: Record<string, string> = {
          partnerize: "Partnerize",
          awin: "Awin",
          cj: "Commission Junction",
        };
        const affiliateProvider = config
          ? providerMap[config.network]
          : hotel.brand_parent;

        const { error: updateError } = await supabase
          .from("hotels")
          .update({
            affiliate_url: affiliateUrl,
            affiliate_provider: affiliateProvider,
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
        configured_brands: Object.keys(BRAND_CONFIGS).filter((brand) => {
          const config = BRAND_CONFIGS[brand];
          return !!Deno.env.get(config.envKeys.id);
        }),
        unconfigured_brands: Object.keys(BRAND_CONFIGS).filter((brand) => {
          const config = BRAND_CONFIGS[brand];
          return !Deno.env.get(config.envKeys.id);
        }),
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
