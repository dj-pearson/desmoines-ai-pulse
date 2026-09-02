import { Link } from 'react-router-dom';
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { EventListJsonLd } from '@/components/schema/EventListJsonLd';
import { getCanonicalUrl } from '@/lib/brandConfig';
import type { Event } from '@/lib/types';
import { useVenues } from '@/hooks/useVenues';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Music } from "lucide-react";
import { Button } from '@/components/ui/button';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const GENRE_FILTERS = ['All', 'Rock', 'Country', 'Jazz', 'Hip-Hop', 'Electronic', 'Classical', 'Blues', 'Folk'];

function useMusicEvents(timeframe: 'tonight' | 'weekend' | 'upcoming') {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const friday = new Date(now);
  friday.setDate(now.getDate() + ((5 - now.getDay() + 7) % 7));
  const weekendStart = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate()).toISOString();
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 3);
  const weekendEnd = sunday.toISOString();

  return useQuery({
    queryKey: ['music-events', timeframe],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .or('category.ilike.%Music%,category.ilike.%Concert%,category.ilike.%Live Music%')
        .order('date', { ascending: true })
        .limit(20);

      if (timeframe === 'tonight') {
        query = query.gte('date', todayStart).lt('date', todayEnd);
      } else if (timeframe === 'weekend') {
        query = query.gte('date', weekendStart).lt('date', weekendEnd);
      } else {
        query = query.gte('date', now.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

const VENUE_TYPE_LABELS: Record<string, string> = {
  arena: 'Arena',
  theater: 'Theater',
  bar: 'Bar & Lounge',
  club: 'Music Club',
  outdoor: 'Outdoor',
  civic: 'Civic Center',
};

export default function MusicHub() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const { data: tonightShows } = useMusicEvents('tonight');
  const { data: weekendShows } = useMusicEvents('weekend');
  const { data: upcomingShows } = useMusicEvents('upcoming');

  const canonicalUrl = getCanonicalUrl('/music');
  const pageDescription =
    "Discover live music, concerts, and venue guides in Des Moines. Tonight's shows, this weekend's concerts, and the top music venues in the metro.";

  // SEO-022. Exactly the shows the page renders below, deduped: the three
  // sections overlap (tonight's show is also a weekend show), and an ItemList
  // that claims the same Event twice is a claim the page contradicts.
  const schemaShows = Object.values(
    Object.fromEntries(
      [
        ...(tonightShows ?? []),
        ...(weekendShows ?? []).slice(0, 6),
        ...(upcomingShows ?? []).slice(0, 10),
      ].map((event) => [event.id, event]),
    ),
  ) as unknown as Event[];

  // The fallback when the calendar is empty, which happens: /music is a venue
  // guide as much as a listings page, and the venue cluster is what the page
  // ranks on out of season. A Place list is a true claim about that section.
  const venueItems = (venues ?? []).map((venue) => ({
    name: venue.name,
    url: getCanonicalUrl(`/music/venues/${venue.slug}`),
    ...(venue.image_url && { image: venue.image_url }),
    ...(venue.description && { description: venue.description }),
    itemProps: {
      ...(venue.address && {
        address: {
          '@type': 'PostalAddress',
          streetAddress: venue.address,
          addressRegion: 'IA',
          addressCountry: 'US',
        },
      }),
      ...(venue.latitude != null &&
        venue.longitude != null && {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: venue.latitude,
            longitude: venue.longitude,
          },
        }),
      ...(venue.capacity != null && { maximumAttendeeCapacity: venue.capacity }),
    },
  }));

  return (
    <>
      <SEOHead
        title="Live Music & Concerts in Des Moines"
        description={pageDescription}
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={[
          'Des Moines concerts',
          'live music Des Moines',
          'Des Moines music venues',
          'concerts tonight Des Moines',
        ]}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Music', url: '/music' },
        ]}
      />
      {schemaShows.length > 0 ? (
        <EventListJsonLd
          events={schemaShows}
          listName="Live music and concerts in Des Moines, Iowa"
          listDescription={pageDescription}
          listUrl={canonicalUrl}
        />
      ) : (
        <ItemListSchema
          name="Live music venues in Des Moines, Iowa"
          description="Arenas, theaters, clubs and bars hosting live music in the Des Moines metro."
          items={venueItems}
          itemType="Place"
        />
      )}
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 px-4 py-2 rounded-full mb-4">
              <Music className="h-5 w-5" />
              <span className="font-semibold">Des Moines Music Scene</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Live Music & Concerts
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Your guide to the Des Moines music scene — tonight's shows, venue guides, and upcoming concerts all in one place.
            </p>
          </div>

          {/* Tonight's Shows */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="clock" className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Tonight&apos;s Shows</h2>
              <Badge variant="secondary">{tonightShows?.length || 0}</Badge>
            </div>
            {tonightShows && tonightShows.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {tonightShows.map((event) => (
                  <Link key={event.id} to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}>
                    <Card className="hover:border-primary transition-colors h-full">
                      <CardContent className="p-4">
                        <h3 className="font-semibold mb-1 line-clamp-2">{event.title}</h3>
                        {event.venue && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <SpriteIcon name="map-pin" className="h-3 w-3" /> {event.venue}
                          </p>
                        )}
                        {event.date && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                        {event.price && <Badge variant="outline" className="mt-2">{event.price}</Badge>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No shows scheduled for tonight. Check back for updates!</p>
            )}
          </section>

          {/* This Weekend */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="calendar" className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">This Weekend</h2>
              <Badge variant="secondary">{weekendShows?.length || 0}</Badge>
            </div>
            {weekendShows && weekendShows.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {weekendShows.slice(0, 6).map((event) => (
                  <Link key={event.id} to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}>
                    <Card className="hover:border-primary transition-colors h-full">
                      <CardContent className="p-4">
                        <h3 className="font-semibold mb-1 line-clamp-2">{event.title}</h3>
                        {event.venue && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <SpriteIcon name="map-pin" className="h-3 w-3" /> {event.venue}
                          </p>
                        )}
                        {event.date && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {new Date(event.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                            {' · '}
                            {new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No weekend shows listed yet. Check upcoming concerts below!</p>
            )}
          </section>

          {/* Upcoming Concerts */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Music className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Upcoming Concerts</h2>
            </div>
            {upcomingShows && upcomingShows.length > 0 ? (
              <div className="space-y-3">
                {upcomingShows.slice(0, 10).map((event) => (
                  <Link key={event.id} to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}>
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
                          {event.venue && (
                            <p className="text-sm text-muted-foreground">{event.venue}</p>
                          )}
                        </div>
                        {event.price && <Badge variant="outline">{event.price}</Badge>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No upcoming concerts found.</p>
            )}
          </section>

          {/* Venue Guide */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="map-pin" className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Venue Guide</h2>
            </div>
            {venuesLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {venues?.map((venue) => (
                  <Link key={venue.id} to={`/music/venues/${venue.slug}`}>
                    <Card className="hover:border-primary transition-colors h-full">
                      {venue.image_url && (
                        <div className="h-40 overflow-hidden rounded-t-lg">
                          <img src={venue.image_url} alt={venue.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <CardContent className="p-5">
                        <h3 className="text-lg font-semibold mb-1">{venue.name}</h3>
                        {venue.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{venue.description}</p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {venue.venue_type && (
                            <Badge variant="secondary">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</Badge>
                          )}
                          {venue.capacity && (
                            <Badge variant="outline">
                              <SpriteIcon name="users" className="h-3 w-3 mr-1" />
                              {venue.capacity.toLocaleString()}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
