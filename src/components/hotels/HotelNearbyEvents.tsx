import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventsInRange, ongoingLabel } from "@/hooks/useEventsInRange";
import { isDateOnly, parseDateOnly, tripWindowProblem } from "@/lib/dateOnly";
import { eventHref } from "@/lib/dashboardItems";
import { haversineDistance } from "@/lib/geo";
import { isPrerender } from "@/lib/isPrerender";
import { addCentralDays, centralDateOf, CENTRAL_TIMEZONE, formatEventTimeOnly } from "@/lib/timezone";
import { formatMiles } from "@/lib/venuePages";
import type { LandingEvent } from "@/hooks/useEventLanding";

/** "Within a mile" is walking distance downtown; further is a drive. */
const HOTEL_NEARBY_EVENT_MILES = 1;
const MAX_SHOWN = 5;
/** Today plus six more days when the URL carries no trip window. */
const DEFAULT_DAYS = 7;

interface HotelNearbyEventsProps {
  hotelName: string;
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
}

interface NearbyEvent {
  event: LandingEvent;
  miles: number;
  /** "Sat, Oct 10" or "Ongoing, through Oct 11". */
  dayLabel: string;
  timeLabel: string | null;
}

function finite(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The trip window from ?from=&to= when it is a valid future window, else the next seven days. */
function useHotelWindow(): { from: string; to: string; fromUrl: boolean } {
  const [params] = useSearchParams();
  const from = params.get("from");
  const to = params.get("to");
  const today = centralDateOf();
  if (isDateOnly(from) && isDateOnly(to) && !tripWindowProblem(from, to) && to >= today) {
    return { from, to, fromUrl: true };
  }
  return { from: today, to: addCentralDays(today, DEFAULT_DAYS - 1), fromUrl: false };
}

function windowLabel(from: string, to: string): string {
  const a = format(parseDateOnly(from), "MMM d");
  return from === to ? a : `${a} to ${format(parseDateOnly(to), "MMM d")}`;
}

/**
 * What's on near this hotel (plan-stay-pass2 WP2 item 7, bet 4).
 *
 * Events within a mile of the hotel over the visitor's trip window, or the
 * next seven days, nearest first, with a hand-off to the trip planner for the
 * same dates. Booking sites list static attractions next to a hotel; this
 * lists Saturday's shows.
 *
 * Renders nothing for a hotel without coordinates, which is most of them
 * until D9 backfills hotels.latitude. It also renders nothing in the
 * prerender capture, where it would bake the build week's events into the
 * static HTML. Distances are straight lines and say so.
 */
export function HotelNearbyEvents({ hotelName, latitude, longitude }: HotelNearbyEventsProps) {
  const lat = finite(latitude);
  const lng = finite(longitude);
  const hasCoordinates = lat !== null && lng !== null;
  const prerender = isPrerender();
  const { from, to, fromUrl } = useHotelWindow();

  // The hook is disabled with null dates, so a hotel without coordinates
  // (or the prerender) makes no request.
  const active = hasCoordinates && !prerender;
  const { data, isLoading, isError, refetch, window, truncatedAfter } = useEventsInRange(
    active ? from : null,
    active ? to : null,
  );

  const rows = useMemo<NearbyEvent[]>(() => {
    if (!active || !window || !data) return [];
    const origin = { latitude: lat as number, longitude: lng as number };
    const seen = new Set<string>();
    const out: NearbyEvent[] = [];
    for (const event of data) {
      if (!event?.id || seen.has(event.id)) continue;
      seen.add(event.id);
      const eLat = finite(event.latitude);
      const eLng = finite(event.longitude);
      if (eLat === null || eLng === null || !event.date) continue;
      const miles = haversineDistance(origin, { latitude: eLat, longitude: eLng });
      if (miles > HOTEL_NEARBY_EVENT_MILES) continue;
      const startDay = centralDateOf(event.date);
      const shownDay = startDay < window.startDay ? window.startDay : startDay;
      const ongoing = ongoingLabel(event, shownDay);
      out.push({
        event,
        miles,
        dayLabel: ongoing ?? formatInTimeZone(event.date, CENTRAL_TIMEZONE, "EEE, MMM d"),
        timeLabel: ongoing ? null : formatEventTimeOnly(event) ?? "Time TBA",
      });
    }
    return out
      .sort((a, b) => a.miles - b.miles || a.event.date.localeCompare(b.event.date))
      .slice(0, MAX_SHOWN);
  }, [active, window, data, lat, lng]);

  if (!active) return null;

  const planHref = `/trip-planner?from=${from}&to=${to}`;
  const range = windowLabel(from, to);

  return (
    <section aria-labelledby="hotel-nearby-events-heading" className="space-y-3">
      <div>
        <h2 id="hotel-nearby-events-heading" className="text-xl font-semibold">
          What&apos;s on near this hotel
        </h2>
        <p className="text-sm text-muted-foreground">
          Within {HOTEL_NEARBY_EVENT_MILES} mile of {hotelName} (straight line),{" "}
          {fromUrl ? "during your dates" : "over the next seven days"}: {range}.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground" role="status">
          <span>Events near this hotel didn&apos;t load.</span>
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing listed within a mile of this hotel for {range}.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border">
          {rows.map(({ event, miles, dayLabel, timeLabel }) => (
            <li key={event.id}>
              <Link
                to={eventHref(event)}
                className="flex min-h-11 flex-col gap-0.5 px-4 py-3 hover:bg-muted/50 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="font-medium">{event.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {dayLabel}
                  {timeLabel ? `, ${timeLabel}` : ""}
                  {", "}
                  {formatMiles(miles)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !isError && truncatedAfter && truncatedAfter < to && (
        <p className="text-xs text-muted-foreground">
          Checked events through {format(parseDateOnly(truncatedAfter), "EEE, MMM d")}; the planner shows the rest.
        </p>
      )}

      <Link
        to={planHref}
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Plan these dates
      </Link>
    </section>
  );
}
