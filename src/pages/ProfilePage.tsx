import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SocialEventCard } from '@/components/SocialEventCard';
import SEOHead from '@/components/SEOHead';
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import {
  Calendar,
  Heart,
  Bell,
  History,
  MessageSquare,
  CalendarCheck,
  LogIn,
  Sparkles,
} from 'lucide-react';
import { createEventSlugWithCentralTime } from '@/lib/timezone';

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upcoming');

  // Fetch user's upcoming events (going/interested status)
  const { data: upcomingEvents, isLoading: upcomingLoading } = useQuery({
    queryKey: ['user-upcoming-events', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('event_attendance')
        .select(`
          event_id,
          status,
          created_at,
          events (
            id, title, date, location, category, image_url, price, venue,
            is_featured, event_start_utc, event_start_local, city,
            latitude, longitude, enhanced_description
          )
        `)
        .eq('user_id', user.id)
        .in('status', ['going', 'interested'])
        .gte('events.date', new Date().toISOString().split('T')[0])
        .order('events.date', { ascending: true });

      if (error) throw error;
      return data?.map((item: any) => ({ ...item.events, attendance_status: item.status })) || [];
    },
    enabled: !!user?.id,
  });

  // Fetch user's favorited events
  const { data: savedEvents, isLoading: savedLoading } = useQuery({
    queryKey: ['user-saved-events', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Fetch favorite event IDs from user_event_interactions
      const { data: favoriteInteractions, error: favError } = await supabase
        .from('user_event_interactions')
        .select('event_id')
        .eq('user_id', user.id)
        .eq('interaction_type', 'favorite');

      if (favError) throw favError;

      const favoriteEventIds = favoriteInteractions?.map(item => item.event_id) || [];

      // If no favorites, return empty array
      if (favoriteEventIds.length === 0) return [];

      // Fetch the actual event details for favorited events
      const { data, error } = await supabase
        .from('events')
        .select('id, title, date, location, category, image_url, price, venue, is_featured, event_start_utc, event_start_local, city, latitude, longitude, enhanced_description')
        .in('id', favoriteEventIds)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Fetch user's active reminders
  const { data: activeReminders, isLoading: remindersLoading } = useQuery({
    queryKey: ['user-active-reminders', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('user_event_reminders')
        .select(`
          id,
          reminder_type,
          created_at,
          events (
            id, title, date, location, category, image_url, price, venue,
            is_featured, event_start_utc, event_start_local, city,
            latitude, longitude, enhanced_description
          )
        `)
        .eq('user_id', user.id)
        .eq('delivery_status', 'pending')
        .gte('events.date', new Date().toISOString().split('T')[0])
        .order('events.date', { ascending: true });

      if (error) throw error;

      // Group reminders by event
      const groupedByEvent = data?.reduce((acc: any, item: any) => {
        const eventId = item.events.id;
        if (!acc[eventId]) {
          acc[eventId] = {
            ...item.events,
            reminders: []
          };
        }
        acc[eventId].reminders.push(item.reminder_type);
        return acc;
      }, {});

      return Object.values(groupedByEvent || {});
    },
    enabled: !!user?.id,
  });

  // Fetch user's past events
  const { data: pastEvents, isLoading: pastLoading } = useQuery({
    queryKey: ['user-past-events', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('event_attendance')
        .select(`
          event_id,
          status,
          created_at,
          events (
            id, title, date, location, category, image_url, price, venue,
            is_featured, event_start_utc, event_start_local, city,
            latitude, longitude, enhanced_description
          )
        `)
        .eq('user_id', user.id)
        .in('status', ['going', 'interested'])
        .lt('events.date', new Date().toISOString().split('T')[0])
        .order('events.date', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data?.map((item: any) => ({ ...item.events, attendance_status: item.status })) || [];
    },
    enabled: !!user?.id,
  });

  // Not authenticated
  if (!authLoading && !isAuthenticated) {
    return (
      <>
        <SEOHead
          title="Sign In Required - Des Moines Insider"
          description="Sign in to view your event profile"
          type="website"
        />
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto px-4 py-16">
            <EmptyState
              icon={LogIn}
              title="Sign In Required"
              description="Please sign in to view your event profile and manage your events"
              actions={[
                {
                  label: 'Sign In',
                  onClick: () => navigate('/login'),
                  icon: LogIn,
                }
              ]}
            />
          </main>
          <Footer />
        </div>
      </>
    );
  }

  const handleViewEvent = (event: any) => {
    navigate(`/events/${createEventSlugWithCentralTime(event.title, event)}`);
  };

  return (
    <>
      <SEOHead
        title="My Events - Des Moines Insider"
        description="Manage your events, reminders, and favorites"
        type="website"
      />
      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: "Home", href: "/" },
              { label: "My Events" },
            ]}
          />
          {/* Profile Header */}
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">My Events</h1>
            <p className="text-muted-foreground">
              Manage your upcoming events, reminders, and favorites
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 gap-2">
              <TabsTrigger value="upcoming" className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4" />
                <span>Upcoming</span>
                {upcomingEvents && upcomingEvents.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {upcomingEvents.length}
                  </Badge>
                )}
              </TabsTrigger>

              <TabsTrigger value="saved" className="flex items-center gap-2">
                <Heart className="h-4 w-4" />
                <span>Saved</span>
                {savedEvents && savedEvents.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {savedEvents.length}
                  </Badge>
                )}
              </TabsTrigger>

              <TabsTrigger value="reminders" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                <span>Reminders</span>
                {activeReminders && activeReminders.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {activeReminders.length}
                  </Badge>
                )}
              </TabsTrigger>

              <TabsTrigger value="past" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                <span>Past</span>
                {pastEvents && pastEvents.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {pastEvents.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Upcoming Events Tab */}
            <TabsContent value="upcoming" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Upcoming Events</CardTitle>
                  <CardDescription>
                    Events you're attending or interested in
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {upcomingLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64" />
                      ))}
                    </div>
                  ) : upcomingEvents && upcomingEvents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {upcomingEvents.map((event: any) => (
                        <div key={event.id} className="relative">
                          <SocialEventCard
                            event={event}
                            onViewDetails={() => handleViewEvent(event)}
                          />
                          <Badge
                            variant={event.attendance_status === 'going' ? 'default' : 'secondary'}
                            className="absolute top-2 right-2"
                          >
                            {event.attendance_status === 'going' ? '✓ Going' : 'Interested'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Calendar}
                      title="No upcoming events"
                      description="RSVP to events to see them here"
                      actions={[
                        {
                          label: 'Browse Events',
                          onClick: () => navigate('/events'),
                          icon: Sparkles,
                        },
                      ]}
                      compact
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Saved Events Tab */}
            <TabsContent value="saved" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Saved Events</CardTitle>
                  <CardDescription>
                    Events you've favorited for later
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {savedLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64" />
                      ))}
                    </div>
                  ) : savedEvents && savedEvents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {savedEvents.map((event: any) => (
                        <SocialEventCard
                          key={event.id}
                          event={event}
                          onViewDetails={() => handleViewEvent(event)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Heart}
                      title="No saved events"
                      description="Save events by clicking the heart icon"
                      actions={[
                        {
                          label: 'Discover Events',
                          onClick: () => navigate('/events'),
                          icon: Sparkles,
                        },
                      ]}
                      compact
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Active Reminders Tab */}
            <TabsContent value="reminders" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Active Reminders</CardTitle>
                  <CardDescription>
                    Events with email reminders set
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {remindersLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64" />
                      ))}
                    </div>
                  ) : activeReminders && activeReminders.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeReminders.map((event: any) => (
                        <div key={event.id} className="relative">
                          <SocialEventCard
                            event={event}
                            onViewDetails={() => handleViewEvent(event)}
                          />
                          <div className="absolute top-2 right-2 flex flex-col gap-1">
                            {event.reminders?.map((reminderType: string) => (
                              <Badge key={reminderType} variant="default" className="text-xs">
                                <Bell className="h-3 w-3 mr-1" />
                                {reminderType === '1_day' ? '1d' : reminderType === '3_hours' ? '3h' : '1h'}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Bell}
                      title="No active reminders"
                      description="Set reminders on event pages to get notified before events start"
                      actions={[
                        {
                          label: 'Find Events',
                          onClick: () => navigate('/events'),
                          icon: Calendar,
                        },
                      ]}
                      compact
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Past Events Tab */}
            <TabsContent value="past" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Past Events</CardTitle>
                  <CardDescription>
                    Events you attended or were interested in
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {pastLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64" />
                      ))}
                    </div>
                  ) : pastEvents && pastEvents.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pastEvents.map((event: any) => (
                        <SocialEventCard
                          key={event.id}
                          event={event}
                          onViewDetails={() => handleViewEvent(event)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={History}
                      title="No past events"
                      description="Events you attended will appear here"
                      actions={[
                        {
                          label: 'Explore Events',
                          onClick: () => navigate('/events'),
                          icon: Sparkles,
                        },
                      ]}
                      compact
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>

        <Footer />
      </div>
    </>
  );
}
