import { useMemo } from "react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ListFreshness } from "@/components/ListFreshness";
import { FAQSection } from "@/components/FAQSection";
import { SocialEventCard } from "@/components/SocialEventCard";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { formatCount } from "@/lib/pluralize";
import { useWeather, reorderForWeather } from "@/hooks/useWeather";
import { useNow } from "@/hooks/useNow";
import {
  useEventLanding,
  useWindowIndoorFlags,
  groupTodayEvents,
  countFree,
  countStartingAfter5pm,
  formatCentralDate,
  hourLabel,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { EventsLandingLinks } from "@/components/events/EventsLandingLinks";
import { EVENING_START_HOUR } from "@/lib/tonightPairings";
import { WeatherNotice } from "@/components/WeatherNotice";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";

/**
 * Same render cap as the weekend and month landings (WEB-PERF-023). A busy
 * day can pass it; the overflow link opens today on the hub, where every
 * event is reachable.
 */
const VISIBLE_EVENTS = 36;

/** Row cap for today's window. At the cap the count reads "N+". */
const FETCH_LIMIT = 200;

const EMPTY: LandingEvent[] = [];

export default function EventsToday() {
  /**
   * WEB-SEO-031: this was a useState/useEffect fetch, and PrerenderSignal
   * (which counts TanStack queries in flight) could not see it, so the
   * prerenderer captured six pulsing cards. useEventLanding is a useQuery, so
   * the capture waits for the rows. It also applies the visibility predicates
   * this page used to skip, and the window is centralWindow("today"), the same
   * Central day the hub's Today preset uses.
   */
  /*
   * includeOngoing (events-pass2 WP3 item 1): day 3 of a festival, and last
   * night's show still running after midnight, are part of today. They group
   * under "Happening now" and drop off once over (groupTodayEvents).
   */
  const {
    data: events = EMPTY,
    isLoading,
    error: loadError,
    refetch,
    window: todayWindow,
  } = useEventLanding({
    key: { landing: "today" },
    window: "today",
    limit: FETCH_LIMIT,
    includeOngoing: true,
  });

  // A minute clock, so "Happening now" and "Tonight" regroup while the tab is
  // open instead of keeping the buckets from the moment it loaded.
  const now = useNow(60 * 1000);

  const { weather, hasVerdict } = useWeather();

  // Fetched by the day's bounds rather than by up to 200 ids in one in()
  // filter, and separately, so a not-yet-deployed column can never fail the
  // events query itself - see useWindowIndoorFlags.
  const indoorFlags = useWindowIndoorFlags(todayWindow, hasVerdict);

  /**
   * Grouped against the clock (Happening now / This afternoon / Tonight...),
   * then weather-ordered INSIDE each group, so a wet evening moves indoor
   * shows up within "Tonight" without moving them out of it. Reordering never
   * filters. The render cap is then filled group by group in page order.
   */
  const grouped = useMemo(
    () =>
      groupTodayEvents(events, now).map((group) => ({
        ...group,
        events: reorderForWeather(group.events, (event) => indoorFlags[event.id], weather),
      })),
    [events, now, indoorFlags, weather]
  );
  // What the page lists: carried rows that are already over are not in any
  // group, so the counts come from the groups, not the raw rows.
  const listed = useMemo(() => grouped.flatMap((group) => group.events), [grouped]);

  const groups = useMemo(() => {
    let remaining = VISIBLE_EVENTS;
    return grouped
      .map((group) => {
        const shown = group.events.slice(0, Math.max(remaining, 0));
        remaining -= shown.length;
        return { ...group, total: group.events.length, events: shown };
      })
      .filter((group) => group.events.length > 0);
  }, [grouped]);

  const visibleEvents = useMemo(() => groups.flatMap((group) => group.events), [groups]);
  const hiddenCount = listed.length - visibleEvents.length;

  // The day the rows were fetched for, under the h1, as the weekend page does.
  // Absolute, so it is still true in prerendered HTML read later that day.
  const dayLabel =
    todayWindow && !isLoading && !loadError
      ? formatCentralDate(todayWindow.startDay, "EEEE, MMMM d, yyyy")
      : null;

  /**
   * WEB-SEO-031: the title and description used to interpolate `new Date()`,
   * which in the prerendered HTML is the build clock, frozen. The date lives in
   * <ListFreshness> instead, computed from the rows.
   */
  const pageTitle = `Events Today in Des Moines | ${BRAND.name}`;
  const pageDescription = `Find events happening today in Des Moines and suburbs. See times, locations, and details for today's activities and entertainment.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Today", url: "/events/today" },
  ];

  // Static answers on purpose (WEB-SEO-008): a count interpolated here makes
  // the loading render and the loaded render emit different FAQPage JSON.
  // Every sentence describes something a reader can check on this page.
  const faqData = [
    {
      question: `What's happening today in Des Moines?`,
      answer: `This page lists the events on our calendar for today, Central time, in Des Moines and the surrounding suburbs, plus anything that started earlier and is still running. It is grouped into what is on now, this morning, this afternoon and tonight, which starts at ${hourLabel(EVENING_START_HOUR)}.`,
    },
    {
      question: "How often is this list updated?",
      answer: EVENTS_UPDATE_ANSWER,
    },
    {
      question: "Are there free events today?",
      answer: "Events whose listed price says free are marked Free on their cards and counted in the Free figure above. An event with no listed price says so; it is not counted as free.",
    },
    {
      question: "Can I get directions to events?",
      answer: "Each card shows the venue and links to the event's own page, which has the address.",
    },
  ];

  // WEB-PERF-030: one batch query per table instead of three queries and
  // three realtime channels per card.
  const batchSocialIds = useMemo(() => visibleEvents.map((e) => e.id), [visibleEvents]);
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocial(batchSocialIds);

  let cardIndex = 0;

  return (
    <div className="min-h-screen bg-background">
      {/* A failed first query has not answered "what's on today" (WP3 item 12). */}
      {loadError && events.length === 0 && <NoIndexMeta />}
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl('/events/today')}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        isTimeSensitive={true}
      />
      {/* The schema describes what the page shows: the capped list. */}
      <EventListJsonLd
        events={visibleEvents}
        maxItems={VISIBLE_EVENTS}
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

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <SpriteIcon name="calendar" className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">Events Today in Des Moines</h1>
          </div>
          {dayLabel && <p className="text-lg text-muted-foreground mb-2">{dayLabel}</p>}

          {/* SEO-009: a visible, absolute freshness date from the rows, not
              from the clock that ran the build. */}
          <ListFreshness rows={events} className="mb-4" />

          <div className="flex items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
          </div>

          <p className="text-lg text-muted-foreground max-w-3xl">
            What's on today in Des Moines and the suburbs, from what has already
            started to what starts tonight. All times are Central.
          </p>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {events.length >= FETCH_LIMIT ? `${listed.length}+` : listed.length}
                </div>
                <div className="text-sm text-muted-foreground">Events Today</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{countFree(listed)}</div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {countStartingAfter5pm(listed)}
                </div>
                <div className="text-sm text-muted-foreground">Starting after 5 PM</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Why the order changed (WEB-FEAT-022). Renders nothing without a verdict. */}
        <WeatherNotice weather={weather} hasVerdict={hasVerdict} className="mb-6" />

        {!isLoading && loadError ? (
          <ErrorState error={loadError} onRetry={() => void refetch()} />
        ) : isLoading ? (
          /* WEB-SEO-031: SkeletonGroup carries role="status" and aria-busy,
             which the prerender strict gate reads. */
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
        ) : visibleEvents.length > 0 ? (
          <>
            {groups.map((group) => (
              <section key={group.id} aria-labelledby={`today-${group.id}`} className="mb-8">
                <h2 id={`today-${group.id}`} className="text-2xl font-bold mb-4">
                  {group.label}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    ({formatCount(group.total, "event")})
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.events.map((event) => {
                    const index = cardIndex++;
                    return (
                      <SocialEventCard
                        priority={index < 3}
                        key={event.id}
                        event={event}
                        socialData={batchSocialData?.[event.id]}
                        socialDataPending={batchSocialPending}
                        onViewDetails={() => {}}
                      />
                    );
                  })}
                </div>
              </section>
            ))}

            {hiddenCount > 0 && (
              <div className="mb-8 text-center">
                <p className="text-muted-foreground mb-3">
                  Showing {visibleEvents.length} of {formatCount(listed.length, "event")} today.
                </p>
                <Button asChild variant="outline">
                  <Link to="/events?preset=today">See all of today on the events page</Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <SpriteIcon name="calendar" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Events Scheduled for Today</h2>
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
                  Friday through Sunday in Des Moines
                </p>
              </Link>
              <Link
                to="/restaurants/open-now"
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">Restaurants Open Now</h3>
                <p className="text-sm text-muted-foreground">
                  Somewhere to eat before or after
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
        {/* SEO-003: FAQSection renders the questions and emits the single
            FAQPage block, so the schema never describes an invisible FAQ. */}
        <EventsLandingLinks current="/events/today" className="mb-8" />
        <FAQSection faqs={faqData} />
      </div>

      <Footer />
    </div>
  );
}
