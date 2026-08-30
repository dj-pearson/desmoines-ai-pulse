import { useMemo, useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Navigation, ZoomIn, ZoomOut, Maximize2, List, Star } from "lucide-react";
import { cn } from '@/lib/utils';
import { getCategoryHex } from '@/lib/categoryColors';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

// Fix for default marker icon issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom marker icons
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 25px; height: 25px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
    iconSize: [25, 25],
    iconAnchor: [12, 12],
  });
};

const userLocationIcon = L.divIcon({
  className: 'user-location-marker',
  html: `<div style="background-color: #3b82f6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(59, 130, 246, 0.6);"></div>`,
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
}

interface InteractiveMapProps {
  locations: MapLocation[];
  center?: [number, number];
  zoom?: number;
  className?: string;
  height?: string;
  showClustering?: boolean;
  showUserLocation?: boolean;
  userLocation?: { latitude: number; longitude: number };
  showRadius?: boolean;
  radiusMiles?: number;
  onLocationClick?: (location: MapLocation) => void;
  linkPrefix?: string; // e.g., '/events', '/restaurants'
  colorByCategory?: boolean;
}

// Component to handle map controls and fit bounds
function MapControls({
  locations,
  userLocation,
}: {
  locations: MapLocation[];
  userLocation?: { latitude: number; longitude: number };
}) {
  const map = useMap();

  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(
        locations
          .filter(loc => loc.latitude && loc.longitude)
          .map(loc => [loc.latitude, loc.longitude] as [number, number])
      );
      
      if (userLocation) {
        bounds.extend([userLocation.latitude, userLocation.longitude]);
      }
      
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    }
  }, [locations, userLocation, map]);

  return null;
}

// Component for custom map controls
function CustomMapControls({ onZoomIn, onZoomOut, onCenter, onFullscreen }: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenter: () => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      <Button
        size="sm"
        variant="secondary"
        className="h-8 w-8 p-0 shadow-md"
        onClick={onZoomIn}
        title="Zoom In"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="h-8 w-8 p-0 shadow-md"
        onClick={onZoomOut}
        title="Zoom Out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="h-8 w-8 p-0 shadow-md"
        onClick={onCenter}
        title="Center Map"
      >
        <Navigation className="h-4 w-4" />
      </Button>
      <Button
        size="sm"
        variant="secondary"
        className="h-8 w-8 p-0 shadow-md"
        onClick={onFullscreen}
        title="Fullscreen"
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function InteractiveMap({
  locations,
  center,
  zoom = 12,
  className,
  height = '600px',
  showClustering = true,
  showUserLocation = false,
  userLocation,
  showRadius = false,
  radiusMiles = 25,
  onLocationClick,
  linkPrefix = '/events',
  colorByCategory = false,
}: InteractiveMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Filter out locations without coordinates
  const validLocations = useMemo(
    () => locations.filter(loc => loc.latitude != null && loc.longitude != null),
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

  // Category colors for markers — uses shared color map
  const getCategoryColor = (category?: string) => {
    return getCategoryHex(category);
  };

  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  const handleCenter = () => {
    if (mapRef.current) {
      mapRef.current.setView(mapCenter, zoom);
    }
  };

  const handleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const renderMarkers = () => {
    return validLocations.map(location => {
      const icon = colorByCategory
        ? createCustomIcon(getCategoryColor(location.category))
        : undefined;

      return (
        <Marker
          key={location.id}
          position={[location.latitude, location.longitude]}
          icon={icon}
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
                {location.rating && (
                  <div className="text-xs">
                    ⭐ {location.rating.toFixed(1)}
                  </div>
                )}
                {location.price && (
                  <div className="text-xs font-medium">{location.price}</div>
                )}
                <Link
                  to={`${linkPrefix}/${location.slug || location.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  View Details →
                </Link>
              </div>
            </div>
          </Popup>
        </Marker>
      );
    });
  };

  const [showListView, setShowListView] = useState(false);

  return (
    <div className={cn('relative', className)}>
      {/* Skip link for screen readers and keyboard users */}
      <a
        href="#map-list-alternative"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[1001] focus:top-2 focus:left-2 focus:bg-white focus:text-primary focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg focus:text-sm focus:font-medium"
        onClick={(e) => {
          e.preventDefault();
          setShowListView(true);
          document.getElementById('map-list-alternative')?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        Skip map, view as list
      </a>

      {/* Map toggle */}
      <div className="flex justify-end mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowListView(!showListView)}
          className="text-xs"
        >
          <List className="h-3.5 w-3.5 mr-1.5" />
          {showListView ? 'Hide list view' : 'Show list view'}
        </Button>
      </div>

      <div
        role="application"
        aria-label={`Interactive map showing ${validLocations.length} locations in Des Moines`}
        className={cn(
          'relative rounded-lg overflow-hidden shadow-lg',
          isFullscreen && 'fixed inset-0 z-[9999] rounded-none',
        )}
        style={{ height: isFullscreen ? '100vh' : height }}
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

        <MapControls locations={validLocations} userLocation={userLocation} />

        {/* User location marker */}
        {showUserLocation && userLocation && (
          <>
            <Marker
              position={[userLocation.latitude, userLocation.longitude]}
              icon={userLocationIcon}
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

        {/* Location markers - clustering will be added in future iteration */}
        {renderMarkers()}
      </MapContainer>

      {/* Custom controls overlay */}
      <CustomMapControls
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onCenter={handleCenter}
        onFullscreen={handleFullscreen}
      />

      {/* Legend */}
      {colorByCategory && (
        <div className="absolute bottom-4 left-4 z-[1000] bg-white dark:bg-gray-800 p-3 rounded-lg shadow-md">
          <h4 className="text-xs font-semibold mb-2">Categories</h4>
          <div className="space-y-1">
            {Array.from(new Set(validLocations.map(loc => loc.category).filter(Boolean))).map(
              category => (
                <div key={category} className="flex items-center gap-2 text-xs">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: getCategoryColor(category) }}
                  />
                  <span>{category}</span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Location count badge */}
      <div className="absolute top-4 left-4 z-[1000] bg-white dark:bg-gray-800 px-3 py-1 rounded-lg shadow-md">
        <span className="text-sm font-medium">
          {validLocations.length} location{validLocations.length !== 1 ? 's' : ''}
        </span>
      </div>
      </div>

      {/* Keyboard-accessible list alternative */}
      <div id="map-list-alternative" tabIndex={-1}>
        {showListView && validLocations.length > 0 && (
          <div className="mt-4 border rounded-lg overflow-hidden" role="region" aria-label="Map locations as list">
            <div className="bg-muted px-4 py-2 border-b">
              <h3 className="text-sm font-semibold">{validLocations.length} Locations</h3>
            </div>
            <ul className="divide-y max-h-[400px] overflow-y-auto">
              {validLocations.map((location) => (
                <li key={location.id}>
                  <Link
                    to={`${linkPrefix}/${location.slug || location.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{location.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {location.category && <span>{location.category}</span>}
                        {location.rating && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
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
          </div>
        )}
      </div>
    </div>
  );
}
