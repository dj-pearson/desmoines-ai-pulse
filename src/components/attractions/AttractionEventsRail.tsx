import { Link } from "react-router-dom";
import { useVenueEvents, useVenueLinks } from "@/hooks/useVenues";
import { useNearbyListings } from "@/hooks/useNearbyListings";
import { eventHref } from "@/lib/dashboardItems";
import { formatEventDateShort } from "@/lib/timezone";
import { formatMiles, matchVenue, nearby } from "@/lib/venuePages";

/**
 * "Happening here and nearby" on an attraction page (Explore plan WP3 item 8).
 *
 * Two sources, merged: upcoming events whose venue names this attraction
 * (useVenueEvents, which applies the merged/hidden/archived visibility rule),
 * then upcoming events within NEARBY_MILES of its coordinates
 * (useNearbyListings, same rule). Deduped by id, soonest first.
 *
 * Renders nothing when neither source has a row: an attraction with no
 * coordinates and no named events gets no empty section. The /music/venues
 * link appears only when the attraction matches a venue page, from the
 * two-column useVenueLinks() rather than the full venues table.
 */

interface AttractionEventsRailProps {
  name: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** Rows shown at most. */
  limit?: number;
}

interface RailEvent {
  id: string;
  title: string | null;
  venue: string | null;
  date: string | null;
  event_start_utc: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface RailRow {
  event: RailEvent;
  /** "At this venue" or a distance. */
  where: string;
  sortKey: number;
}

function startMs(event: RailEvent): number {
  const t = Date.parse(event.event_start_utc || event.date || "");
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

export function AttractionEventsRail({ name, latitude, longitude, limit = 6 }: AttractionEventsRailProps) {
  const { data: atVenue } = useVenueEvents(name);
  const { data: near } = useNearbyListings("events", latitude, longitude, { limit: 12 });
  const { data: venueLinks } = useVenueLinks();

  const venueRows = (atVenue ?? []) as unknown as RailEvent[];
  const nearRows = (near ?? []) as unknown as RailEvent[];

  const seen = new Set<string>();
  const rows: RailRow[] = [];
  for (const event of venueRows) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    rows.push({ event, where: "At this venue", sortKey: startMs(event) });
  }
  const distances = nearby({ latitude, longitude }, nearRows, { limit: nearRows.length });
  for (const { item, miles } of distances) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    rows.push({ event: item, where: `${formatMiles(miles)} away`, sortKey: startMs(item) });
  }
  rows.sort((a, b) => a.sortKey - b.sortKey);
  const shown = rows.slice(0, limit);

  const venuePage = matchVenue(name, venueLinks ?? []);

  if (shown.length === 0 && !venuePage) return null;

  return (
    <section className="mb-8" aria-labelledby="attraction-events-heading">
      <h2 id="attraction-events-heading" className="text-2xl font-bold text-foreground mb-1">
        Happening here and nearby
      </h2>
      {shown.length > 0 && (
        <p className="text-muted-foreground mb-4">Upcoming events at {name} and within two miles, soonest first.</p>
      )}
      {shown.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {shown.map(({ event, where }) => (
            <li key={event.id}>
              <Link
                to={eventHref(event)}
                className="flex min-h-11 flex-col gap-0.5 px-4 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span className="text-sm font-medium text-foreground/80 sm:w-44 sm:shrink-0 tabular-nums">
                  {formatEventDateShort(event)}
                </span>
                <span className="font-semibold text-foreground line-clamp-1">{event.title}</span>
                <span className="text-sm text-muted-foreground sm:ml-auto sm:shrink-0">
                  {event.venue && where !== "At this venue" ? `${event.venue}, ${where}` : where}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {venuePage && (
        <p className="mt-4">
          <Link to={`/music/venues/${venuePage.slug}`} className="font-semibold text-primary hover:underline">
            Everything scheduled at {venuePage.name}
          </Link>
        </p>
      )}
    </section>
  );
}
