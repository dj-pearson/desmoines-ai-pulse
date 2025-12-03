import { useState, lazy, Suspense } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-skeleton';
import { MapPin, Navigation, Calendar, DollarSign, List, Map as MapIcon, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEventsNearby, useGeolocation, getDistanceDisplay } from '@/hooks/useProximitySearch';
import { InteractiveMap, MapLocation } from '@/components/InteractiveMap';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// Lazy load map component
const EventsMap = lazy(() => import('@/components/InteractiveMap').then(mod => ({ default: mod.InteractiveMap })));

export default function EventsNearMe() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [category, setCategory] = useState('all');

  const { location, requestLocation, isLoading: locationLoading, error: locationError } = useGeolocation();

  const {
    items: events,
    isLoading,
    error,
    searchCenter,
  } = useEventsNearby({
    latitude: location?.latitude || 41.5868, // Default to Des Moines
    longitude: location?.longitude || -93.625,
    radiusMiles,
    category: category !== 'all' ? category : undefined,
    sortBy: 'distance',
  });

  const handleRequestLocation = () => {
    requestLocation();
    if (locationError) {
      toast({
        title: 'Location Error',
        description: locationError,
        variant: 'destructive',
      });
    }
  };

  const mapLocations: MapLocation[] = events.map(event => ({
    id: event.id,
    name: event.title,
    latitude: event.latitude!,
    longitude: event.longitude!,
    category: event.category || 'General',
    image_url: event.image_url || undefined,
    description: event.enhanced_description || event.description || undefined,
    distance_miles: event.distance_miles,
    price: event.price || undefined,
    slug: event.id,
  }));

  return (
    <>
      <SEOHead
        title="Events Near Me | Des Moines Insider"
        description="Find events happening near your location in Des Moines. Discover concerts, festivals, food events, and more within your preferred distance."
        keywords={['events near me', 'nearby events', 'Des Moines events', 'local events', 'events by distance']}
      />
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4">Events Near Me</h1>
            <p className="text-lg text-muted-foreground">
              Discover events happening around you. Adjust the radius to find events within your preferred distance.
            </p>
          </div>

          {/* Location Controls */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Your Location
              </CardTitle>
              <CardDescription>
                {location
                  ? `Showing events near ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                  : 'Using Des Moines, IA as default location'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleRequestLocation}
                disabled={locationLoading}
                variant="outline"
                className="w-full sm:w-auto"
              >
                {locationLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Navigation className="h-4 w-4 mr-2" />
                )}
                Use My Current Location
              </Button>

              {location && (
                <Badge variant="secondary" className="ml-2">
                  Accuracy: ±{location.accuracy.toFixed(0)} meters
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Radius Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Search Radius</label>
                  <span className="text-sm text-muted-foreground">{radiusMiles} miles</span>
                </div>
                <Slider
                  value={[radiusMiles]}
                  onValueChange={(value) => setRadiusMiles(value[0])}
                  min={1}
                  max={50}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 mi</span>
                  <span>50 mi</span>
                </div>
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="Music">Music</SelectItem>
                    <SelectItem value="Food">Food & Drink</SelectItem>
                    <SelectItem value="Arts & Culture">Arts & Culture</SelectItem>
                    <SelectItem value="Sports">Sports</SelectItem>
                    <SelectItem value="Community">Community</SelectItem>
                    <SelectItem value="Family">Family</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* View Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  onClick={() => setViewMode('list')}
                  className="flex-1"
                >
                  <List className="h-4 w-4 mr-2" />
                  List View
                </Button>
                <Button
                  variant={viewMode === 'map' ? 'default' : 'outline'}
                  onClick={() => setViewMode('map')}
                  className="flex-1"
                >
                  <MapIcon className="h-4 w-4 mr-2" />
                  Map View
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results Count */}
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Found {events.length} events within {radiusMiles} miles
              {location && ' of your location'}
            </p>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {/* List View */}
          {!isLoading && !error && viewMode === 'list' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map(event => (
                <Card key={event.id} className="hover:shadow-lg transition-shadow">
                  <Link to={`/events/${event.id}`}>
                    {event.image_url && (
                      <img
                        src={event.image_url}
                        alt={event.title}
                        className="w-full h-48 object-cover rounded-t-lg"
                      />
                    )}
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <CardTitle className="text-lg line-clamp-2">{event.title}</CardTitle>
                        {event.is_featured && (
                          <Badge variant="secondary" className="ml-2">Featured</Badge>
                        )}
                      </div>
                      {event.category && (
                        <Badge variant="outline" className="w-fit">
                          {event.category}
                        </Badge>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        {event.date && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(event.date), 'MMM d, yyyy')}
                          </div>
                        )}
                        {event.distance_miles !== undefined && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <MapPin className="h-4 w-4" />
                            {getDistanceDisplay(event.distance_miles)}
                          </div>
                        )}
                        {event.venue && (
                          <p className="text-muted-foreground line-clamp-1">{event.venue}</p>
                        )}
                        {event.price && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <DollarSign className="h-4 w-4" />
                            {event.price}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              ))}
            </div>
          )}

          {/* Map View */}
          {!isLoading && !error && viewMode === 'map' && (
            <Suspense fallback={<LoadingSpinner />}>
              <InteractiveMap
                locations={mapLocations}
                showUserLocation={!!location}
                userLocation={searchCenter}
                showRadius={true}
                radiusMiles={radiusMiles}
                linkPrefix="/events"
                colorByCategory={true}
                height="600px"
              />
            </Suspense>
          )}

          {/* Empty State */}
          {!isLoading && !error && events.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <MapPin className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No events found</h3>
                <p className="text-muted-foreground mb-4">
                  Try increasing the search radius or changing the category filter.
                </p>
                <Button onClick={() => setRadiusMiles(50)}>Expand Search to 50 Miles</Button>
              </CardContent>
            </Card>
          )}
        </main>
        <Footer />
      </div>
    </>
  );
}
