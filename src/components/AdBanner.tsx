import { useEffect } from "react";
import { useActiveAds } from "@/hooks/useActiveAds";
import { useAffiliateAd } from "@/hooks/useAffiliateAd";
import { useAdTracking } from "@/hooks/useAdTracking";
import { useSubscription } from "@/hooks/useSubscription";
import { AffiliateAdBanner } from "@/components/AffiliateAdBanner";
import { HouseAd } from "@/components/HouseAd";
import { RevealOnVisible } from "@/components/RevealOnVisible";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { openExternalUrl, isCapacitor } from "@/lib/capacitorUtils";
import { trackAdFill, trackAdFillClick, type AdInventoryClass } from "@/lib/tracking";

type AdPlacement = 'top_banner' | 'featured_spot' | 'below_fold' | 'sidebar';

interface AdBannerProps {
  placement: AdPlacement;
  className?: string;
  /** Optional fallback content shown to ad-free (Insider/VIP) members. */
  fallback?: React.ReactNode;
}

function getAdSizeClasses(placement: AdPlacement): string {
  switch (placement) {
    case 'top_banner':
      return "h-20 md:h-28";
    case 'featured_spot':
      return "min-h-[220px] md:min-h-[250px]";
    case 'below_fold':
      return "h-20 md:h-28";
    case 'sidebar':
      return "w-[160px] min-h-[600px]";
    default:
      return "h-24 md:h-28";
  }
}

/**
 * Ad slot with a never-empty fill chain: paid campaign → affiliate → house ad.
 * Insider/VIP members see zero ads. Top-banner (above the fold) renders
 * immediately; every other placement defers its fetch + render until it scrolls
 * near the viewport so it never costs LCP or bandwidth before then.
 */
export function AdBanner({ placement, className = "", fallback }: AdBannerProps) {
  const { hasFeature, isLoading: subscriptionLoading } = useSubscription();

  // Insider and VIP members get an ad-free experience.
  if (hasFeature('ad_free')) {
    return fallback ? <>{fallback}</> : null;
  }

  if (subscriptionLoading) {
    return null;
  }

  if (placement === 'top_banner') {
    return <AdBannerContent placement={placement} className={className} />;
  }

  return (
    <RevealOnVisible
      placeholder={
        <div className={`${getAdSizeClasses(placement)} ${className}`} aria-hidden="true" />
      }
    >
      <AdBannerContent placement={placement} className={className} />
    </RevealOnVisible>
  );
}

/** The resolved ad for a slot, deciding paid vs affiliate vs house fill. */
function AdBannerContent({
  placement,
  className,
}: {
  placement: AdPlacement;
  className: string;
}) {
  const { ad, isLoading: adLoading } = useActiveAds(placement);
  const affiliate = useAffiliateAd(placement);

  const { adRef, trackClick } = useAdTracking({
    campaignId: ad?.campaign_id || '',
    creativeId: ad?.creative_id || '',
    placementType: placement,
    autoTrackImpression: !!ad,
    viewabilityThreshold: 0.5,
    viewabilityDuration: 1000,
  });

  // Which inventory class fills the slot (null while the campaign RPC resolves).
  const inventory: AdInventoryClass | null = adLoading
    ? null
    : ad
      ? 'paid'
      : affiliate.partner
        ? 'affiliate'
        : 'house';

  // Record the fill (tagged by source) so fill rate is measurable.
  useEffect(() => {
    if (inventory) {
      trackAdFill(inventory, placement);
    }
  }, [inventory, placement]);

  // Brief: still resolving whether a paid campaign exists.
  if (adLoading) {
    return null;
  }

  // Affiliate fill.
  if (!ad && affiliate.partner) {
    return (
      <AffiliateAdBanner
        placement={placement}
        className={className}
        onClick={() => trackAdFillClick('affiliate', placement)}
      />
    );
  }

  // House fill — never leave the slot empty.
  if (!ad) {
    return <HouseAd placement={placement} className={className} />;
  }

  // Paid campaign fill.
  const handleAdClick = async () => {
    await trackClick();
    trackAdFillClick('paid', placement);
    if (ad.link_url) {
      if (isCapacitor()) {
        await openExternalUrl(ad.link_url);
      } else {
        window.open(ad.link_url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  return (
    <Card
      ref={adRef}
      className={`${getAdSizeClasses(placement)} overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative group ${className}`}
      role="complementary"
      aria-label="Sponsored advertisement"
    >
      {/* FTC-compliant Sponsored label */}
      <div className="absolute top-1.5 left-1.5 z-20">
        <span className="text-[10px] font-medium bg-black/60 text-white/90 px-1.5 py-0.5 rounded tracking-wide uppercase">
          Ad
        </span>
      </div>

      <div
        onClick={handleAdClick}
        className="w-full h-full relative flex items-center"
        style={{
          backgroundImage: ad.image_url ? `url(${ad.image_url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Gradient overlay for text readability */}
        {ad.image_url && (
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/30 to-transparent" />
        )}

        {/* Content wrapper */}
        <div className="relative z-10 flex items-center justify-between w-full p-3 md:p-4">
          <div className="flex-1 min-w-0 mr-3 md:mr-4">
            {ad.title && (
              <h3 className={`font-semibold mb-0.5 line-clamp-1 ${ad.image_url ? 'text-white drop-shadow-lg' : 'text-foreground'} ${placement === 'featured_spot' ? 'text-base md:text-lg' : 'text-sm md:text-base'}`}>
                {ad.title}
              </h3>
            )}
            {ad.description && (
              <p className={`text-xs md:text-sm line-clamp-2 ${ad.image_url ? 'text-white/90 drop-shadow-md' : 'text-muted-foreground'}`}>
                {ad.description}
              </p>
            )}
          </div>

          {ad.link_url && (
            <Button
              size="sm"
              className="flex-shrink-0 bg-white/90 text-primary hover:bg-white shadow-md group-hover:shadow-lg transition-shadow text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
              aria-label={ad.title ? `${ad.cta_text || 'Learn more'} - ${ad.title}` : "Learn more about this advertisement"}
            >
              {ad.cta_text || "Learn More"}
              <ExternalLink className="ml-1 md:ml-1.5 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
