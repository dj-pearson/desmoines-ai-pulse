import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Navigation, List, Map as MapIcon, Loader2, SlidersHorizontal } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { EventListJsonLd } from '@/components/schema/EventListJsonLd';
import { SocialEventCard } from '@/components/SocialEventCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { LoadingSpinner } from '@/components/ui/loading-skeleton';
import { ErrorState } from '@/components/ui/error-state';
import type { MapEvent } from '@/hooks/useEventsMapData';
import { useBatchEventSocial } from '@/hooks/useBatchEventSocial';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import {
  useEventsNearby,
  useGeolocation,
  NEARBY_EVENTS_LIMIT,
  NEARBY_WINDOW_CAP,
  type NearbyEvent,
} from '@/hooks/useProximitySearch';
import { BRAND } from '@/lib/brandConfig';
import { EVENT_CATEGORIES } from '@/lib/eventCategories';
import { formatCount } from '@/lib/pluralize';
import { storage } from '@/lib/safeStorage';
import { formatInCentralTime } from '@/lib/timezone';
import {
  DEFAULT_NEAR_ME_ORIGIN,
  DEFAULT_NEAR_ME_RADIUS,
  DEFAULT_NEAR_ME_WINDOW,
  NEAR_ME_MAX_RADIUS,
  NEAR_ME_MIN_RADIUS,
  NEAR_ME_ORIGINS,
  NEAR_ME_ORIGIN_STORAGE_KEY,
  NEAR_ME_WINDOWS,
  findNearMeOrigin,
  findNearMeWindow,
  formatNearMeDistance,
  nearMeWindowBounds,
  parseNearMeRadius,
  parseNearMeWindow,
  type NearMeWindow,
} from '@/lib/nearMeOrigins';
import type { Event } from '@/lib/types';

/**
 * /events/near-me (events-pass2 WP5).
 *
 * The URL holds the state: `from` (an origin slug), `r` (miles), `category`
 * and `when`. The hub sends `when` and `category` here when a visitor denies
 * location (WP1 item 8). safeStorage remembers the last picked origin for a
 * visit with no `from`; it never holds coordinates.
 *
 * With a window the list is exact (useEventsNearby's windowed read); only
 * "Anytime" goes through the capped RPC. The map is the hub's EventsMap, so
 * pins group by venue and popups carry dates.
 */

// Leaflet is ~150KB; list visitors never download it.
const EventsMap = lazy(() => import('@/components/EventsMap'));

/** Select value for "measure from where I am". Not an origin slug. */
const CURRENT_LOCATION = 'current';

/** Cards per page of the list; "Show more" adds this many again. */
const PAGE_SIZE = 24;

const PAGE_URL = `${BRAND.baseUrl}/events/near-me`;

function readStoredOrigin(): string {
  const stored = storage.get<string>(NEAR_ME_ORIGIN_STORAGE_KEY);
  return findNearMeOrigin(stored)?.slug ?? DEFAULT_NEAR_ME_ORIGIN;
}

function parseCategory(value: string): string {
  return EVENT_CATEGORIES.includes(value) ? value : 'all';
}

/** "Sep 25" or "Sep 25 - Oct 1", Central; absolute, so a prerender stays true. */
function windowDates(window: { start: string; end: string } | null): string | null {
  if (!window) return null;
  const first = formatInCentralTime(window.start, 'MMM d');
  const last = formatInCentralTime(window.end, 'MMM d');
  return first === last ? first : `${first} - ${last}`;
}

function toMapEvent(event: NearbyEvent): MapEvent {
  return {
    id: event.id,
    title: event.title,
    date: typeof event.date === 'string' ? event.date : event.date.toISOString(),
    event_start_utc: event.event_start_utc ?? null,
    event_start_local: event.event_start_local ?? null,
    end_date: event.end_date ?? null,
    venue: event.venue ?? null,
    location: event.location ?? null,
    city: event.city ?? null,
    price: event.price ?? null,
    category: event.category ?? null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
  };
}

export default function EventsNearMe() {
  const { getStr, setParam } = useUrlFilters();

  // The stored origin is read once; the URL wins whenever it names one.
  const [storedOrigin] = useState<string>(readStoredOrigin);
  const originSlug = findNearMeOrigin(getStr('from', ''))?.slug ?? storedOrigin;
  const when = parseNearMeWindow(getStr('when', ''));
  const radiusMiles = parseNearMeRadius(getStr('r', ''));
  const category = parseCategory(getStr('category', 'all'));

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The slider shows radiusDraft while dragging; the query only sees the
  // committed `r`, written on release (onValueCommit). Firing the query per
  // tick sent up to 50 requests per drag and raced their answers.
  const [radiusDraft, setRadiusDraft] = useState(radiusMiles);
  useEffect(() => setRadiusDraft(radiusMiles), [radiusMiles]);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();

  // A fix that arrives after the tap becomes the origin. The coordinates stay
  // in memory; only a picked place name is ever stored.
  useEffect(() => {
    if (location) setUseCurrentLocation(true);
  }, [location]);

  const origin = findNearMeOrigin(originSlug) ?? NEAR_ME_ORIGINS[0];
  const fromCurrent = useCurrentLocation && !!location;
  const center = fromCurrent
    ? { latitude: location.latitude, longitude: location.longitude }
    : { latitude: origin.latitude, longitude: origin.longitude };
  const originLabel = fromCurrent ? undefined : origin.label;
  const placeText = fromCurrent ? 'your location' : origin.label;

  // Recomputed when `when` changes, not per render, so the query key is stable.
  const timeWindow = useMemo(() => nearMeWindowBounds(when), [when]);

  const {
    items: events,
    limitHit,
    source,
    isLoading,
    isFetching,
    isFetched,
    isSuccess,
    error,
    refetch,
    searchCenter,
  } = useEventsNearby({
    latitude: center.latitude,
    longitude: center.longitude,
    radiusMiles,
    category: category !== 'all' ? category : undefined,
    window: timeWindow,
  });

  // A new question starts from the top of its answer.
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [originSlug, fromCurrent, when, radiusMiles, category]);

  const visibleEvents = events.slice(0, shown);
  const socialIds = useMemo(() => visibleEvents.map((e) => e.id), [visibleEvents]);
  const { data: socialData, isPending: socialPending } = useBatchEventSocial(socialIds);
  const mapEvents = useMemo(() => events.map(toMapEvent), [events]);
  const distanceById = useMemo(
    () => new Map(events.map((e) => [e.id, e.distance_miles])),
    [events]
  );

  const setWhen = (next: NearMeWindow) =>
    setParam('when', next, { def: DEFAULT_NEAR_ME_WINDOW, replace: true });
  const setRadius = (miles: number) => {
    setRadiusDraft(miles);
    setParam('r', miles, { def: DEFAULT_NEAR_ME_RADIUS, replace: true });
  };
  const setCategory = (value: string) => setParam('category', value, { def: 'all', replace: true });

  const handleOriginChange = (value: string) => {
    if (value === CURRENT_LOCATION) {
      if (location) setUseCurrentLocation(true);
      else requestLocation();
      return;
    }
    setUseCurrentLocation(false);
    storage.set(NEAR_ME_ORIGIN_STORAGE_KEY, value);
    // Always written, even for Downtown: an empty `from` falls back to the
    // stored pick, which is this one only from the next visit on.
    setParam('from', value, { replace: true });
  };

  const whenOption = findNearMeWindow(when);
  const whenLabel = whenOption?.label ?? '';
  const dates = windowDates(timeWindow);
  const chips = NEAR_ME_WINDOWS.some((w) => w.value === when)
    ? NEAR_ME_WINDOWS
    : [...NEAR_ME_WINDOWS, ...(whenOption ? [whenOption] : [])];
  const whenPhrase = dates ? `${whenLabel.toLowerCase()} (${dates})` : 'any date';
  const showEmpty = isFetched && !isFetching && !error && events.length === 0;
  const filtersActive = radiusMiles !== DEFAULT_NEAR_ME_RADIUS || category !== 'all';

  let countLine = 'Searching...';
  if (isSuccess && !(isFetching && events.length === 0)) {
    const where = `within ${formatCount(radiusMiles, 'mile')} of ${placeText}`;
    if (!limitHit) {
      countLine = `${formatCount(events.length, 'event')} ${where}, ${whenPhrase}.`;
    } else if (source === 'rpc') {
      countLine =
        `At least ${formatCount(events.length, 'event')} ${where}. ` +
        `An any-date search stops at ${NEARBY_EVENTS_LIMIT} events and puts featured ones first, ` +
        'so pick a date range to see every event in the radius.';
    } else {
      countLine =
        `At least ${formatCount(events.length, 'event')} ${where}, ${whenPhrase}. ` +
        `The search reads the first ${NEARBY_WINDOW_CAP.toLocaleString()} by date; ` +
        'a smaller radius or a shorter window shows every one.';
    }
  }

  const distanceLabel = (event: MapEvent) =>
    formatNearMeDistance(distanceById.get(event.id), originLabel) || null;

  return (
    <>
      <SEOHead
        title="Events Near Me in Des Moines | Des Moines Insider"
        description="Des Moines events nearest first, measured from where you are or from Downtown, East Village, Ankeny, Waukee and other parts of the metro."
        keywords={['events near me', 'nearby events', 'Des Moines events', 'local events', 'events by distance']}
        canonicalUrl={PAGE_URL}
      />
      <EventListJsonLd
        events={visibleEvents as unknown as Event[]}
        listName={`Events near ${placeText}, Des Moines`}
        listDescription={`Events within ${radiusMiles} miles of ${placeText}, nearest first.`}
        listUrl={PAGE_URL}
        maxItems={PAGE_SIZE}
      />
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 container mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">Events near me</h1>
            <p className="text-lg text-muted-foreground max-w-prose">
              What's on close by, nearest first, from where you are or from a part of town you pick.
            </p>
          </div>

          {/* One bar: where from, when, and the rest in a sheet. */}
          <section aria-label="Search controls" className="mb-6 space-y-4 rounded-xl border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="space-y-1.5 sm:w-60">
                <label htmlFor="near-me-origin" className="text-sm font-medium">
                  Measure distance from
                </label>
                <Select
                  value={fromCurrent ? CURRENT_LOCATION : origin.slug}
                  onValueChange={handleOriginChange}
                >
                  <SelectTrigger id="near-me-origin" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {location && (
                      <SelectItem value={CURRENT_LOCATION}>My current location</SelectItem>
                    )}
                    {NEAR_ME_ORIGINS.map((o) => (
                      <SelectItem key={o.slug} value={o.slug}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => (location ? setUseCurrentLocation(true) : requestLocation())}
                disabled={locationLoading || fromCurrent}
                variant="outline"
                className="min-h-11"
              >
                {locationLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                Use my current location
              </Button>
              <div className="flex gap-2 sm:ml-auto">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="min-h-11">
                      <SlidersHorizontal className="h-4 w-4 mr-2" />
                      Radius and category
                      {filtersActive && <span className="sr-only"> (changed)</span>}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle>Radius and category</SheetTitle>
                      <SheetDescription>
                        Measured from {placeText}. Changes apply as you make them.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-6 space-y-6 max-w-xl">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span id="near-me-radius-label" className="text-sm font-medium">
                            Search radius
                          </span>
                          <span className="text-sm text-muted-foreground" aria-hidden="true">
                            {radiusDraft} miles
                          </span>
                        </div>
                        <SliderPrimitive.Root
                          value={[radiusDraft]}
                          onValueChange={(value) => setRadiusDraft(value[0])}
                          onValueCommit={(value) => setRadius(value[0])}
                          min={NEAR_ME_MIN_RADIUS}
                          max={NEAR_ME_MAX_RADIUS}
                          step={1}
                          className="relative flex w-full touch-none select-none items-center py-3"
                        >
                          <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
                            <SliderPrimitive.Range className="absolute h-full bg-primary" />
                          </SliderPrimitive.Track>
                          <SliderPrimitive.Thumb
                            aria-label="Search radius"
                            aria-valuetext={formatCount(radiusDraft, 'mile')}
                            className="block h-6 w-6 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          />
                        </SliderPrimitive.Root>
                        <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
                          <span>{NEAR_ME_MIN_RADIUS} mi</span>
                          <span>{NEAR_ME_MAX_RADIUS} mi</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label htmlFor="near-me-category" className="text-sm font-medium">
                          Category
                        </label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger id="near-me-category" className="min-h-11">
                            <SelectValue placeholder="All categories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
                            {EVENT_CATEGORIES.map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <fieldset>
                <legend className="sr-only">When</legend>
                <div className="flex flex-wrap gap-2">
                  {chips.map((w) => (
                    <Button
                      key={w.value}
                      type="button"
                      size="sm"
                      variant={when === w.value ? 'default' : 'outline'}
                      aria-pressed={when === w.value}
                      onClick={() => setWhen(w.value)}
                      className="min-h-11"
                    >
                      {w.label}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <div className="flex gap-2" role="group" aria-label="View">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                  className="min-h-11"
                >
                  <List className="h-4 w-4 mr-2" />
                  List
                </Button>
                <Button
                  variant={viewMode === 'map' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'map'}
                  onClick={() => setViewMode('map')}
                  className="min-h-11"
                >
                  <MapIcon className="h-4 w-4 mr-2" />
                  Map
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Your location is rounded to about half a mile before it's used, and it isn't saved.
            </p>

            {locationError && !fromCurrent && (
              <p className="text-sm" role="alert">
                <span className="font-medium">{locationError}</span>{' '}
                <span className="text-muted-foreground">
                  Distances are measured from {origin.label}; pick another starting point above.
                </span>
              </p>
            )}
          </section>

          <h2 className="sr-only">Events by distance</h2>
          <p className="mb-4 text-sm text-foreground max-w-prose" role="status" aria-live="polite">
            {countLine}
          </p>

          {isLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {error && <ErrorState error={error} onRetry={() => void refetch()} />}

          {!isLoading && !error && viewMode === 'list' && events.length > 0 && (
            <>
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                aria-busy={isFetching}
              >
                {visibleEvents.map((event, index) => (
                  <SocialEventCard
                    key={event.id}
                    event={event as unknown as Event}
                    // The first row of the grid is the LCP candidate (WEB-SEO-032).
                    priority={index < 3}
                    distanceOriginLabel={originLabel}
                    socialData={socialData?.[event.id]}
                    socialDataPending={socialPending}
                    onViewDetails={() => {}}
                  />
                ))}
              </div>
              {events.length > shown && (
                <div className="mt-8 flex flex-col items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Showing the nearest {shown} of {events.length}.
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setShown((n) => n + PAGE_SIZE)}
                  >
                    Show more
                  </Button>
                </div>
              )}
            </>
          )}

          {!isLoading && !error && viewMode === 'map' && events.length > 0 && (
            <Suspense fallback={<LoadingSpinner />}>
              <EventsMap
                events={mapEvents}
                userLocation={searchCenter}
                originLabel={originLabel ?? 'You'}
                radiusMiles={radiusMiles}
                distanceLabel={distanceLabel}
                onShowList={() => setViewMode('list')}
              />
            </Suspense>
          )}

          {showEmpty && (
            <section className="rounded-xl border bg-card px-6 py-12 text-center">
              <h2 className="text-lg font-semibold mb-2">No events found</h2>
              <p className="text-muted-foreground mb-4 max-w-prose mx-auto">
                Nothing within {formatCount(radiusMiles, 'mile')} of {placeText} for {whenPhrase}.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {radiusMiles < NEAR_ME_MAX_RADIUS && (
                  <Button onClick={() => setRadius(NEAR_ME_MAX_RADIUS)} className="min-h-11">
                    Expand to {NEAR_ME_MAX_RADIUS} miles
                  </Button>
                )}
                {when !== 'anytime' && (
                  <Button variant="outline" onClick={() => setWhen('anytime')} className="min-h-11">
                    Show any date
                  </Button>
                )}
                <Button asChild variant="ghost" className="min-h-11">
                  <Link to="/events">Browse all events</Link>
                </Button>
              </div>
            </section>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
