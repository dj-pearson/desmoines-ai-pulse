export interface WhatWeCountProps {
  className?: string;
}

/**
 * The counting rules behind the numbers on /campaigns/:id/analytics, taken
 * from the code that does the counting. If one of these changes, change the
 * sentence here in the same commit:
 *
 * - impression: useAdTracking.ts, viewabilityThreshold 0.5 and
 *   viewabilityDuration 1000 (IntersectionObserver)
 * - bots: supabase/functions/_shared/adEventFilters.ts, looksAutomated()
 * - apps: track-ad-event/index.ts header; iOS and Android still write to the
 *   tables directly and RLS refuses them
 */
export function WhatWeCount({ className }: WhatWeCountProps) {
  return (
    <section aria-labelledby="what-we-count-heading" className={className}>
      <h2 id="what-we-count-heading" className="text-lg font-semibold">
        What we count
      </h2>
      <ul className="mt-3 max-w-prose list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        <li>
          An impression is counted when at least half of your ad has been on screen for one second.
          An ad that loads below the fold and is never scrolled to isn't counted.
        </li>
        <li>
          Visits from crawlers and automated browsers are dropped, and so are requests that don't say
          what browser sent them.
        </li>
        <li>
          Only the website is counted today. Views in the iOS and Android apps aren't recorded yet, so
          they don't appear here.
        </li>
        <li>A click is counted each time someone opens your link from the ad.</li>
      </ul>
    </section>
  );
}
