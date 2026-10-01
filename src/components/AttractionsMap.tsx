import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Link } from "react-router-dom";
import { attractionFactParts, type AttractionFactFields } from "@/lib/attractionHours";
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

/** Downtown Des Moines, for the one case with nothing to fit. */
const DEFAULT_CENTER: [number, number] = [41.5868, -93.625];

export interface AttractionsMapRow extends AttractionFactFields {
  id: string;
  name: string;
  type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface AttractionsMapProps {
  attractions: AttractionsMapRow[];
  /**
   * The clock for today's status in each popup. Null under prerender, which
   * leaves the status out (explore pass 2 WP3 item 3).
   */
  now?: Date | null;
}

function hasCoords(a: AttractionsMapRow): a is AttractionsMapRow & { latitude: number; longitude: number } {
  return (
    a.latitude != null &&
    a.longitude != null &&
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude) &&
    (a.latitude !== 0 || a.longitude !== 0)
  );
}

/**
 * Fits the view to the pins (explore pass 2 WP3 item 9). A fixed zoom-12
 * centre cut off Ankeny and West Des Moines, and a filtered list of three
 * downtown museums opened at city scale.
 */
function FitToPins({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 });
    // `key` stands for `points`, whose identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

const AttractionsMap = ({ attractions, now = null }: AttractionsMapProps) => {
  const located = attractions.filter(hasCoords);
  const missing = attractions.length - located.length;
  const points = located.map((a) => [a.latitude, a.longitude] as [number, number]);

  return (
    <div>
      {missing > 0 && (
        <p className="mb-2 text-sm text-muted-foreground" data-map-missing="">
          {missing} of {attractions.length} attractions have no map location, so they are only in the list.
        </p>
      )}
      <MapContainer center={DEFAULT_CENTER} zoom={12} className="h-[600px] w-full rounded-lg">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitToPins points={points} />
        {located.map((attraction) => {
          const facts = attractionFactParts(attraction, now);
          return (
            <Marker key={attraction.id} position={[attraction.latitude, attraction.longitude]}>
              <Popup>
                <Link to={`/attractions/${createSlug(attraction.name)}`} className="font-semibold">
                  {attraction.name}
                </Link>
                {attraction.type && <span className="block text-xs">{attraction.type}</span>}
                {facts.length > 0 && <span className="block text-xs">{facts.join(", ")}</span>}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default AttractionsMap;
