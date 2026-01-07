import React from 'react';

interface OptimizedLogoProps {
  /** Logo variant to use */
  variant?: 'default' | 'header' | 'text' | 'icon' | 'logo2';
  /** Alt text for the image */
  alt?: string;
  /** Additional CSS classes */
  className?: string;
  /** Image width - if only height is provided, width is calculated from aspect ratio */
  width?: number;
  /** Image height - if only width is provided, height is calculated from aspect ratio */
  height?: number;
  /** Loading strategy - use 'eager' for above-the-fold images */
  loading?: 'lazy' | 'eager';
  /** Fetch priority hint */
  fetchPriority?: 'high' | 'low' | 'auto';
}

// Known aspect ratios for each logo variant (width:height)
const LOGO_ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  default: { width: 400, height: 400 },   // DMI-Logo (square-ish)
  header: { width: 400, height: 119 },    // DMI-Logo-Header (wide)
  text: { width: 300, height: 60 },       // DMI-Logo-Text (wide)
  icon: { width: 64, height: 64 },        // DMI-Icon (square)
  logo2: { width: 600, height: 593 },     // DMI-Logo2 (nearly square)
};

/**
 * Optimized logo component that uses WebP format with PNG fallback
 * This provides 95%+ smaller file sizes compared to original PNGs
 *
 * Performance improvements:
 * - DMI-Logo: 1.3MB → 18KB WebP (98.6% smaller)
 * - DMI-Logo-Header: 118KB → 20KB WebP (83% smaller)
 */
export function OptimizedLogo({
  variant = 'default',
  alt = 'Des Moines Insider',
  className = '',
  width: propWidth,
  height: propHeight,
  loading = 'eager',
  fetchPriority = 'high',
}: OptimizedLogoProps) {
  const logoFiles = {
    default: 'DMI-Logo',
    header: 'DMI-Logo-Header',
    text: 'DMI-Logo-Text',
    icon: 'DMI-Icon',
    logo2: 'DMI-Logo2',
  };

  const fileName = logoFiles[variant];
  const aspectRatio = LOGO_ASPECT_RATIOS[variant];

  // Calculate dimensions maintaining aspect ratio to prevent CLS
  let width = propWidth;
  let height = propHeight;

  if (aspectRatio) {
    if (propHeight && !propWidth) {
      // Calculate width from height
      width = Math.round((propHeight * aspectRatio.width) / aspectRatio.height);
    } else if (propWidth && !propHeight) {
      // Calculate height from width
      height = Math.round((propWidth * aspectRatio.height) / aspectRatio.width);
    } else if (!propWidth && !propHeight) {
      // Use natural dimensions (scaled down for performance)
      width = aspectRatio.width > 100 ? Math.round(aspectRatio.width / 4) : aspectRatio.width;
      height = aspectRatio.height > 100 ? Math.round(aspectRatio.height / 4) : aspectRatio.height;
    }
  }

  return (
    <picture>
      <source srcSet={`/${fileName}.webp`} type="image/webp" />
      <img
        src={`/${fileName}.png`}
        alt={alt}
        className={className}
        width={width}
        height={height}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
      />
    </picture>
  );
}
