
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

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  latitude?: number;
  longitude?: number;
}

interface RestaurantsMapProps {
  restaurants: Restaurant[];
}

const RestaurantsMap = ({ restaurants }: RestaurantsMapProps) => {
  const validRestaurants = restaurants.filter(
    (r) => r.latitude != null && r.longitude != null
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
      {validRestaurants.map((restaurant) => (
        <Marker
          key={restaurant.id}
          position={[restaurant.latitude!, restaurant.longitude!]}
        >
          <Popup>
            <Link to={`/restaurants/${restaurant.slug || restaurant.id}`}>
              {restaurant.name}
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

export default RestaurantsMap;
