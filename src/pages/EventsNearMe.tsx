import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Navigation, DollarSign, List, Map as MapIcon, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-skeleton';
import { SpriteIcon } from '@/components/ui/SpriteIcon';
import { ErrorState } from '@/components/ui/error-state';
import { OptimizedImage } from '@/components/OptimizedImage';
import type { MapLocation } from '@/components/InteractiveMap';
import { useEventsNearby, useGeolocation, NEARBY_EVENTS_LIMIT } from '@/hooks/useProximitySearch';
import { createEventSlugWithCentralTime, formatEventDateShort } from '@/lib/timezone';
import { EVENT_CATEGORIES } from '@/lib/eventCategories';
import { formatCount } from '@/lib/pluralize';
import { storage } from '@/lib/safeStorage';
import {
  DEFAULT_NEAR_ME_ORIGIN,
  DEFAULT_NEAR_ME_WINDOW,
  NEAR_ME_ORIGINS,
  NEAR_ME_ORIGIN_STORAGE_KEY,
  NEAR_ME_WINDOWS,
  findNearMeOrigin,
  formatNearMeDistance,
  nearMeWindowBounds,
  parseNearMeWindow,
  type NearMeWindow,
} from '@/lib/nearMeOrigins';

// Lazy load map component
const EventsMap = lazy(() => import('@/components/InteractiveMap').then(mod => ({ default: mod.InteractiveMap })));

/** Select value for "measure from where I am". Not an origin slug. */
const CURRENT_LOCATION = 'current';

const DEFAULT_RADIUS = 25;

function readStoredOrigin(): string {
  const stored = storage.get<string>(NEAR_ME_ORIGIN_STORAGE_KEY);
  return findNearMeOrigin(stored)?.slug ?? DEFAULT_NEAR_ME_ORIGIN;
}

export default function EventsNearMe() {
  const [searchParams, setSearchParams] = useSearchParams();
  const when = parseNearMeWindow(searchParams.get('when'));

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  // The slider shows radiusDraft while dragging; the query only sees
  // radiusMiles, which changes on release (onValueCommit). Firing the RPC per
  // tick sent up to 50 requests per drag and raced their answers.
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS);
  const [radiusDraft, setRadiusDraft] = useState(DEFAULT_RADIUS);
  const [category, setCategory] = useState('all');
  const [originSlug, setOriginSlug] = useState<string>(readStoredOrigin);
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);

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

  // Recomputed when `when` changes, not per render, so the query key is stable.
  const timeWindow = useMemo(() => nearMeWindowBounds(when), [when]);

  const {
    items: events,
    limitHit,
    isLoading,
    isFetching,
    isFetched,
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

  const setWhen = (next: NearMeWindow) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next === DEFAULT_NEAR_ME_WINDOW) params.delete('when');
        else params.set('when', next);
        return params;
      },
      { replace: true }
    );
  };

  const handleOriginChange = (value: string) => {
    if (value === CURRENT_LOCATION) {
      if (location) setUseCurrentLocation(true);
      else requestLocation();
      return;
    }
    setUseCurrentLocation(false);
    setOriginSlug(value);
    storage.set(NEAR_ME_ORIGIN_STORAGE_KEY, value);
  };

  const setRadius = (miles: number) => {
    setRadiusDraft(miles);
    setRadiusMiles(miles);
  };

  const eventHref = (event: (typeof events)[number]) =>
    `/events/${createEventSlugWithCentralTime(event.title, event)}`;

  // Pins and cards share one href builder, so a popup can never point at a
  // different URL than the card for the same event (a bare id 404s).
  const mapLocations: MapLocation[] = events
    .filter((event) => event.latitude != null && event.longitude != null)
    .map((event) => ({
      id: event.id,
      name: event.title,
      latitude: event.latitude,
      longitude: event.longitude,
      category: event.category || 'General',
      image_url: event.image_url || undefined,
      // The RPC returns enhanced_description only; there is no `description` column.
      description: event.enhanced_description || undefined,
      distance_miles: event.distance_miles,
      price: event.price || undefined,
      slug: createEventSlugWithCentralTime(event.title, event),
    }));

  const whenLabel = NEAR_ME_WINDOWS.find((w) => w.value === when)?.label ?? '';
  const placeText = fromCurrent ? 'your location' : origin.label;
  const showEmpty = isFetched && !isFetching && !error && events.length === 0;

  return (
    <>
      <SEOHead
        title="Events Near Me | Des Moines Insider"
        description="Find events happening near your location in Des Moines. Discover concerts, festivals, food events, and more within your preferred distance."
        keywords={['events near me', 'nearby events', 'Des Moines events', 'local events', 'events by distance']}
      />
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">Events Near Me</h1>
            <p className="text-lg text-muted-foreground max-w-prose">
              What's on close by, from where you are or from a part of town you pick.
            </p>
          </div>

          {/* Starting point */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SpriteIcon name="map-pin" className="h-5 w-5" />
                Starting point
              </CardTitle>
              <CardDescription>
                {fromCurrent ? 'Near your current location' : `Near ${origin.label}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="space-y-2 sm:w-64">
                  <label htmlFor="near-me-origin" className="text-sm font-medium">
                    Measure distance from
                  </label>
                  <Select
                    value={fromCurrent ? CURRENT_LOCATION : origin.slug}
                    onValueChange={handleOriginChange}
                  >
                    <SelectTrigger id="near-me-origin">
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
                  className="w-full sm:w-auto min-h-11"
                >
                  {locationLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Navigation className="h-4 w-4 mr-2" />
                  )}
                  Use my current location
                </Button>
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
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium mb-2">When</legend>
                <div className="flex flex-wrap gap-2">
                  {NEAR_ME_WINDOWS.map((w) => (
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
                  onValueCommit={(value) => setRadiusMiles(value[0])}
                  min={1}
                  max={50}
                  step={1}
                  className="relative flex w-full touch-none select-none items-center py-3"
                >
                  <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
                    <SliderPrimitive.Range className="absolute h-full bg-primary" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb
                    aria-label="Search radius"
                    aria-valuetext={formatCount(radiusDraft, 'mile')}
                    className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </SliderPrimitive.Root>
                <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
                  <span>1 mi</span>
                  <span>50 mi</span>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="near-me-category" className="text-sm font-medium">
                  Category
                </label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="near-me-category">
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

              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                  className="flex-1 min-h-11"
                >
                  <List className="h-4 w-4 mr-2" />
                  List
                </Button>
                <Button
                  variant={viewMode === 'map' ? 'default' : 'outline'}
                  aria-pressed={viewMode === 'map'}
                  onClick={() => setViewMode('map')}
                  className="flex-1 min-h-11"
                >
                  <MapIcon className="h-4 w-4 mr-2" />
                  Map
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="mb-4">
            <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
              {!isFetched || (isFetching && events.length === 0)
                ? 'Searching...'
                : `${formatCount(events.length, 'event')} within ${formatCount(radiusMiles, 'mile')} of ${placeText}, ${whenLabel.toLowerCase()}.`}
              {isFetched && limitHit && (
                <>
                  {' '}
                  The search checks the first {NEARBY_EVENTS_LIMIT} events in this radius; a smaller
                  radius makes sure nothing closer is left out.
                </>
              )}
            </p>
          </div>

          {isLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {error && <ErrorState error={error} onRetry={() => void refetch()} />}

          {!isLoading && !error && viewMode === 'list' && events.length > 0 && (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              aria-busy={isFetching}
            >
              {events.map((event, index) => {
                const distance = formatNearMeDistance(event.distance_miles, originLabel);
                return (
                  <Card key={event.id} className="hover:shadow-lg transition-shadow">
                    <Link to={eventHref(event)}>
                      {event.image_url && (
                        <div className="overflow-hidden rounded-t-lg">
                          <OptimizedImage
                            src={event.image_url}
                            alt={event.title}
                            className="object-cover"
                            // h-48 was on the img, and the wrapper div above it
                            // sets no height - so the height moves ONTO the
                            // component's own container or the box collapses.
                            containerClassName="w-full h-48"
                            // The first row of a three-column grid. Chrome does not start a lazy
                            // image's fetch until layout has run, so the LCP candidate on a listing
                            // page must not be lazy (WEB-SEO-032).
                            priority={index < 3}
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                          />
                        </div>
                      )}
                      <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                          <CardTitle className="text-lg line-clamp-2">{event.title}</CardTitle>
                          {event.is_featured && (
                            <Badge variant="secondary" className="ml-2">Featured</Badge>
                          )}
                        </div>
                        {event.category && (
                          <Badge variant="outline" className="w-fit">
                            {event.category}
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                            <span className="flex items-center gap-2">
                              <SpriteIcon name="calendar" className="h-4 w-4" />
                              {formatEventDateShort(event)}
                            </span>
                            {distance && (
                              <span className="flex items-center gap-2">
                                <SpriteIcon name="map-pin" className="h-4 w-4" />
                                {distance}
                              </span>
                            )}
                          </div>
                          {event.venue && (
                            <p className="text-muted-foreground line-clamp-1">{event.venue}</p>
                          )}
                          {event.price && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <DollarSign className="h-4 w-4" />
                              {event.price}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                );
              })}
            </div>
          )}

          {!isLoading && !error && viewMode === 'map' && (
            <Suspense fallback={<LoadingSpinner />}>
              <EventsMap
                locations={mapLocations}
                showUserLocation={fromCurrent}
                userLocation={searchCenter}
                showRadius={true}
                radiusMiles={radiusMiles}
                linkPrefix="/events"
                colorByCategory={true}
                height="600px"
              />
            </Suspense>
          )}

          {showEmpty && (
            <Card>
              <CardContent className="py-12 text-center">
                <SpriteIcon name="map-pin" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold mb-2">No events found</h2>
                <p className="text-muted-foreground mb-4">
                  Nothing within {formatCount(radiusMiles, 'mile')} of {placeText} for{' '}
                  {whenLabel.toLowerCase()}.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {radiusMiles < 50 && (
                    <Button onClick={() => setRadius(50)} className="min-h-11">
                      Expand to 50 miles
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
              </CardContent>
            </Card>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
