import React, { useMemo } from "react";
import { createLogger } from '@/lib/logger';
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_LIST_COLUMNS } from "@/lib/listColumns";
import { queryKeys } from "@/lib/queryKeys";
import { STALE_TIME } from "@/lib/queryConfig";
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
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Link } from "react-router-dom";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { formatCount } from "@/lib/pluralize";
import { useWeather, reorderForWeather } from "@/hooks/useWeather";
import { useEventIndoorFlags } from "@/hooks/useEventIndoorFlags";
import { WeatherNotice } from "@/components/WeatherNotice";

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
  useDocumentTitle("Events Today");

  /**
   * WEB-SEO-031. This was useState + useEffect + a raw supabase call, which is
   * invisible to PrerenderSignal: that component counts queries in flight via
   * useIsFetching, so a fetch outside React Query never registered and the
   * prerenderer captured whatever was on screen - a skeleton - and called the
   * page settled. /events/today shipped with 5 h3 where its sibling had 56.
   *
   * The query key goes through the factory so an admin edit invalidating
   * ['events'] reaches this page too (WEB-PERF-032), and the projection is the
   * shared EVENT_LIST_COLUMNS rather than a hand-listed set that drifts from
   * public.events.
   */
  const { data: events = [], isLoading } = useQuery({
    queryKey: queryKeys.events.list({ window: 'today' }),
    staleTime: STALE_TIME.CONTENT_LIST,
    queryFn: async (): Promise<EventItem[]> => {
      const tz = "America/Chicago";
      const nowLocal = toZonedTime(new Date(), tz);
      const startLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 0, 0, 0, 0);
      const endLocal = new Date(nowLocal.getFullYear(), nowLocal.getMonth(), nowLocal.getDate(), 23, 59, 59, 999);

      const { data, error } = await supabase
        .from("events")
        .select(EVENT_LIST_COLUMNS)
        .gte("date", fromZonedTime(startLocal, tz).toISOString())
        .lte("date", fromZonedTime(endLocal, tz).toISOString())
        .order("event_start_utc", { ascending: true, nullsFirst: false });

      if (error) {
        log.error('fetchEvents', 'Error fetching events', { error });
        throw error;
      }
      return (data || []) as unknown as EventItem[];
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
   * WEB-SEO-031: NO DATE HERE. Both strings interpolated new Date(), and this
   * route is prerendered - so the build clock, not the visitor's day, was
   * frozen into the <title> and the meta description that Google shows. A page
   * whose whole promise is "today" was advertising a date in the past from the
   * moment the build finished. The visible, checkable date lives in the body,
   * rendered by ListFreshness from the newest updated_at among the rows
   * actually listed, which stays true however old the capture is.
   */
  const pageTitle = `Events Today in Des Moines - Tonight's Concerts, Shows and Things to Do | ${BRAND.name}`;
  const pageDescription = `Everything happening today in Des Moines and the suburbs: concerts, shows, family activities and free events, with times and locations. Rebuilt daily.`;

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

          {/* WEB-SEO-031: the clock line here read format(new Date(), "EEEE,
              MMMM d, yyyy"), computed at render - which on a prerendered route
              means computed once at build and then served frozen. A crawler and
              every first-paint visitor saw the build's weekday, not their own.
              ListFreshness above carries the one date on this page that is a
              fact about the data rather than about the build. */}
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
        {isLoading ? (
          // WEB-SEO-031: role/aria-busy/aria-live are what let the prerender
          // strict gate tell a skeleton from a rendered list. Without them the
          // capture of an unsettled page looks like a legitimately empty one.
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <span className="sr-only">Loading today&apos;s events...</span>
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
            {todaysEvents.map((event, index) => (
              <SocialEventCard
                key={event.id}
                event={event}
                priority={index < 3}
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