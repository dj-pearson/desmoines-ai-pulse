import { useParams, Link } from 'react-router-dom';
import { createEventSlugWithCentralTime, formatEventPart, formatEventTimeOnly } from "@/lib/timezone";
import { RouteCanonical } from "@/components/RouteCanonical";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useTeam, useTeamGames } from '@/hooks/useTeams';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from '@/components/ui/error-state';
import { toJsonLd } from '@/lib/jsonLd';
import { safeHttpUrl } from '@/lib/safeUrl';
import { currentVenueName } from '@/lib/venuePages';
import { getCanonicalUrl } from '@/lib/brandConfig';

export default function TeamDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: team, isLoading, error: teamError, refetch: refetchTeam } = useTeam(slug || '');
  const {
    data: games,
    error: gamesError,
    refetch: refetchGames,
    isPending: gamesPending,
    status: gamesStatus,
  } = useTeamGames(team ? { name: team.name, slug: team.slug } : '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/sports/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  /**
   * WEB-QA-032. A failed load used to fall straight through to the not-found
   * branch below, which renders "team not found" AND a noindex. On a real
   * team whose page merely failed to load that is a deindexing risk, not
   * just bad copy - Googlebot hitting the site during a backend blip would be
   * told the page should not be indexed. A failure and a missing row are
   * different answers and get different pages.
   */
  if (teamError) {
    return (
      <div className="min-h-screen bg-background">
        <RouteCanonical path={`/sports/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-16">
          <ErrorState error={teamError} onRetry={() => refetchTeam()} />
        </div>
        <Footer />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background">
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Team Not Found</h1>
          <Link to="/sports" className="text-primary hover:underline">Back to Sports Hub</Link>
        </div>
        <Footer />
      </div>
    );
  }

  // Item 11: team rows are admin-written; only http(s) becomes a link.
  const websiteUrl = safeHttpUrl(team.website);
  const scheduleUrl = safeHttpUrl(team.schedule_url);
  const venueName = currentVenueName(team.venue_name);
  const teamJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name: team.name,
    sport: team.sport,
    memberOf: { '@type': 'SportsOrganization', name: team.league },
    ...(websiteUrl ? { url: websiteUrl, sameAs: [websiteUrl] } : { url: getCanonicalUrl(`/sports/${team.slug}`) }),
    ...(venueName ? { location: { '@type': 'Place', name: venueName } } : {}),
  };

  return (
    <>
      {/* WEB-SEO-033. RouteCanonical was only in the LOADING branch, so the
          canonical existed for the few hundred milliseconds before the fetch
          resolved and then vanished. A crawler that executes JS sees the
          settled DOM, which had none -- and SEO-028 put it in the loading
          branch precisely because the canonical must not wait for data, not
          because it should stop existing once data arrives. It belongs in
          both. */}
      <RouteCanonical path={`/sports/${slug}`} />
      <Helmet>
        <title>{`${team.name} - ${team.sport} in Des Moines | Des Moines Insider`}</title>
        <meta name="description" content={team.description || `${team.name}: ${team.league} ${team.sport} in Des Moines, Iowa.`} />
        {/* Item 11: escaped through toJsonLd, like every ld+json block. */}
        <script type="application/ld+json">{toJsonLd(teamJsonLd)}</script>
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-6">
            <Link to="/sports" className="hover:text-primary">Sports</Link>
            <span className="mx-2">/</span>
            <span>{team.name}</span>
          </nav>

          {/* Team Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">{team.name}</h1>
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <Badge variant="secondary">{team.sport}</Badge>
              <Badge variant="outline">{team.league}</Badge>
              {venueName && (
                <Badge variant="outline">
                  <SpriteIcon name="map-pin" className="h-3 w-3 mr-1" /> {venueName}
                </Badge>
              )}
            </div>
            {team.description && (
              <p className="text-lg text-muted-foreground max-w-3xl">{team.description}</p>
            )}
            <div className="flex gap-3 mt-4">
              {websiteUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
                    <SpriteIcon name="external-link" className="h-4 w-4 mr-1" /> Official website
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </Button>
              )}
              {scheduleUrl && (
                <Button asChild variant="outline" size="sm">
                  <a href={scheduleUrl} target="_blank" rel="noopener noreferrer">
                    <SpriteIcon name="calendar" className="h-4 w-4 mr-1" /> Full schedule
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Upcoming Games */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <SpriteIcon name="calendar" className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Upcoming Games</h2>
            </div>
            {/* Item 7: skeletons while the games request is in flight; the
                empty line only once it has answered with zero rows. */}
            {gamesPending ? (
              <div className="space-y-3" aria-busy="true" data-team-games-loading="">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
                ))}
              </div>
            ) : games && games.length > 0 ? (
              <div className="space-y-3">
                {games.map((event) => (
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
                          {event.venue && <p className="text-sm text-muted-foreground">{event.venue}</p>}
                        </div>
                        {event.price && <Badge variant="outline">{event.price}</Badge>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              gamesError ? (
                <ErrorState error={gamesError} compact onRetry={refetchGames} />
              ) : gamesStatus === 'success' ? (
                <p className="text-muted-foreground">
                  No upcoming games listed for {team.name}.
                  {scheduleUrl && (
                    <>
                      {' '}
                      <a href={scheduleUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">
                        See the team&apos;s own schedule
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                      .
                    </>
                  )}
                </p>
              ) : null
            )}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
