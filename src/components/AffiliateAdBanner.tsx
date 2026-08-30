import { useEffect, useRef } from 'react';
import { useAffiliateAd } from '@/hooks/useAffiliateAd';
import { isCapacitor, openExternalUrl } from '@/lib/capacitorUtils';
import type { AffiliatePlacement } from '@/lib/affiliateAds';
import { createViewabilityObserver } from '@/lib/tracking';
import { logAdImpression, logAdClick } from '@/lib/adAnalytics';

interface AffiliateAdBannerProps {
  placement: AffiliatePlacement;
  className?: string;
}

export function AffiliateAdBanner({ placement, className = '' }: AffiliateAdBannerProps) {
  const { partner, imageUrl, affiliateUrl } = useAffiliateAd(placement);
  const ref = useRef<HTMLDivElement>(null);

  // Affiliate-class fill tracking (WEB-FEAT-004): viewability impression.
  useEffect(() => {
    if (!ref.current || !partner) return;
    const observer = createViewabilityObserver(ref.current, () => {
      logAdImpression('affiliate', placement, { partner: partner.name });
    });
    return () => observer.disconnect();
  }, [placement, partner]);

  if (!partner || !imageUrl || !affiliateUrl) return null;

  const handleClick = async () => {
    logAdClick('affiliate', placement, { partner: partner.name });
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
      ref={ref}
      className={`relative cursor-pointer group ${sizeClasses} ${className}`}
      role="complementary"
      aria-label={`${partner.name} affiliate advertisement`}
    >
      {/* FTC-compliant Ad label.
          Rendered ABOVE the creative rather than overlaid on it (WEB-QA-006).
          This unit's headline is baked into the partner's image, so an
          absolutely-positioned badge sat directly on top of that artwork — the
          QA pass caught it covering the leading "Di" of "Discover". Padding
          cannot fix text that lives inside a bitmap, so the disclosure gets its
          own line. Still clear and conspicuous, and immediately adjacent to the
          ad, which is what the FTC guidance asks for.
          (AdBanner renders its headline as real DOM text, so it keeps the
          overlaid badge and just reserves left padding instead.) */}
      <div className="mb-1 flex">
        <span className="text-[10px] font-medium bg-muted text-muted-foreground px-1.5 py-0.5 rounded tracking-wide uppercase">
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
            logAdClick('affiliate', placement, { partner: partner.name });
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
