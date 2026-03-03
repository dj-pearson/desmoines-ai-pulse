/**
 * EventLocationMap - Leaflet map for event details sidebar.
 * Uses OpenStreetMap tiles (tile.openstreetmap.org) instead of the deprecated
 * embed iframe (www.openstreetmap.org/export/embed.html) which returns
 * "refused to connect" due to X-Frame-Options / frame-ancestors restrictions.
 */
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix default icon paths for bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface EventLocationMapProps {
  latitude: number;
  longitude: number;
  venue?: string | null;
  location?: string | null;
  className?: string;
}

export function EventLocationMap({
  latitude,
  longitude,
  venue,
  location,
  className = "h-48 w-full rounded-lg",
}: EventLocationMapProps) {
  const label = venue || location || "Event location";

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      scrollWheelZoom={false}
      className={className}
      style={{ minHeight: 192 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <Marker position={[latitude, longitude]}>
        <Popup>{label}</Popup>
      </Marker>
    </MapContainer>
  );
}
