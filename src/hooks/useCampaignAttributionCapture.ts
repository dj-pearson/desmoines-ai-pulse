import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { CookieConsent } from "@/components/CookieConsentBanner";
import { analyticsGranted } from "@/lib/analyticsConsent";
import { applyAttributionConsent, captureCampaignAttribution } from "@/lib/campaignAttribution";

/**
 * Remembers the campaign (utm_*) a visitor arrived on so a signup on a later
 * page still carries it (WEB-ADS-016). See src/lib/campaignAttribution.ts for
 * the memory/device split. Mount once inside BrowserRouter.
 */
export function useCampaignAttributionCapture(): void {
  const { search } = useLocation();

  useEffect(() => {
    captureCampaignAttribution(search, analyticsGranted());
  }, [search]);

  useEffect(() => {
    const onConsent = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsent | null>).detail;
      applyAttributionConsent(analyticsGranted(detail ?? undefined));
    };
    window.addEventListener("cookie-consent-changed", onConsent);
    return () => window.removeEventListener("cookie-consent-changed", onConsent);
  }, []);
}
