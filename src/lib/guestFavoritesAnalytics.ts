/**
 * Guest-favorites funnel tracking (WEB-FEAT-006). Mirrors
 * src/lib/paywallAnalytics.ts — routes through the site's existing GA4 (gtag)
 * pipeline so the save-wall conversion funnel is measurable:
 *   guest_save        — an anonymous visitor saved an item
 *   wall_hit          — a guest hit the save cap (signup prompt shown)
 *   signup_from_wall  — a guest clicked through to sign up from the prompt
 *   migrated          — guest favorites were merged into a new account
 * Always best-effort and never throws so a tracking gap can't break saving.
 */
import { createLogger } from "@/lib/logger";

const logger = createLogger("guestFavoritesAnalytics");

export type GuestFavoriteAction =
  | "guest_save"
  | "wall_hit"
  | "signup_from_wall"
  | "migrated";

export function trackGuestFavoriteEvent(
  action: GuestFavoriteAction,
  extra?: Record<string, unknown>,
): void {
  const payload = { ...extra };

  try {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    ) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
        "event",
        `guest_favorite_${action}`,
        payload,
      );
    }
  } catch (error) {
    logger.error("trackGuestFavoriteEvent", "Failed to send event", {
      error: String(error),
    });
  }

  logger.debug("trackGuestFavoriteEvent", `guest_favorite_${action}`, payload);
}
