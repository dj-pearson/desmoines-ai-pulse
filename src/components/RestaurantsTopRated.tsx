import { useState } from "react";
import { Link } from "react-router-dom";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import type { TopRatedRestaurant } from "@/hooks/useTopRatedRestaurants";
import {
  TOP_RATED_CAVEAT,
  TOP_RATED_HEADING_RULE,
  TOP_RATED_LIMIT,
  TOP_RATED_RULE,
  rankedFacts,
} from "@/lib/restaurantRanking";
import { cn } from "@/lib/utils";

interface RestaurantsTopRatedProps {
  restaurants: readonly TopRatedRestaurant[];
  isLoading: boolean;
}

/** The anchor other pages may link to. */
export const TOP_RATED_ANCHOR = "top-rated";

/** Rows a phone sees before it asks for the rest (WEB-UX-085). */
export const TOP_RATED_PHONE_PREVIEW = 5;

/**
 * The ranked list at the top of /restaurants (SEO-038). Every entry is a row
 * the rule in src/lib/restaurantRanking.ts selected, with one line of facts
 * from that row. No opinions: the rule is printed with the list and the
 * rating says whose it is.
 *
 * BELOW md IT SHOWS FIVE (WEB-UX-085). Twenty single-column rows with the
 * rule printed first came to about 1,600px at 390px, so the filters and the
 * first photo card started three screens down. All twenty stay in the DOM and
 * only the rows past five are hidden by CSS below md, so the prerendered HTML
 * and the ItemList carry the full list at every width, and md and up is
 * unchanged. The rule moved under the list into a details element: it is
 * still in the page for anyone who asks how the list is made, without being
 * the first thing a phone reads.
 *
 * THE RULE IN ONE LINE sits under the heading at every width (WEB-BE-076), so
 * "best-rated" is never printed without what it measured. The full rule stays
 * in the details element.
 *
 * While the rows load it renders an aria-busy placeholder, which the
 * prerender waits on, so the captured HTML carries the list rather than a
 * skeleton. On an error it renders nothing; the grid below still lists every
 * restaurant.
 */
export function RestaurantsTopRated({ restaurants, isLoading }: RestaurantsTopRatedProps) {
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <SkeletonGroup label="Loading the top-rated restaurants..." className="rounded-2xl bg-card p-4 sm:p-6">
        <Skeleton className="h-7 w-3/4 max-w-md" />
        <div className="mt-5 grid gap-x-10 gap-y-4 md:grid-cols-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton
              key={i}
              className={cn("h-11 w-full", i >= TOP_RATED_PHONE_PREVIEW && "max-md:hidden")}
            />
          ))}
        </div>
      </SkeletonGroup>
    );
  }
  if (restaurants.length === 0) return null;

  const count = restaurants.length;
  const collapsible = count > TOP_RATED_PHONE_PREVIEW;
  const collapsed = collapsible && !expanded;
  const listId = "top-rated-list";
  return (
    <section
      id={TOP_RATED_ANCHOR}
      aria-labelledby="top-rated-heading"
      className="scroll-mt-20 rounded-2xl bg-card p-4 sm:p-6"
      data-top-rated=""
      data-collapsed={collapsed ? "" : undefined}
    >
      <h2 id="top-rated-heading" className="text-xl md:text-2xl font-bold text-foreground">
        {count === TOP_RATED_LIMIT ? "The 20 best-rated" : `The ${count} best-rated`} restaurants in Des Moines
      </h2>
      <p className="mt-1 text-sm text-muted-foreground" data-heading-rule="">
        {TOP_RATED_HEADING_RULE}
      </p>
      <ol id={listId} className="mt-2 md:mt-3 md:columns-2 md:gap-x-10">
        {restaurants.map((r, i) => (
          <li
            key={r.id}
            className={cn(
              "break-inside-avoid border-b border-border last:border-b-0 md:[&:nth-child(10)]:border-b-0",
              collapsed && i >= TOP_RATED_PHONE_PREVIEW && "max-md:hidden",
              collapsed && i === TOP_RATED_PHONE_PREVIEW - 1 && "max-md:border-b-0"
            )}
          >
            <Link
              to={`/restaurants/${r.slug}`}
              className="group flex min-h-11 items-baseline gap-3 py-2.5 text-foreground"
            >
              <span
                className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-muted-foreground"
                aria-hidden="true"
              >
                {i + 1}.
              </span>
              <span className="min-w-0">
                <span className="block font-semibold underline-offset-4 group-hover:text-primary group-hover:underline">
                  {r.name}
                </span>
                <span className="block text-sm text-muted-foreground">{rankedFacts(r).join(" · ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls={listId}
          className="mt-1 inline-flex min-h-11 items-center rounded-lg px-2 -mx-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          {collapsed ? `Show all ${count}` : `Show top ${TOP_RATED_PHONE_PREVIEW}`}
        </button>
      )}
      <details className="mt-1 md:mt-3 text-sm text-muted-foreground">
        {/* Left as display:list-item so the disclosure triangle stays; py-3
            with a 20px line makes the summary a 44px target. */}
        <summary className="w-fit cursor-pointer py-3 leading-5 font-medium text-foreground underline-offset-4 hover:underline">
          How this list is made
        </summary>
        <p className="max-w-[70ch] pb-1" data-selection-rule="">
          {TOP_RATED_RULE} {TOP_RATED_CAVEAT}
        </p>
      </details>
    </section>
  );
}
