import { Link } from "react-router-dom";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import type { TopRatedRestaurant } from "@/hooks/useTopRatedRestaurants";
import { TOP_RATED_CAVEAT, TOP_RATED_LIMIT, TOP_RATED_RULE, rankedFacts } from "@/lib/restaurantRanking";

interface RestaurantsTopRatedProps {
  restaurants: readonly TopRatedRestaurant[];
  isLoading: boolean;
}

/** The anchor other pages may link to. */
export const TOP_RATED_ANCHOR = "top-rated";

/**
 * The ranked list at the top of /restaurants (SEO-038). Every entry is a row
 * the rule in src/lib/restaurantRanking.ts selected, with one line of facts
 * from that row. No opinions: the rule is printed above the list and the
 * rating says whose it is.
 *
 * While the rows load it renders an aria-busy placeholder, which the
 * prerender waits on, so the captured HTML carries the list rather than a
 * skeleton. On an error it renders nothing; the grid below still lists every
 * restaurant.
 */
export function RestaurantsTopRated({ restaurants, isLoading }: RestaurantsTopRatedProps) {
  if (isLoading) {
    return (
      <SkeletonGroup label="Loading the top-rated restaurants..." className="rounded-2xl bg-card p-4 sm:p-6">
        <Skeleton className="h-7 w-3/4 max-w-md" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        <div className="mt-5 grid gap-x-10 gap-y-4 md:grid-cols-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </SkeletonGroup>
    );
  }
  if (restaurants.length === 0) return null;

  const count = restaurants.length;
  return (
    <section
      id={TOP_RATED_ANCHOR}
      aria-labelledby="top-rated-heading"
      className="scroll-mt-20 rounded-2xl bg-card p-4 sm:p-6"
      data-top-rated=""
    >
      <h2 id="top-rated-heading" className="text-xl md:text-2xl font-bold text-foreground">
        {count === TOP_RATED_LIMIT ? "The 20 best-rated" : `The ${count} best-rated`} restaurants in Des Moines
      </h2>
      <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground" data-selection-rule="">
        How this list is made: {TOP_RATED_RULE} {TOP_RATED_CAVEAT}
      </p>
      <ol className="mt-4 md:columns-2 md:gap-x-10">
        {restaurants.map((r, i) => (
          <li key={r.id} className="break-inside-avoid border-b border-border last:border-b-0 md:[&:nth-child(10)]:border-b-0">
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
    </section>
  );
}
