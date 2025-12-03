import { InteractiveMap, MapLocation } from './InteractiveMap';
import { useGeolocation } from '@/hooks/useProximitySearch';

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
  description?: string;
  amenities?: string[];
}

interface PlaygroundsMapProps {
  playgrounds: Playground[];
}

const PlaygroundsMap = ({ playgrounds }: PlaygroundsMapProps) => {
  const { location } = useGeolocation();

  const mapLocations: MapLocation[] = playgrounds
    .filter(p => p.latitude != null && p.longitude != null)
    .map(playground => ({
      id: playground.id,
      name: playground.name,
      latitude: playground.latitude!,
      longitude: playground.longitude!,
      slug: createSlug(playground.name),
      description: playground.description,
      type: 'playground',
    }));

  return (
    <InteractiveMap
      locations={mapLocations}
      showUserLocation={!!location}
      userLocation={location}
      linkPrefix="/playgrounds"
      height="600px"
      zoom={12}
    />
  );
};

export default PlaygroundsMap;
