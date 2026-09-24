import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { OptimizedImage } from "@/components/OptimizedImage";
import { createEventSlugWithCentralTime, formatEventPart, formatEventTimeOnly } from "@/lib/timezone";
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
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { queryKeys } from '@/lib/queryKeys';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from '@/components/ui/error-state';
import { applyEventVisibility } from '@/lib/eventQuery';
import {
  HUB_EVENT_LIMIT,
  MUSIC_HUB_DAYS,
  hubEventWindow,
  partitionHubEvents,
  showsByVenue,
  sortVenuesByShows,
} from '@/lib/hubEventPartition';

/** Card links: a visible focus ring, since the Card itself has no focus style. */
const CARD_LINK =
  'block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Explore plan WP5 item 4. One query over today to +14 days, split on the
 * Central clock by partitionHubEvents. This replaced three overlapping
 * queries (tonight, weekend, upcoming), which rendered the same show up to
 * three times and computed a weekend that, on a Saturday, was next week's.
 */
function useMusicHubEvents() {
  const range = hubEventWindow(MUSIC_HUB_DAYS);
  return useQuery({
    // Under the events prefix (WEB-PERF-032) so an admin edit invalidates it;
    // the window's first day is in the key, so crossing midnight refetches.
    queryKey: queryKeys.events.list({ hub: 'music', from: range.startDay, to: range.endDay }),
    queryFn: async () => {
      const { data, error } = await applyEventVisibility(
        supabase.from('events').select(EVENT_LIST_COLUMNS)
      )
        .or('category.ilike.%Music%,category.ilike.%Concert%')
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date', { ascending: true })
        .limit(HUB_EVENT_LIMIT);
      if (error) throw error;
      return (data ?? []) as unknown as Event[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function eventHref(event: Event): string {
  return `/events/${createEventSlugWithCentralTime(event.title, event)}`;
}

function SectionSkeleton({ count, tall = false }: { count: number; tall?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={tall ? 'h-48 rounded-lg' : 'h-[104px] rounded-lg'} />
      ))}
    </div>
  );
}

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="mt-4 inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
    >
      {children}
    </Link>
  );
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
  const {
    data: venues,
    isPending: venuesPending,
    error: venuesError,
    refetch: refetchVenues,
  } = useVenues();
  const shows = useMusicHubEvents();
  const showsSettled = shows.status === 'success';
  const truncated = (shows.data?.length ?? 0) >= HUB_EVENT_LIMIT;
  const range = hubEventWindow(MUSIC_HUB_DAYS);

  const { tonight, weekend, later, onNow } = useMemo(
    () => partitionHubEvents(shows.data ?? [], new Date(), { weekend: true }),
    [shows.data],
  );

  // Item 6: what's playing at each venue, from the rows already loaded.
  const venueShows = useMemo(
    () => showsByVenue(venues ?? [], [...tonight, ...weekend, ...later]),
    [venues, tonight, weekend, later],
  );
  const orderedVenues = useMemo(() => sortVenuesByShows(venues ?? [], venueShows), [venues, venueShows]);

  const canonicalUrl = getCanonicalUrl('/music');
  const pageDescription =
    "Discover live music, concerts, and venue guides in Des Moines. Tonight's shows, this weekend's concerts, and the top music venues in the metro.";

  // SEO-022. Exactly the shows the page renders below. The sections no longer
  // overlap (partitionHubEvents puts each event in one), so no dedupe is needed
  // for the ItemList to claim each Event once.
  const shownWeekend = weekend.slice(0, 6);
  const shownLater = later.slice(0, 10);
  const schemaShows: Event[] = [...tonight, ...shownWeekend, ...shownLater];
  const lastDayLabel = formatEventPart({ date: range.end }, 'MMM d');

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

  const showCount = (n: number, openEnded = false) =>
    showsSettled ? <Badge variant="secondary">{`${n}${openEnded && truncated ? '+' : ''}`}</Badge> : null;

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
              <Music className="h-5 w-5" aria-hidden="true" />
              <span className="font-semibold">Des Moines Music Scene</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Live Music & Concerts
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Your guide to the Des Moines music scene: tonight's shows, venue guides, and upcoming concerts all in one place.
            </p>
          </div>

          {/*
            WEB-QA-032, explore plan WP5 item 5. One alert for the one query
            behind all three show sections, instead of the same error three
            times. The sections are not rendered on failure, so none of them
            can state "no shows" as a fact.
          */}
          {shows.isError ? (
            <div className="mb-12" data-hub-alert="events">
              <ErrorState error={shows.error} onRetry={() => void shows.refetch()} />
            </div>
          ) : (
            <>
              {/* Tonight's Shows */}
              <section className="mb-12" aria-labelledby="music-tonight">
                <div className="flex items-center gap-2 mb-4">
                  <SpriteIcon name="clock" className="h-5 w-5 text-primary" />
                  <h2 id="music-tonight" className="text-2xl font-bold">Tonight&apos;s Shows</h2>
                  {showCount(tonight.length)}
                </div>
                {shows.isPending ? (
                  <SectionSkeleton count={3} />
                ) : tonight.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tonight.map((event) => (
                      <Link key={event.id} to={eventHref(event)} className={CARD_LINK}>
                        <Card className="hover:border-primary transition-colors h-full">
                          <CardContent className="p-4">
                            <h3 className="font-semibold mb-1 line-clamp-2">{event.title}</h3>
                            {event.venue && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <SpriteIcon name="map-pin" className="h-3 w-3" /> {event.venue}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground mt-1">
                              {onNow.has(event.id) ? (
                                <span className="font-medium text-foreground">On now</span>
                              ) : (
                                formatEventTimeOnly(event) ?? 'Time TBA'
                              )}
                            </p>
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
              <section className="mb-12" aria-labelledby="music-weekend">
                <div className="flex items-center gap-2 mb-4">
                  <SpriteIcon name="calendar" className="h-5 w-5 text-primary" />
                  <h2 id="music-weekend" className="text-2xl font-bold">This Weekend</h2>
                  {showCount(weekend.length)}
                </div>
                {shows.isPending ? (
                  <SectionSkeleton count={3} />
                ) : weekend.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {shownWeekend.map((event) => (
                      <Link key={event.id} to={eventHref(event)} className={CARD_LINK}>
                        <Card className="hover:border-primary transition-colors h-full">
                          <CardContent className="p-4">
                            <h3 className="font-semibold mb-1 line-clamp-2">{event.title}</h3>
                            {event.venue && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <SpriteIcon name="map-pin" className="h-3 w-3" /> {event.venue}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground mt-1">
                              {formatEventPart(event, 'EEE, MMM d')}
                              {' · '}
                              {formatEventTimeOnly(event) ?? 'Time TBA'}
                            </p>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No weekend shows listed yet. Check upcoming concerts below!</p>
                )}
                {showsSettled && (
                  <SeeAll to="/events?category=Music&preset=this-weekend">
                    {weekend.length > shownWeekend.length
                      ? `See all ${weekend.length} weekend shows`
                      : 'This weekend on the events calendar'}
                  </SeeAll>
                )}
              </section>

              {/* Upcoming Concerts */}
              <section className="mb-12" aria-labelledby="music-upcoming">
                <div className="flex items-center gap-2 mb-4">
                  <Music className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h2 id="music-upcoming" className="text-2xl font-bold">Upcoming Concerts</h2>
                  {showCount(later.length, true)}
                </div>
                {shows.isPending ? (
                  <SectionSkeleton count={3} />
                ) : later.length > 0 ? (
                  <div className="space-y-3">
                    {shownLater.map((event) => (
                      <Link key={event.id} to={eventHref(event)} className={CARD_LINK}>
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
                {showsSettled && (
                  <SeeAll to={`/events?category=Music&from=${range.startDay}&to=${range.endDay}`}>
                    {later.length > shownLater.length
                      ? `See all ${later.length}${truncated ? '+' : ''} upcoming concerts`
                      : `All music through ${lastDayLabel ?? 'the next two weeks'}`}
                  </SeeAll>
                )}
              </section>
            </>
          )}

          {/* Venue Guide */}
          <section className="mb-12" aria-labelledby="music-venues">
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="map-pin" className="h-5 w-5 text-primary" />
              <h2 id="music-venues" className="text-2xl font-bold">Venue Guide</h2>
            </div>
            {venuesPending ? (
              <SectionSkeleton count={6} tall />
            ) : venuesError ? (
              <ErrorState
                error={venuesError}
                compact
                onRetry={() => void refetchVenues()}
                description="We couldn't load the venue guide. This is usually temporary, so please try again."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {orderedVenues.map((venue) => {
                  const playing = venueShows.get(venue.id);
                  const nextWhen = playing
                    ? onNow.has(playing.next.id)
                      ? 'on now'
                      : [formatEventPart(playing.next, 'EEE'), formatEventTimeOnly(playing.next)]
                          .filter(Boolean)
                          .join(' ')
                    : '';
                  return (
                    <Link key={venue.id} to={`/music/venues/${venue.slug}`} className={CARD_LINK}>
                      <Card className="hover:border-primary transition-colors h-full">
                        {venue.image_url && (
                          <div className="h-40 overflow-hidden rounded-t-lg">
                            <OptimizedImage
                              src={venue.image_url}
                              alt={venue.name}
                              className="object-cover"
                              containerClassName="w-full h-full"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            />
                          </div>
                        )}
                        <CardContent className="p-5">
                          <h3 className="text-lg font-semibold mb-1">{venue.name}</h3>
                          {playing && (
                            <div className="mb-3 text-sm">
                              <p className="font-medium line-clamp-1">
                                Next: {playing.next.title}
                                {nextWhen && `, ${nextWhen}`}
                              </p>
                              <p className="text-muted-foreground">
                                {playing.count}
                                {truncated ? '+' : ''} {playing.count === 1 && !truncated ? 'show' : 'shows'} in the next 2 weeks
                              </p>
                            </div>
                          )}
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
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
