import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  Calendar, UtensilsCrossed, Star, Navigation, Search, List, MapPin,
} from 'lucide-react';
import type { MapBounds, MapEntity, MapEntityType } from '@/components/discover/DiscoverMapCanvas';

const DiscoverMapCanvas = lazy(() => import('@/components/discover/DiscoverMapCanvas'));

const DES_MOINES_CENTER: [number, number] = [41.5868, -93.625];
const INITIAL_ZOOM = 12;
// Default bounding box (~roughly the metro) so the list populates before the
// map chunk finishes loading and reports its first bounds.
const DEFAULT_BOUNDS: MapBounds = { north: 41.75, south: 41.45, east: -93.45, west: -93.85 };

const PER_TYPE_LIMIT = 100;

const LAYER_CONFIG: { key: MapEntityType; label: string; Icon: typeof Calendar; color: string }[] = [
  { key: 'event', label: 'Events', Icon: Calendar, color: '#6366f1' },
  { key: 'restaurant', label: 'Restaurants', Icon: UtensilsCrossed, color: '#ef4444' },
  { key: 'attraction', label: 'Attractions', Icon: Star, color: '#f59e0b' },
];

// Round bounds so tiny sub-tile pans don't spawn a brand-new query key.
function roundBounds(b: MapBounds): MapBounds {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { north: r(b.north), south: r(b.south), east: r(b.east), west: r(b.west) };
}

function boundsEqual(a: MapBounds | null, b: MapBounds | null): boolean {
  if (!a || !b) return a === b;
  return a.north === b.north && a.south === b.south && a.east === b.east && a.west === b.west;
}

async function fetchInBounds(bounds: MapBounds): Promise<MapEntity[]> {
  const results: MapEntity[] = [];
  const { north, south, east, west } = bounds;

  const [eventsRes, restaurantsRes, attractionsRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, latitude, longitude, description, category, date')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', south).lte('latitude', north)
      .gte('longitude', west).lte('longitude', east)
      .gte('date', new Date().toISOString())
      .neq('is_merged', true)
      .limit(PER_TYPE_LIMIT),
    supabase
      .from('restaurants')
      .select('id, name, latitude, longitude, description, cuisine, rating')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', south).lte('latitude', north)
      .gte('longitude', west).lte('longitude', east)
      .neq('is_merged', true)
      .limit(PER_TYPE_LIMIT),
    supabase
      .from('attractions')
      .select('id, name, latitude, longitude, description, category')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', south).lte('latitude', north)
      .gte('longitude', west).lte('longitude', east)
      .limit(PER_TYPE_LIMIT),
  ]);

  for (const e of eventsRes.data ?? []) {
    results.push({
      id: e.id, name: e.title, type: 'event',
      latitude: Number(e.latitude), longitude: Number(e.longitude),
      description: e.description?.slice(0, 120), category: e.category, date: e.date,
    });
  }
  for (const r of restaurantsRes.data ?? []) {
    results.push({
      id: r.id, name: r.name, type: 'restaurant',
      latitude: Number(r.latitude), longitude: Number(r.longitude),
      description: r.description?.slice(0, 120), category: r.cuisine,
      rating: r.rating ? Number(r.rating) : undefined,
    });
  }
  for (const a of attractionsRes.data ?? []) {
    results.push({
      id: a.id, name: a.name, type: 'attraction',
      latitude: Number(a.latitude), longitude: Number(a.longitude),
      description: a.description?.slice(0, 120), category: a.category,
    });
  }
  return results;
}

function useBoundsEntities(bounds: MapBounds | null) {
  return useQuery({
    queryKey: ['discover-map-bounds', bounds],
    queryFn: () => fetchInBounds(bounds as MapBounds),
    enabled: !!bounds,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

const TYPE_PATH: Record<MapEntityType, string> = {
  event: 'events', restaurant: 'restaurants', attraction: 'attractions',
};
const TYPE_COLOR: Record<MapEntityType, string> = {
  event: '#6366f1', restaurant: '#ef4444', attraction: '#f59e0b',
};

interface ResultsListProps {
  entities: MapEntity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
}

function ResultsList({ entities, selectedId, onSelect, loading }: ResultsListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll the selected card into view when a marker is clicked.
  useEffect(() => {
    if (!selectedId) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-entity-id="${selectedId}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  if (loading && entities.length === 0) {
    return (
      <div className="space-y-3 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <MapPin className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm font-medium">Nothing in this area</p>
        <p className="text-xs mt-1">Pan or zoom out, then press “Search this area”.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="divide-y">
      {entities.map((entity) => (
        <button
          key={`${entity.type}:${entity.id}`}
          type="button"
          data-entity-id={entity.id}
          onClick={() => onSelect(entity.id)}
          className={cn(
            'w-full text-left px-3 py-3 transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            selectedId === entity.id && 'bg-primary/10'
          )}
        >
          <div className="flex items-start gap-2">
            <span
              className="mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: TYPE_COLOR[entity.type] }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{entity.name}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {entity.category && <span className="truncate">{entity.category}</span>}
                {entity.rating != null && (
                  <span className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {entity.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
            <a
              href={`/${TYPE_PATH[entity.type]}/${entity.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-primary hover:underline flex-shrink-0 mt-0.5"
            >
              View
            </a>
          </div>
        </button>
      ))}
    </div>
  );
}

export default function DiscoverMap() {
  const isMobile = useIsMobile();

  const [committedBounds, setCommittedBounds] = useState<MapBounds | null>(DEFAULT_BOUNDS);
  const [pendingBounds, setPendingBounds] = useState<MapBounds | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<MapEntityType>>(
    new Set<MapEntityType>(['event', 'restaurant', 'attraction'])
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: entities, isFetching } = useBoundsEntities(committedBounds);

  // The first time the map reports bounds, adopt them (auto-search the opening view).
  const adoptedReady = useRef(false);
  const handleReady = useCallback((b: MapBounds) => {
    if (adoptedReady.current) return;
    adoptedReady.current = true;
    const rounded = roundBounds(b);
    setCommittedBounds(rounded);
    setPendingBounds(rounded);
  }, []);

  const handleMoveEnd = useCallback((b: MapBounds) => {
    setPendingBounds(roundBounds(b));
  }, []);

  const boundsDirty = !boundsEqual(pendingBounds, committedBounds);

  const searchThisArea = () => {
    if (pendingBounds) setCommittedBounds(pendingBounds);
  };

  const toggleLayer = (key: MapEntityType) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleEntities = useMemo(
    () => (entities ?? []).filter((e) => activeLayers.has(e.type)),
    [entities, activeLayers]
  );

  const countsByType = useMemo(() => {
    const counts: Record<MapEntityType, number> = { event: 0, restaurant: 0, attraction: 0 };
    for (const e of entities ?? []) counts[e.type] += 1;
    return counts;
  }, [entities]);

  const handleSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id && isMobile) setSheetOpen(false);
  }, [isMobile]);

  const handleSelectFromList = useCallback((id: string) => {
    setSelectedId(id);
    // Clear any one-shot flyTarget so the canvas flies to the selected entity.
    setFlyTarget(null);
  }, []);

  const handleNearMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setFlyTarget({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 14 });
    });
  };

  const totalVisible = visibleEntities.length;

  const listPanel = (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b bg-card flex items-center justify-between">
        <span className="text-sm font-semibold">
          {totalVisible} result{totalVisible !== 1 ? 's' : ''} in view
        </span>
        {isFetching && <span className="text-xs text-muted-foreground">Updating…</span>}
      </div>
      <ScrollArea className="flex-1">
        <ResultsList
          entities={visibleEntities}
          selectedId={selectedId}
          onSelect={handleSelectFromList}
          loading={isFetching}
        />
      </ScrollArea>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>Discover Map — Explore Des Moines | Des Moines Insider</title>
        <meta name="description" content="Explore Des Moines on an interactive map. Pan to any neighborhood and search this area for events, restaurants, and attractions in view." />
      </Helmet>
      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        {/* Controls bar */}
        <div className="border-b bg-card px-4 py-3">
          <div className="container mx-auto flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground mr-1">Layers:</span>
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
                <Badge variant="secondary" className="ml-1.5 text-xs">
                  {countsByType[key]}
                </Badge>
              </Button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              {isMobile && (
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      <List className="h-4 w-4 mr-1" /> List ({totalVisible})
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[70vh] p-0 flex flex-col">
                    {listPanel}
                  </SheetContent>
                </Sheet>
              )}
              <Button variant="outline" size="sm" onClick={handleNearMe}>
                <Navigation className="h-4 w-4 mr-1" /> Near Me
              </Button>
            </div>
          </div>
        </div>

        {/* Map + sidebar */}
        <div className="flex-1 flex relative" style={{ minHeight: '60vh' }}>
          {/* Sidebar (desktop) */}
          {!isMobile && (
            <aside className="w-80 border-r bg-background flex-shrink-0 hidden md:flex flex-col">
              {listPanel}
            </aside>
          )}

          {/* Map */}
          <div className="flex-1 relative">
            <Suspense fallback={<Skeleton className="w-full h-full absolute inset-0" />}>
              <DiscoverMapCanvas
                entities={visibleEntities}
                selectedId={selectedId}
                onSelect={handleSelect}
                onReady={handleReady}
                onMoveEnd={handleMoveEnd}
                flyTarget={flyTarget}
                initialCenter={DES_MOINES_CENTER}
                initialZoom={INITIAL_ZOOM}
              />
            </Suspense>

            {/* Search this area */}
            {boundsDirty && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
                <Button size="sm" className="shadow-lg" onClick={searchThisArea}>
                  <Search className="h-4 w-4 mr-1.5" /> Search this area
                </Button>
              </div>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
