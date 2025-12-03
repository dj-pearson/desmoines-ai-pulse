# Location-Based Features Implementation

This document provides comprehensive documentation for the location-based features implemented in the Des Moines Insider platform.

## Overview

The platform now includes a complete suite of location-based features:
1. ✅ **Proximity Search** - Find nearby events/restaurants by distance
2. ✅ **Interactive Maps** - Leaflet/React Leaflet integration with custom markers
3. ✅ **Coordinate Auto-Backfill** - Automated lat/lng population for locations
4. ✅ **Address Validation & Autocomplete** - Standardize and suggest addresses
5. ✅ **Geofencing** - Location-based notifications/boundaries
6. ✅ **Real-Time Location Tracking** - Live position tracking for mobile app

## Architecture

### Backend Infrastructure

#### PostGIS Geospatial Database
- **Extension**: PostGIS for geospatial operations
- **Columns**: `geom geography(POINT, 4326)` on all location tables
- **Indexes**: GIST spatial indexes for fast distance queries
- **Triggers**: Auto-update geom when lat/lng changes

#### Database Tables
- `events`, `restaurants`, `attractions`, `playgrounds` - Core content with coordinates
- `geofence_regions` - Defined geographic boundaries
- `geofence_events` - Log of user geofence interactions
- `location_history` - Real-time location tracking data

#### Edge Functions
- `geocode-location` - Convert addresses to coordinates using Nominatim
- `backfill-all-coordinates` - Batch geocode missing coordinates

### Frontend Components & Hooks

#### Proximity Search Hooks
**File**: `src/hooks/useProximitySearch.ts`

Hooks for finding nearby items:
- `useEventsNearby(options)` - Search events by distance
- `useRestaurantsNearby(options)` - Search restaurants by distance
- `useGeolocation()` - Get user's current location
- `calculateDistance(lat1, lon1, lat2, lon2)` - Haversine distance calculation
- `formatDistance(miles)` - Format distance for display

#### Interactive Map Component
**File**: `src/components/InteractiveMap.tsx`

Feature-rich map component:
- Custom markers with category colors
- User location marker with radius circle
- Popup cards with details and links
- Custom zoom/center/fullscreen controls
- Auto-fit bounds to show all locations
- Location count badge

#### Location Autocomplete
**File**: `src/components/LocationAutocomplete.tsx`

Address input with autocomplete:
- Real-time address suggestions (Nominatim API)
- "Use Current Location" button
- Debounced API calls
- Address validation and standardization
- `useGeocoding()` hook for manual geocoding

#### Geofencing
**File**: `src/hooks/useGeofencing.ts`

Monitor user entering/exiting regions:
- `useGeofencing(options)` - Track geofence events
- `useGeofenceRegions()` - Manage geofence definitions
- Configurable callbacks (onEnter, onExit, onDwell)
- Browser notifications support
- Dwell time detection

#### Real-Time Location Tracking
**File**: `src/hooks/useLocationTracking.ts`

Continuous location monitoring:
- `useLocationTracking(options)` - Start/stop tracking
- `useLocationHistory(userId)` - Retrieve saved history
- Distance traveled calculation
- Average speed calculation
- Save to database option
- Location history (last 100 points)

## Database Schema

### Core Tables with Coordinates

All tables have these geospatial columns:
```sql
latitude DOUBLE PRECISION,
longitude DOUBLE PRECISION,
geom geography(POINT, 4326) -- Auto-populated from lat/lng
```

Tables: `events`, `restaurants`, `attractions`, `playgrounds`

### Geofencing Tables

**geofence_regions**
```sql
id UUID PRIMARY KEY,
name TEXT NOT NULL,
description TEXT,
latitude DOUBLE PRECISION NOT NULL,
longitude DOUBLE PRECISION NOT NULL,
radius_meters INTEGER NOT NULL,
geom geography(POINT, 4326),
active BOOLEAN DEFAULT true,
created_by UUID REFERENCES auth.users(id),
created_at TIMESTAMPTZ,
updated_at TIMESTAMPTZ,
metadata JSONB
```

**geofence_events**
```sql
id UUID PRIMARY KEY,
user_id UUID REFERENCES auth.users(id),
region_id UUID REFERENCES geofence_regions(id),
event_type TEXT CHECK (event_type IN ('enter', 'exit', 'dwell')),
latitude DOUBLE PRECISION NOT NULL,
longitude DOUBLE PRECISION NOT NULL,
timestamp TIMESTAMPTZ,
metadata JSONB
```

### Location Tracking Table

**location_history**
```sql
id UUID PRIMARY KEY,
user_id UUID NOT NULL REFERENCES auth.users(id),
latitude DOUBLE PRECISION NOT NULL,
longitude DOUBLE PRECISION NOT NULL,
accuracy DOUBLE PRECISION NOT NULL,
altitude DOUBLE PRECISION,
altitude_accuracy DOUBLE PRECISION,
heading DOUBLE PRECISION, -- Direction in degrees (0-360)
speed DOUBLE PRECISION, -- Speed in m/s
geom geography(POINT, 4326),
timestamp TIMESTAMPTZ NOT NULL,
metadata JSONB
```

## Database Functions

### Proximity Search Functions

```sql
-- Find events within radius (PostGIS)
search_events_near_location(
  user_lat REAL,
  user_lon REAL,
  radius_meters INTEGER DEFAULT 50000,
  search_limit INTEGER DEFAULT 50
) RETURNS events[]

-- Find restaurants within radius
restaurants_within_radius(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_miles DOUBLE PRECISION,
  limit_count INTEGER DEFAULT 100
) RETURNS restaurants[]

-- Find attractions within radius
attractions_within_radius(...) -- Similar signature

-- Find playgrounds within radius
playgrounds_within_radius(...) -- Similar signature
```

### Geofencing Functions

```sql
-- Check if point is in any geofence
check_geofences(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION
) RETURNS TABLE (region_id, region_name, distance_meters, is_inside)

-- Find nearby geofences
nearby_geofences(
  user_lat DOUBLE PRECISION,
  user_lon DOUBLE PRECISION,
  max_distance_meters INTEGER DEFAULT 5000
) RETURNS TABLE (id, name, description, distance_meters)
```

### Location Tracking Functions

```sql
-- Get user's location path
user_location_path(
  p_user_id UUID,
  start_time TIMESTAMPTZ DEFAULT NOW() - INTERVAL '1 day',
  end_time TIMESTAMPTZ DEFAULT NOW(),
  limit_count INTEGER DEFAULT 1000
) RETURNS TABLE (latitude, longitude, timestamp, speed, heading)

-- Calculate distance traveled
calculate_distance_traveled(
  p_user_id UUID,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ
) RETURNS DOUBLE PRECISION -- meters

-- Find most visited locations (clustering)
user_most_visited_locations(
  p_user_id UUID,
  radius_meters INTEGER DEFAULT 100,
  min_visits INTEGER DEFAULT 3,
  limit_count INTEGER DEFAULT 10
) RETURNS TABLE (center_lat, center_lng, visit_count, first_visit, last_visit)

-- Cleanup old data (run via cron)
cleanup_old_location_history(
  days_to_keep INTEGER DEFAULT 90
) RETURNS INTEGER
```

## Usage Examples

### 1. Proximity Search - Events Near Me

```typescript
import { useEventsNearby, useGeolocation } from '@/hooks/useProximitySearch';

function EventsNearMe() {
  const { location, requestLocation, isLoading: locationLoading } = useGeolocation();
  
  const { items: events, isLoading } = useEventsNearby({
    latitude: location?.latitude || 41.5868,
    longitude: location?.longitude || -93.625,
    radiusMiles: 10,
    category: 'Music',
    sortBy: 'distance',
  });

  return (
    <div>
      <button onClick={requestLocation}>Use My Location</button>
      {events.map(event => (
        <div key={event.id}>
          <h3>{event.title}</h3>
          <p>{event.distance_miles} miles away</p>
        </div>
      ))}
    </div>
  );
}
```

### 2. Interactive Map with User Location

```typescript
import { InteractiveMap, MapLocation } from '@/components/InteractiveMap';
import { useGeolocation } from '@/hooks/useProximitySearch';

function RestaurantsMapView() {
  const { location } = useGeolocation();
  const { restaurants } = useRestaurants();

  const mapLocations: MapLocation[] = restaurants.map(r => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    category: r.cuisine,
    slug: r.slug,
    image_url: r.image_url,
    rating: r.rating,
  }));

  return (
    <InteractiveMap
      locations={mapLocations}
      showUserLocation={true}
      userLocation={location}
      showRadius={true}
      radiusMiles={5}
      linkPrefix="/restaurants"
      colorByCategory={true}
      height="600px"
    />
  );
}
```

### 3. Address Autocomplete

```typescript
import { LocationAutocomplete } from '@/components/LocationAutocomplete';

function EventSubmissionForm() {
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);

  const handleSelect = (result) => {
    setAddress(result.display_name);
    setCoordinates({ lat: parseFloat(result.lat), lng: parseFloat(result.lon) });
  };

  return (
    <form>
      <LocationAutocomplete
        value={address}
        onChange={(value) => setAddress(value)}
        onSelect={handleSelect}
        placeholder="Enter event location..."
        showCurrentLocation={true}
        filterToRegion="Iowa"
      />
      {coordinates && (
        <p>Coordinates: {coordinates.lat}, {coordinates.lng}</p>
      )}
    </form>
  );
}
```

### 4. Geofencing

```typescript
import { useGeofencing, GeofenceEvent } from '@/hooks/useGeofencing';

function GeofenceDemo() {
  const regions = [
    {
      id: '1',
      name: 'Downtown Des Moines',
      latitude: 41.5868,
      longitude: -93.6250,
      radiusMeters: 2000,
      active: true,
    },
  ];

  const handleEnter = (event: GeofenceEvent) => {
    console.log(`Entered ${event.region.name}`);
    // Show welcome notification, special offers, etc.
  };

  const handleExit = (event: GeofenceEvent) => {
    console.log(`Left ${event.region.name}`);
  };

  const { activeRegions, isTracking, startTracking, stopTracking } = useGeofencing({
    regions,
    onEnter: handleEnter,
    onExit: handleExit,
    enableNotifications: true,
    dwellTimeMs: 300000, // 5 minutes
  });

  return (
    <div>
      <button onClick={isTracking ? stopTracking : startTracking}>
        {isTracking ? 'Stop Tracking' : 'Start Tracking'}
      </button>
      <p>Active regions: {activeRegions.join(', ')}</p>
    </div>
  );
}
```

### 5. Real-Time Location Tracking

```typescript
import { useLocationTracking, formatDistance, formatSpeed } from '@/hooks/useLocationTracking';

function TripTracker() {
  const {
    currentLocation,
    distanceTraveled,
    averageSpeed,
    isTracking,
    startTracking,
    stopTracking,
    clearHistory,
  } = useLocationTracking({
    enableHighAccuracy: true,
    trackingInterval: 5000, // Update every 5 seconds
    saveToDatabase: true,
    onLocationUpdate: (location) => {
      console.log('New location:', location);
    },
  });

  return (
    <div>
      <button onClick={isTracking ? stopTracking : startTracking}>
        {isTracking ? 'Stop Trip' : 'Start Trip'}
      </button>
      
      {currentLocation && (
        <div>
          <p>Location: {currentLocation.latitude}, {currentLocation.longitude}</p>
          <p>Accuracy: ±{currentLocation.accuracy.toFixed(0)} meters</p>
          <p>Distance: {formatDistance(distanceTraveled)}</p>
          <p>Speed: {formatSpeed(averageSpeed)}</p>
        </div>
      )}
      
      <button onClick={clearHistory}>Clear History</button>
    </div>
  );
}
```

## Migrations

Run these migrations in order:

1. **20250107000008_add_postgis_geospatial.sql** - PostGIS setup, geom columns, triggers
2. **20251110000000_add_geospatial_proximity_search.sql** - Proximity search functions
3. **20251203000002_enhanced_coordinate_auto_backfill.sql** - Auto-geocoding system
4. **20251203000003_add_geofencing.sql** - Geofencing infrastructure
5. **20251203000004_add_location_tracking.sql** - Location tracking tables

```bash
# Apply migrations
supabase db push

# Run coordinate backfill
supabase functions invoke backfill-all-coordinates
```

## Security & Privacy

### Row Level Security (RLS)

All location tables have RLS enabled:

- **Content tables** (events, restaurants, attractions): Public read, authenticated write
- **geofence_regions**: Public read for active regions, authenticated create/update
- **geofence_events**: Users can only see their own events
- **location_history**: Users can only access their own location data
- **Admins**: Full access to all data

### Privacy Features

1. **User Control**: Users must grant location permission
2. **Data Retention**: Location history auto-deleted after 90 days
3. **Transparency**: Clear indicators when tracking is active
4. **Opt-out**: Easy to stop tracking and delete history

### Permission Handling

```typescript
const { permissionStatus, startTracking } = useLocationTracking();

if (permissionStatus === 'denied') {
  // Show instructions to enable location in browser settings
}
```

## Performance Optimization

### Database Indexes

All location tables have:
- GIST spatial indexes on `geom` column
- B-tree indexes on `latitude`, `longitude`
- Composite indexes on frequently queried columns

### API Rate Limiting

- Nominatim geocoding: Max 1 request/second (enforced by delay)
- Batch geocoding: Process in chunks of 5 with delays
- Use edge function caching where possible

### Frontend Optimization

- Debounced autocomplete (500ms default)
- Lazy-loaded map component
- Location caching (5-minute maximumAge)
- Efficient re-renders with useCallback/useMemo

## Testing

### Test Proximity Search
```typescript
const { items, isLoading } = useEventsNearby({
  latitude: 41.5868,
  longitude: -93.625,
  radiusMiles: 10,
});
// Should return events within 10 miles of Des Moines
```

### Test Geofencing
```typescript
const regions = [{ id: '1', name: 'Test', latitude: 41.5868, longitude: -93.625, radiusMeters: 1000 }];
const { activeRegions } = useGeofencing({ regions, onEnter: console.log });
// Move device location into region, should trigger onEnter
```

### Test Location Tracking
```typescript
const { currentLocation, startTracking } = useLocationTracking();
await startTracking();
// currentLocation should update with device position
```

## Troubleshooting

### Geocoding Issues
- **Problem**: Address not found
- **Solution**: Try simpler address (e.g., just street + city), or use coordinates directly

### Map Not Showing
- **Problem**: Leaflet CSS not loading
- **Solution**: Ensure `leaflet/dist/leaflet.css` is imported, check console for errors

### Location Permission Denied
- **Problem**: Browser blocks location access
- **Solution**: Check browser settings, use HTTPS, show clear permission request UI

### Distance Calculations Inaccurate
- **Problem**: Wrong distances returned
- **Solution**: Verify coordinates are in correct order (latitude, longitude), check units (meters vs miles)

## Future Enhancements

- [ ] Add marker clustering (requires compatible react-leaflet-cluster)
- [ ] Implement route planning between locations
- [ ] Add heatmap visualization for location density
- [ ] Support for custom map tile providers
- [ ] Offline map caching for mobile app
- [ ] Advanced geofencing shapes (polygons, not just circles)
- [ ] Location-based push notifications
- [ ] Travel time estimates (driving, walking, transit)

## References

- [PostGIS Documentation](https://postgis.net/documentation/)
- [Leaflet API](https://leafletjs.com/reference.html)
- [React Leaflet](https://react-leaflet.js.org/)
- [Nominatim API](https://nominatim.org/release-docs/develop/api/Overview/)
- [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)

## Support

For issues or questions, refer to:
- `CLAUDE.md` - General development guide
- `DEVELOPER_GUIDE.md` - Detailed development patterns
- This file (`LOCATION_FEATURES.md`) - Location features documentation
