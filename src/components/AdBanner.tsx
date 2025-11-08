import { useActiveAds } from "@/hooks/useActiveAds";
import { useAdTracking } from "@/hooks/useAdTracking";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface AdBannerProps {
  placement: 'top_banner' | 'featured_spot' | 'below_fold';
  className?: string;
}

export function AdBanner({ placement, className = "" }: AdBannerProps) {
  const { ad, isLoading } = useActiveAds(placement);

  // Set up ad tracking with viewability monitoring
  const { adRef, trackClick } = useAdTracking({
    campaignId: ad?.campaign_id || '',
    creativeId: ad?.creative_id || '',
    placementType: placement,
    autoTrackImpression: !!ad, // Only track if ad exists
    viewabilityThreshold: 0.5, // 50% visible
    viewabilityDuration: 1000, // 1 second
  });

  if (isLoading || !ad) {
    return null;
  }

  const handleAdClick = async () => {
    // Track the click
    await trackClick();

    // Open the link
    if (ad.link_url) {
      window.open(ad.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  const getAdSizeClasses = () => {
    switch (placement) {
      case 'top_banner':
        return "h-24 md:h-32";
      case 'featured_spot':
        return "h-48 md:h-56";
      case 'below_fold':
        return "h-32 md:h-40";
      default:
        return "h-32";
    }
  };

  return (
    <Card
      ref={adRef}
      className={`${getAdSizeClasses()} overflow-hidden cursor-pointer hover:shadow-lg transition-shadow ${className}`}
    >
      <div
        onClick={handleAdClick}
        className="w-full h-full relative bg-gradient-to-r from-muted to-muted/50 flex items-center justify-between p-4"
        style={{
          backgroundImage: ad.image_url ? `url(${ad.image_url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Overlay for better text readability */}
        {ad.image_url && (
          <div className="absolute inset-0 bg-black/20" />
        )}

        <div className="relative z-10 flex-1">
          {ad.title && (
            <h3 className="font-semibold text-lg text-white mb-1 drop-shadow-lg">
              {ad.title}
            </h3>
          )}
          {ad.description && (
            <p className="text-sm text-white/90 drop-shadow-lg line-clamp-2">
              {ad.description}
            </p>
          )}
        </div>

        {ad.link_url && (
          <Button
            size="sm"
            className="relative z-10 ml-4 bg-white/90 text-primary hover:bg-white"
            aria-label={ad.title ? `Learn more about ${ad.title}` : "Learn more about this advertisement"}
          >
            {ad.cta_text || "Learn More"}
            <ExternalLink className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>
    </Card>
  );
}
