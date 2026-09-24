import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Link } from "react-router-dom";
// Bundled from the leaflet package rather than fetched from unpkg.com, so the
// map has no third-party request and no version drift (Explore plan WP3 item 9).
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet guesses its image path from the CSS URL, which a bundler breaks;
// dropping the private resolver makes it use the URLs below.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

interface Attraction {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
}

interface AttractionsMapProps {
  attractions: Attraction[];
}

const AttractionsMap = ({ attractions }: AttractionsMapProps) => {
  const validAttractions = attractions.filter(
    (a) => a.latitude != null && a.longitude != null
  );

  return (
    <MapContainer
      center={[41.5868, -93.625]}
      zoom={12}
      className="h-[600px] w-full rounded-lg"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {validAttractions.map((attraction) => (
        <Marker
          key={attraction.id}
          position={[attraction.latitude as number, attraction.longitude as number]}
        >
          <Popup>
            <Link to={`/attractions/${createSlug(attraction.name)}`}>
              {attraction.name}
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default AttractionsMap;
