/**
 * Saved-search funnel tracking (WEB-FEAT-003). Logs the save → paywall → alert
 * loop through the site's existing GA4 (gtag) pipeline tagged with the user's
 * tier so per-tier conversion is measurable (the web twin of the iOS saved-
 * search analytics). Best-effort, never throws.
 */
import { createLogger } from "@/lib/logger";

const logger = createLogger("savedSearchAnalytics");

export type SavedSearchAction =
  | "save_prompt" // affordance clicked
  | "saved" // search persisted
  | "paywall" // free/locked user routed to the paywall
  | "limit_reached" // tier cap hit
  | "alert_toggled" // alerts switched on/off
  | "deleted";

/**
 * Emit a saved-search lifecycle event. Routes through gtag when available and
 * dev-logs otherwise.
 */
export function trackSavedSearchEvent(
  action: SavedSearchAction,
  tier: string,
  extra?: Record<string, unknown>,
): void {
  const payload = { tier, ...extra };

  try {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    ) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
        "event",
        `saved_search_${action}`,
        payload,
      );
    }
  } catch (error) {
    logger.error("trackSavedSearchEvent", "Failed to send saved-search event", {
      error: String(error),
    });
  }

  logger.debug("trackSavedSearchEvent", `saved_search_${action}`, payload);
}
