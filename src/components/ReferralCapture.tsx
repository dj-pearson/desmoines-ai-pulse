import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuthState } from "@/contexts/AuthContext";
import { useCampaignAttributionCapture } from "@/hooks/useCampaignAttributionCapture";
import { useReferralCapture } from "@/hooks/useReferralCapture";
import { normalizeReferralCode } from "@/lib/referralCode";
import { dismissInviteBanner, isInviteBannerDismissed, shouldOfferInvite } from "@/lib/referralStorage";

// Lazy: this component is mounted at the app root, and only an invited,
// signed-out visitor ever needs the strip, so nobody else downloads it.
const InviteWelcomeBanner = lazy(() =>
  import("@/components/InviteWelcomeBanner").then((m) => ({ default: m.InviteWelcomeBanner })),
);

/**
 * Keeps a ?ref code and attributes it once the visitor is signed in (plan
 * WP6), and remembers the utm_* campaign a visitor arrived on so a later
 * signup still carries it (WEB-ADS-016). Mount once inside AuthProvider and
 * BrowserRouter, above the routes.
 *
 * Renders nothing except for a visitor who opened an invite link in this
 * session and is signed out: they get a strip asking them to create the
 * account the invite is counted against (WEB-ADS-034). The
 * "invited" flag is component state, so it survives in-app navigation (which
 * drops the ?ref from the URL) and ends with the tab.
 */
export function ReferralCapture() {
  useReferralCapture();
  useCampaignAttributionCapture();

  const { search, pathname } = useLocation();
  const { user, isLoading } = useAuthState();
  const [invited, setInvited] = useState(false);
  const [dismissed, setDismissed] = useState(isInviteBannerDismissed);

  useEffect(() => {
    if (normalizeReferralCode(new URLSearchParams(search).get("ref"))) setInvited(true);
  }, [search]);

  const show = shouldOfferInvite({
    invited,
    dismissed,
    signedIn: !!user,
    authLoading: isLoading,
    pathname,
  });
  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <InviteWelcomeBanner
        pathname={pathname}
        onDismiss={() => {
          dismissInviteBanner();
          setDismissed(true);
        }}
      />
    </Suspense>
  );
}
