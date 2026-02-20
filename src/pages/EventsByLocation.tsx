import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createLogger } from '@/lib/logger';
import { supabase } from "@/integrations/supabase/client";

const log = createLogger('EventsByLocation');
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Calendar, Users, Star } from "lucide-react";
import { format, parseISO, isAfter } from "date-fns";
import { BRAND } from "@/lib/brandConfig";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

// Suburb mapping for SEO-friendly URLs and proper names
const SUBURBS = {
  "west-des-moines": {
    name: "West Des Moines",
    searchTerms: ["West Des Moines", "WDM", "Valley Junction"],
    description:
      "West Des Moines offers family-friendly events, outdoor activities, and cultural attractions in the heart of Iowa.",
    neighborhoods: ["Valley Junction", "Jordan Creek", "Clive"],
  },
  ankeny: {
    name: "Ankeny",
    searchTerms: ["Ankeny"],
    description:
      "Ankeny is known for its community events, parks, and family activities just north of Des Moines.",
    neighborhoods: ["Downtown Ankeny", "Prairie Trail"],
  },
  urbandale: {
    name: "Urbandale",
    searchTerms: ["Urbandale"],
    description:
      "Urbandale hosts seasonal festivals, community gatherings, and outdoor recreation events.",
    neighborhoods: ["Downtown Urbandale", "Living History Farms"],
  },
  johnston: {
    name: "Johnston",
    searchTerms: ["Johnston"],
    description:
      "Johnston features community events, outdoor activities, and family-friendly attractions.",
    neighborhoods: ["Downtown Johnston", "Terra Park"],
  },
  altoona: {
    name: "Altoona",
    searchTerms: ["Altoona", "Adventureland"],
    description:
      "Altoona is home to Adventureland and hosts numerous family events and community celebrations.",
    neighborhoods: ["Downtown Altoona", "Adventureland Area"],
  },
  clive: {
    name: "Clive",
    searchTerms: ["Clive"],
    description:
      "Clive offers upscale events, outdoor activities, and community gatherings in west Des Moines metro.",
    neighborhoods: ["Clive Village", "Greenbelt Trail"],
  },
  "windsor-heights": {
    name: "Windsor Heights",
    searchTerms: ["Windsor Heights"],
    description:
      "Windsor Heights hosts intimate community events and local gatherings in a charming suburban setting.",
    neighborhoods: ["Downtown Windsor Heights"],
  },
};

export default function EventsByLocation() {
  const { location } = useParams<{ location: string }>();

  const suburbInfo = location
    ? SUBURBS[location as keyof typeof SUBURBS]
    : null;

  useDocumentTitle(suburbInfo?.name ? `Events in ${suburbInfo.name}` : "Events by Location");

  interface EventItem {
    id: string;
    title: string;
    date: string;
    time?: string;
    location: string;
    venue: string;
    price: string;
    category: string;
    enhanced_description: string;
    original_description: string;
    image_url: string;
    event_start_utc: string;
    status?: string;
    city?: string;
  }

  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setIsLoading(true);
        const today = new Date().toISOString().split("T")[0];
        
        const { data, error } = await supabase
          .from("events")
          .select("id, title, date, time, location, venue, price, category, enhanced_description, original_description, image_url, event_start_utc, status, city")
          .gte("date", today)
          .order("date", { ascending: true });
        
        if (error) {
          log.error('fetchEvents', 'Error fetching events', { error });
          setEvents([]);
        } else {
          // Filter events that match the suburb
          const filteredData = (data || []).filter((event) => {
            const eventLocation = (
              event.location ||
              event.venue ||
              ""
            ).toLowerCase();
            return suburbInfo.searchTerms.some((term: string) =>
              eventLocation.includes(term.toLowerCase())
            );
          });
          setEvents(filteredData);
        }
      } catch (error) {
        log.error('fetchEvents', 'Unexpected error in fetchEvents', { error });
        setEvents([]);
      } finally {
        setIsLoading(false);
      }
    };

    if (suburbInfo) {
      fetchEvents();
    }
  }, [suburbInfo]);

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-by-location", location],
    queryFn: async () => {
      if (!suburbInfo) return [];

      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("status", "active")
        .limit(5);

      if (error) throw error;

      // Filter restaurants that match the suburb
      return (data || []).filter((restaurant) => {
        const restaurantLocation = (
          restaurant.location ||
          restaurant.city ||
          ""
        ).toLowerCase();
        return suburbInfo.searchTerms.some((term) =>
          restaurantLocation.includes(term.toLowerCase())
        );
      });
    },
    enabled: !!suburbInfo,
  });

  if (!suburbInfo) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Card>
            <CardContent className="pt-6 text-center">
              <h1 className="text-2xl font-bold mb-4">Location Not Found</h1>
              <p className="text-muted-foreground">
                The location you're looking for doesn't exist.
                <a href="/events" className="text-primary hover:underline ml-1">
                  Browse all events
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const upcomingEvents =
    events?.filter((event) => {
      try {
        return isAfter(parseISO(event.date), new Date());
      } catch {
        return false;
      }
    }) || [];

  const pageTitle = `${suburbInfo.name} Events - Things To Do | ${BRAND.name}`;
  const pageDescription = `Find events in ${suburbInfo.name}, Iowa. ${suburbInfo.description} See dates, times, locations, and get directions.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: suburbInfo.name, url: `/events/${location}` },
  ];

  const faqData = [
    {
      question: `What events are happening in ${suburbInfo.name}?`,
      answer: `We currently have ${upcomingEvents.length} upcoming events in ${suburbInfo.name}. Check our list below for dates, times, and locations.`,
    },
    {
      question: `What is ${suburbInfo.name} known for?`,
      answer: suburbInfo.description,
    },
    {
      question: `How do I get to ${suburbInfo.name} from Des Moines?`,
      answer: `${suburbInfo.name} is easily accessible from downtown Des Moines by car. Check individual event listings for specific addresses and parking information.`,
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={`${BRAND.baseUrl}/events/${location}`}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        suburb={suburbInfo.name}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: suburbInfo.name },
          ]}
        />
        {/* Hero Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Events in {suburbInfo.name}</h1>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl mb-6">
            {suburbInfo.description}
          </p>

          {/* Quick Stats */}
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {upcomingEvents.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Upcoming Events
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {
                      upcomingEvents.filter(
                        (e) => e.price === "Free" || e.price === "0"
                      ).length
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Free Events
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {restaurants?.length || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Local Restaurants
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Events List */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
        ) : upcomingEvents.length > 0 ? (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              Upcoming Events
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingEvents.map((event) => (
                <EventCard key={event.id} event={event} onViewDetails={() => {}} />
              ))}
            </div>
          </div>
        ) : (
          <Card className="mb-8">
            <CardContent className="pt-6 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Upcoming Events</h2>
              <p className="text-muted-foreground mb-4">
                No events are currently scheduled for {suburbInfo.name}. Check
                back later or browse events in nearby areas.
              </p>
              <div className="flex justify-center gap-4">
                <a href="/events" className="text-primary hover:underline">
                  All Des Moines Events
                </a>
                <a
                  href="/events/this-weekend"
                  className="text-primary hover:underline"
                >
                  This Weekend's Events
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Local Restaurants */}
        {restaurants && restaurants.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Users className="h-6 w-6" />
              Local Dining in {suburbInfo.name}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {restaurants.slice(0, 6).map((restaurant) => (
                <Card
                  key={restaurant.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2">{restaurant.name}</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      {restaurant.cuisine || "Restaurant"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {restaurant.location || restaurant.city}
                    </p>
                    <div className="flex justify-between items-center mt-3">
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm">Local Favorite</span>
                      </div>
                      <a
                        href={`/restaurants/${restaurant.id}`}
                        className="text-primary hover:underline text-sm"
                      >
                        View Details
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* FAQ Section */}
        <Card>
          <CardHeader>
            <CardTitle>About {suburbInfo.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {faqData.map((faq, index) => (
              <div key={index} className="border-b pb-4 last:border-b-0">
                <h3 className="font-semibold mb-2">{faq.question}</h3>
                <p className="text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
