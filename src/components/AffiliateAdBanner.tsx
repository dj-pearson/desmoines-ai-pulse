import { useAffiliateAd } from '@/hooks/useAffiliateAd';
import { isCapacitor, openExternalUrl } from '@/lib/capacitorUtils';
import type { AffiliatePlacement } from '@/lib/affiliateAds';

interface AffiliateAdBannerProps {
  placement: AffiliatePlacement;
  className?: string;
  /** Fired on click so the parent can track the affiliate fill (fill-rate measurement). */
  onClick?: () => void;
}

export function AffiliateAdBanner({ placement, className = '', onClick }: AffiliateAdBannerProps) {
  const { partner, imageUrl, affiliateUrl } = useAffiliateAd(placement);

  if (!partner || !imageUrl || !affiliateUrl) return null;

  const handleClick = async () => {
    onClick?.();
    if (isCapacitor()) {
      await openExternalUrl(affiliateUrl);
    } else {
      window.open(affiliateUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const sizeClasses = (() => {
    switch (placement) {
      case 'top_banner':
      case 'below_fold':
        return 'max-w-[728px] mx-auto';
      case 'featured_spot':
        return 'max-w-[300px] mx-auto';
      case 'sidebar':
        return 'hidden lg:block max-w-[160px]';
      default:
        return '';
    }
  })();

  const isAboveFold = placement === 'top_banner';

  return (
    <div
      className={`relative cursor-pointer group ${sizeClasses} ${className}`}
      role="complementary"
      aria-label={`${partner.name} affiliate advertisement`}
    >
      {/* FTC-compliant Ad label */}
      <div className="absolute top-1.5 left-1.5 z-20">
        <span className="text-[10px] font-medium bg-black/60 text-white/90 px-1.5 py-0.5 rounded tracking-wide uppercase">
          Ad
        </span>
      </div>

      <a
        href={affiliateUrl}
        target="_blank"
        rel="sponsored noopener noreferrer"
        onClick={(e) => {
          if (isCapacitor()) {
            e.preventDefault();
            handleClick();
          } else {
            onClick?.();
          }
        }}
        className="block"
      >
        <img
          src={imageUrl}
          alt={`${partner.name} - Book hotels in Des Moines`}
          className="w-full h-auto rounded-lg shadow-sm group-hover:shadow-md transition-shadow"
          loading={isAboveFold ? 'eager' : 'lazy'}
          fetchPriority={isAboveFold ? 'high' : undefined}
        />
      </a>
    </div>
  );
}
