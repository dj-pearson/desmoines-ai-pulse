import { OptimizedImage } from "@/components/OptimizedImage";
import { useActiveAds } from "@/hooks/useActiveAds";
import { useAdTracking } from "@/hooks/useAdTracking";
import { useSubscription } from "@/hooks/useSubscription";
import { useAffiliateAd } from "@/hooks/useAffiliateAd";
import { useAuthFlags } from "@/contexts/AuthContext";
import { AffiliateAdBanner } from "@/components/AffiliateAdBanner";
import { HouseAd } from "@/components/HouseAd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PLACEMENT_CREATIVE_SIZE,
  PLACEMENT_LABELS,
  PLACEMENT_RESERVE_CLASSES,
  PLACEMENT_SIZE_CLASSES,
  type AdSlotPlacement,
} from "@/components/adSlotSizes";

import { toSafeExternalUrl } from "@/lib/capacitorUtils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface AdBannerProps {
  placement: AdSlotPlacement;
  className?: string;
  /** Optional fallback content when no ads are available */
  fallback?: React.ReactNode;
}

interface AdSlotProps extends AdBannerProps {
  /** Insider/VIP: no ad and no empty band. */
  adFree: boolean;
  /** Whether the visitor's tier is still unknown. */
  tierLoading: boolean;
}

/**
 * A signed-out visitor is always free tier, so the slot no longer waits on
 * useSubscription (subscription_plans select("*") plus user_subscriptions)
 * before it can show the above-the-fold top_banner. Only signed-in visitors pay
 * for the tier lookup, through MemberAdSlot, the same split as PaidTierCheck in
 * header/UserMenu.tsx. useSubscription itself is unchanged for other callers.
 */
export function AdBanner(props: AdBannerProps) {
  const { isLoading: authLoading, isAuthenticated } = useAuthFlags();
  if (isAuthenticated) return <MemberAdSlot {...props} />;
  return <AdSlot {...props} adFree={false} tierLoading={authLoading} />;
}

/** Split out so useSubscription only runs for signed-in visitors. */
function MemberAdSlot(props: AdBannerProps) {
  const { hasFeature, isLoading } = useSubscription();
  return <AdSlot {...props} adFree={hasFeature('ad_free')} tierLoading={isLoading} />;
}

function AdSlot({ placement, className = "", fallback, adFree, tierLoading }: AdSlotProps) {
  // The ad queries run alongside the tier lookup, not after it.
  const { ad, isLoading: adLoading } = useActiveAds(placement);
  // Affiliate availability for the fill chain (campaign -> affiliate -> house).
  const { partner, imageUrl, affiliateUrl } = useAffiliateAd(placement);
  const hasAffiliate = !!(partner && imageUrl && affiliateUrl);

  const { adRef, trackClick } = useAdTracking({
    campaignId: ad?.campaign_id || '',
    creativeId: ad?.creative_id || '',
    placementType: placement,
    autoTrackImpression: !!ad,
    viewabilityThreshold: 0.5,
    viewabilityDuration: 1000,
  });

  // Insider and VIP members get an ad-free experience: no ad and no empty band.
  if (adFree) {
    return fallback ? <>{fallback}</> : null;
  }

  if (tierLoading || adLoading) {
    // Hold the slot's height while we find out what fills it.
    return (
      <div
        aria-hidden="true"
        data-testid="ad-slot-placeholder"
        className={`${PLACEMENT_RESERVE_CLASSES[placement]} ${className}`}
      />
    );
  }

  // Fill chain so a slot never renders empty (WEB-FEAT-004):
  //   paid campaign -> affiliate -> house ad. A caller-provided `fallback`
  //   (e.g. content) still takes precedence over house fill.
  if (!ad) {
    if (hasAffiliate) {
      return <AffiliateAdBanner placement={placement} className={className} />;
    }
    return fallback ? <>{fallback}</> : <HouseAd placement={placement} className={className} />;
  }

  // An advertiser link that isn't http(s) renders as a plain, non-clickable
  // ad rather than a javascript:/data: link in our origin.
  const safeLinkUrl = toSafeExternalUrl(ad.link_url);
  const hasImage = !!ad.image_url;
  const isAboveFold = placement === 'top_banner';
  const { width, height } = PLACEMENT_CREATIVE_SIZE[placement];

  // WEB-UX-046: the click lives on a real link, so it is focusable, announces
  // as a link, and middle-click/open-in-new-tab work. The browser follows the
  // href and the click is logged alongside.
  const handleAdClick = () => {
    void trackClick();
  };

  return (
    <Card
      ref={adRef}
      className={`${PLACEMENT_SIZE_CLASSES[placement]} overflow-hidden relative group ${safeLinkUrl ? "hover:shadow-lg transition-shadow" : ""} ${className}`}
      role="complementary"
      aria-label={`Advertisement, ${PLACEMENT_LABELS[placement]}`}
    >
      {/* The creative is an <img> rather than a CSS background, so it has
          alternative text, an intrinsic size and a loading priority. */}
      {hasImage && (
        <OptimizedImage
          src={ad.image_url}
          alt={ad.title || ad.description || "Advertisement"}
          width={width}
          height={height}
          containerClassName="absolute inset-0"
          className="w-full h-full"
          objectFit="cover"
          priority={isAboveFold}
          fetchPriority={isAboveFold ? 'high' : undefined}
        />
      )}

      {/* Gradient overlay for text readability */}
      {hasImage && (
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/30 to-transparent" />
      )}

      {/* FTC-compliant Sponsored label */}
      <div className="absolute top-1.5 left-1.5 z-20">
        <span className="text-[10px] font-medium bg-black/60 text-white/90 px-1.5 py-0.5 rounded tracking-wide uppercase">
          Ad
        </span>
      </div>

      {/* Content wrapper.
          Left padding clears the absolutely-positioned "Ad" badge above
          (WEB-QA-006). With a uniform p-3 the headline started at 12px while
          the badge occupies roughly 6-38px, so on short banner units the badge
          sat on top of the first characters of the title. The badge is FTC
          disclosure and must stay legible, so the text yields to it. */}
      <div className="absolute inset-0 z-10 flex items-center justify-between py-3 pr-3 pl-12 md:py-4 md:pr-4 md:pl-14">
        <div className="flex-1 min-w-0 mr-3 md:mr-4">
          {ad.title && (
            <h3 className={`font-semibold mb-0.5 line-clamp-1 ${hasImage ? 'text-white drop-shadow-lg' : 'text-foreground'} ${placement === 'featured_spot' ? 'text-base md:text-lg' : 'text-sm md:text-base'}`}>
              {ad.title}
            </h3>
          )}
          {ad.description && (
            <p className={`text-xs md:text-sm line-clamp-2 ${hasImage ? 'text-white/90 drop-shadow-md' : 'text-muted-foreground'}`}>
              {ad.description}
            </p>
          )}
        </div>

        {safeLinkUrl && (
          <Button
            asChild
            size="sm"
            // The after: layer stretches this one link over the whole card, so
            // a mouse click anywhere on the ad still lands, without a second
            // click target or a clickable div.
            className="flex-shrink-0 bg-white/90 text-primary hover:bg-white shadow-md group-hover:shadow-lg transition-shadow text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3 after:absolute after:inset-0 after:content-['']"
          >
            <a
              href={safeLinkUrl}
              target="_blank"
              rel="noopener sponsored"
              onClick={handleAdClick}
              aria-label={ad.title ? `${ad.cta_text || 'Learn more'} - ${ad.title}` : "Learn more about this advertisement"}
            >
              {ad.cta_text || "Learn More"}
              <SpriteIcon name="external-link" className="ml-1 md:ml-1.5 h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </Card>
  );
}
