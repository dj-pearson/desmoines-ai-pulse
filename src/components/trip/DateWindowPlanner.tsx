import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { useEventsInRange, EVENTS_IN_RANGE_LIMIT } from "@/hooks/useEventsInRange";
import { useHotelPins } from "@/hooks/useHotels";
import { useVenues } from "@/hooks/useVenues";
import { parseDateOnly, tripWindowProblem } from "@/lib/dateOnly";
import { centralDateOf, formatEventTimeOnly } from "@/lib/timezone";
import { eventHref } from "@/lib/dashboardItems";
import { formatMiles, matchVenue, nearby } from "@/lib/venuePages";
import type { LandingEvent } from "@/hooks/useEventLanding";

/** How many hotels "Stay near the action" shows. */
const HOTELS_SHOWN = 5;

interface DateWindowPlannerProps {
  /** Applied window, yyyy-MM-dd (Central calendar days), inclusive. */
  from: string;
  to: string;
  /** Called with a validated window when the visitor submits the form. */
  onApply: (from: string, to: string) => void;
  /** Rendered under the results: the AI upgrade, or the line saying it's paused. */
  children?: ReactNode;
}

/** "Fri, Oct 9 - Sun, Oct 11", or one day when from === to. */
function windowLabel(from: string, to: string): string {
  const a = format(parseDateOnly(from), "EEE, MMM d");
  return from === to ? a : `${a} - ${format(parseDateOnly(to), "EEE, MMM d")}`;
}

function hasCoords(e: LandingEvent): boolean {
  const lat = Number(e.latitude);
  const lng = Number(e.longitude);
  return e.latitude != null && e.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

/**
 * The free "I'm here Oct 9-11" planner (plan-stay WP1 item 5, bet 1): the real
 * events on those dates grouped by Central day, the hotels closest to where
 * they are, and a way to get around. No login, no subscription.
 */
export function DateWindowPlanner({ from, to, onApply, children }: DateWindowPlannerProps) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [touched, setTouched] = useState(false);

  // A back/forward navigation changes the applied window under the form.
  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    setTouched(false);
  }, [from, to]);

  const problem = tripWindowProblem(draftFrom, draftTo);
  const today = centralDateOf();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    onApply(draftFrom, draftTo);
  };

  const { days, data: events = [], isLoading, error, refetch } = useEventsInRange(from, to);
  const { data: pins, isLoading: pinsLoading, error: pinsError } = useHotelPins();
  const { data: venues } = useVenues();

  // Centroid of the window's events that carry coordinates. A straight-line
  // average is fine at city scale, and the label says it's a straight line.
  const centroid = useMemo(() => {
    const located = events.filter(hasCoords);
    if (located.length === 0) return null;
    const lat = located.reduce((s, e) => s + Number(e.latitude), 0) / located.length;
    const lng = located.reduce((s, e) => s + Number(e.longitude), 0) / located.length;
    return { latitude: lat, longitude: lng };
  }, [events]);

  const nearestHotels = useMemo(
    () =>
      centroid
        ? nearby(centroid, pins ?? [], { maxMiles: Number.POSITIVE_INFINITY, limit: HOTELS_SHOWN })
        : [],
    [centroid, pins],
  );

  // /stay?near= takes a venue slug, so "See all" points at the venue that
  // hosts the most of this window's events, when one matches.
  const topVenue = useMemo(() => {
    if (!venues?.length) return null;
    const counts = new Map<string, { slug: string; name: string; n: number }>();
    for (const e of events) {
      const v = matchVenue(e.venue, venues);
      if (!v?.slug) continue;
      const row = counts.get(v.slug) ?? { slug: v.slug, name: v.name, n: 0 };
      row.n += 1;
      counts.set(v.slug, row);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n)[0] ?? null;
  }, [events, venues]);

  const label = windowLabel(from, to);

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-labelledby="trip-window-heading"
        className="rounded-xl border bg-card p-4 sm:p-6"
      >
        <h2 id="trip-window-heading" className="text-lg font-semibold">
          When are you in Des Moines?
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="trip-from">Arriving</Label>
            <Input
              id="trip-from"
              type="date"
              value={draftFrom}
              min={today}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="min-h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trip-to">Leaving</Label>
            <Input
              id="trip-to"
              type="date"
              value={draftTo}
              min={draftFrom || today}
              onChange={(e) => setDraftTo(e.target.value)}
              className="min-h-11"
            />
          </div>
          <Button type="submit" size="lg" className="col-span-2 min-h-11 sm:col-span-1">
            Show what's on
          </Button>
        </div>
        {touched && problem && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {problem}
          </p>
        )}
      </form>

      <section aria-labelledby="trip-events-heading" className="space-y-4">
        <div>
          <h2 id="trip-events-heading" className="text-2xl font-semibold">
            {label}
          </h2>
          {!isLoading && !error && (
            <p className="text-sm text-muted-foreground">
              {events.length === 0
                ? "No events listed on these dates yet."
                : events.length >= EVENTS_IN_RANGE_LIMIT
                  ? `The first ${EVENTS_IN_RANGE_LIMIT} events on these dates.`
                  : `${events.length} event${events.length === 1 ? "" : "s"} on these dates.`}{" "}
              <Link to="/events" className="font-medium text-primary underline-offset-4 hover:underline">
                Browse all events
              </Link>
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <ol className="space-y-6">
            {days.map((group) => (
              <li key={group.day}>
                <h3 className="text-base font-semibold">
                  {format(parseDateOnly(group.day), "EEEE, MMMM d")}
                </h3>
                {group.events.length === 0 ? (
                  <p className="mt-1 text-sm text-muted-foreground">Nothing listed yet.</p>
                ) : (
                  <ul className="mt-2 divide-y rounded-xl border">
                    {group.events.map((event) => (
                      <li key={event.id}>
                        <Link
                          to={eventHref(event)}
                          className="flex min-h-11 flex-col gap-0.5 p-3 hover:bg-muted/50 sm:flex-row sm:items-baseline sm:gap-4"
                        >
                          <span className="w-20 shrink-0 text-sm tabular-nums text-muted-foreground">
                            {formatEventTimeOnly(event) ?? "Time TBA"}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium">{event.title}</span>
                            {(event.venue || event.location) && (
                              <span className="block truncate text-sm text-muted-foreground">
                                {event.venue || event.location}
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="trip-stay-heading" className="space-y-3">
        <h2 id="trip-stay-heading" className="text-xl font-semibold">
          Stay near the action
        </h2>
        {pinsLoading || isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : pinsError ? (
          <p className="text-sm text-muted-foreground">
            We couldn't load hotels just now.{" "}
            <Link to="/stay" className="font-medium text-primary hover:underline">
              Browse all hotels
            </Link>
          </p>
        ) : nearestHotels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {centroid
              ? "No hotels with a known location yet."
              : "None of these events has a mapped location, so we can't rank hotels by distance."}{" "}
            <Link to="/stay" className="font-medium text-primary hover:underline">
              Browse all hotels
            </Link>
          </p>
        ) : (
          <>
            <ul className="divide-y rounded-xl border" aria-label="Hotels nearest these events">
              {nearestHotels.map(({ item, miles }) => (
                <li key={item.id}>
                  <Link
                    to={`/stay/${item.slug}`}
                    className="flex min-h-11 items-center justify-between gap-3 p-3 text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatMiles(miles)} (straight line)</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Distance from the middle of these events' venues, as the crow flies. Check the route before you walk it.
            </p>
            <Link
              to={topVenue ? `/stay?near=${encodeURIComponent(topVenue.slug)}` : "/stay"}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              {topVenue ? `See all hotels near ${topVenue.name}` : "See all hotels"}
            </Link>
          </>
        )}
      </section>

      <section aria-labelledby="trip-around-heading" className="rounded-xl border p-4 sm:p-6">
        <h2 id="trip-around-heading" className="text-xl font-semibold">
          Getting here and around
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          The airport, DART buses, parking, the skywalk and rideshare.
        </p>
        <Link
          to="/getting-around"
          className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          How to get around Des Moines
        </Link>
      </section>

      {children}
    </div>
  );
}
