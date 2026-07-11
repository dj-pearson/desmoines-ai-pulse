import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useTeams } from '@/hooks/useTeams';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, MapPin, Calendar, Clock, Ticket } from 'lucide-react';
import { EVENT_LIST_COLUMNS } from '@/lib/listColumns';

function useSportsEvents(timeframe: 'today' | 'week') {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  const weekEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toISOString();

  return useQuery({
    queryKey: ['sports-events', timeframe],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(EVENT_LIST_COLUMNS)
        .or('category.ilike.%Sport%,category.ilike.%Game%,category.ilike.%Baseball%,category.ilike.%Hockey%,category.ilike.%Basketball%,category.ilike.%Football%,category.ilike.%Soccer%')
        .order('date', { ascending: true })
        .limit(20);

      if (timeframe === 'today') {
        query = query.gte('date', todayStart).lt('date', todayEnd);
      } else {
        query = query.gte('date', todayStart).lt('date', weekEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
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
  const { data: teams, isLoading: teamsLoading } = useTeams();
  const { data: todayGames } = useSportsEvents('today');
  const { data: weekGames } = useSportsEvents('week');

  return (
    <>
      <Helmet>
        <title>Sports in Des Moines — Teams, Schedules & Gameday Guides | Des Moines Insider</title>
        <meta name="description" content="Des Moines sports hub — Iowa Cubs, Iowa Wild, Iowa Wolves, Iowa Barnstormers, and more. Game schedules, venue guides, and tailgating tips." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-green-500/10 text-green-600 dark:text-green-400 px-4 py-2 rounded-full mb-4">
              <Trophy className="h-5 w-5" />
              <span className="font-semibold">#1 Minor League Market</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Des Moines Sports
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Des Moines is the #1 minor league sports market in America. From Iowa Cubs baseball to Iowa Wild hockey, find your next gameday experience.
            </p>
          </div>

          {/* Today's Games */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Today&apos;s Games</h2>
              <Badge variant="secondary">{todayGames?.length || 0}</Badge>
            </div>
            {todayGames && todayGames.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {todayGames.map((event) => (
                  <Link key={event.id} to={`/events/${event.id}`}>
                    <Card className="hover:border-primary transition-colors h-full">
                      <CardContent className="p-4">
                        <h3 className="font-semibold mb-1 line-clamp-2">{event.title}</h3>
                        {event.venue && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {event.venue}
                          </p>
                        )}
                        {event.date && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {new Date(event.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        )}
                        {event.price && <Badge variant="outline" className="mt-2"><Ticket className="h-3 w-3 mr-1" />{event.price}</Badge>}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No games scheduled for today.</p>
            )}
          </section>

          {/* This Week */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">This Week&apos;s Schedule</h2>
            </div>
            {weekGames && weekGames.length > 0 ? (
              <div className="space-y-3">
                {weekGames.map((event) => (
                  <Link key={event.id} to={`/events/${event.id}`}>
                    <Card className="hover:border-primary transition-colors">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="text-center min-w-[60px]">
                          <p className="text-xs text-muted-foreground uppercase">
                            {new Date(event.date).toLocaleDateString([], { weekday: 'short' })}
                          </p>
                          <p className="text-2xl font-bold">
                            {new Date(event.date).getDate()}
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
              <p className="text-muted-foreground">No games scheduled this week.</p>
            )}
          </section>

          {/* Teams & Venues */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-5 w-5 text-primary" />
              <h2 className="text-2xl font-bold">Teams &amp; Venues</h2>
            </div>
            {teamsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-48 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {teams?.map((team) => (
                  <Link key={team.id} to={`/sports/${team.slug}`}>
                    <Card className="hover:border-primary transition-colors h-full">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-3xl">{SPORT_ICONS[team.sport] || '\ud83c\udfc6'}</span>
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
                              <MapPin className="h-3 w-3 mr-1" />
                              {team.venue_name}
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
