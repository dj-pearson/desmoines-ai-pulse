import { useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navigation, ZoomIn, ZoomOut, Maximize2, Minimize2, List, Star, Phone } from "lucide-react";
import { cn } from '@/lib/utils';
import { getCategoryHex } from '@/lib/categoryColors';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

// Fix for default marker icon issue with bundlers. The prototype carries a
// private _getIconUrl that Leaflet's own typings do not declare.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// One divIcon per colour, built once (eat-drink plan WP4 item 4). Creating a
// fresh icon per marker per render made react-leaflet call setIcon on every
// marker whenever the parent re-rendered.
const iconCache = new Map<string, L.DivIcon>();
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
/** Pin colour for a map that sets neither markerColor nor colorByCategory. */
const DEFAULT_MARKER_COLOR = '#2563eb';

function getColorIcon(color: string): L.DivIcon {
  // Only a hex colour reaches the html string, so nothing can inject markup.
  const safe = HEX_COLOR.test(color) ? color : '#64748b';
  let icon = iconCache.get(safe);
  if (!icon) {
    icon = L.divIcon({
      className: 'custom-marker',
      html: `<div aria-hidden="true" style="background-color: ${safe}; width: 25px; height: 25px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
      iconSize: [25, 25],
      iconAnchor: [12, 12],
    });
    iconCache.set(safe, icon);
  }
  return icon;
}

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div aria-hidden="true" style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export interface MapLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type?: string;
  category?: string;
  slug?: string;
  image_url?: string;
  distance_miles?: number;
  description?: string;
  rating?: number;
  price?: string;
  /** Pin colour (hex). Wins over colorByCategory when set. */
  markerColor?: string;
  /** Status in words ("Open until 10 PM"), shown in the popup, marker title and list. */
  statusLabel?: string;
  /** Adds a tel: action to the popup. */
  phone?: string;
}

/** A row the map could not place, listed by name under "Location not mapped". */
export interface UnmappedLocation {
  id: string;
  name: string;
  slug?: string;
  statusLabel?: string;
}

export interface MapLegendItem {
  label: string;
  color: string;
}

interface InteractiveMapProps {
  locations: MapLocation[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  height?: string;
  /** Not implemented: clustering needs a dependency this map does not carry yet. */
  showClustering?: boolean;
  showUserLocation?: boolean;
  userLocation?: { latitude: number; longitude: number };
  showRadius?: boolean;
  radiusMiles?: number;
  onLocationClick?: (location: MapLocation) => void;
  linkPrefix?: string; // e.g., '/events', '/restaurants'
  colorByCategory?: boolean;
  /** Replaces the category legend, for maps coloured by something else. */
  legend?: MapLegendItem[];
  legendTitle?: string;
  /** Replaces "N locations" in the count badge. */
  countLabel?: string;
  /** Accessible name for the map region. */
  mapLabel?: string;
  /** Listed under the map list alternative instead of silently dropped. */
  unmappedLocations?: UnmappedLocation[];
  /** When the user location arrives, centre on it instead of fitting every pin. */
  focusUserLocation?: boolean;
  /** Extra controls rendered in the toolbar above the map. */
  toolbar?: ReactNode;
}

const COORD_KEY_DIGITS = 3;

// Fits the map to the pins, but only when the SET of pins changes (item 4).
// Keyed on the joined ids rather than the array identity, so a parent
// re-render, a window refocus or a refetch with the same rows leaves the
// visitor's zoom and centre alone.
function MapControls({
  locations,
  userLocation,
  focusUserLocation,
}: {
  locations: MapLocation[];
  userLocation?: { latitude: number; longitude: number };
  focusUserLocation: boolean;
}) {
  const map = useMap();
  const locationsRef = useRef(locations);
  locationsRef.current = locations;

  const idsKey = useMemo(() => locations.map((loc) => loc.id).join('|'), [locations]);
  const userKey = userLocation
    ? `${userLocation.latitude.toFixed(COORD_KEY_DIGITS)},${userLocation.longitude.toFixed(COORD_KEY_DIGITS)}`
    : '';
  const userRef = useRef(userLocation);
  userRef.current = userLocation;

  useEffect(() => {
    const user = userRef.current;
    if (focusUserLocation && user) {
      map.setView([user.latitude, user.longitude], Math.max(map.getZoom(), 14));
      return;
    }
    const points = locationsRef.current;
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((loc) => [loc.latitude, loc.longitude] as [number, number]));
    if (user) bounds.extend([user.latitude, user.longitude]);
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [idsKey, userKey, focusUserLocation, map]);

  return null;
}

// Controls are 44px (h-11 w-11) with an accessible name, not a title alone (item 5).
function CustomMapControls({ onZoomIn, onZoomOut, onCenter, onFullscreen, isFullscreen }: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onFullscreen: () => void;
  isFullscreen: boolean;
}) {
  const cls = 'h-11 w-11 p-0 shadow-md';
  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      <Button type="button" variant="secondary" className={cls} onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
        <ZoomIn className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button type="button" variant="secondary" className={cls} onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
        <ZoomOut className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button type="button" variant="secondary" className={cls} onClick={onCenter} aria-label="Re-center map" title="Re-center map">
        <Navigation className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        className={cls}
        onClick={onFullscreen}
        aria-label="Full screen map"
        aria-pressed={isFullscreen}
        title={isFullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
      >
        {isFullscreen ? (
          <Minimize2 className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-5 w-5" aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}

function directionsUrl(location: MapLocation): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${location.latitude},${location.longitude}`;
}

/** Digits and a leading + only, so a scraped string cannot become an odd href. */
function telHref(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null;
}

export function InteractiveMap({
  locations,
  center,
  zoom = 12,
  className,
  height = '600px',
  showUserLocation = false,
  userLocation,
  showRadius = false,
  radiusMiles = 25,
  onLocationClick,
  linkPrefix = '/events',
  colorByCategory = false,
  legend,
  legendTitle,
  countLabel,
  mapLabel,
  unmappedLocations,
  focusUserLocation = false,
  toolbar,
}: InteractiveMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showListView, setShowListView] = useState(false);

  // Filter out locations without coordinates
  const validLocations = useMemo(
    () => locations.filter(loc => Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)),
    [locations]
  );

  // Calculate center if not provided
  const mapCenter: [number, number] = useMemo(() => {
    if (center) return center;
    if (userLocation) return [userLocation.latitude, userLocation.longitude];
    if (validLocations.length > 0) {
      const avgLat = validLocations.reduce((sum, loc) => sum + loc.latitude, 0) / validLocations.length;
      const avgLng = validLocations.reduce((sum, loc) => sum + loc.longitude, 0) / validLocations.length;
      return [avgLat, avgLng];
    }
    return [41.5868, -93.625]; // Des Moines default
  }, [center, userLocation, validLocations]);

  // The map measures its container once; after the container changes size it
  // has to be told, or the tiles stay drawn for the old box (item 5).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(id);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleCenter = () => mapRef.current?.setView(mapCenter, zoom);
  const handleFullscreen = () => setIsFullscreen((v) => !v);

  // Always an icon. react-leaflet passes `icon: undefined` straight into
  // L.Marker's options, which overwrites the default and throws "reading
  // 'createIcon'" on add - that is what took /playgrounds?view=map down to the
  // route error boundary.
  const markerIcon = (location: MapLocation): L.DivIcon => {
    if (location.markerColor) return getColorIcon(location.markerColor);
    if (colorByCategory) return getColorIcon(getCategoryHex(location.category));
    return getColorIcon(DEFAULT_MARKER_COLOR);
  };

  const markerTitle = (location: MapLocation) =>
    location.statusLabel ? `${location.name}, ${location.statusLabel}` : location.name;

  const categoryLegend = useMemo<MapLegendItem[]>(() => {
    if (legend || !colorByCategory) return [];
    return Array.from(new Set(validLocations.map((loc) => loc.category).filter((c): c is string => !!c))).map(
      (category) => ({ label: category, color: getCategoryHex(category) })
    );
  }, [legend, colorByCategory, validLocations]);

  const legendItems = legend ?? categoryLegend;
  const hasUnmapped = !!unmappedLocations && unmappedLocations.length > 0;

  const renderMarkers = () => {
    return validLocations.map(location => {
      const title = markerTitle(location);
      const tel = location.phone ? telHref(location.phone) : null;
      return (
        <Marker
          key={location.id}
          position={[location.latitude, location.longitude]}
          icon={markerIcon(location)}
          title={title}
          alt={title}
          eventHandlers={{
            click: () => onLocationClick?.(location),
          }}
        >
          <Popup>
            <div className="min-w-[200px] max-w-[300px]">
              {location.image_url && (
                <img
                  src={location.image_url}
                  alt={`${location.name} - ${location.category || 'location'} in Des Moines`}
                  className="w-full h-32 object-cover rounded-md mb-2"
                  loading="lazy"
                />
              )}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">{location.name}</h3>
                {location.statusLabel && (
                  <p className="text-xs font-medium">{location.statusLabel}</p>
                )}
                {location.category && (
                  <Badge variant="secondary" className="text-xs">
                    {location.category}
                  </Badge>
                )}
                {location.distance_miles !== undefined && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <SpriteIcon name="map-pin" className="h-3 w-3" />
                    {location.distance_miles.toFixed(1)} mi away
                  </div>
                )}
                {location.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {location.description}
                  </p>
                )}
                {location.rating != null && location.rating > 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                    <span>{location.rating.toFixed(1)}</span>
                    <span className="sr-only">out of 5</span>
                  </div>
                )}
                {location.price && (
                  <div className="text-xs font-medium">{location.price}</div>
                )}
                {location.type === 'restaurant' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href={directionsUrl(location)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                    >
                      Directions
                      <span className="sr-only"> to {location.name} (opens in a new tab)</span>
                    </a>
                    {tel && (
                      <a
                        href={tel}
                        className="inline-flex min-h-11 items-center gap-1 rounded-md border px-3 text-xs font-medium hover:bg-muted"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                        Call
                        <span className="sr-only"> {location.name}</span>
                      </a>
                    )}
                  </div>
                )}
                <Link
                  to={`${linkPrefix}/${location.slug || location.id}`}
                  className="inline-flex min-h-11 items-center text-xs text-primary hover:underline"
                >
                  View details
                </Link>
              </div>
            </div>
          </Popup>
        </Marker>
      );
    });
  };

  return (
    <div className={cn('relative', className)}>
      {/* Skip link for screen readers and keyboard users */}
      <a
        href="#map-list-alternative"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[1001] focus:top-2 focus:left-2 focus:bg-background focus:text-primary focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:text-sm focus:font-medium"
        onClick={(e) => {
          e.preventDefault();
          setShowListView(true);
          document.getElementById('map-list-alternative')?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        Skip map, view as list
      </a>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-2">
        {toolbar}
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowListView(!showListView)}
          aria-expanded={showListView}
          aria-controls="map-list-alternative"
          className="h-11 text-sm"
        >
          <List className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {showListView ? 'Hide list view' : 'Show list view'}
        </Button>
      </div>

      <div
        role="region"
        aria-label={mapLabel ?? `Map showing ${validLocations.length} locations in Des Moines`}
        className={cn(
          'relative rounded-lg overflow-hidden shadow-lg',
          isFullscreen && 'fixed inset-0 z-[9999] rounded-none',
        )}
        style={{ height: isFullscreen ? '100dvh' : height }}
      >
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        className="h-full w-full"
        ref={mapRef}
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        <MapControls
          locations={validLocations}
          userLocation={userLocation}
          focusUserLocation={focusUserLocation}
        />

        {/* User location marker */}
        {showUserLocation && userLocation && (
          <>
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={userLocationIcon}
              title="Your location"
              alt="Your location"
            >
              <Popup>
                <div className="text-center">
                  <p className="font-semibold">Your Location</p>
                  <p className="text-xs text-muted-foreground">
                    {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                  </p>
                </div>
              </Popup>
            </Marker>
            {showRadius && (
              <Circle
                center={[userLocation.latitude, userLocation.longitude]}
                radius={radiusMiles * 1609.34} // Convert miles to meters
                pathOptions={{
                  fillColor: '#3b82f6',
                  fillOpacity: 0.1,
                  color: '#3b82f6',
                  weight: 2,
                }}
              />
            )}
          </>
        )}

        {renderMarkers()}
      </MapContainer>

      {/* Custom controls overlay */}
      <CustomMapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onCenter={handleCenter}
        onFullscreen={handleFullscreen}
        isFullscreen={isFullscreen}
      />

      {/* Legend: capped height so a long category list cannot cover the map */}
      {legendItems.length > 0 && (
        <div className="absolute bottom-4 left-4 z-[1000] max-h-40 max-w-[60%] overflow-y-auto rounded-lg bg-background/95 p-3 text-foreground shadow-md">
          <h4 className="text-xs font-semibold mb-2">{legendTitle ?? 'Categories'}</h4>
          <ul className="space-y-1">
            {legendItems.map((item) => (
              <li key={item.label} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 rounded-full border-2 border-white shadow-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Location count badge */}
      <div className="absolute top-4 left-4 z-[1000] max-w-[calc(100%-5rem)] rounded-lg bg-background/95 px-3 py-1 text-foreground shadow-md">
        <span className="text-sm font-medium">
          {countLabel ?? `${validLocations.length} location${validLocations.length !== 1 ? 's' : ''}`}
        </span>
      </div>
      </div>

      {/* Keyboard-accessible list alternative */}
      <div id="map-list-alternative" tabIndex={-1}>
        {showListView && (validLocations.length > 0 || hasUnmapped) && (
          <div className="mt-4 border rounded-lg overflow-hidden" role="region" aria-label="Map locations as list">
            {validLocations.length > 0 && (
              <>
                <div className="bg-muted px-4 py-2 border-b">
                  <h3 className="text-sm font-semibold">{validLocations.length} on the map</h3>
                </div>
                <ul className="divide-y max-h-[400px] overflow-y-auto">
                  {validLocations.map((location) => (
                    <li key={location.id}>
                      <Link
                        to={`${linkPrefix}/${location.slug || location.id}`}
                        className="flex min-h-11 items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{location.name}</p>
                          <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground mt-0.5">
                            {location.statusLabel && (
                              <span className="flex items-center gap-1.5 text-foreground">
                                {location.markerColor && (
                                  <span
                                    aria-hidden="true"
                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: location.markerColor }}
                                  />
                                )}
                                {location.statusLabel}
                              </span>
                            )}
                            {location.category && <span>{location.category}</span>}
                            {location.rating != null && location.rating > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                                {location.rating.toFixed(1)}
                              </span>
                            )}
                            {location.distance_miles !== undefined && (
                              <span>{location.distance_miles.toFixed(1)} mi</span>
                            )}
                          </div>
                        </div>
                        <SpriteIcon name="map-pin" className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {hasUnmapped && (
              <>
                <div className="bg-muted px-4 py-2 border-y">
                  <h3 className="text-sm font-semibold">Location not mapped ({unmappedLocations.length})</h3>
                </div>
                <ul className="divide-y max-h-[300px] overflow-y-auto">
                  {unmappedLocations.map((location) => (
                    <li key={location.id}>
                      <Link
                        to={`${linkPrefix}/${location.slug || location.id}`}
                        className="flex min-h-11 flex-col justify-center px-4 py-2 hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">{location.name}</span>
                        {location.statusLabel && (
                          <span className="text-xs text-muted-foreground">{location.statusLabel}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
