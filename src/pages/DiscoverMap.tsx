import { useState, useMemo, lazy, Suspense } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Calendar, UtensilsCrossed, Star, MapPin, Navigation,
} from 'lucide-react';

const MapContainer = lazy(() =>
  import('react-leaflet').then((m) => ({ default: m.MapContainer }))
);
const TileLayer = lazy(() =>
  import('react-leaflet').then((m) => ({ default: m.TileLayer }))
);
const MarkerImport = lazy(() =>
  import('react-leaflet').then((m) => ({ default: m.Marker }))
);
const PopupImport = lazy(() =>
  import('react-leaflet').then((m) => ({ default: m.Popup }))
);

interface MapEntity {
  id: string;
  name: string;
  type: 'event' | 'restaurant' | 'attraction';
  latitude: number;
  longitude: number;
  description?: string;
  category?: string;
  rating?: number;
  date?: string;
}

const LAYER_CONFIG = [
  { key: 'event' as const, label: 'Events', Icon: Calendar, color: '#6366f1' },
  { key: 'restaurant' as const, label: 'Restaurants', Icon: UtensilsCrossed, color: '#ef4444' },
  { key: 'attraction' as const, label: 'Attractions', Icon: Star, color: '#f59e0b' },
];

function useMapEntities() {
  return useQuery({
    queryKey: ['map-entities'],
    queryFn: async (): Promise<MapEntity[]> => {
      const results: MapEntity[] = [];

      const [eventsRes, restaurantsRes, attractionsRes] = await Promise.all([
        supabase
          .from('events')
          .select('id, title, latitude, longitude, description, category, date')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .gte('date', new Date().toISOString())
          .limit(200),
        supabase
          .from('restaurants')
          .select('id, name, latitude, longitude, description, cuisine, rating')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(300),
        supabase
          .from('attractions')
          .select('id, name, latitude, longitude, description, category')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .limit(200),
      ]);

      if (eventsRes.data) {
        for (const e of eventsRes.data) {
          results.push({
            id: e.id,
            name: e.title,
            type: 'event',
            latitude: Number(e.latitude),
            longitude: Number(e.longitude),
            description: e.description?.slice(0, 120),
            category: e.category,
            date: e.date,
          });
        }
      }

      if (restaurantsRes.data) {
        for (const r of restaurantsRes.data) {
          results.push({
            id: r.id,
            name: r.name,
            type: 'restaurant',
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            description: r.description?.slice(0, 120),
            category: r.cuisine,
            rating: r.rating ? Number(r.rating) : undefined,
          });
        }
      }

      if (attractionsRes.data) {
        for (const a of attractionsRes.data) {
          results.push({
            id: a.id,
            name: a.name,
            type: 'attraction',
            latitude: Number(a.latitude),
            longitude: Number(a.longitude),
            description: a.description?.slice(0, 120),
            category: a.category,
          });
        }
      }

      return results;
    },
    staleTime: 10 * 60 * 1000,
  });
}

export default function DiscoverMap() {
  const { data: entities, isLoading } = useMapEntities();
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    new Set(['event', 'restaurant', 'attraction'])
  );

  const toggleLayer = (key: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(
    () => entities?.filter((e) => activeLayers.has(e.type)) ?? [],
    [entities, activeLayers]
  );

  const handleNearMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(() => {
      // The map will re-center if we implement it with useMap
      // For now, the button shows intent
    });
  };

  return (
    <>
      <Helmet>
        <title>Discover Map — Explore Des Moines | Des Moines Insider</title>
        <meta name="description" content="Explore Des Moines on an interactive map. Toggle events, restaurants, and attractions to discover what is nearby." />
      </Helmet>
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

        {/* Map */}
        <div className="flex-1 relative" style={{ minHeight: '60vh' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="w-full h-full absolute inset-0" />
            </div>
          ) : (
            <Suspense fallback={<Skeleton className="w-full h-full absolute inset-0" />}>
              <MapContainer
                center={[41.5868, -93.625]}
                zoom={13}
                style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
                scrollWheelZoom
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {filtered.map((entity) => (
                  <Suspense key={entity.id} fallback={null}>
                    <MarkerImport
                      position={[entity.latitude, entity.longitude]}
                    >
                      <PopupImport>
                        <div className="min-w-[200px]">
                          <h3 className="font-semibold text-sm mb-1">{entity.name}</h3>
                          {entity.category && (
                            <p className="text-xs text-muted-foreground mb-1">{entity.category}</p>
                          )}
                          {entity.description && (
                            <p className="text-xs mb-2">{entity.description}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {entity.type === 'event' ? 'Event' : entity.type === 'restaurant' ? 'Restaurant' : 'Attraction'}
                            </Badge>
                            {entity.rating && (
                              <span className="text-xs text-muted-foreground">
                                <Star className="h-3 w-3 inline mr-0.5 text-amber-500" />
                                {entity.rating}
                              </span>
                            )}
                          </div>
                          <a
                            href={`/${entity.type === 'event' ? 'events' : entity.type === 'restaurant' ? 'restaurants' : 'attractions'}/${entity.id}`}
                            className="text-xs text-primary hover:underline mt-2 block"
                          >
                            View Details
                          </a>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${entity.latitude},${entity.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            <MapPin className="h-3 w-3 inline mr-0.5" /> Get Directions
                          </a>
                        </div>
                      </PopupImport>
                    </MarkerImport>
                  </Suspense>
                ))}
              </MapContainer>
            </Suspense>
          )}
        </div>

        <Footer />
      </div>
    </>
  );
}
