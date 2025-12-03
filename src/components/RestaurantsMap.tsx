import { InteractiveMap, MapLocation } from './InteractiveMap';
import { useGeolocation } from '@/hooks/useProximitySearch';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  latitude?: number;
  longitude?: number;
  cuisine?: string;
  rating?: number;
  image_url?: string;
  description?: string;
  price_range?: string;
}

interface RestaurantsMapProps {
  restaurants: Restaurant[];
}

const RestaurantsMap = ({ restaurants }: RestaurantsMapProps) => {
  const { location } = useGeolocation();

  const mapLocations: MapLocation[] = restaurants
    .filter(r => r.latitude != null && r.longitude != null)
    .map(restaurant => ({
      id: restaurant.id,
      name: restaurant.name,
      latitude: restaurant.latitude!,
      longitude: restaurant.longitude!,
      slug: restaurant.slug,
      category: restaurant.cuisine,
      rating: restaurant.rating,
      image_url: restaurant.image_url,
      description: restaurant.description,
      price: restaurant.price_range,
      type: 'restaurant',
    }));

  return (
    <InteractiveMap
      locations={mapLocations}
      showUserLocation={!!location}
      userLocation={location}
      linkPrefix="/restaurants"
      colorByCategory={true}
      height="600px"
      zoom={12}
    />
  );
};

export default RestaurantsMap;
