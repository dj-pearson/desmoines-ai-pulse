import React, { useState, useEffect, useMemo } from "react";
import { useParams, useLocation as useRouterLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createLogger } from '@/lib/logger';
import { supabase } from "@/integrations/supabase/client";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const log = createLogger('EventsByLocation');
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FAQSection } from "@/components/FAQSection";
import { SocialEventCard } from "@/components/SocialEventCard";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";
import { format, parseISO, isAfter } from "date-fns";
import { BRAND } from "@/lib/brandConfig";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";

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
  // WEB-SEO-002: this read `useParams().location`, but App.tsx mounts this
  // component on SEVEN LITERAL paths (/events/ankeny, /events/urbandale, ...)
  // rather than on /events/:location — a param route there would collide with
  // the /events/:slug event-detail handler that follows it. With no matching
  // param, `location` was always undefined, so suburbInfo was always null and
  // every one of the seven pages rendered the "Location Not Found" branch.
  //
  // They are all in sitemap-static.xml and all prerendered, so we were serving
  // crawlers a not-found page, under one shared title, for the seven
  // "<suburb> events" queries — some of the most winnable terms we have.
  // Found by auditing the shipped HTML; the source reads perfectly well.
  //
  // Derive the slug from the pathname, keeping the param as the preferred
  // source so a future /events/:location route would still work.
  const { location: locationParam } = useParams<{ location: string }>();
  const { pathname } = useRouterLocation();
  const slug = locationParam ?? pathname.split('/').filter(Boolean).pop() ?? null;

  const suburbInfo = slug ? SUBURBS[slug as keyof typeof SUBURBS] : null;

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
          // NOTE: `time` and `status` are not columns on public.events (see the
          // warning on EVENT_LIST_COLUMNS in src/lib/listColumns.ts). Naming them
          // made PostgREST reject the whole projection with 42703, so this page
          // rendered zero events on every load. Neither field was read downstream.
          .select("id, title, date, location, venue, price, category, enhanced_description, original_description, image_url, event_start_utc, city")
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
    queryKey: ["restaurants-by-location", slug],
    queryFn: async () => {
      if (!suburbInfo) return [];

      const { data, error } = await supabase
        .from("restaurants")
        .select(RESTAURANT_LIST_COLUMNS)
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

  // Moved above the early return below (WEB-PERF-030): it depends only on
  // the events query, and the hooks that follow it must run on every render.
  // Two full rows of the lg:grid-cols-3 grid below. This route prerendered
  // 4,077 elements inside #root against a median of 496 across all 35 routes,
  // and Lighthouse flags above ~1,500 - a cost paid in HTML parse, DOM memory
  // and hydration, all main-thread (WEB-PERF-023).
  //
  // ONLY THE RENDERED LIST IS CAPPED. Every count on this page - the FAQ answer,
  // the stat block, the this-week filter - still reads upcomingEvents.length, so
  // no number a user sees changes.
  const VISIBLE_EVENTS = 24;

  const upcomingEvents =
    events?.filter((event) => {
      try {
        return isAfter(parseISO(event.date), new Date());
      } catch {
        return false;
      }
    }) || [];

  const visibleEvents = upcomingEvents.slice(0, VISIBLE_EVENTS);
  const hiddenEventCount = upcomingEvents.length - visibleEvents.length;

  // WEB-PERF-030. SocialEventCard falls back to useEventSocial(event.id)
  // when no batch data is passed, and that fallback ran three queries and
  // opened three realtime channels PER CARD. This page renders up to
  // visibleEvents.length of them, so one anonymous visit could issue hundreds of
  // requests and sockets for a preview nobody can interact with. One batch
  // query per table replaces all of it.
  const batchSocialIds = useMemo(() => (visibleEvents ?? []).map((e) => e.id), [visibleEvents]);
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocial(batchSocialIds);

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


  const pageTitle = `${suburbInfo.name} Events - Things To Do | ${BRAND.name}`;
  const pageDescription = `Find events in ${suburbInfo.name}, Iowa. ${suburbInfo.description} See dates, times, locations, and get directions.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: suburbInfo.name, url: `/events/${slug}` },
  ];

  // NO LIVE COUNT IN ANY ANSWER, and that is the whole point (WEB-SEO-008).
  //
  // This answer used to interpolate upcomingEvents.length, which made the FAQ
  // differ between the loading render and the loaded one - so the block below
  // had to withhold it while loading, or react-helmet-async would append both
  // and production would serve two FAQPage blocks saying different numbers.
  //
  // Withholding traded that for a worse failure: whenever the prerenderer
  // captured a route before its query resolved, the page shipped with NO
  // FAQPage at all. Measured on the 2026-08-28 build, /events/altoona and
  // /events/johnston had zero while /events/clive and /events/windsor-heights -
  // same 5 h3, same empty ItemList - had one. A race, not a data difference.
  //
  // A count in structured data is also wrong on its own terms: it is a snapshot
  // that goes stale the moment an event is ingested, and Google may well read a
  // number the page no longer shows.
  const faqData = [
    {
      question: `What events are happening in ${suburbInfo.name}?`,
      answer: `Browse upcoming ${suburbInfo.name} events below for dates, times and locations. The list is updated daily as new events are announced.`,
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
        canonicalUrl={`${BRAND.baseUrl}/events/${slug}`}
        pageType="website"
        breadcrumbs={breadcrumbs}
        // Always emitted now. It used to be withheld while loading because the
        // answers carried a live event count, so the loading and loaded renders
        // produced different FAQPage JSON and react-helmet-async appended both
        // rather than replacing - production served two blocks, one saying
        // "0 events" and one saying "8 events".
        //
        // faqData no longer depends on any loaded value (see its definition
        // above), so both renders produce byte-identical JSON and there is
        // nothing to duplicate. That removes the reason to withhold, and with it
        // the failure withholding caused: a route captured before its query
        // resolved shipped with no FAQPage at all.
        faqData={faqData}
        suburb={suburbInfo.name}
      />
      <EventListJsonLd
        events={upcomingEvents || []}
        listName={`Events in ${suburbInfo.name}, Iowa`}
        listDescription={pageDescription}
        listUrl={`${BRAND.baseUrl}/events/${slug}`}
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
            <SpriteIcon name="map-pin" className="h-6 w-6 text-primary" />
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
              <SpriteIcon name="calendar" className="h-6 w-6" />
              Upcoming Events
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleEvents.map((event) => (
                <SocialEventCard
                  key={event.id}
                  event={event}
                  socialData={batchSocialData?.[event.id]}
                  socialDataPending={batchSocialPending}
                  onViewDetails={() => {}}
                />
              ))}
            </div>
            {hiddenEventCount > 0 && (
              // Say what is not shown. A list that stops at 36 without saying so
              // reads as "there are 36 events here", which is how a truncation
              // becomes a fact (WEB-PERF-023).
              <p className="mt-6 text-sm text-muted-foreground">
                Showing the first {VISIBLE_EVENTS} of {upcomingEvents.length} upcoming events in{' '}
                {suburbInfo.name}.
              </p>
            )}
          </div>
        ) : (
          <Card className="mb-8">
            <CardContent className="pt-6 text-center">
              <SpriteIcon name="calendar" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
              <SpriteIcon name="users" className="h-6 w-6" />
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

        {/* SEO-003: one component renders the questions and emits the single
            FAQPage block, so the schema cannot describe content that is not on
            the page. The heading stays "About <suburb>" — it is the visible
            title, and the questions underneath are the same either way. */}
        <FAQSection faqs={faqData} title={`About ${suburbInfo.name}`} />
      </div>

      <Footer />
    </div>
  );
}
