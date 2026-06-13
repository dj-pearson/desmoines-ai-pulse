import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin } from 'lucide-react';

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type MapEntityType = 'event' | 'restaurant' | 'attraction';

export interface MapEntity {
  id: string;
  name: string;
  type: MapEntityType;
  latitude: number;
  longitude: number;
  description?: string;
  category?: string;
  rating?: number;
  date?: string;
}

const TYPE_COLOR: Record<MapEntityType, string> = {
  event: '#6366f1',
  restaurant: '#ef4444',
  attraction: '#f59e0b',
};

const TYPE_LABEL: Record<MapEntityType, string> = {
  event: 'Event',
  restaurant: 'Restaurant',
  attraction: 'Attraction',
};

const TYPE_PATH: Record<MapEntityType, string> = {
  event: 'events',
  restaurant: 'restaurants',
  attraction: 'attractions',
};

// Cache icons so we don't recreate a divIcon for every marker on each render.
const iconCache = new Map<string, L.DivIcon>();
function markerIcon(type: MapEntityType, selected: boolean): L.DivIcon {
  const key = `${type}:${selected}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const color = TYPE_COLOR[type];
  const size = selected ? 32 : 22;
  const ring = selected ? '4px solid #111827' : '3px solid white';
  const icon = L.divIcon({
    className: 'discover-map-marker',
    html: `<div style="background-color:${color};width:${size}px;height:${size}px;border-radius:50%;border:${ring};box-shadow:0 2px 6px rgba(0,0,0,0.35);transition:all .15s;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

function toBounds(map: L.Map): MapBounds {
  const b = map.getBounds();
  return {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest(),
  };
}

/** Reports the map's bounds once on ready and after every pan/zoom. */
function BoundsReporter({
  onReady,
  onMoveEnd,
}: {
  onReady: (b: MapBounds) => void;
  onMoveEnd: (b: MapBounds) => void;
}) {
  const map = useMapEvents({
    moveend: () => onMoveEnd(toBounds(map)),
  });
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    onReady(toBounds(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

/** Flies the map to an imperative target (selected card / "Near Me"). */
function FlyTo({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], target.zoom ?? Math.max(map.getZoom(), 14), {
      duration: 0.6,
    });
  }, [target, map]);
  return null;
}

interface DiscoverMapCanvasProps {
  entities: MapEntity[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onReady: (b: MapBounds) => void;
  onMoveEnd: (b: MapBounds) => void;
  flyTarget: { lat: number; lng: number; zoom?: number } | null;
  initialCenter: [number, number];
  initialZoom: number;
}

export default function DiscoverMapCanvas({
  entities,
  selectedId,
  onSelect,
  onReady,
  onMoveEnd,
  flyTarget,
  initialCenter,
  initialZoom,
}: DiscoverMapCanvasProps) {
  const markerRefs = useRef(new Map<string, L.Marker>());

  // Open the popup of the selected marker when selection changes.
  useEffect(() => {
    if (!selectedId) return;
    const m = markerRefs.current.get(selectedId);
    if (m) m.openPopup();
  }, [selectedId]);

  const selectedEntity = useMemo(
    () => entities.find((e) => e.id === selectedId) ?? null,
    [entities, selectedId]
  );

  // Derive a fly target: explicit flyTarget wins, otherwise fly to the selected entity.
  const resolvedTarget = useMemo(() => {
    if (flyTarget) return flyTarget;
    if (selectedEntity)
      return { lat: selectedEntity.latitude, lng: selectedEntity.longitude };
    return null;
  }, [flyTarget, selectedEntity]);

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      scrollWheelZoom
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BoundsReporter onReady={onReady} onMoveEnd={onMoveEnd} />
      <FlyTo target={resolvedTarget} />

      {entities.map((entity) => (
        <Marker
          key={`${entity.type}:${entity.id}`}
          position={[entity.latitude, entity.longitude]}
          icon={markerIcon(entity.type, entity.id === selectedId)}
          ref={(m) => {
            if (m) markerRefs.current.set(entity.id, m);
            else markerRefs.current.delete(entity.id);
          }}
          zIndexOffset={entity.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(entity.id) }}
        >
          <Popup>
            <div className="min-w-[200px]">
              <h3 className="font-semibold text-sm mb-1">{entity.name}</h3>
              {entity.category && (
                <p className="text-xs text-muted-foreground mb-1">{entity.category}</p>
              )}
              {entity.description && (
                <p className="text-xs mb-2">{entity.description}</p>
              )}
              <span className="inline-block text-[11px] font-medium rounded px-1.5 py-0.5 mb-2 text-white"
                style={{ backgroundColor: TYPE_COLOR[entity.type] }}
              >
                {TYPE_LABEL[entity.type]}
              </span>
              <a
                href={`/${TYPE_PATH[entity.type]}/${entity.id}`}
                className="text-xs text-primary hover:underline block"
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
