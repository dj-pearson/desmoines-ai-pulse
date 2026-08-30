import { useParams, Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useVenue, useVenueEvents } from '@/hooks/useVenues';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Navigation } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const VENUE_TYPE_LABELS: Record<string, string> = {
  arena: 'Arena',
  theater: 'Theater',
  bar: 'Bar & Lounge',
  club: 'Music Club',
  outdoor: 'Outdoor Venue',
  civic: 'Civic Center',
};

export default function VenueDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: venue, isLoading } = useVenue(slug || '');
  const { data: events } = useVenueEvents(venue?.name || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-48 w-full mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-background">
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Venue Not Found</h1>
          <Link to="/music" className="text-primary hover:underline">Back to Music Hub</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const directionsUrl = venue.latitude && venue.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`
    : venue.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venue.address)}`
      : null;

  return (
    <>
      <Helmet>
        <title>{venue.name} — Des Moines Venue Guide | Des Moines Insider</title>
        <meta name="description" content={venue.description || `${venue.name} — live music and events venue in Des Moines, Iowa.`} />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-muted-foreground mb-6">
            <Link to="/music" className="hover:text-primary">Music</Link>
            <span className="mx-2">/</span>
            <Link to="/music" className="hover:text-primary">Venues</Link>
            <span className="mx-2">/</span>
            <span>{venue.name}</span>
          </nav>

          {/* Venue Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">{venue.name}</h1>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              {venue.venue_type && (
                <Badge variant="secondary">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</Badge>
              )}
              {venue.capacity && (
                <Badge variant="outline">
                  <SpriteIcon name="users" className="h-3 w-3 mr-1" />
                  Capacity: {venue.capacity.toLocaleString()}
                </Badge>
              )}
            </div>
            {venue.description && (
              <p className="text-lg text-muted-foreground max-w-3xl">{venue.description}</p>
            )}
          </div>

          {/* Venue Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-2 flex items-center gap-2"><SpriteIcon name="map-pin" className="h-4 w-4" /> Location</h3>
                {venue.address && <p className="text-sm text-muted-foreground mb-3">{venue.address}</p>}
                {directionsUrl && (
                  <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Navigation className="h-4 w-4 mr-1" /> Get Directions
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
            {venue.website && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><SpriteIcon name="external-link" className="h-4 w-4" /> Website</h3>
                  <a href={venue.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm break-all">
                    {venue.website.replace(/^https?:\/\//, '')}
                  </a>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Upcoming Events */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="calendar" className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Upcoming Events at {venue.name}</h2>
            </div>
            {events && events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <Link key={event.id} to={`/events/${event.id}`}>
                    <Card className="hover:border-primary transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <p className="text-xs text-muted-foreground uppercase">
                            {new Date(event.date).toLocaleDateString([], { month: 'short' })}
                          </p>
                          <p className="text-2xl font-bold">
                            {new Date(event.date).getDate()}
                          </p>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold">{event.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {new Date(event.date).toLocaleDateString([], { weekday: 'long' })}
                            {' · '}
                            {new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                        {event.price && <Badge variant="outline">{event.price}</Badge>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No upcoming events listed for this venue.</p>
            )}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
