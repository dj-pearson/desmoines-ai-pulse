/**
 * Home personalization cohort tracking (WEB-FEAT-007). Mirrors
 * src/lib/guestFavoritesAnalytics.ts — routes through the site's existing GA4
 * (gtag) pipeline so personalized-vs-control conversion is measurable:
 *   home_order_cohort — which home section order a session was served
 *                       ({ cohort: 'personalized' | 'control', strategy, dominant })
 * Always best-effort and never throws so a tracking gap can't break the page.
 */
import { createLogger } from "@/lib/logger";
import type { HomeOrderingCohort } from "@/lib/homeSectionOrder";

const logger = createLogger("personalizationAnalytics");

export function trackHomeOrderCohort(
  cohort: HomeOrderingCohort,
  extra?: Record<string, unknown>,
): void {
  const payload = { cohort, ...extra };

  try {
    if (
      typeof window !== "undefined" &&
      (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    ) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
        "event",
        "home_order_cohort",
        payload,
      );
    }
  } catch (error) {
    logger.error("trackHomeOrderCohort", "Failed to send event", {
      error: String(error),
    });
  }

  logger.debug("trackHomeOrderCohort", "home_order_cohort", payload);
}
