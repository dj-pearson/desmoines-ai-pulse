import { useState, useMemo, lazy, Suspense, useRef } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Calendar, UtensilsCrossed, Star, Navigation, Search, ChevronUp, ChevronDown } from "lucide-react";
import { STALE_TIME } from '@/lib/queryConfig';
import type { MapBounds, MapEntity } from '@/components/map/DiscoverMapCanvas';
import { getCanonicalUrl } from '@/lib/brandConfig';

// react-leaflet stays off the initial bundle (WEB-PERF-003) — the whole canvas
// (incl. leaflet) loads lazily when the map renders.
const DiscoverMapCanvas = lazy(() => import('@/components/map/DiscoverMapCanvas'));

const LAYER_CONFIG = [
  { key: 'event' as const, label: 'Events', Icon: Calendar },
  { key: 'restaurant' as const, label: 'Restaurants', Icon: UtensilsCrossed },
  { key: 'attraction' as const, label: 'Attractions', Icon: Star },
];

/**
 * Map rows for the applied viewport (WEB-FEAT-009 AC1).
 *
 * THE CAPS BITE, measured against production 2026-08-24: 314 future events
 * carry coordinates against a limit of 200, and 465 restaurants against 300.
 * So a third of each never reached the map, and because none of the three
 * queries had an .order(), WHICH third was whatever Postgres happened to
 * return - not the soonest events or the nearest venues, and not necessarily
 * the same set twice.
 *
 * That also made the "N in view" counter wrong. The comment below it claimed
 * those counters "already report the true total"; they reported the true total
 * OF THE CAPPED FETCH. Pan into a dense block and the UI would state a
 * confident number that silently omitted a third of what is there.
 *
 * Bounds now reach the SERVER instead of only filtering what was already
 * downloaded, which is what AC1 asked for and is why the counts can be trusted:
 * the limit applies to rows in view rather than to the city. The client-side
 * withinBounds filter stays as the precise pass over what came back.
 *
 * Longitude is only constrained when west <= east. Des Moines cannot straddle
 * the antimeridian, but a wrapped viewport would otherwise produce
 * `lng >= 179 AND lng <= -179` and silently return nothing.
 */
function useMapEntities(bounds: MapBounds | null) {
  return useQuery({
    queryKey: ['map-entities', bounds?.north, bounds?.south, bounds?.east, bounds?.west],
    queryFn: async (): Promise<MapEntity[]> => {
      const results: MapEntity[] = [];

      const inBounds = <T extends { gte: (c: string, v: number) => T; lte: (c: string, v: number) => T }>(
        query: T,
      ): T => {
        if (!bounds) return query;
        let scoped = query.gte('latitude', bounds.south).lte('latitude', bounds.north);
        if (bounds.west <= bounds.east) {
          scoped = scoped.gte('longitude', bounds.west).lte('longitude', bounds.east);
        }
        return scoped;
      };

      const [eventsRes, restaurantsRes, attractionsRes] = await Promise.all([
        inBounds(
          supabase
            .from('events')
          // public.events has no `description` — it carries enhanced_description
          // and original_description. Selecting `description` failed the whole
          // query with 42703, so the map showed no events at all.
          .select('id, title, latitude, longitude, enhanced_description, original_description, category, date')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
            .gte('date', new Date().toISOString())
            // Soonest first: without an order the 200 kept were arbitrary.
            .order('date', { ascending: true })
            .limit(200),
        ),
        inBounds(
          supabase
            .from('restaurants')
            .select('id, name, latitude, longitude, description, cuisine, rating')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .order('name', { ascending: true })
            .limit(300),
        ),
        inBounds(
          supabase
            .from('attractions')
          // public.attractions classifies with `type`, not `category`.
            .select('id, name, latitude, longitude, description, type')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .order('name', { ascending: true })
            .limit(200),
        ),
      ]);

      if (eventsRes.data) {
        for (const e of eventsRes.data) {
          results.push({
            id: e.id, name: e.title, type: 'event',
            latitude: Number(e.latitude), longitude: Number(e.longitude),
            description: (e.enhanced_description ?? e.original_description)?.slice(0, 120),
            category: e.category, date: e.date,
          });
        }
      }
      if (restaurantsRes.data) {
        for (const r of restaurantsRes.data) {
          results.push({
            id: r.id, name: r.name, type: 'restaurant',
            latitude: Number(r.latitude), longitude: Number(r.longitude),
            description: r.description?.slice(0, 120), category: r.cuisine,
            rating: r.rating ? Number(r.rating) : undefined,
          });
        }
      }
      if (attractionsRes.data) {
        for (const a of attractionsRes.data) {
          results.push({
            id: a.id, name: a.name, type: 'attraction',
            latitude: Number(a.latitude), longitude: Number(a.longitude),
            description: a.description?.slice(0, 120), category: a.type,
          });
        }
      }
      return results;
    },
    staleTime: STALE_TIME.CONTENT_LIST,
  });
}

function withinBounds(e: MapEntity, b: MapBounds): boolean {
  return (
    e.latitude <= b.north &&
    e.latitude >= b.south &&
    e.longitude <= b.east &&
    e.longitude >= b.west
  );
}

const TYPE_LABEL: Record<MapEntity['type'], string> = {
  event: 'Event', restaurant: 'Restaurant', attraction: 'Attraction',
};
const detailPath = (e: MapEntity) =>
  `/${e.type === 'event' ? 'events' : e.type === 'restaurant' ? 'restaurants' : 'attractions'}/${e.id}`;

export default function DiscoverMap() {
  // Bounds the map currently shows (updated on moveend) vs. the bounds the list
  // is filtered to ("Search this area" promotes pending -> applied).
  const [pendingBounds, setPendingBounds] = useState<MapBounds | null>(null);
  const [appliedBounds, setAppliedBounds] = useState<MapBounds | null>(null);

  const { data: entities, isLoading } = useMapEntities(appliedBounds);
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    new Set(['event', 'restaurant', 'attraction'])
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; key: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const flyKey = useRef(0);

  const toggleLayer = (key: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const layerFiltered = useMemo(
    () => entities?.filter((e) => activeLayers.has(e.type)) ?? [],
    [entities, activeLayers]
  );

  // Markers reflect layer toggles; the list reflects layer toggles AND the
  // applied viewport bounds.
  const inView = useMemo(
    () =>
      appliedBounds
        ? layerFiltered.filter((e) => withinBounds(e, appliedBounds))
        : layerFiltered,
    [layerFiltered, appliedBounds]
  );

  // WEB-PERF-023. The list rendered every entry in `inView`, and with no bounds
  // applied that is the full fetch — 200 events + 300 restaurants + 200
  // attractions. Measured on a clean build: /map shipped 6,568 elements inside
  // #root against a 481 median, the worst route on the site, and Lighthouse
  // flags above ~1,500. The cost is HTML parse, DOM memory and hydration, all
  // main-thread, all on the route most likely to be opened on a phone.
  //
  // Only the LIST is capped. Markers are untouched, so the map still plots
  // everything, and the "N in view" counters below report the true total for
  // the viewport - the number a user reads does not change.
  //
  // That claim used to read "already report the true total" and was not true:
  // the fetch was capped at 200/300/200 with no bounds and no ordering, so the
  // counter reported the total of an arbitrary subset. It holds now only
  // because useMapEntities scopes the query to the applied bounds, which is
  // what makes the limits generous rather than binding (WEB-FEAT-009 AC1).
  const VISIBLE_RESULTS = 60;
  const visibleResults = inView.slice(0, VISIBLE_RESULTS);
  const hiddenResults = inView.length - visibleResults.length;

  const boundsAreStale =
    pendingBounds !== null && pendingBounds !== appliedBounds;

  const handleSearchArea = () => {
    setAppliedBounds(pendingBounds);
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const entity = entities?.find((e) => e.id === id);
    if (entity) {
      flyKey.current += 1;
      setFlyTo({ lat: entity.latitude, lng: entity.longitude, key: flyKey.current });
    }
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      flyKey.current += 1;
      setFlyTo({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        key: flyKey.current,
      });
    });
  };

  const ResultsList = (
    <ul className="divide-y" aria-label="Results in view">
      {inView.length === 0 ? (
        <li className="p-4 text-sm text-muted-foreground">
          No results in this area. Pan or zoom out, then “Search this area”.
        </li>
      ) : (
        visibleResults.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => handleSelect(e.id)}
              className={cn(
                'w-full text-left p-3 hover:bg-muted/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selectedId === e.id && 'bg-primary/10'
              )}
              aria-current={selectedId === e.id}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[e.type]}</Badge>
                {e.rating && (
                  <span className="text-[11px] text-muted-foreground">
                    <Star className="h-3 w-3 inline mr-0.5 text-amber-500" />{e.rating}
                  </span>
                )}
              </div>
              <h3 className="font-medium text-sm line-clamp-1">{e.name}</h3>
              {e.category && (
                <p className="text-xs text-muted-foreground line-clamp-1">{e.category}</p>
              )}
              <a
                href={detailPath(e)}
                className="text-xs text-primary hover:underline"
                onClick={(ev) => ev.stopPropagation()}
              >
                View details
              </a>
            </button>
          </li>
        ))
      )}
      {hiddenResults > 0 && (
        // Say what is not shown. A list that stops at 60 without saying so reads
        // as "there are 60 results", which is how a truncation becomes a fact.
        <li className="p-3 text-xs text-muted-foreground border-t">
          Showing the first {VISIBLE_RESULTS} of {inView.length} results. Zoom in or
          pan, then “Search this area”, to narrow them down.
        </li>
      )}
    </ul>
  );

  return (
    <>
      <Helmet>
        <title>Discover Map — Explore Des Moines | Des Moines Insider</title>
        <meta name="description" content="Explore Des Moines on an interactive map. Pan to search an area and browse events, restaurants, and attractions in view." />
        {/* WEB-SEO-002: sitemapped and prerendered, but had no canonical. */}
        <link rel="canonical" href={getCanonicalUrl('/map')} />
        {/* WEB-SEO-002: these pages set only title/description, so index.html's
            static og: and twitter: tags were the only ones shipping — pinned to the
            homepage on every route. Emitting them here lets the static copies be
            marked data-rh and replaced rather than duplicated. */}
        <meta property="og:title" content="Discover Map — Explore Des Moines | Des Moines Insider" />
        <meta property="og:description" content="Explore Des Moines on an interactive map. Pan to search an area and browse events, restaurants, and attractions in view." />
        <meta property="og:url" content={getCanonicalUrl('/map')} />
        <meta name="twitter:title" content="Discover Map — Explore Des Moines | Des Moines Insider" />
        <meta name="twitter:description" content="Explore Des Moines on an interactive map. Pan to search an area and browse events, restaurants, and attractions in view." />
      </Helmet>
      {/* WEB-SEO-004 / WEB-SEO-002: this page had no heading of any level, which
          is both an SEO gap and a WCAG 1.3.1 heading-hierarchy failure. The UI is
          map-first with no natural place for a visible title, so the h1 is
          screen-reader only — an accepted pattern for map-led layouts. */}
      <h1 className="sr-only">Explore Des Moines on a Map — Events, Restaurants and Attractions</h1>
      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        {/* Controls bar */}
        <div className="border-b bg-card px-4 py-3">
          <div className="container mx-auto flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground mr-2">Layers:</span>
            {LAYER_CONFIG.map(({ key, label, Icon }) => (
              <Button
                key={key}
                variant={activeLayers.has(key) ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleLayer(key)}
                aria-pressed={activeLayers.has(key)}
              >
                <Icon className="h-4 w-4 mr-1" />
                {label}
                {entities && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {entities.filter((e) => e.type === key).length}
                  </Badge>
                )}
              </Button>
            ))}
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={handleNearMe}>
                <Navigation className="h-4 w-4 mr-1" /> Near Me
              </Button>
            </div>
          </div>
        </div>

        {/* Map + results */}
        <div className="flex-1 relative flex" style={{ minHeight: '60vh' }}>
          {/* Desktop sidebar list */}
          <aside className="hidden md:flex md:flex-col w-80 border-r bg-card overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-sm font-semibold" aria-live="polite">
                {inView.length} in view
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">{ResultsList}</div>
          </aside>

          {/* Map */}
          <div className="flex-1 relative">
            {isLoading ? (
              <Skeleton className="w-full h-full absolute inset-0" />
            ) : (
              <Suspense fallback={<Skeleton className="w-full h-full absolute inset-0" />}>
                <DiscoverMapCanvas
                  entities={layerFiltered}
                  selectedId={selectedId}
                  onSelect={handleSelect}
                  onBoundsChange={setPendingBounds}
                  flyTo={flyTo}
                />
              </Suspense>
            )}

            {/* Search this area */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000]">
              <Button
                size="sm"
                onClick={handleSearchArea}
                disabled={!boundsAreStale}
                className="shadow-lg"
              >
                <Search className="h-4 w-4 mr-1" /> Search this area
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile bottom sheet */}
        <div className="md:hidden fixed bottom-20 inset-x-0 z-[1000]">
          <div className="mx-2 mb-2 rounded-t-xl border bg-card shadow-2xl">
            <button
              type="button"
              onClick={() => setSheetOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3"
              aria-expanded={sheetOpen}
            >
              <span className="text-sm font-semibold" aria-live="polite">
                {inView.length} in view
              </span>
              {sheetOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            {sheetOpen && (
              <div className="max-h-[40vh] overflow-y-auto border-t">{ResultsList}</div>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
