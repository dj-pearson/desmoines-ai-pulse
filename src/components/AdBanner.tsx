import { useActiveAds } from "@/hooks/useActiveAds";
import { useAdTracking } from "@/hooks/useAdTracking";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface AdBannerProps {
  placement: 'top_banner' | 'featured_spot' | 'below_fold';
  className?: string;
  /** Optional fallback content when no ads are available */
  fallback?: React.ReactNode;
}

export function AdBanner({ placement, className = "", fallback }: AdBannerProps) {
  const { ad, isLoading } = useActiveAds(placement);

  const { adRef, trackClick } = useAdTracking({
    campaignId: ad?.campaign_id || '',
    creativeId: ad?.creative_id || '',
    placementType: placement,
    autoTrackImpression: !!ad,
    viewabilityThreshold: 0.5,
    viewabilityDuration: 1000,
  });

  if (isLoading) {
    return null;
  }

  if (!ad) {
    return fallback ? <>{fallback}</> : null;
  }

  const handleAdClick = async () => {
    await trackClick();
    if (ad.link_url) {
      window.open(ad.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  const getAdSizeClasses = () => {
    switch (placement) {
      case 'top_banner':
        return "h-24 md:h-28";
      case 'featured_spot':
        return "min-h-[250px]";
      case 'below_fold':
        return "h-24 md:h-28";
      default:
        return "h-28";
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
        <div className="relative z-10 flex items-center justify-between w-full p-4">
          <div className="flex-1 min-w-0 mr-4">
            {ad.title && (
              <h3 className={`font-semibold mb-0.5 line-clamp-1 ${ad.image_url ? 'text-white drop-shadow-lg' : 'text-foreground'} ${placement === 'featured_spot' ? 'text-lg' : 'text-base'}`}>
                {ad.title}
              </h3>
            )}
            {ad.description && (
              <p className={`text-sm line-clamp-2 ${ad.image_url ? 'text-white/90 drop-shadow-md' : 'text-muted-foreground'}`}>
                {ad.description}
              </p>
            )}
          </div>

          {ad.link_url && (
            <Button
              size="sm"
              className="flex-shrink-0 bg-white/90 text-primary hover:bg-white shadow-md group-hover:shadow-lg transition-shadow"
              aria-label={ad.title ? `${ad.cta_text || 'Learn more'} - ${ad.title}` : "Learn more about this advertisement"}
            >
              {ad.cta_text || "Learn More"}
              <ExternalLink className="ml-1.5 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
