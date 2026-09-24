import { useEffect, useMemo, useRef } from 'react';
import { LocateFixed, Loader2 } from 'lucide-react';
import { InteractiveMap, type MapLegendItem, type MapLocation, type UnmappedLocation } from './InteractiveMap';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-skeleton';
import { useGeolocation } from '@/hooks/useProximitySearch';
import { useMinuteClock } from '@/hooks/useMinuteClock';
import { useAnnounce } from '@/hooks/use-announce';
import {
  MAP_PIN_STATUS_COLORS,
  MAP_PIN_STATUS_LEGEND,
  MAP_PIN_STATUS_ORDER,
  mapPinState,
  splitByCoordinates,
  useRestaurantMapPoints,
  type MapPinStatus,
  type RestaurantMapFilters,
  type RestaurantMapPoint,
} from '@/hooks/useRestaurantMapPoints';
import { haversineDistance } from '@/lib/geo';

/** A page row, accepted only as a fallback when the map query fails. */
interface PageRestaurant {
  id: string;
  name: string;
  slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  cuisine?: string | null;
  opening?: string | null;
  price_range?: string | null;
  rating?: number | null;
  image_url?: string | null;
  phone?: string | null;
  status?: string | null;
}

interface RestaurantsMapProps {
  /** The hub's current filters. The map fetches every matching row itself. */
  filters?: RestaurantMapFilters;
  /**
   * The list's current page. Used only if the map query fails, so the view
   * still shows something, and labelled as one page when it does.
   */
  restaurants?: PageRestaurant[];
}

function toPoint(r: PageRestaurant): RestaurantMapPoint {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    cuisine: r.cuisine ?? null,
    opening: r.opening ?? null,
    price_range: r.price_range ?? null,
    rating: r.rating ?? null,
    image_url: r.image_url ?? null,
    phone: r.phone ?? null,
    status: r.status ?? null,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Restaurants map (eat-drink plan WP4): every mapped restaurant for the
 * current filters, coloured by open status in Des Moines time, with the rows
 * it cannot place listed rather than dropped.
 */
export function RestaurantsMap({ filters = {}, restaurants = [] }: RestaurantsMapProps) {
  const { location, error: geoError, isLoading: geoLoading, requestLocation } = useGeolocation();
  const { announce, announcement, regionProps } = useAnnounce();
  const now = useMinuteClock();
  const { points, totalCount, isLoading, error } = useRestaurantMapPoints(filters);

  // Only a failed map query falls back to the page rows.
  const usingPageFallback = !!error && restaurants.length > 0;
  const source = useMemo(
    () => (usingPageFallback ? restaurants.map(toPoint) : points),
    [usingPageFallback, restaurants, points]
  );
  const { mapped, unmapped } = useMemo(() => splitByCoordinates(source), [source]);

  const userLocation = useMemo(
    () => (location ? { latitude: location.latitude, longitude: location.longitude } : undefined),
    [location]
  );

  // Memoised so a re-render does not hand the map a new array (item 4). It
  // changes once a minute, when the clock can move an open status.
  const pins = useMemo(() => mapped.map((r) => ({ r, pin: mapPinState(r, now) })), [mapped, now]);

  const mapLocations: MapLocation[] = useMemo(() => {
    const list: MapLocation[] = pins.map(({ r, pin }) => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      slug: r.slug ?? undefined,
      category: r.cuisine ?? undefined,
      rating: r.rating ?? undefined,
      image_url: r.image_url ?? undefined,
      price: r.price_range ?? undefined,
      phone: r.phone ?? undefined,
      markerColor: MAP_PIN_STATUS_COLORS[pin.status],
      statusLabel: pin.label,
      distance_miles: userLocation
        ? haversineDistance(userLocation, { latitude: r.latitude, longitude: r.longitude })
        : undefined,
      type: 'restaurant',
    }));
    if (userLocation) {
      list.sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0));
    }
    return list;
  }, [pins, userLocation]);

  const legend: MapLegendItem[] = useMemo(() => {
    const counts: Record<MapPinStatus, number> = { open: 0, 'closing-soon': 0, closed: 0, unknown: 0 };
    for (const { pin } of pins) counts[pin.status] += 1;
    return MAP_PIN_STATUS_ORDER.map((status) => ({
      label: `${MAP_PIN_STATUS_LEGEND[status]} (${counts[status]})`,
      color: MAP_PIN_STATUS_COLORS[status],
    }));
  }, [pins]);

  const unmappedLocations: UnmappedLocation[] = useMemo(
    () =>
      unmapped.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug ?? undefined,
        statusLabel: mapPinState(r, now).label,
      })),
    [unmapped, now]
  );

  const total = usingPageFallback ? source.length : Math.max(totalCount, source.length);
  const countLabel = `${mapLocations.length} of ${total} mapped`;

  // Near me reports its outcome in a polite live region (item 6).
  const askedRef = useRef(false);
  useEffect(() => {
    if (!askedRef.current) return;
    if (geoError) announce(geoError);
    else if (location) {
      const nearest = mapLocations[0];
      announce(
        nearest?.distance_miles !== undefined
          ? `Showing restaurants near you. Nearest: ${nearest.name}, ${nearest.distance_miles.toFixed(1)} miles.`
          : 'Showing restaurants near you.'
      );
    }
    // Announce once per outcome, not on every minute tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoError, location, announce]);

  const handleNearMe = () => {
    askedRef.current = true;
    requestLocation();
  };

  if (isLoading && !usingPageFallback) {
    return <LoadingSpinner label="Loading map..." />;
  }

  const nearMeButton = (
    <Button
      type="button"
      variant="outline"
      className="h-11 text-sm"
      onClick={handleNearMe}
      disabled={geoLoading}
      aria-pressed={!!location}
    >
      {geoLoading ? (
        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" aria-hidden="true" />
      ) : (
        <LocateFixed className="h-4 w-4 mr-1.5" aria-hidden="true" />
      )}
      {geoLoading ? 'Finding you...' : 'Near me'}
    </Button>
  );

  return (
    <div>
      <div {...regionProps}>{announcement}</div>
      {geoError && (
        <p className="mb-2 text-sm text-destructive">{geoError}</p>
      )}
      {usingPageFallback && (
        <p className="mb-2 text-sm text-muted-foreground">
          The full map could not load, so this shows the current page of results only.
        </p>
      )}
      {!usingPageFallback && error && (
        <p className="mb-2 text-sm text-destructive">The map could not load. Try the list view.</p>
      )}
      {unmapped.length > 0 && (
        <p className="mb-2 text-sm text-muted-foreground">
          {plural(unmapped.length, 'restaurant is', 'restaurants are')} not on the map. Open the list view to see{' '}
          {unmapped.length === 1 ? 'it' : 'them'} under "Location not mapped".
        </p>
      )}
      <InteractiveMap
        locations={mapLocations}
        showUserLocation={!!userLocation}
        userLocation={userLocation}
        focusUserLocation={!!userLocation}
        linkPrefix="/restaurants"
        legend={legend}
        legendTitle="Right now"
        countLabel={countLabel}
        mapLabel={`Map of ${plural(mapLocations.length, 'restaurant', 'restaurants')}, coloured by whether each is open now`}
        unmappedLocations={unmappedLocations}
        toolbar={nearMeButton}
        height="600px"
        zoom={12}
      />
    </div>
  );
}

export default RestaurantsMap;
