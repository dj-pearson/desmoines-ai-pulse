import { Link } from "react-router-dom";
import { useTonightPairings } from "@/hooks/useTonightPairings";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { formatCentralTime, formatMiles, type TonightPairing } from "@/lib/tonightPairings";
import { isPrerender } from "@/lib/isPrerender";

/**
 * "Dinner before the show" on the /restaurants hub (eat-drink plan WP1 item 7).
 *
 * Reuses useTonightPairings, the same two requests the home page's TonightRail
 * makes, so a visitor who came from the home page gets this from cache. Only
 * pairings that found an open restaurant are shown: an event with no dinner is
 * the events hub's business, not this one's.
 *
 * Renders nothing while loading, on error, or when nothing pairs. A skeleton
 * would push cards down for a strip that often has nothing to say.
 *
 * Never in static HTML (eat-drink pass 2 WP1 item 3). /restaurants is
 * prerendered, and "tonight" frozen at build time is wrong by the next
 * evening. The hub places it: above the grid from sm up, after the third card
 * below sm, so it is never the first thing on a phone.
 */

const MAX_ROWS = 3;

type PairedTonight = TonightPairing & { dinner: NonNullable<TonightPairing["dinner"]> };

function isPaired(p: TonightPairing): p is PairedTonight {
  return p.dinner !== null;
}

const linkClass =
  "font-semibold text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

interface RestaurantsTonightStripProps {
  className?: string;
}

export function RestaurantsTonightStrip({ className = "" }: RestaurantsTonightStripProps) {
  // Checked before the hook so the prerender makes neither request.
  if (isPrerender()) return null;
  return <TonightRows className={className} />;
}

function TonightRows({ className }: RestaurantsTonightStripProps) {
  const { pairings } = useTonightPairings();
  const rows = pairings.filter(isPaired).slice(0, MAX_ROWS);

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="restaurants-tonight-heading" className={className}>
      <h2 id="restaurants-tonight-heading" className="text-lg font-semibold text-foreground mb-2">
        Dinner before a show tonight
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map((pairing) => {
          const { event, dinner, startsAt } = pairing;
          const restaurant = dinner.restaurant;
          return (
            <li
              key={event.id}
              className="flex min-h-11 flex-wrap items-center gap-x-1.5 gap-y-1 px-4 py-2.5 text-sm"
              data-tonight-row=""
            >
              <span className="text-muted-foreground">Dinner at</span>
              <Link to={`/restaurants/${restaurant.slug || restaurant.id}`} className={linkClass}>
                {restaurant.name || "a nearby restaurant"}
              </Link>
              <span className="text-muted-foreground">({formatMiles(dinner.distanceMiles)}) before</span>
              <Link
                to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                className={linkClass}
              >
                {event.title || "tonight's event"}
              </Link>
              {startsAt && (
                <span className="text-muted-foreground">at {formatCentralTime(startsAt)} CT</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
