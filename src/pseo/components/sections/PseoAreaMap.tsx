/**
 * SEO-040 - the area guide's map: the neighbourhood boundary and a point for
 * every place and event the guide lists. Loaded lazily by PseoAreaGuide so
 * Leaflet stays out of the pSEO chunk. Circle markers rather than the default
 * pin, which would fetch its icon images from a CDN.
 */
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '@/lib/neighborhoodBoundaries';

export interface AreaMapPoint {
  id: string;
  name: string;
  href: string;
  kind: 'restaurant' | 'bar' | 'event';
  lat: number;
  lng: number;
}

interface PseoAreaMapProps {
  polygon: readonly LatLng[];
  points: AreaMapPoint[];
  label: string;
}

// Leaflet writes these as SVG attributes, which cannot read CSS variables.
const KIND_COLOR: Record<AreaMapPoint['kind'], string> = {
  restaurant: '#b45309',
  bar: '#1d4ed8',
  event: '#047857',
};

export default function PseoAreaMap({ polygon, points, label }: PseoAreaMapProps) {
  const ring = polygon.map(([lat, lng]) => [lat, lng] as [number, number]);
  return (
    <MapContainer
      bounds={ring}
      scrollWheelZoom={false}
      className="h-72 w-full rounded-xl md:h-96"
      style={{ minHeight: 288 }}
      aria-label={label}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Polygon positions={ring} pathOptions={{ color: '#475569', weight: 2, fillOpacity: 0.05 }} />
      {points.map((p) => (
        <CircleMarker
          key={`${p.kind}-${p.id}`}
          center={[p.lat, p.lng]}
          radius={7}
          pathOptions={{ color: KIND_COLOR[p.kind], fillColor: KIND_COLOR[p.kind], fillOpacity: 0.85, weight: 2 }}
        >
          <Popup>
            <a href={p.href}>{p.name}</a>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
