/**
 * Per-surface paywall conversion tracking (WEB-FEAT-001). Every present /
 * dismiss / checkout-start fires through the site's existing GA4 (gtag)
 * pipeline tagged with the context id + recommended tier so conversion can be
 * measured per surface — the web twin of the iOS analytics.trackPaywall* calls.
 */
import { createLogger } from "@/lib/logger";
import type { PaywallTier } from "@/lib/paywallContexts";

const logger = createLogger("paywallAnalytics");

export type PaywallAction = "present" | "dismiss" | "checkout_start";

/**
 * Log a paywall lifecycle event. Routes through gtag when available (the same
 * mechanism src/lib/analytics-tracker.ts uses) and dev-logs otherwise; always
 * best-effort and never throws so a tracking gap can't break the modal.
 */
export function trackPaywallEvent(
  action: PaywallAction,
  context: string,
  tier: PaywallTier,
  extra?: Record<string, unknown>,
): void {
  const payload = { context, tier, ...extra };

  try {
    if (typeof window !== "undefined" && (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag) {
      (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
        "event",
        `paywall_${action}`,
        payload,
      );
    }
  } catch (error) {
    logger.error("trackPaywallEvent", "Failed to send paywall event", {
      error: String(error),
    });
  }

  logger.debug("trackPaywallEvent", `paywall_${action}`, payload);
}
