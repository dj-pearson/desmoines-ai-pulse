import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import { Badge } from "@/components/ui/badge";
import { Star, MapPin } from "lucide-react";

/**
 * Leaflet canvas for the Discover map (WEB-FEAT-009). Lives in its own module so
 * react-leaflet stays off the initial bundle — the page lazy()-imports this
 * (keeps WEB-PERF-003 intact). Emits viewport bounds on moveend, flies to a
 * selected entity, and reports marker clicks back up.
 */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapEntity {
  id: string;
  name: string;
  type: "event" | "restaurant" | "attraction";
  latitude: number;
  longitude: number;
  description?: string;
  category?: string;
  rating?: number;
  date?: string;
}

interface DiscoverMapCanvasProps {
  entities: MapEntity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  flyTo: { lat: number; lng: number; key: number } | null;
}

function readBounds(map: LeafletMap): MapBounds {
  const b = map.getBounds();
  return {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest(),
  };
}

function BoundsWatcher({
  onBoundsChange,
}: {
  onBoundsChange: (b: MapBounds) => void;
}) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(readBounds(map)),
  });
  // Emit the initial viewport once mounted.
  useEffect(() => {
    onBoundsChange(readBounds(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function FlyToController({
  flyTo,
}: {
  flyTo: { lat: number; lng: number; key: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 15), {
        duration: 0.6,
      });
    }
  }, [flyTo, map]);
  return null;
}

export default function DiscoverMapCanvas({
  entities,
  selectedId,
  onSelect,
  onBoundsChange,
  flyTo,
}: DiscoverMapCanvasProps) {
  return (
    <MapContainer
      center={[41.5868, -93.625]}
      zoom={13}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BoundsWatcher onBoundsChange={onBoundsChange} />
      <FlyToController flyTo={flyTo} />
      {entities.map((entity) => (
        <Marker
          key={entity.id}
          position={[entity.latitude, entity.longitude]}
          zIndexOffset={selectedId === entity.id ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(entity.id) }}
        >
          <Popup>
            <div className="min-w-[200px]">
              <h3 className="font-semibold text-sm mb-1">{entity.name}</h3>
              {entity.category && (
                <p className="text-xs text-muted-foreground mb-1">
                  {entity.category}
                </p>
              )}
              {entity.description && (
                <p className="text-xs mb-2">{entity.description}</p>
              )}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {entity.type === "event"
                    ? "Event"
                    : entity.type === "restaurant"
                    ? "Restaurant"
                    : "Attraction"}
                </Badge>
                {entity.rating && (
                  <span className="text-xs text-muted-foreground">
                    <Star className="h-3 w-3 inline mr-0.5 text-amber-500" />
                    {entity.rating}
                  </span>
                )}
              </div>
              <a
                href={`/${
                  entity.type === "event"
                    ? "events"
                    : entity.type === "restaurant"
                    ? "restaurants"
                    : "attractions"
                }/${entity.id}`}
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
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
