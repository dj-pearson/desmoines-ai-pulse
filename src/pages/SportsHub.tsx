import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { createEventSlugWithCentralTime, formatEventPart, formatEventTimeOnly } from "@/lib/timezone";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { EventListJsonLd } from '@/components/schema/EventListJsonLd';
import { OptimizedImage } from '@/components/OptimizedImage';
import { getCanonicalUrl } from '@/lib/brandConfig';
import type { Event } from '@/lib/types';
import { useTeams, type Team } from '@/hooks/useTeams';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy } from "lucide-react";
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';
import { queryKeys } from '@/lib/queryKeys';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from '@/components/ui/error-state';
import { applyEventVisibility } from '@/lib/eventQuery';
import { ExploreSectionLinks } from '@/components/explore/ExploreSectionLinks';
import { useNow } from '@/hooks/useNow';
import { safeHttpUrl } from '@/lib/safeUrl';
import { currentVenueName } from '@/lib/venuePages';
import {
  HUB_EVENT_LIMIT,
  SPORTS_HUB_DAYS,
  hubEventWindow,
  hubEventsOrFilter,
  partitionHubEvents,
  sectionMayBeCut,
  teamVenueSentence,
} from '@/lib/hubEventPartition';

const SPORTS_CATEGORY_OR =
  'category.ilike.%Sport%,category.ilike.%Baseball%,category.ilike.%Hockey%,category.ilike.%Basketball%,category.ilike.%Football%,category.ilike.%Soccer%';

/** Card links: a visible focus ring, since the Card itself has no focus style. */
const CARD_LINK =
  'block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * Explore plan WP5 items 4 and 8. One query over today to +6 days, split on
 * the Central clock by partitionHubEvents; it replaced a "today" query and a
 * "week" query that returned today's games twice.
 *
 * `category.ilike.%Game%` is gone: it matched trivia and board-game nights.
 * The canonical vocabulary (src/lib/eventCategories.json) files every sport
 * under "Sports", and the per-sport terms stay for rows written before it.
 */
function useSportsHubEvents(now: Date) {
  const range = hubEventWindow(SPORTS_HUB_DAYS, now);
  return useQuery({
    // Under the events prefix (WEB-PERF-032); the first day is in the key, so
    // crossing midnight Central refetches.
    queryKey: queryKeys.events.list({ hub: 'sports', from: range.startDay, to: range.endDay }),
    queryFn: async () => {
      const { data, error } = await applyEventVisibility(
        supabase.from('events').select(EVENT_LIST_COLUMNS)
      )
        // Pass 2 WP5 item 12: a tournament that began yesterday and is still
        // running is on today; `.gte('date', start)` dropped it.
        .or(hubEventsOrFilter(SPORTS_CATEGORY_OR, range.start, new Date()))
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

const SPORT_ICONS: Record<string, string> = {
  Baseball: '\u26be',
  Hockey: '\ud83c\udfd2',
  Basketball: '\ud83c\udfc0',
  'Arena Football': '\ud83c\udfc8',
  Soccer: '\u26bd',
  'Multi-Sport': '\ud83c\udfc5',
};

export default function SportsHub() {
  const { data: teams, isPending: teamsPending, error: teamsError, refetch: refetchTeams } = useTeams();
  const now = useNow(60_000);
  const games = useSportsHubEvents(now);
  const gamesSettled = games.status === 'success';
  const rows = useMemo(() => games.data ?? [], [games.data]);
  const truncated = rows.length >= HUB_EVENT_LIMIT;

  // Sports keeps "Today" (the calendar day), not the music hub's evening.
  const { tonight: todayGames, later: weekGames, onNow, tonightEndMs } = useMemo(
    () => partitionHubEvents(rows, now, { weekend: false, tonight: 'day' }),
    [rows, now],
  );
  const todayCut = sectionMayBeCut(rows, HUB_EVENT_LIMIT, tonightEndMs);
  const heroVenues = teams ? teamVenueSentence(teams) : null;
  const weekEmpty = gamesSettled && todayGames.length === 0 && weekGames.length === 0;

  // Item 7: out of season, each team's own schedule is the next step.
  const teamSchedules = (teams ?? [])
    .map((team) => ({ team, url: safeHttpUrl(team.schedule_url) ?? safeHttpUrl(team.website) }))
    .filter((entry): entry is { team: Team; url: string } => entry.url !== null);

  const canonicalUrl = getCanonicalUrl('/sports');
  const pageDescription =
    "Des Moines sports this week: Iowa Cubs, Iowa Wild, Iowa Wolves and Iowa Barnstormers games, with each team's schedule and venue.";

  // SEO-022. Exactly the games rendered below; the sections no longer overlap.
  const schemaGames: Event[] = [...todayGames, ...weekGames];

  // Out of season there are no games, and the page is then a directory of the
  // seven metro teams. A SportsTeam list is what it is at that point.
  const teamItems = (teams ?? []).map((team) => ({
    name: team.name,
    url: getCanonicalUrl(`/sports/${team.slug}`),
    ...(team.logo_url && { image: team.logo_url }),
    ...(team.description && { description: team.description }),
    itemProps: {
      ...(team.sport && { sport: team.sport }),
      ...(team.league && { memberOf: { '@type': 'SportsOrganization', name: team.league } }),
      ...(team.venue_name && { location: { '@type': 'Place', name: currentVenueName(team.venue_name) } }),
    },
  }));

  const countBadge = (n: number, mayBeCut: boolean) =>
    gamesSettled ? <Badge variant="secondary">{`${n}${mayBeCut ? '+' : ''}`}</Badge> : null;
  const nextGame = weekGames[0] ?? null;

  return (
    <>
      <SEOHead
        title="Des Moines Sports - Teams & Schedules"
        description={pageDescription}
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={[
          'Iowa Cubs schedule',
          'Des Moines sports',
          'Iowa Wild tickets',
          'Principal Park',
        ]}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Sports', url: '/sports' },
        ]}
      />
      {schemaGames.length > 0 ? (
        <EventListJsonLd
          events={schemaGames}
          listName="Des Moines sports schedule"
          listDescription={pageDescription}
          listUrl={canonicalUrl}
        />
      ) : (
        <ItemListSchema
          name="Pro and minor league teams in Des Moines, Iowa"
          description="Iowa Cubs, Iowa Wild, Iowa Wolves, Iowa Barnstormers and the rest of the Des Moines metro's teams."
          items={teamItems}
          itemType="SportsTeam"
        />
      )}
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-600 dark:text-green-400 px-4 py-2 rounded-full mb-4">
              <Trophy className="h-5 w-5" aria-hidden="true" />
              <span className="font-semibold">Game Days in Des Moines</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Des Moines Sports
            </h1>
            {/* Pass 2 item 4: the teams and venues come from the teams rows,
                and nothing renders until they have loaded. */}
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto min-h-[1.75rem]" data-sports-hero="">
              {heroVenues ? `${heroVenues}. Here's who's playing this week.` : null}
            </p>
          </div>
          <ExploreSectionLinks current="/sports" className="mb-10" />

          {/*
            WEB-QA-032, explore plan WP5 item 5. One alert for the one query
            behind both game sections. The sections are not rendered on
            failure, so neither can state "no games" as a fact.
          */}
          {games.isError ? (
            <div className="mb-12" data-hub-alert="events">
              <ErrorState error={games.error} onRetry={() => void games.refetch()} />
            </div>
          ) : (
            <>
              {/* Today's Games */}
              <section className="mb-12" aria-labelledby="sports-today">
                <div className="flex items-center gap-2 mb-4">
                  <SpriteIcon name="clock" className="h-5 w-5 text-primary" />
                  <h2 id="sports-today" className="text-2xl font-bold">Today&apos;s Games</h2>
                  {countBadge(todayGames.length, todayCut)}
                </div>
                {games.isPending ? (
                  <SectionSkeleton count={3} />
                ) : todayGames.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {todayGames.map((event) => (
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
                            {event.price && <Badge variant="outline" className="mt-2"><SpriteIcon name="ticket" className="h-3 w-3 mr-1" />{event.price}</Badge>}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground" data-empty-today="">
                    No games listed for today.
                    {nextGame && (
                      <>
                        {' '}The next one is {formatEventPart(nextGame, 'EEEE, MMMM d')}:{' '}
                        <Link to={eventHref(nextGame)} className="font-medium text-primary underline underline-offset-4">
                          {nextGame.title}
                        </Link>
                        .
                      </>
                    )}
                  </p>
                )}
                {gamesSettled && todayGames.length > 0 && (
                  <SeeAll to="/events?category=Sports&preset=today">Today on the events calendar</SeeAll>
                )}
              </section>

              {/* This Week */}
              <section className="mb-12" aria-labelledby="sports-week">
                <div className="flex items-center gap-2 mb-4">
                  <SpriteIcon name="calendar" className="h-5 w-5 text-primary" />
                  <h2 id="sports-week" className="text-2xl font-bold">This Week&apos;s Schedule</h2>
                  {countBadge(weekGames.length, truncated)}
                </div>
                {games.isPending ? (
                  <SectionSkeleton count={3} />
                ) : weekGames.length > 0 ? (
                  <div className="space-y-3">
                    {weekGames.map((event) => (
                      <Link key={event.id} to={eventHref(event)} className={CARD_LINK}>
                        <Card className="hover:border-primary transition-colors">
                          <CardContent className="p-4 flex items-center gap-4">
                            <div className="text-center min-w-[60px]">
                              <p className="text-xs text-muted-foreground uppercase">
                                {formatEventPart(event, 'EEE')}
                              </p>
                              <p className="text-2xl font-bold">
                                {formatEventPart(event, 'd')}
                              </p>
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold">{event.title}</h3>
                              {event.venue && <p className="text-sm text-muted-foreground">{event.venue}</p>}
                            </div>
                            {event.price && <Badge variant="outline">{event.price}</Badge>}
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No games listed for the next 7 days.</p>
                )}
                {gamesSettled && weekGames.length > 0 && (
                  <SeeAll to="/events?category=Sports&preset=next-7-days">
                    Next 7 days on the events calendar
                  </SeeAll>
                )}
                {weekEmpty && teamSchedules.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold mb-2">Team schedules</h3>
                    <ul className="flex flex-wrap gap-x-6 gap-y-1">
                      {teamSchedules.map(({ team, url }) => (
                        <li key={team.id}>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                          >
                            {team.name} schedule
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            </>
          )}

          {/* Teams & Venues */}
          <section className="mb-12" aria-labelledby="sports-teams">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
              <h2 id="sports-teams" className="text-2xl font-bold">Teams &amp; Venues</h2>
            </div>
            {teamsPending ? (
              <SectionSkeleton count={6} tall />
            ) : teamsError ? (
              <ErrorState
                error={teamsError}
                compact
                onRetry={() => void refetchTeams()}
                description="We couldn't load the team list. This is usually temporary, so please try again."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {teams?.map((team) => (
                  <Link key={team.id} to={`/sports/${team.slug}`} className={CARD_LINK}>
                    <Card className="hover:border-primary transition-colors h-full">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-3">
                          {team.logo_url ? (
                            <OptimizedImage
                              src={team.logo_url}
                              alt=""
                              objectFit="contain"
                              containerClassName="h-10 w-10 shrink-0"
                              sizes="40px"
                            />
                          ) : (
                            <span className="text-3xl" aria-hidden="true">{SPORT_ICONS[team.sport] || '🏆'}</span>
                          )}
                          <div>
                            <h3 className="text-lg font-semibold">{team.name}</h3>
                            <p className="text-sm text-muted-foreground">{team.league}</p>
                          </div>
                        </div>
                        {team.description && (
                          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{team.description}</p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary">{team.sport}</Badge>
                          {team.venue_name && (
                            <Badge variant="outline">
                              <SpriteIcon name="map-pin" className="h-3 w-3 mr-1" />
                              {currentVenueName(team.venue_name)}
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
