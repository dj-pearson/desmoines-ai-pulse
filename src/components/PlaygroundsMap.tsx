import { InteractiveMap, MapLocation } from './InteractiveMap';
import { createSlug } from '@/lib/slug';

/** Mirrors the nullable shape of public.playgrounds. These were declared
 *  optional (`number | undefined`) but the columns are nullable
 *  (`number | null`), so a row straight from the database did not satisfy this
 *  interface. The runtime already handles null - see the `!= null` guard below -
 *  only the type was wrong. */
interface Playground {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  amenities?: string[] | null;
  /** Set by the hub's Near me sort; shown in the marker popup. */
  distanceMiles?: number | null;
}

interface PlaygroundsMapProps {
  playgrounds: Playground[];
  /**
   * The visitor's position, owned by the hub (explore plan WP4 item 7). This
   * component used to call useGeolocation itself and never requestLocation,
   * so the "you are here" marker could not appear.
   */
  userLocation?: { latitude: number; longitude: number } | null;
}

const PlaygroundsMap = ({ playgrounds, userLocation }: PlaygroundsMapProps) => {
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
      distance_miles: playground.distanceMiles ?? undefined,
      type: 'playground',
    }));

  return (
    <InteractiveMap
      locations={mapLocations}
      showUserLocation={!!userLocation}
      userLocation={userLocation ?? undefined}
      linkPrefix="/playgrounds"
      height="600px"
      zoom={12}
    />
  );
};

export default PlaygroundsMap;
