import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createLogger } from '@/lib/logger';
import { supabase } from "@/integrations/supabase/client";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const log = createLogger('EventsToday');
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ListFreshness } from "@/components/ListFreshness";
import { FAQSection } from "@/components/FAQSection";
import { SocialEventCard } from "@/components/SocialEventCard";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Link } from "react-router-dom";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { formatCount } from "@/lib/pluralize";
import { useWeather, reorderForWeather } from "@/hooks/useWeather";
import { useEventIndoorFlags } from "@/hooks/useEventIndoorFlags";
import { WeatherNotice } from "@/components/WeatherNotice";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { queryKeys } from "@/lib/queryKeys";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";

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
  /**
   * Read by ListFreshness, which is what renders the visible "updated" date.
   * It has to be selected below as well: PostgREST returns exactly the
   * projection it is given, so a column named here but not there is simply
   * absent at runtime and newestTimestamp returns null - the component then
   * renders nothing, silently, which is the state this page shipped in.
   */
  updated_at: string | null;
}

export default function EventsToday() {

  /**
   * WEB-SEO-031 -- THIS WAS A useState/useEffect FETCH, AND THAT IS WHY THE
   * PRERENDERER SHIPPED A SKELETON.
   *
   * PrerenderSignal publishes "the data has arrived" by counting TanStack
   * queries in flight with useIsFetching. A hand-rolled fetch is invisible to
   * that count, so `seen` never became true, the GRACE_MS fallback fired at
   * 1.5s, and the capture was whatever had rendered by then - which for this
   * page was six pulsing cards. WEB-SEO-006 measured the result in production:
   * /events/today served 5 h3 where its sibling served 56.
   *
   * Using useQuery is the fix; nothing about the query itself is clever. The
   * projection is EVENT_LIST_COLUMNS rather than a hand-written column list,
   * which also picks up `updated_at` - the column ListFreshness needs and
   * whose omission from a projection is exactly the silent-empty failure the
   * EventItem docstring below records.
   */
  const {
    data: events = [],
    isLoading,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.events.list({ window: "today" }),
    queryFn: async (): Promise<EventItem[]> => {
      const tz = "America/Chicago";
      const now = new Date();
      const nowLocal = toZonedTime(now, tz);
      const startLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
      const endLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999);
      const startUtc = fromZonedTime(startLocal, tz).toISOString();
      const endUtc = fromZonedTime(endLocal, tz).toISOString();

      const { data, error } = await supabase
        .from("events")
        .select(EVENT_LIST_COLUMNS)
        .gte("date", startUtc)
        .lte("date", endUtc)
        .order("event_start_utc", { ascending: true, nullsFirst: false });

      if (error) {
        log.error("fetchEvents", "Error fetching events", { error });
        throw error;
      }
      return (data ?? []) as unknown as EventItem[];
    },
  });

  const { weather, hasVerdict } = useWeather();

  // Fetched separately so a not-yet-deployed column can never fail the events
  // query itself - see the header of useEventIndoorFlags.
  const loadedIds = useMemo(() => (events || []).map((event) => event.id), [events]);
  const indoorFlags = useEventIndoorFlags(loadedIds, hasVerdict);

  /**
   * Weather-aware ordering. This REORDERS and never filters, so a change in the
   * forecast can move a card but can never make the list shorter. With no
   * verdict, or no flags, the array passes through in its original date order.
   */
  const todaysEvents = useMemo(
    () => reorderForWeather(events || [], (event) => indoorFlags[event.id], weather),
    [events, indoorFlags, weather],
  );

  /**
   * WEB-SEO-031: both of these used to interpolate `new Date()`.
   *
   * On a client render that is today, which looks right in a browser and is
   * why it survived. In the PRERENDERED HTML it is the build clock, frozen -
   * so the file a crawler fetches has said "Events Today in Des Moines -
   * September 2, 2026" every day since the deploy, and a title asserting the
   * wrong date on a page whose whole promise is "today" is worse than no date
   * at all.
   *
   * The date is not lost, it moved to where it can be true: <ListFreshness>
   * below renders it from the newest event's `updated_at`, in the browser,
   * from data rather than from the clock that happened to run the build.
   * SEO-009 AC3 asks for the same thing.
   */
  const pageTitle = `Events Today in Des Moines | ${BRAND.name}`;
  const pageDescription = `Find events happening today in Des Moines and suburbs. See times, locations, and details for today's activities and entertainment.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Today", url: "/events/today" },
  ];

  const faqData = [
    {
      question: `What's happening today in Des Moines?`,
      answer: `See everything happening today in Des Moines and surrounding areas, with times, locations and details. The list is rebuilt daily.`,
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

  // WEB-PERF-030. SocialEventCard falls back to useEventSocial(event.id)
  // when no batch data is passed, and that fallback ran three queries and
  // opened three realtime channels PER CARD. This page renders up to
  // todaysEvents.length of them, so one anonymous visit could issue hundreds of
  // requests and sockets for a preview nobody can interact with. One batch
  // query per table replaces all of it.
  const batchSocialIds = useMemo(() => (todaysEvents ?? []).map((e) => e.id), [todaysEvents]);
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocial(batchSocialIds);

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl('/events/today')}
        pageType="website"
        breadcrumbs={breadcrumbs}
        // Withheld until the data lands (WEB-SEO-008). Every answer here
        // interpolates a live count, so the loading render and the loaded
        // render produce DIFFERENT FAQPage JSON - and react-helmet-async
        // appends script children that differ rather than replacing them, so
        // the prerender captured both. Production served two FAQPage blocks
        // on this page, one saying "0 events" and one saying "8 events".
        faqData={faqData}
        isTimeSensitive={true}
      />
      <EventListJsonLd
        events={todaysEvents}
        /* WEB-SEO-031: was `... - ${format(new Date(), "MMMM d, yyyy")}`, so
           the JSON-LD list asserted the build date as the day it covers. */
        listName="Events Today in Des Moines"
        listDescription={pageDescription}
        listUrl={getCanonicalUrl('/events/today')}
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
            <SpriteIcon name="calendar" className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Events Today in Des Moines</h1>
          </div>

          {/* SEO-009: a visible, absolute freshness date. These are the pages
              somebody checks again next Friday, and the only freshness claim on
              them lived in the meta description ("Updated daily"), where the
              reader it is aimed at cannot check it. Absolute rather than
              relative on purpose - these pages are prerendered, so a relative
              string is computed once at build time and frozen, and would still
              read "2 hours ago" days later. Renders nothing when no row carries
              a usable date. */}
          <ListFreshness rows={todaysEvents} className="mb-4" />

          {/* WEB-SEO-031: a `format(new Date())` date USED TO SIT HERE, beside
              the location. In the prerendered file it is the build date, shown
              to a crawler and to any visitor without JS as though it were
              today - the one claim this page cannot afford to get wrong. The
              <ListFreshness> above already carries a date, and it comes from
              the newest event's updated_at rather than from a clock. */}
          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-4 w-4" />
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

        {/* Why the order changed (WEB-FEAT-022). Renders nothing without a verdict. */}
        <WeatherNotice weather={weather} hasVerdict={hasVerdict} className="mb-6" />

        {/* Events List */}
        {!isLoading && loadError ? (
          <ErrorState error={loadError} onRetry={() => void refetch()} />
        ) : isLoading ? (
          /* WEB-SEO-031: the skeleton carried no aria-busy and no loading
             text, so the prerenderer's strict gate had nothing to recognise
             and accepted a capture of six pulsing cards as the page.
             SkeletonGroup supplies role="status", aria-busy and an sr-only
             label - which the gate reads and a screen reader announces. */
          <SkeletonGroup
            label="Loading today's events..."
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded mb-2"></div>
                  <div className="h-4 bg-muted rounded mb-4 w-3/4"></div>
                  <div className="h-20 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </SkeletonGroup>
        ) : todaysEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {todaysEvents.map((event, index) => (
              <SocialEventCard
                priority={index < 3}
                  key={event.id}
                  event={event}
                  socialData={batchSocialData?.[event.id]}
                  socialDataPending={batchSocialPending}
                  onViewDetails={() => {}}
                />
            ))}
          </div>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <SpriteIcon name="calendar" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
        {/* SEO-003: the FAQ is rendered here, not only declared in the head.
            This page used to pass faqData to EnhancedLocalSEO, which emitted a
            FAQPage block into <Helmet> and nothing else - so it declared an FAQ
            that no visitor could see, which Google's FAQPage guidance does not
            allow. FAQSection renders the questions and emits the single block. */}
        <FAQSection faqs={faqData} />

      </div>

      <Footer />
    </div>
  );
}