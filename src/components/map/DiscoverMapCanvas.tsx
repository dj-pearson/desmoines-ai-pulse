import { useEffect, useRef, type MutableRefObject } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
// This chunk is the only one on /map that loads react-leaflet, and nothing
// else brought Leaflet's stylesheet into it: without it the tiles render as a
// scattered mosaic and the container is not position: relative (explore plan
// WP2 item 1).
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Star } from "lucide-react";

/**
 * Leaflet canvas for the Discover map (WEB-FEAT-009). Lives in its own module so
 * react-leaflet stays off the initial bundle - the page lazy()-imports this
 * (keeps WEB-PERF-003 intact). Emits viewport bounds on moveend, flies to a
 * selected entity, opens its popup, and reports marker clicks back up.
 *
 * The page never unmounts this while it loads (WP2 item 2): the viewport the
 * user panned to is the map's own state, and a remount would reset it to the
 * initial centre.
 */
export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export type MapEntityType = "event" | "restaurant" | "attraction" | "playground" | "trail";

export interface MapEntity {
  id: string;
  name: string;
  type: MapEntityType;
  latitude: number;
  longitude: number;
  /**
   * In-app path of the detail page, already canonical. Optional because the
   * trip planner's stop preview reuses this canvas with bare rows; without it
   * the popup falls back to the legacy /<type>s/<id> path.
   */
  href?: string;
  description?: string;
  category?: string;
  rating?: number;
  date?: string;
  /** "Open until 10 PM", "Starts 7:30 PM". Shown in popup, list and marker title. */
  statusLabel?: string;
}

interface DiscoverMapCanvasProps {
  entities: MapEntity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onBoundsChange: (bounds: MapBounds) => void;
  flyTo: { lat: number; lng: number; key: number } | null;
  /** Fit to these on mount (from ?bbox=). Read once; later changes are ignored. */
  initialBounds?: MapBounds | null;
  userLocation?: { lat: number; lng: number } | null;
  /** Static SVG markup per type, shared with the page's legend. */
  markerHtml?: Record<MapEntityType, string>;
  typeLabel?: Record<MapEntityType, string>;
}

const DSM_CENTER: [number, number] = [41.5868, -93.625];

/** A plain lettered dot per type, for callers that pass no markup of their own. */
function defaultMarkerHtml(fill: string, glyph: string): string {
  return (
    '<svg viewBox="0 0 28 28" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' +
    `<circle cx="14" cy="14" r="12" fill="${fill}" stroke="#ffffff" stroke-width="2"/>` +
    `<text x="14" y="18.5" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff" font-family="system-ui, sans-serif">${glyph}</text>` +
    "</svg>"
  );
}

const DEFAULT_MARKER_HTML: Record<MapEntityType, string> = {
  event: defaultMarkerHtml("#c2410c", "E"),
  restaurant: defaultMarkerHtml("#0f766e", "R"),
  attraction: defaultMarkerHtml("#1d4ed8", "A"),
  playground: defaultMarkerHtml("#be185d", "P"),
  trail: defaultMarkerHtml("#4d7c0f", "T"),
};

const DEFAULT_TYPE_LABEL: Record<MapEntityType, string> = {
  event: "Event",
  restaurant: "Restaurant",
  attraction: "Attraction",
  playground: "Playground",
  trail: "Trail",
};

const LEGACY_PREFIX: Record<MapEntityType, string> = {
  event: "events",
  restaurant: "restaurants",
  attraction: "attractions",
  playground: "playgrounds",
  trail: "outdoors",
};

// One divIcon per (type, selected), built once. A fresh icon per render made
// react-leaflet call setIcon on every marker whenever the parent re-rendered
// (same reasoning as InteractiveMap's cache). The markup is a page constant,
// never row data, so nothing from the database reaches the html string.
const iconCache = new Map<string, L.DivIcon>();

function markerIcon(type: MapEntityType, html: string, selected: boolean): L.DivIcon {
  const key = `${type}|${selected ? 1 : 0}|${html}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const size = selected ? 36 : 28;
    icon = L.divIcon({
      className: "discover-marker",
      html: `<div aria-hidden="true" style="width:${size}px;height:${size}px;line-height:0">${html}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const userLocationIcon = L.divIcon({
  className: "discover-user-location",
  html: '<div aria-hidden="true" style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid #fff"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function readBounds(map: LeafletMap): MapBounds {
  const b = map.getBounds();
  return {
    north: b.getNorth(),
    south: b.getSouth(),
    east: b.getEast(),
    west: b.getWest(),
  };
}

function BoundsWatcher({ onBoundsChange }: { onBoundsChange: (b: MapBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(readBounds(map)),
  });
  // Emit the initial viewport once mounted. The page does not query until this
  // arrives, so the first fetch is already scoped to what is on screen.
  useEffect(() => {
    onBoundsChange(readBounds(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function FlyToController({ flyTo }: { flyTo: { lat: number; lng: number; key: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    }
  }, [flyTo, map]);
  return null;
}

/**
 * Opens the selected marker's popup, once per selection. Waits for the fly-to
 * to settle when one is in flight, because opening mid-flight auto-pans and
 * cuts the animation short. A selection whose marker is not rendered yet (a
 * ?sel= on a cold load) is retried when the entities arrive.
 */
function SelectedPopupOpener({
  selectedId,
  flyKey,
  entityCount,
  markers,
}: {
  selectedId: string | null;
  flyKey: number | null;
  entityCount: number;
  markers: MutableRefObject<Map<string, LeafletMarker>>;
}) {
  const map = useMap();
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      opened.current = null;
      return;
    }
    const token = `${selectedId}|${flyKey ?? ""}`;
    if (opened.current === token) return;
    const marker = markers.current.get(selectedId);
    if (!marker) return;

    const open = () => {
      opened.current = token;
      marker.openPopup();
    };
    if (flyKey === null) {
      open();
      return;
    }
    // flyTo always ends with moveend; the timer covers a flight Leaflet
    // skipped because the target was already in view at that zoom.
    const timer = window.setTimeout(open, 900);
    const onEnd = () => {
      window.clearTimeout(timer);
      open();
    };
    map.once("moveend", onEnd);
    return () => {
      window.clearTimeout(timer);
      map.off("moveend", onEnd);
    };
  }, [selectedId, flyKey, entityCount, map, markers]);

  return null;
}

function directionsUrl(entity: MapEntity): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${entity.latitude},${entity.longitude}`;
}

export default function DiscoverMapCanvas({
  entities,
  selectedId,
  onSelect,
  onBoundsChange,
  flyTo,
  initialBounds,
  userLocation,
  markerHtml = DEFAULT_MARKER_HTML,
  typeLabel = DEFAULT_TYPE_LABEL,
}: DiscoverMapCanvasProps) {
  const markers = useRef(new Map<string, LeafletMarker>());
  // Read once: MapContainer ignores later changes to center/zoom/bounds anyway.
  const initial = useRef(initialBounds ?? null);
  const fit = initial.current;

  return (
    <MapContainer
      {...(fit
        ? {
            bounds: [
              [fit.south, fit.west],
              [fit.north, fit.east],
            ] as [[number, number], [number, number]],
          }
        : { center: DSM_CENTER, zoom: 13 })}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BoundsWatcher onBoundsChange={onBoundsChange} />
      <FlyToController flyTo={flyTo} />
      <SelectedPopupOpener
        selectedId={selectedId}
        flyKey={flyTo?.key ?? null}
        entityCount={entities.length}
        markers={markers}
      />
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={userLocationIcon}
          title="Your location"
          interactive={false}
          keyboard={false}
        />
      )}
      {entities.map((entity) => {
        const label = typeLabel[entity.type];
        const title = `${entity.name}, ${label}${entity.statusLabel ? ", " + entity.statusLabel : ""}`;
        const selected = selectedId === entity.id;
        return (
          <Marker
            key={`${entity.type}:${entity.id}`}
            ref={(m) => {
              if (m) markers.current.set(entity.id, m);
              else markers.current.delete(entity.id);
            }}
            position={[entity.latitude, entity.longitude]}
            icon={markerIcon(entity.type, markerHtml[entity.type], selected)}
            title={title}
            alt={title}
            zIndexOffset={selected ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(entity.id) }}
          >
            <Popup>
              <div className="min-w-[200px] space-y-1">
                <h3 className="font-semibold text-sm">{entity.name}</h3>
                {entity.statusLabel && (
                  <p className="text-xs font-medium !my-0">{entity.statusLabel}</p>
                )}
                {entity.category && (
                  <p className="text-xs text-muted-foreground !my-0">{entity.category}</p>
                )}
                {entity.description && (
                  <p className="text-xs !my-0 line-clamp-3">{entity.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {label}
                  </Badge>
                  {entity.rating != null && entity.rating > 0 && (
                    <span className="text-xs text-muted-foreground">
                      <Star className="h-3 w-3 inline mr-0.5 text-amber-500" aria-hidden="true" />
                      {entity.rating}
                      <span className="sr-only"> out of 5</span>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    to={entity.href ?? `/${LEGACY_PREFIX[entity.type]}/${entity.id}`}
                    className="inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-medium text-primary hover:bg-muted"
                  >
                    View details
                    <span className="sr-only"> for {entity.name}</span>
                  </Link>
                  <a
                    href={directionsUrl(entity)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                  >
                    Directions
                    <span className="sr-only"> to {entity.name} (opens in a new tab)</span>
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
