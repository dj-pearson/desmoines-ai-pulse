# Location Features - Quick Reference Guide

## Quick Start

### 1. Apply Database Migrations
```bash
cd /workspace
supabase db push
```

### 2. Run Coordinate Backfill
```bash
supabase functions invoke backfill-all-coordinates
```

### 3. Add Route to App
In `src/App.tsx`, add:
```typescript
import EventsNearMe from '@/pages/EventsNearMe';

// In routes:
<Route path="/events/near-me" element={<EventsNearMe />} />
```

## Hook Usage

### Find Nearby Events
```typescript
import { useEventsNearby, useGeolocation } from '@/hooks/useProximitySearch';

const { location, requestLocation } = useGeolocation();
const { items: events } = useEventsNearby({
  latitude: location?.latitude || 41.5868,
  longitude: location?.longitude || -93.625,
  radiusMiles: 10,
});
```

### Show Interactive Map
```typescript
import { InteractiveMap } from '@/components/InteractiveMap';

<InteractiveMap
  locations={mapLocations}
  showUserLocation={true}
  userLocation={location}
  showRadius={true}
  radiusMiles={5}
  linkPrefix="/events"
  colorByCategory={true}
/>
```

### Address Autocomplete
```typescript
import { LocationAutocomplete } from '@/components/LocationAutocomplete';

<LocationAutocomplete
  value={address}
  onChange={(value) => setAddress(value)}
  onSelect={(result) => {
    setCoords({ lat: result.lat, lng: result.lon });
  }}
  showCurrentLocation={true}
/>
```

### Geofencing
```typescript
import { useGeofencing } from '@/hooks/useGeofencing';

const { activeRegions, startTracking } = useGeofencing({
  regions: myRegions,
  onEnter: (event) => console.log('Entered', event.region.name),
  enableNotifications: true,
});
```

### Location Tracking
```typescript
import { useLocationTracking } from '@/hooks/useLocationTracking';

const {
  currentLocation,
  distanceTraveled,
  isTracking,
  startTracking,
  stopTracking,
} = useLocationTracking({
  enableHighAccuracy: true,
  saveToDatabase: true,
});
```

## Database Functions

### Find Events Within Radius
```sql
SELECT * FROM search_events_near_location(
  41.5868,  -- latitude
  -93.625,  -- longitude
  16093,    -- radius in meters (10 miles)
  50        -- limit
);
```

### Find Restaurants Within Radius
```sql
SELECT * FROM restaurants_within_radius(
  41.5868,  -- latitude
  -93.625,  -- longitude
  5.0,      -- radius in miles
  100       -- limit
);
```

### Check Geofences
```sql
SELECT * FROM check_geofences(41.5868, -93.625);
```

### Get User Location Path
```sql
SELECT * FROM user_location_path(
  'user-uuid',
  NOW() - INTERVAL '1 day',
  NOW()
);
```

## Component Props

### InteractiveMap
```typescript
interface InteractiveMapProps {
  locations: MapLocation[];        // Array of locations to display
  center?: [number, number];       // Map center [lat, lng]
  zoom?: number;                   // Initial zoom level (default 12)
  className?: string;              // Additional CSS classes
  height?: string;                 // Map height (default '600px')
  showClustering?: boolean;        // Enable marker clustering (not yet implemented)
  showUserLocation?: boolean;      // Show user's location
  userLocation?: { latitude: number; longitude: number };
  showRadius?: boolean;            // Show radius circle around user
  radiusMiles?: number;            // Radius size in miles (default 25)
  onLocationClick?: (location: MapLocation) => void;
  linkPrefix?: string;             // URL prefix for location links
  colorByCategory?: boolean;       // Color markers by category
}
```

### LocationAutocomplete
```typescript
interface LocationAutocompleteProps {
  value?: string;                  // Current input value
  onChange?: (value: string, result?: AddressResult) => void;
  onSelect?: (result: AddressResult) => void;
  placeholder?: string;            // Input placeholder
  className?: string;              // Additional CSS classes
  disabled?: boolean;              // Disable input
  showCurrentLocation?: boolean;   // Show "Use Current Location" button
  onCurrentLocationClick?: (coords: { latitude: number; longitude: number }) => void;
  debounceMs?: number;             // Debounce delay (default 500)
  minCharacters?: number;          // Min chars to trigger search (default 3)
  maxResults?: number;             // Max autocomplete results (default 5)
  filterToRegion?: string;         // Filter results to region (e.g., 'Iowa')
}
```

## Utility Functions

### Distance Calculations
```typescript
import { calculateDistance, formatDistance, getDistanceDisplay } from '@/hooks/useProximitySearch';

const miles = calculateDistance(lat1, lon1, lat2, lon2); // Haversine
const display = formatDistance(miles);                    // "5.2 mi"
const text = getDistanceDisplay(miles);                   // "5.2 mi away"
```

### Speed Formatting
```typescript
import { formatSpeed } from '@/hooks/useLocationTracking';

const speedText = formatSpeed(metersPerSecond); // "25.3 mph"
```

### Address Validation
```typescript
import { validateAddress } from '@/components/LocationAutocomplete';

const result = validateAddress(address);
if (result.isValid) {
  console.log('Standardized:', result.standardized);
} else {
  console.log('Errors:', result.errors);
}
```

## Environment Variables

Add to `.env`:
```bash
# No additional env vars needed for location features!
# Uses existing Supabase configuration
```

## Common Patterns

### Events Near Me Page
See `/workspace/src/pages/EventsNearMe.tsx` for complete example with:
- Location permission handling
- Radius slider
- Category filtering
- List/Map view toggle
- Distance display
- Loading/error states

### Map with User Location
```typescript
const { location } = useGeolocation();
const { restaurants } = useRestaurants();

<InteractiveMap
  locations={restaurants.map(r => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    category: r.cuisine,
    slug: r.slug,
  }))}
  showUserLocation={!!location}
  userLocation={location}
  showRadius={true}
  radiusMiles={5}
/>
```

## Troubleshooting

### Permission Denied
```typescript
const { permissionStatus } = useGeolocation();

if (permissionStatus === 'denied') {
  // Show message: "Enable location in browser settings"
}
```

### No Results Found
- Increase search radius
- Check if coordinates exist in database
- Verify PostGIS extension is enabled

### Map Not Loading
- Ensure `leaflet/dist/leaflet.css` is imported
- Check browser console for errors
- Verify locations have valid coordinates

### Geocoding Fails
- Try simpler address format
- Check Nominatim rate limits (1 req/sec)
- Use coordinates directly if address is problematic

## Performance Tips

1. **Lazy load maps**: Use `lazy()` for map components
2. **Debounce autocomplete**: Default 500ms is good
3. **Cache location**: Use 5-minute maximumAge
4. **Limit results**: Keep limit reasonable (50-100)
5. **Use indexes**: Ensure GIST indexes on geom columns

## Security Checklist

- [x] RLS enabled on all location tables
- [x] Users can only access own location data
- [x] Location permission explicitly requested
- [x] 90-day data cleanup configured
- [x] HTTPS required for geolocation
- [x] No third-party tracking

## For More Information

- **Full Documentation**: `/workspace/docs/LOCATION_FEATURES.md`
- **Implementation Summary**: `/workspace/IMPLEMENTATION_SUMMARY.md`
- **Main Guide**: `/workspace/CLAUDE.md`
