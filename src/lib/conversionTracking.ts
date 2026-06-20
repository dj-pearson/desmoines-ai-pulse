import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("conversion");

/**
 * Funnel steps:
 * - guest favorites (WEB-FEAT-006)
 * - contextual paywall present/dismiss/checkout-start, tagged by context id
 *   in `meta.contentId` (WEB-FEAT-001), for per-surface conversion measurement.
 */
export type ConversionStep =
  | "guest_save"
  | "guest_wall_hit"
  | "signup_from_wall"
  | "paywall_present"
  | "paywall_dismiss"
  | "paywall_checkout_start";

/**
 * Fire-and-forget funnel event. Never blocks UX and never throws — if the
 * analytics table rejects the row (e.g. a CHECK on event_type), it silently
 * no-ops. Kept dependency-free (no React hook) so it's safe to call from any
 * FavoriteButton without spinning up an analytics session per instance.
 */
export function trackConversion(
  step: ConversionStep,
  meta?: { contentType?: string; contentId?: string },
): void {
  log.debug("trackConversion", step, meta ?? {});
  void supabase
    .from("user_analytics")
    .insert({
      event_type: step,
      content_type: meta?.contentType ?? "page",
      content_id: meta?.contentId ?? "guest_favorites",
      page_url: typeof window !== "undefined" ? window.location.href : null,
    })
    .then(({ error }) => {
      if (error) log.debug("trackConversion", "insert skipped", { step, error: error.message });
    });
}
