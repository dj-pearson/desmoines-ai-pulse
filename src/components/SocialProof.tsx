import { useMemo } from "react";
import { Link } from "react-router-dom";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";
import { countTonightByArea, tonightCountLabel } from "@/lib/neighborhoodTonight";
import { isPrerender } from "@/lib/isPrerender";
import { useTonightEvents } from "@/hooks/useTonightPairings";

/**
 * The home page's area strip. The export keeps its old name so the mount in
 * Index.tsx does not move.
 *
 * WEB-SEO-016 removed invented testimonials, a 4.8/5 rating and user counts
 * from this section, and the first home pass removed a third copy of the
 * hero's counts and two badges naming areas with no page. Every chip is a link
 * to /neighborhoods/<slug>, generated from NEIGHBORHOODS, so the strip cannot
 * name an area the site has no page for; scripts/check-neighborhood-inventory.mjs
 * keeps that list honest.
 *
 * "Explore by area", not "by neighborhood": seven of the eight entries are
 * separate cities (home pass-2 WP4 item 9).
 *
 * TONIGHT COUNTS come from the Tonight rail's own rows (useTonightEvents: same
 * query key, so no request of its own) matched with the neighborhood pages'
 * rule (src/lib/neighborhoodTonight.ts). A count is a floor ("3+") when the
 * rail's query hit its row cap. Nothing is shown while loading, on error, or
 * at zero: the chip is then just the area's name. Nor in the prerendered HTML,
 * which would freeze tonight's number into a page served for days.
 */
export function SocialProof() {
  const { events, rowCapHit, isLoading, isError } = useTonightEvents();

  const counts = useMemo(
    () =>
      isLoading || isError || isPrerender() ? null : countTonightByArea(events, NEIGHBORHOODS),
    [events, isLoading, isError],
  );

  return (
    <section aria-labelledby="home-neighborhoods-heading" className="py-12 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-4">
          <h2 id="home-neighborhoods-heading" className="text-2xl font-bold">
            Explore by area
          </h2>
          <Link
            to="/neighborhoods"
            className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:no-underline"
          >
            All neighborhoods
          </Link>
        </div>
        <p className="max-w-prose text-muted-foreground mb-5">
          Events, places to eat and things to do in the East Village and the cities around
          Des Moines.
        </p>
        <ul className="flex flex-wrap gap-2">
          {NEIGHBORHOODS.map((n) => {
            const tonight = counts ? tonightCountLabel(counts[n.slug] ?? 0, rowCapHit) : null;
            return (
              <li key={n.slug}>
                <Link
                  to={`/neighborhoods/${n.slug}`}
                  data-area-chip={n.slug}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {n.name}
                  {tonight && (
                    // Live and time-bound: kept out of search snippets.
                    <span data-nosnippet className="font-normal text-muted-foreground">
                      , {tonight}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default SocialProof;
