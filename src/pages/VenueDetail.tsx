import { useParams, Link } from 'react-router-dom';
import { createEventSlugWithCentralTime, formatEventPart, formatEventTimeOnly } from "@/lib/timezone";
import { RouteCanonical } from "@/components/RouteCanonical";
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
import { ErrorState } from '@/components/ui/error-state';
import { NearbyHotels } from '@/components/venues/NearbyHotels';
import { buildEventItemList } from '@/lib/eventSchema';
import { toJsonLd } from '@/lib/jsonLd';
import { buildVenueJsonLd, currentVenueName, venueCity, venuePageUrl } from '@/lib/venuePages';
import { BRAND } from '@/lib/brandConfig';
import { safeHttpUrl } from '@/lib/safeUrl';
import type { Event } from '@/lib/types';

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
  const { data: venue, isLoading, error: venueError, refetch: refetchVenue } = useVenue(slug || '');
  // The venue row, not just its name, so its aliases reach the matcher
  // (explore pass 2 WP5 item 2: "Casey's Center" rows belong to the arena).
  const {
    data: events,
    error: eventsError,
    refetch: refetchEvents,
    isPending: eventsPending,
    status: eventsStatus,
  } = useVenueEvents(venue ? { name: venue.name, slug: venue.slug } : '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/music/venues/${slug}`} />
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

  /**
   * WEB-QA-032. A failed load used to fall straight through to the not-found
   * branch below, which renders "venue not found" AND a noindex. On a real
   * venue whose page merely failed to load that is a deindexing risk, not
   * just bad copy - Googlebot hitting the site during a backend blip would be
   * told the page should not be indexed. A failure and a missing row are
   * different answers and get different pages.
   */
  if (venueError) {
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={`/music/venues/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-16">
          <ErrorState error={venueError} onRetry={() => refetchVenue()} />
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

  // The row can still carry the arena's old name; every reader-facing string
  // uses the current one (explore-pass2 WP5 acceptance). Matching keeps the
  // row name, which is what useVenueEvents' aliases are keyed from.
  const venueName = currentVenueName(venue.name);
  const city = venueCity(venue.address) || BRAND.city;
  // Admin-written; a javascript: value must never become a link (item 11).
  const websiteUrl = safeHttpUrl(venue.website);
  const upcoming = (events ?? []) as unknown as Event[];
  const next = upcoming[0];
  const nextWhen = next ? formatEventPart(next, 'EEEE, MMMM d') : null;
  // The answer-first sentence, from the row and the list only.
  const summary = [
    `${venueName} is ${venue.address ? `at ${venue.address}` : `in ${city}, ${BRAND.state}`}.`,
    eventsStatus === 'success' && upcoming.length > 0
      ? `${upcoming.length === 1 ? 'One upcoming event is' : `${upcoming.length} upcoming events are`} listed here${next && nextWhen ? `, the next on ${nextWhen}: ${next.title}` : ''}.`
      : null,
  ].filter(Boolean).join(' ');
  const metaDescription = upcoming.length > 0
    ? `${upcoming.length} upcoming event${upcoming.length === 1 ? '' : 's'} at ${venueName} in ${city}${next && nextWhen ? `, starting with ${next.title} on ${nextWhen}` : ''}. Dates, times, tickets and directions.`
    : `Events at ${venueName} in ${city}, ${BRAND.state}: address, directions and upcoming shows as they are announced.`;

  return (
    <>
      {/* WEB-SEO-033. RouteCanonical was only in the LOADING branch, so the
          canonical existed for the few hundred milliseconds before the fetch
          resolved and then vanished. A crawler that executes JS sees the
          settled DOM, which had none -- and SEO-028 put it in the loading
          branch precisely because the canonical must not wait for data, not
          because it should stop existing once data arrives. It belongs in
          both. */}
      <RouteCanonical path={`/music/venues/${slug}`} />
      {/* SEO-018. Title and description are built from the row and the
          event list, so they answer the query this page exists for - "what is
          on at <venue>" - instead of restating the seed's marketing copy. */}
      <Helmet>
        <title>{`Upcoming Events at ${venueName}, ${city}`}</title>
        <meta name="description" content={metaDescription} />
        <meta property="og:title" content={`Upcoming Events at ${venueName}, ${city}`} />
        <meta property="og:description" content={metaDescription} />
        <script type="application/ld+json">{toJsonLd(buildVenueJsonLd({ ...venue, name: venueName }))}</script>
        {upcoming.length > 0 && (
          <script type="application/ld+json">
            {toJsonLd(
              buildEventItemList(upcoming, {
                name: `Upcoming events at ${venueName}`,
                description: `Events scheduled at ${venueName}, ${city}, ${BRAND.state}.`,
                url: venuePageUrl(venue),
              }),
            )}
          </script>
        )}
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-6">
            <Link to="/music" className="hover:text-primary">Music</Link>
            <span className="mx-2">/</span>
            <Link to="/events" className="hover:text-primary">Events</Link>
            <span className="mx-2">/</span>
            <span>{venueName}</span>
          </nav>

          {/* Venue Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">{venueName}</h1>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              {venue.venue_type && (
                <Badge variant="secondary">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</Badge>
              )}
              {/* NO CAPACITY BADGE (SEO-018). The seed migration hard-codes a
                  capacity per venue that nobody verified, and seating capacity
                  is one of the fields the story names as not to assert. */}
            </div>
            <p id="venue-summary" className="text-lg text-foreground max-w-3xl mb-2">{summary}</p>
            {venue.description && (
              <p className="text-muted-foreground max-w-3xl">{venue.description}</p>
            )}
          </div>

          {/* Venue Info */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-2 flex items-center gap-2"><SpriteIcon name="map-pin" className="h-4 w-4" /> Location</h3>
                {venue.address && <p className="text-sm text-muted-foreground mb-3">{venue.address}</p>}
                {directionsUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                      <Navigation className="h-4 w-4 mr-1" aria-hidden="true" /> Get Directions
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
            {websiteUrl && (
              <Card>
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-2 flex items-center gap-2"><SpriteIcon name="external-link" className="h-4 w-4" /> Website</h3>
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm break-all">
                    {websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                  </a>
                </CardContent>
              </Card>
            )}
            <NearbyHotels latitude={venue.latitude} longitude={venue.longitude} placeName={venueName} limit={4} nearSlug={venue.slug} />
          </div>

          {/* Upcoming Events */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="calendar" className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Upcoming Events at {venueName}</h2>
            </div>
            {/* Item 7: loading is not empty. Skeletons while the request is
                in flight; "No upcoming events" only once it has answered with
                zero rows. */}
            {eventsPending ? (
              <div className="space-y-3" aria-busy="true" data-venue-events-loading="">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
                ))}
              </div>
            ) : events && events.length > 0 ? (
              <div className="space-y-3">
                {events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                    className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Card className="hover:border-primary transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <p className="text-xs text-muted-foreground uppercase">
                            {formatEventPart(event, 'MMM')}
                          </p>
                          <p className="text-2xl font-bold">
                            {formatEventPart(event, 'd')}
                          </p>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold">{event.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {formatEventPart(event, 'EEEE')}
                            {' · '}
                            {formatEventTimeOnly(event) ?? 'Time TBA'}
                          </p>
                        </div>
                        {event.price && <Badge variant="outline">{event.price}</Badge>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              eventsError ? (
                <ErrorState error={eventsError} compact onRetry={refetchEvents} />
              ) : eventsStatus === 'success' ? (
                <p className="text-muted-foreground">No upcoming events listed for this venue.</p>
              ) : null
            )}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
