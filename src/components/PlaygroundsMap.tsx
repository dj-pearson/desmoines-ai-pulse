import { InteractiveMap, MapLocation } from './InteractiveMap';
import { useGeolocation } from '@/hooks/useProximitySearch';

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

/** Mirrors the nullable shape of public.playgrounds. These were declared
 *  optional (`number | undefined`) but the columns are nullable
 *  (`number | null`), so a row straight from the database did not satisfy this
 *  interface. The runtime already handles null — see the `!= null` guard below —
 *  only the type was wrong. */
interface Playground {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  amenities?: string[] | null;
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
      // MapLocation.description is `string | undefined`; the column is nullable,
      // so convert at the boundary rather than loosening MapLocation.
      description: playground.description ?? undefined,
      type: 'playground',
    }));

  return (
    <InteractiveMap
      locations={mapLocations}
      showUserLocation={!!location}
      // useGeolocation returns null when unavailable and also carries `accuracy`,
      // which InteractiveMap does not accept — narrow to the two fields it wants.
      userLocation={location ? { latitude: location.latitude, longitude: location.longitude } : undefined}
      linkPrefix="/playgrounds"
      height="600px"
      zoom={12}
    />
  );
};

export default PlaygroundsMap;
