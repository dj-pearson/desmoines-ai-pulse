/**
 * FTC-compliant "Sponsored" label for promoted listings.
 * Per FTC guidelines (16 CFR Part 255), native/in-feed promoted content must be
 * clearly and conspicuously labeled as "Sponsored" so consumers are not misled.
 *
 * text-xs, not text-[10px]: a disclosure has to be readable to count as
 * conspicuous. The fill is amber-700 because white on amber-500 measured about
 * 2.1:1; amber-700 clears 4.5:1 (the same pair as STATUS_BADGE.featured).
 * No aria-label: the visible word is the accessible name, and an aria-label on
 * a plain span is not reliably announced anyway.
 */
interface SponsoredBadgeProps {
  /** Optional extra class names */
  className?: string;
}

export function SponsoredBadge({ className = '' }: SponsoredBadgeProps) {
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold bg-amber-700 text-white px-1.5 py-0.5 rounded select-none ${className}`}
    >
      Sponsored
    </span>
  );
}
