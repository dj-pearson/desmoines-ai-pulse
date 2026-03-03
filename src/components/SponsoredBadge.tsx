/**
 * FTC-compliant "Sponsored" label for promoted listings.
 * Per FTC guidelines (16 CFR Part 255), native/in-feed promoted content must be
 * clearly and conspicuously labeled as "Sponsored" so consumers are not misled.
 */
interface SponsoredBadgeProps {
  /** Optional extra class names */
  className?: string;
}

export function SponsoredBadge({ className = '' }: SponsoredBadgeProps) {
  return (
    <span
      aria-label="Sponsored content"
      className={`inline-flex items-center text-[10px] font-semibold bg-amber-500/90 text-white px-1.5 py-0.5 rounded tracking-wide uppercase select-none ${className}`}
    >
      Sponsored
    </span>
  );
}
