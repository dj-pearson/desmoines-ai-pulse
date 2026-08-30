import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("sponsoredListing");

/**
 * Track a sponsored-listing impression/click distinctly from paid campaign
 * creatives (WEB-FEAT-005) — mirrors iOS, which logs sponsored listings via the
 * analytics path keyed by listing id (they have no campaign creative_id, so they
 * can't go in ad_impressions). Fire-and-forget; never blocks or throws.
 */
export function trackSponsoredListing(
  action: "impression" | "click",
  listingType: "event" | "restaurant" | "attraction",
  listingId: string,
): void {
  void supabase
    .from("user_analytics")
    .insert({
      event_type: `sponsored_listing_${action}`,
      content_type: listingType,
      content_id: listingId,
      page_url: typeof window !== "undefined" ? window.location.href : null,
    })
    .then(({ error }) => {
      if (error) log.debug("trackSponsoredListing", "insert skipped", { action, error: error.message });
    });
}
