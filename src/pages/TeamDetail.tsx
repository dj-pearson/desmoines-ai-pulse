import { useParams, Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useTeam, useTeamGames } from '@/hooks/useTeams';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Trophy, MapPin, Calendar, ExternalLink } from 'lucide-react';

export default function TeamDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: team, isLoading } = useTeam(slug || '');
  const { data: games } = useTeamGames(team?.name || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Team Not Found</h1>
          <Link to="/sports" className="text-primary hover:underline">Back to Sports Hub</Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{team.name} — {team.sport} in Des Moines | Des Moines Insider</title>
        <meta name="description" content={team.description || `${team.name} — ${team.league} ${team.sport} in Des Moines, Iowa.`} />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SportsTeam',
            name: team.name,
            sport: team.sport,
            memberOf: { '@type': 'SportsOrganization', name: team.league },
            ...(team.website && { url: team.website }),
          })}
        </script>
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-muted-foreground mb-6">
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
              {team.venue_name && (
                <Badge variant="outline">
                  <MapPin className="h-3 w-3 mr-1" /> {team.venue_name}
                </Badge>
              )}
            </div>
            {team.description && (
              <p className="text-lg text-muted-foreground max-w-3xl">{team.description}</p>
            )}
            <div className="flex gap-3 mt-4">
              {team.website && (
                <a href={team.website} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-1" /> Official Website
                  </Button>
                </a>
              )}
              {team.schedule_url && (
                <a href={team.schedule_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm">
                    <Calendar className="h-4 w-4 mr-1" /> Full Schedule
                  </Button>
                </a>
              )}
            </div>
          </div>

          {/* Upcoming Games */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Upcoming Games</h2>
            </div>
            {games && games.length > 0 ? (
              <div className="space-y-3">
                {games.map((event) => (
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
                          {event.venue && <p className="text-sm text-muted-foreground">{event.venue}</p>}
                        </div>
                        {event.price && <Badge variant="outline">{event.price}</Badge>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No upcoming games listed for {team.name}.</p>
            )}
          </section>
        </div>
        <Footer />
      </div>
    </>
  );
}
