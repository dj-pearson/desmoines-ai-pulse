import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("conversion");

/** Guest-favorites funnel steps (WEB-FEAT-006). */
export type ConversionStep = "guest_save" | "guest_wall_hit" | "signup_from_wall";

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
