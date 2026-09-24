import { useActiveAds } from "@/hooks/useActiveAds";
import { useAdTracking } from "@/hooks/useAdTracking";
import { useSubscription } from "@/hooks/useSubscription";
import { useAffiliateAd } from "@/hooks/useAffiliateAd";
import { AffiliateAdBanner } from "@/components/AffiliateAdBanner";
import { HouseAd } from "@/components/HouseAd";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { openExternalUrl, toSafeExternalUrl } from "@/lib/capacitorUtils";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

interface AdBannerProps {
  placement: 'top_banner' | 'featured_spot' | 'below_fold';
  className?: string;
  /** Optional fallback content when no ads are available */
  fallback?: React.ReactNode;
}

/**
 * Height each placement reserves. Used both for the rendered ad and for the
 * placeholder shown while the subscription and ad queries resolve, so the slot
 * doesn't grow from 0 to 80-112px under the reader once an ad arrives.
 */
const PLACEMENT_SIZE_CLASSES: Record<AdBannerProps['placement'], string> = {
  top_banner: "h-20 md:h-28",
  featured_spot: "min-h-[220px] md:min-h-[250px]",
  below_fold: "h-20 md:h-28",
};

const PLACEMENT_RESERVE_CLASSES: Record<AdBannerProps['placement'], string> = {
  top_banner: "min-h-20 md:min-h-28",
  featured_spot: "min-h-[220px] md:min-h-[250px]",
  below_fold: "min-h-20 md:min-h-28",
};

/**
 * Builds a CSS `url("...")` value. The advertiser controls `image_url`, and an
 * unquoted `url(${x})` lets a `)` or `;` in it end the value early. Quotes,
 * backslashes and line breaks are escaped so the string stays one token.
 */
function cssUrl(value: string): string {
  const escaped = value.replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, "");
  return `url("${escaped}")`;
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

  // Insider and VIP members get an ad-free experience: no ad and no empty band.
  if (hasFeature('ad_free')) {
    return fallback ? <>{fallback}</> : null;
  }

  if (subscriptionLoading || adLoading) {
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

  const handleAdClick = async () => {
    if (!safeLinkUrl) return;
    await trackClick();
    await openExternalUrl(safeLinkUrl);
  };

  return (
    <Card
      ref={adRef}
      className={`${PLACEMENT_SIZE_CLASSES[placement]} overflow-hidden relative group ${safeLinkUrl ? "cursor-pointer hover:shadow-lg transition-shadow" : ""} ${className}`}
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
        onClick={safeLinkUrl ? handleAdClick : undefined}
        className="w-full h-full relative flex items-center"
        style={{
          backgroundImage: ad.image_url ? cssUrl(ad.image_url) : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Gradient overlay for text readability */}
        {ad.image_url && (
          <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/30 to-transparent" />
        )}

        {/* Content wrapper.
            Left padding clears the absolutely-positioned "Ad" badge above
            (WEB-QA-006). With a uniform p-3 the headline started at 12px while
            the badge occupies roughly 6-38px, so on short banner units the badge
            sat on top of the first characters of the title. The badge is FTC
            disclosure and must stay legible, so the text yields to it. */}
        <div className="relative z-10 flex items-center justify-between w-full py-3 pr-3 pl-12 md:py-4 md:pr-4 md:pl-14">
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

          {safeLinkUrl && (
            <Button
              size="sm"
              className="flex-shrink-0 bg-white/90 text-primary hover:bg-white shadow-md group-hover:shadow-lg transition-shadow text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
              aria-label={ad.title ? `${ad.cta_text || 'Learn more'} - ${ad.title}` : "Learn more about this advertisement"}
            >
              {ad.cta_text || "Learn More"}
              <SpriteIcon name="external-link" className="ml-1 md:ml-1.5 h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
