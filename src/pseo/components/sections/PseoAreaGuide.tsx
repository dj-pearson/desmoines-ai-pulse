/**
 * SEO-040 - a neighbourhood area guide built from rows: restaurants, bars,
 * what's on this week, parking and a map.
 *
 * Rendered for a pSEO row whose sections include { type: 'area_guide' } and
 * whose location dimension has a polygon in src/lib/neighborhoodBoundaries.ts.
 * Anything else renders nothing, so the section is inert on a page it does not
 * fit. Data shaping is in ../../areaGuide.ts; the reads in ../../hooks/useAreaGuide.ts.
 */
import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { formatEventPart, formatEventTimeOnly } from '@/lib/timezone';
import { isPrerender } from '@/lib/isPrerender';
import type { PseoDimensionRef } from '../../schemas';
import { boundaryForLocation, type AreaEventRow, type AreaPlaceRow } from '../../areaGuide';
import { useAreaEvents, useAreaPlaces } from '../../hooks/useAreaGuide';
import { eventListingHref, restaurantListingHref } from '../../listingHrefs';
import type { AreaMapPoint } from './PseoAreaMap';

const PseoAreaMap = lazy(() => import('./PseoAreaMap'));

interface PseoAreaGuideProps {
  dimensions: PseoDimensionRef[];
}

const LIST_LINK = 'font-medium text-foreground underline underline-offset-4 hover:text-primary hover:no-underline';

export function PseoAreaGuide({ dimensions }: PseoAreaGuideProps) {
  const location = dimensions.find((d) => d.dimension === 'location');
  const boundary = boundaryForLocation(location?.slug);
  const places = useAreaPlaces(boundary);
  const events = useAreaEvents(boundary);

  const points = useMemo<AreaMapPoint[]>(() => {
    const out: AreaMapPoint[] = [];
    const addPlace = (r: AreaPlaceRow, kind: 'restaurant' | 'bar') => {
      if (r.latitude == null || r.longitude == null) return;
      out.push({ id: r.id, name: r.name, href: restaurantListingHref(r), kind, lat: Number(r.latitude), lng: Number(r.longitude) });
    };
    places.data?.restaurants.forEach((r) => addPlace(r, 'restaurant'));
    places.data?.bars.forEach((r) => addPlace(r, 'bar'));
    [...(events.data?.thisWeek ?? []), ...(events.data?.later ?? [])].forEach((e) => {
      if (e.latitude == null || e.longitude == null) return;
      out.push({ id: e.id, name: e.title, href: eventListingHref(e), kind: 'event', lat: Number(e.latitude), lng: Number(e.longitude) });
    });
    return out;
  }, [places.data, events.data]);

  if (!boundary) return null;
  const area = boundary.name;

  return (
    <div className="space-y-12">
      {/* Restaurants */}
      <section aria-labelledby="area-restaurants">
        <h2 id="area-restaurants" className="text-2xl font-bold mb-2">
          Restaurants in the {area}
        </h2>
        {places.error ? (
          <ErrorState error={places.error} compact title={`We couldn't load ${area} restaurants`} onRetry={() => void places.refetch()} />
        ) : places.isLoading ? (
          <ListSkeleton />
        ) : places.data && places.data.restaurants.length > 0 ? (
          <>
            <p className="text-muted-foreground mb-4 max-w-prose">
              The highest-rated places to eat we list inside the boundary, with the cuisine and price
              band each one has on file.
            </p>
            <PlaceList rows={places.data.restaurants} />
          </>
        ) : (
          <p className="text-muted-foreground max-w-prose">We don&apos;t list a restaurant inside this boundary yet.</p>
        )}
      </section>

      {/* Bars */}
      <section aria-labelledby="area-bars">
        <h2 id="area-bars" className="text-2xl font-bold mb-2">
          Bars
        </h2>
        {places.error ? (
          <ErrorState error={places.error} compact title={`We couldn't load ${area} bars`} onRetry={() => void places.refetch()} />
        ) : places.isLoading ? (
          <ListSkeleton />
        ) : places.data && places.data.bars.length > 0 ? (
          <>
            <p className="text-muted-foreground mb-4 max-w-prose">
              Places in the {area} our listings record as a bar, pub, taproom or bar &amp; grill.
            </p>
            <PlaceList rows={places.data.bars} />
          </>
        ) : (
          <p className="text-muted-foreground max-w-prose">We don&apos;t list a bar inside this boundary yet.</p>
        )}
        <p className="mt-4 text-sm">
          <Link to="/breweries" className={LIST_LINK}>
            Breweries across Des Moines
          </Link>
        </p>
      </section>

      {/* What's on */}
      <section aria-labelledby="area-events">
        <h2 id="area-events" className="text-2xl font-bold mb-2">
          What&apos;s on in the {area} this week
        </h2>
        {events.error ? (
          <ErrorState error={events.error} compact title={`We couldn't load ${area} events`} onRetry={() => void events.refetch()} />
        ) : events.isLoading ? (
          <ListSkeleton />
        ) : (
          <>
            {events.data && events.data.thisWeek.length > 0 ? (
              <EventList rows={events.data.thisWeek} />
            ) : (
              <p className="text-muted-foreground max-w-prose">
                Nothing on our calendar inside the {area} in the next seven days.
              </p>
            )}
            {events.data && events.data.later.length > 0 && (
              <>
                <h3 className="text-lg font-semibold mt-6 mb-2">Coming up after that</h3>
                <EventList rows={events.data.later} />
              </>
            )}
            <p className="mt-4 text-sm text-muted-foreground max-w-prose">
              Events count here when their venue&apos;s map point is inside the boundary.{' '}
              <Link to="/events/this-weekend" className={LIST_LINK}>
                Everything on in Des Moines this weekend
              </Link>
            </p>
          </>
        )}
      </section>

      {/* Parking. Same copy as /getting-around: no garage list or rates of our own. */}
      <section aria-labelledby="area-parking">
        <h2 id="area-parking" className="text-2xl font-bold mb-2">
          Parking
        </h2>
        <p className="text-muted-foreground max-w-prose">
          We don&apos;t keep a garage list or rates for the {area}. The city runs the public garages
          downtown, and the ParkDSM app shows where they are and lets you pay from your phone. Rates
          and street-parking hours change, so the app and the posted sign are the ones to trust.
        </p>
        <p className="mt-3 text-sm">
          <Link to="/getting-around" className={LIST_LINK}>
            Parking, the skywalk and DART fares
          </Link>
        </p>
      </section>

      {/* Map */}
      <section aria-labelledby="area-map">
        <h2 id="area-map" className="text-2xl font-bold mb-2">
          Map of the {area}
        </h2>
        <p className="text-muted-foreground mb-4 max-w-prose">
          The outline is the boundary the lists above use: {boundary.boundaryText}.
        </p>
        {isPrerender() ? (
          <div className="h-72 w-full rounded-xl bg-muted md:h-96" aria-hidden="true" />
        ) : (
          <Suspense fallback={<div className="h-72 w-full rounded-xl bg-muted animate-pulse motion-reduce:animate-none md:h-96" aria-hidden="true" />}>
            <PseoAreaMap polygon={boundary.polygon} points={points} label={`Map of the ${area}`} />
          </Suspense>
        )}
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground" aria-label="Map key">
          <li><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-amber-700" />Restaurants</li>
          <li><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-blue-700" />Bars</li>
          <li><span aria-hidden="true" className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-700" />Events</li>
        </ul>
      </section>
    </div>
  );
}

function PlaceList({ rows }: { rows: AreaPlaceRow[] }) {
  return (
    <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {rows.map((r) => {
        const detail = [r.cuisine, r.price_range].filter(Boolean).join(' · ');
        return (
          <li key={r.id} className="min-h-11">
            <Link to={restaurantListingHref(r)} className={LIST_LINK}>
              {r.name}
            </Link>
            {detail && <span className="block text-sm text-muted-foreground">{detail}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function EventList({ rows }: { rows: AreaEventRow[] }) {
  return (
    <ul className="space-y-3">
      {rows.map((e) => {
        const day = formatEventPart(e, 'EEE, MMM d');
        const time = formatEventTimeOnly(e);
        const when = [day, time].filter(Boolean).join(', ');
        return (
          <li key={e.id} className="min-h-11">
            <Link to={eventListingHref(e)} className={LIST_LINK}>
              {e.title}
            </Link>
            <span className="block text-sm text-muted-foreground">
              {[when, e.venue].filter(Boolean).join(' · ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
