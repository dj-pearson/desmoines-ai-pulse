import { Link } from "react-router-dom";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import {
  formatDealSchedule,
  happyHourNow,
  useHappyHourCandidates,
  type HappyHourCandidate,
} from "@/hooks/useDeals";
import { isPrerender } from "@/lib/isPrerender";

/**
 * "Happy hour now" on the /restaurants hub (WEB-FEAT-025).
 *
 * The old Happy Hour quick pick filtered on a tag no query applied, so it
 * returned an unfiltered list. This reads the deals DealManager curates
 * (entity_type 'restaurant', with a daily time window) and lists the ones
 * running at this minute in Des Moines, re-evaluated each minute.
 *
 * Renders nothing while loading, on error, or when nothing is running, the
 * same as the Tonight strip beside it: a "no happy hours right now" box on
 * every visit would read as a claim about the whole city, and the deals table
 * only holds what someone has entered. /deals?when=now says that plainly.
 *
 * Never in static HTML: /restaurants is prerendered and "now" frozen at build
 * time is wrong a minute later.
 */

const linkClass =
  "font-semibold text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm";

interface RestaurantsHappyHourStripProps {
  className?: string;
}

export function RestaurantsHappyHourStrip({ className = "" }: RestaurantsHappyHourStripProps) {
  // Checked before the hooks so the prerender makes no request.
  if (isPrerender()) return null;
  return <HappyHourLive className={className} />;
}

function HappyHourLive({ className }: RestaurantsHappyHourStripProps) {
  const now = useMinuteClock();
  const { data } = useHappyHourCandidates();
  return <HappyHourList rows={happyHourNow(data, now)} className={className} />;
}

interface HappyHourListProps {
  rows: HappyHourCandidate[];
  className?: string;
}

/** The list itself, exported so tests can render it with a fixed clock. */
export function HappyHourList({ rows, className = "" }: HappyHourListProps) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="restaurants-happy-hour-heading" className={className}>
      <h2 id="restaurants-happy-hour-heading" className="text-lg font-semibold text-foreground mb-2">
        Happy hour now
      </h2>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {rows.map(({ deal, restaurant }) => {
          const schedule = formatDealSchedule(deal);
          return (
            <li
              key={restaurant.id}
              className="flex min-h-11 flex-wrap items-center gap-x-1.5 gap-y-1 px-4 py-2.5 text-sm"
              data-happy-hour-row=""
            >
              <Link to={`/restaurants/${restaurant.slug || restaurant.id}#deals`} className={linkClass}>
                {restaurant.name || deal.business_name}
              </Link>
              <span className="text-foreground">{deal.title}</span>
              {schedule && <span className="text-muted-foreground">({schedule})</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm">
        <Link
          to="/deals?category=restaurant&when=now"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Every dining deal running now
        </Link>
      </p>
    </section>
  );
}
