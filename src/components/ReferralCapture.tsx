import { useCampaignAttributionCapture } from "@/hooks/useCampaignAttributionCapture";
import { useReferralCapture } from "@/hooks/useReferralCapture";

/**
 * Headless: keeps a ?ref code and attributes it once the visitor is signed
 * in (plan WP6), and remembers the utm_* campaign a visitor arrived on so a
 * later signup still carries it (WEB-ADS-016). Mount once inside AuthProvider
 * and BrowserRouter.
 */
export function ReferralCapture() {
  useReferralCapture();
  useCampaignAttributionCapture();
  return null;
}
