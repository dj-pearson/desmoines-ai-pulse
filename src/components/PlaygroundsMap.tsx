
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Link } from "react-router-dom";

// Fix for default icon issue with Webpack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

interface Playground {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

interface PlaygroundsMapProps {
  playgrounds: Playground[];
}

const PlaygroundsMap = ({ playgrounds }: PlaygroundsMapProps) => {
  const validPlaygrounds = playgrounds.filter(
    (p) => p.latitude != null && p.longitude != null
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
      {validPlaygrounds.map((playground) => (
        <Marker
          key={playground.id}
          position={[playground.latitude!, playground.longitude!]}
        >
          <Popup>
            <Link to={`/playgrounds/${createSlug(playground.name)}`}>
              {playground.name}
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default PlaygroundsMap;
