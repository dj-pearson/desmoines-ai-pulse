import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { DayDinnerPairing } from "@/components/trip/DayDinnerPairing";
import { TripShortlist } from "@/components/trip/TripShortlist";
import { ongoingLabel, useEventsInRange, type EventDayGroup } from "@/hooks/useEventsInRange";
import { useHotelPins } from "@/hooks/useHotels";
import { useVenueMatchRows, type VenueMatchRow } from "@/hooks/useVenues";
import { useWindowDinnerRestaurants } from "@/hooks/useWindowDinnerRestaurants";
import { parseDateOnly, tripWindowProblem } from "@/lib/dateOnly";
import { isPrerender } from "@/lib/isPrerender";
import { centralDateOf, formatEventTimeOnly, type CentralDate } from "@/lib/timezone";
import { eventHref } from "@/lib/dashboardItems";
import { formatMiles, matchVenue, nearby } from "@/lib/venuePages";
import type { LandingEvent } from "@/hooks/useEventLanding";

/** How many hotels "Stay near the action" shows. */
const HOTELS_SHOWN = 5;
/** Past this a hotel isn't "near the action", it's another town. */
const HOTEL_MAX_MILES = 15;
/** The summary line counts hotels this close to the venue. */
const WALKABLE_MILES = 1;
/** Rows per day before "Show all N on Saturday". */
const DAY_ROW_CAP = 5;

interface DateWindowPlannerProps {
  /** Applied window, yyyy-MM-dd (Central calendar days), inclusive. */
  from: string;
  to: string;
  /** Called with a validated window when the visitor submits the form. */
  onApply: (from: string, to: string) => void;
  /** One line under the form, e.g. why a stale link's dates were replaced. */
  notice?: string | null;
  /** Starred event ids (the free trip calendar). */
  picks: readonly string[];
  onTogglePick: (id: string) => void;
  onClearPicks: () => void;
  /** Rendered under the results: the AI upgrade, when it's available. */
  children?: ReactNode;
}

/** "Fri, Oct 9 - Sun, Oct 11", or one day when from === to. */
function windowLabel(from: string, to: string): string {
  const a = format(parseDateOnly(from), "EEE, MMM d");
  return from === to ? a : `${a} - ${format(parseDateOnly(to), "EEE, MMM d")}`;
}

function venueCoords(v: VenueMatchRow): { latitude: number; longitude: number } | null {
  const lat = Number(v.latitude);
  const lng = Number(v.longitude);
  if (v.latitude == null || v.longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

interface AnchorVenue {
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Window events at this venue. */
  n: number;
}

/**
 * The venue hosting the most of the window's events that has a mapped
 * location. Hotels are ranked by distance to it: a real place people are
 * going, where an average of scattered venues can land in a cornfield.
 */
function anchorVenue(events: readonly LandingEvent[], venues: readonly VenueMatchRow[]): AnchorVenue | null {
  const counts = new Map<string, AnchorVenue>();
  for (const e of events) {
    const v = matchVenue(e.venue || e.location, venues);
    if (!v?.slug) continue;
    const at = venueCoords(v);
    if (!at) continue;
    const row = counts.get(v.slug) ?? { slug: v.slug, name: v.name, ...at, n: 0 };
    row.n += 1;
    counts.set(v.slug, row);
  }
  let best: AnchorVenue | null = null;
  for (const row of counts.values()) if (!best || row.n > best.n) best = row;
  return best;
}

/**
 * The free "I'm here Oct 9-11" planner: the real events on those dates by
 * Central day, a starred shortlist that exports to a calendar, dinner before
 * each day's evening show, the hotels closest to where most of it happens,
 * and a way to get around. No login, no subscription.
 */
export function DateWindowPlanner({
  from,
  to,
  onApply,
  notice,
  picks,
  onTogglePick,
  onClearPicks,
  children,
}: DateWindowPlannerProps) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [touched, setTouched] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // The build-time prerender freezes HTML; this week's events in it would be
  // stale by the time anyone reads it (plan-stay-pass2 WP1 item 8).
  const prerender = isPrerender();

  // A back/forward navigation changes the applied window under the form.
  useEffect(() => {
    setDraftFrom(from);
    setDraftTo(to);
    setTouched(false);
  }, [from, to]);

  const today = centralDateOf();
  const problem = tripWindowProblem(draftFrom, draftTo, today);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem) return;
    onApply(draftFrom, draftTo);
    headingRef.current?.focus();
  };

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
        {notice && !(touched && problem) && (
          <p className="mt-3 text-sm text-muted-foreground" data-trip-window="notice">
            {notice}
          </p>
        )}
      </form>

      {!prerender && (
        <WindowResults
          from={from}
          to={to}
          headingRef={headingRef}
          picks={picks}
          onTogglePick={onTogglePick}
          onClearPicks={onClearPicks}
        />
      )}

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

interface WindowResultsProps {
  from: string;
  to: string;
  headingRef: RefObject<HTMLHeadingElement>;
  picks: readonly string[];
  onTogglePick: (id: string) => void;
  onClearPicks: () => void;
}

/** Everything that depends on the dates: mounted client-side only. */
function WindowResults({ from, to, headingRef, picks, onTogglePick, onClearPicks }: WindowResultsProps) {
  const { days, data: events = [], truncatedAfter, isLoading, isSuccess, error, refetch } = useEventsInRange(from, to);
  const { data: pins, isLoading: pinsLoading, error: pinsError } = useHotelPins();
  const { data: venues, isLoading: venuesLoading, error: venuesError } = useVenueMatchRows();
  // One "now" per window, so dinner picks don't reshuffle on every render.
  const now = useMemo(() => new Date(), [from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const { headliners, restaurants } = useWindowDinnerRestaurants(days, { eventsSettled: isSuccess, now });

  const headlinerByDay = useMemo(() => new Map(headliners.map((h) => [h.day, h.event])), [headliners]);

  const [expanded, setExpanded] = useState<ReadonlySet<CentralDate>>(() => new Set());
  useEffect(() => setExpanded(new Set()), [from, to]);

  const anchor = useMemo(() => (venues ? anchorVenue(events, venues) : null), [events, venues]);
  const nearestHotels = useMemo(
    () => (anchor ? nearby(anchor, pins ?? [], { maxMiles: HOTEL_MAX_MILES, limit: HOTELS_SHOWN }) : []),
    [anchor, pins],
  );
  const walkableHotels = useMemo(
    () => (anchor ? nearby(anchor, pins ?? [], { maxMiles: WALKABLE_MILES, limit: Number.POSITIVE_INFINITY }).length : 0),
    [anchor, pins],
  );

  const pickSet = useMemo(() => new Set(picks), [picks]);
  const label = windowLabel(from, to);
  const hotelsSettled = !pinsLoading && !venuesLoading && !pinsError && !venuesError;

  const toggleDay = (day: CentralDate) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });

  return (
    <>
      <section aria-labelledby="trip-events-heading" className="space-y-4">
        <div>
          <h2 id="trip-events-heading" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
            {label}
          </h2>
          {!isLoading && !error && (
            <p className="text-sm text-muted-foreground" data-trip-window="summary">
              {events.length === 0
                ? "No events listed on these dates yet."
                : `${events.length} event${events.length === 1 ? "" : "s"}.`}
              {truncatedAfter && ` Showing through ${format(parseDateOnly(truncatedAfter), "EEE, MMM d")}.`}{" "}
              {events.length > 0 && hotelsSettled && anchor && (
                <>
                  <a href="#trip-stay-heading" className="font-medium text-primary underline-offset-4 hover:underline">
                    {walkableHotels > 0
                      ? `${walkableHotels} hotel${walkableHotels === 1 ? "" : "s"} within ${WALKABLE_MILES} mi`
                      : "Where to stay"}
                  </a>
                  {". "}
                </>
              )}
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
              <DayGroup
                key={group.day}
                group={group}
                cut={!!truncatedAfter && group.day >= truncatedAfter}
                expanded={expanded.has(group.day)}
                onToggleExpanded={() => toggleDay(group.day)}
                pickSet={pickSet}
                onTogglePick={onTogglePick}
                dinner={
                  headlinerByDay.has(group.day) ? (
                    <DayDinnerPairing event={headlinerByDay.get(group.day)!} restaurants={restaurants} now={now} />
                  ) : null
                }
              />
            ))}
          </ol>
        )}
      </section>

      {!isLoading && !error && (
        <TripShortlist
          picks={picks}
          days={days}
          events={events}
          from={from}
          to={to}
          onRemove={onTogglePick}
          onClear={onClearPicks}
        />
      )}

      <section aria-labelledby="trip-stay-heading" className="space-y-3">
        <h2 id="trip-stay-heading" tabIndex={-1} className="text-xl font-semibold outline-none">
          Stay near the action
        </h2>
        {pinsLoading || isLoading || venuesLoading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        ) : error || venuesError ? (
          <p className="text-sm text-muted-foreground">
            {error
              ? "Hotels are ranked by distance to your events, which didn't load."
              : "Hotels are ranked by distance to your events' venues, which didn't load."}{" "}
            <Link to="/stay" className="font-medium text-primary hover:underline">
              Browse all hotels
            </Link>
          </p>
        ) : pinsError ? (
          <p className="text-sm text-muted-foreground">
            We couldn't load hotels just now.{" "}
            <Link to="/stay" className="font-medium text-primary hover:underline">
              Browse all hotels
            </Link>
          </p>
        ) : !anchor || nearestHotels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {events.length === 0
              ? "With nothing listed on these dates, there's no venue to rank hotels against."
              : !anchor
                ? "None of these events is at a venue we have on the map, so we can't rank hotels by distance."
                : `No hotels within ${HOTEL_MAX_MILES} miles of ${anchor.name}.`}{" "}
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
              Straight-line distance from {anchor.name}, where {anchor.n} of these events{" "}
              {anchor.n === 1 ? "is" : "are"}. Check the route before you walk it.
            </p>
            <Link
              to={`/stay?near=${encodeURIComponent(anchor.slug)}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
            >
              See all hotels near {anchor.name}
            </Link>
          </>
        )}
      </section>
    </>
  );
}

interface DayGroupProps {
  group: EventDayGroup;
  /** On or after the day the in-window query stopped: the list may be incomplete. */
  cut: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  pickSet: ReadonlySet<string>;
  onTogglePick: (id: string) => void;
  dinner: ReactNode;
}

function DayGroup({ group, cut, expanded, onToggleExpanded, pickSet, onTogglePick, dinner }: DayGroupProps) {
  const dayName = format(parseDateOnly(group.day), "EEEE");
  const listId = `trip-day-${group.day}`;
  const shown = expanded ? group.events : group.events.slice(0, DAY_ROW_CAP);
  const hidden = group.events.length - DAY_ROW_CAP;

  return (
    <li>
      <h3 className="text-base font-semibold">{format(parseDateOnly(group.day), "EEEE, MMMM d")}</h3>
      {group.events.length === 0 && !cut ? (
        <p className="mt-1 text-sm text-muted-foreground">Nothing listed yet.</p>
      ) : (
        group.events.length > 0 && (
          <ul id={listId} className="mt-2 divide-y rounded-xl border">
            {shown.map((event) => {
              const picked = pickSet.has(event.id);
              return (
                <li key={event.id} className="flex items-stretch">
                  <Link
                    to={eventHref(event)}
                    className="flex min-h-11 min-w-0 flex-1 flex-col gap-0.5 p-3 hover:bg-muted/50 sm:flex-row sm:items-baseline sm:gap-4"
                  >
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground sm:w-32">
                      {ongoingLabel(event, group.day) ?? formatEventTimeOnly(event) ?? "Time TBA"}
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
                  <button
                    type="button"
                    aria-pressed={picked}
                    aria-label={`Add ${event.title ?? "this event"} to your trip calendar`}
                    onClick={() => onTogglePick(event.id)}
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:text-primary"
                  >
                    <Star className={picked ? "h-5 w-5 fill-current" : "h-5 w-5"} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}
      {hidden > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 min-h-11"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={onToggleExpanded}
        >
          {expanded ? `Show fewer on ${dayName}` : `Show all ${group.events.length} on ${dayName}`}
        </Button>
      )}
      {cut && (
        <Link
          to={`/events?from=${group.day}`}
          className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline"
        >
          More on this day<span className="sr-only"> ({dayName})</span>
        </Link>
      )}
      {dinner}
    </li>
  );
}
