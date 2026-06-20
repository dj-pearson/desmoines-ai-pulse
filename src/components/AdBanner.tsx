import { useActiveAds } from "@/hooks/useActiveAds";
import { useAdTracking } from "@/hooks/useAdTracking";
import { useSubscription } from "@/hooks/useSubscription";
import { useAffiliateAd } from "@/hooks/useAffiliateAd";
import { AffiliateAdBanner } from "@/components/AffiliateAdBanner";
import { HouseAd } from "@/components/HouseAd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { openExternalUrl, isCapacitor } from "@/lib/capacitorUtils";

interface AdBannerProps {
  placement: 'top_banner' | 'featured_spot' | 'below_fold' | 'sidebar';
  className?: string;
  /** Optional fallback content when no ads are available */
  fallback?: React.ReactNode;
}

export function AdBanner({ placement, className = "", fallback }: AdBannerProps) {
  const { hasFeature, isLoading: subscriptionLoading } = useSubscription();
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

  // Insider and VIP members get an ad-free experience
  if (hasFeature('ad_free')) {
    return fallback ? <>{fallback}</> : null;
  }

  if (subscriptionLoading || adLoading) {
    return null;
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

  const handleAdClick = async () => {
    await trackClick();
    if (ad.link_url) {
      if (isCapacitor()) {
        await openExternalUrl(ad.link_url);
      } else {
        window.open(ad.link_url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const getAdSizeClasses = () => {
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
  };

  return (
    <Card
      ref={adRef}
      className={`${getAdSizeClasses()} overflow-hidden cursor-pointer hover:shadow-lg transition-shadow relative group ${className}`}
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
