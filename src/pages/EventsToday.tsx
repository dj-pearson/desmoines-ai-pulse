import React, { useState, useEffect } from "react";
import { createLogger } from '@/lib/logger';
import { supabase } from "@/integrations/supabase/client";

const log = createLogger('EventsToday');
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, MapPin, Clock } from "lucide-react";
import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Link } from "react-router-dom";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

interface EventItem {
  id: string;
  title: string;
  date: string;
  location: string;
  venue: string;
  price: string;
  category: string;
  enhanced_description: string;
  original_description: string;
  image_url: string;
  event_start_utc: string;
}

export default function EventsToday() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useDocumentTitle("Events Today");

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        const tz = "America/Chicago";
        const now = new Date();
        const nowLocal = toZonedTime(now, tz);
        const startLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
        const endLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999);
        const startUtc = fromZonedTime(startLocal, tz).toISOString();
        const endUtc = fromZonedTime(endLocal, tz).toISOString();
        
        const { data, error } = await supabase
          .from("events")
          .select("id, title, date, location, venue, price, category, enhanced_description, original_description, image_url, event_start_utc")
          .gte("date", startUtc)
          .lte("date", endUtc)
          .order("event_start_utc", { ascending: true, nullsFirst: false });
        
        if (error) {
          log.error('fetchEvents', 'Error fetching events', { error });
          setEvents([]);
        } else {
          setEvents(data || []);
        }
      } catch (error) {
        log.error('fetchEvents', 'Unexpected error in fetchEvents', { error });
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const todaysEvents = events || [];

  const pageTitle = `Events Today in Des Moines - ${format(new Date(), "MMMM d, yyyy")} | ${BRAND.name}`;
  const pageDescription = `Find events happening today, ${format(new Date(), "MMMM d, yyyy")}, in Des Moines and suburbs. See times, locations, and details for today's activities and entertainment.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Today", url: "/events/today" },
  ];

  const faqData = [
    {
      question: `What's happening today in Des Moines?`,
      answer: `We have ${todaysEvents.length} events happening today in Des Moines and surrounding areas. See our complete list with times, locations, and details.`,
    },
    {
      question: "How current is this information?",
      answer: "Our event information is updated in real-time throughout the day, so you'll always see the most current listings for today's activities.",
    },
    {
      question: "Are there free events today?",
      answer: "Yes! Use our event cards to see pricing information. Many events in Des Moines are free or low-cost.",
    },
    {
      question: "Can I get directions to events?",
      answer: "Each event card includes location information. Click through to get detailed directions and parking information.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl('/events/today')}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        isTimeSensitive={true}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: "Today" },
          ]}
          className="mb-4"
        />

        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Events Today in Des Moines</h1>
          </div>

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{format(new Date(), "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl">
            Discover what's happening today in Des Moines and surrounding areas. 
            From concerts to community events, find activities for every interest.
          </p>
        </div>

        {/* Quick Stats */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {todaysEvents.length}
                </div>
                <div className="text-sm text-muted-foreground">
                  Events Today
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {todaysEvents.filter(e => e.price === "Free" || e.price === "0").length}
                </div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {new Set(todaysEvents.map(e => e.location?.split(",")[0])).size}
                </div>
                <div className="text-sm text-muted-foreground">Locations</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded mb-4 w-3/4"></div>
                  <div className="h-20 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : todaysEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {todaysEvents.map((event) => (
              <EventCard key={event.id} event={event} onViewDetails={() => {}} />
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                No Events Scheduled for Today
              </h2>
              <p className="text-muted-foreground mb-4">
                Check back tomorrow or browse upcoming events happening this week.
              </p>
              <div className="flex justify-center gap-4">
                <Link to="/events/this-weekend" className="text-primary hover:underline">
                  This Weekend's Events
                </Link>
                <Link to="/events" className="text-primary hover:underline">
                  All Upcoming Events
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Related Links */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>More Event Ideas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/events/this-weekend"
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">This Weekend</h3>
                <p className="text-sm text-muted-foreground">
                  Weekend events and activities happening in Des Moines
                </p>
              </Link>
              <Link
                to="/restaurants"
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">Dining Today</h3>
                <p className="text-sm text-muted-foreground">
                  Great restaurants and eateries open today
                </p>
              </Link>
              <Link
                to="/attractions"
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">Attractions</h3>
                <p className="text-sm text-muted-foreground">
                  Museums, parks, and attractions to visit today
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}