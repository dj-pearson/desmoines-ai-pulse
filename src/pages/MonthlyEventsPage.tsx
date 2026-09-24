import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EventCard from "@/components/EventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import { FAQSection } from "@/components/FAQSection";
import { ListFreshness } from "@/components/ListFreshness";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import {
  useEventLanding,
  groupByWeek,
  countFree,
  countStartingAfter5pm,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import { BRAND } from "@/lib/brandConfig";
import { formatCount } from "@/lib/pluralize";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";

/**
 * WEB-PERF-023. The grid rendered every event in the month, which measured
 * 14,857 DOM elements on /events/august-2026 (268 events), the worst route on
 * the site. 36 is twelve full rows of the lg:grid-cols-3 grid. Every event
 * stays reachable through /events, the month navigation and its own page; if
 * the whole month must render, the fix is a cheaper card, not a bigger cap.
 */
const VISIBLE_EVENTS = 36;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const EMPTY: LandingEvent[] = [];
const ALL = "all";

interface MonthRef {
  year: number;
  /** 1-12 */
  month: number;
}

/** "August-2026" or "august-2026" -> { year: 2026, month: 8 }; null when unparseable. */
function parseMonthSlug(slug: string | undefined): MonthRef | null {
  if (!slug) return null;
  const match = /^([a-z]+)-(\d{4})$/i.exec(slug);
  if (!match) return null;
  const index = MONTHS.indexOf(match[1].toLowerCase());
  if (index < 0) return null;
  return { year: Number(match[2]), month: index + 1 };
}

function shiftMonth({ year, month }: MonthRef, delta: number): MonthRef {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

function monthSlug({ year, month }: MonthRef): string {
  return `${MONTHS[month - 1]}-${year}`;
}

function monthName({ year, month }: MonthRef): string {
  const name = MONTHS[month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export default function MonthlyEventsPage() {
  const { slug } = useParams<{ slug: string }>();
  const parsed = parseMonthSlug(slug);
  // A fallback month keeps the hook order stable; the query is disabled when
  // the slug does not parse, and the page renders the invalid state below.
  const target: MonthRef = parsed ?? { year: 2000, month: 1 };

  const { getStr, setParam } = useUrlFilters();
  const selectedCategory = getStr("category", ALL);

  /**
   * The window is centralWindow(month): the first Central midnight of the
   * month to the last millisecond of its last Central day. The old query
   * bounded a TIMESTAMPTZ with bare dates, which read as UTC midnight: it
   * dropped the last evening of the month (after 7 PM CDT is already the next
   * UTC day) and pulled in the previous month's last evening. Keyed under
   * queryKeys.events.list (it was ['monthly-events', slug]).
   */
  const {
    data: allEvents = EMPTY,
    isLoading,
    isError,
    error,
    refetch,
    window: monthWindow,
  } = useEventLanding({
    key: { landing: "month" },
    window: { kind: "month", year: target.year, month: target.month },
    limit: 1000,
    enabled: parsed !== null,
  });

  const events = useMemo(
    () =>
      selectedCategory === ALL
        ? allEvents
        : allEvents.filter((event) => event.category === selectedCategory),
    [allEvents, selectedCategory]
  );

  const categories = useMemo(
    () => [...new Set(allEvents.map((event) => event.category).filter(Boolean))].sort(),
    [allEvents]
  );

  const visibleEvents = useMemo(() => events.slice(0, VISIBLE_EVENTS), [events]);

  /** Week headings over the capped list; each heading counts its whole week. */
  const weeks = useMemo(() => {
    if (!monthWindow) return [];
    const totals = new Map(
      groupByWeek(events, monthWindow.startDay, monthWindow.endDay).map((w) => [w.id, w.events.length])
    );
    return groupByWeek(visibleEvents, monthWindow.startDay, monthWindow.endDay).map((week) => ({
      ...week,
      total: totals.get(week.id) ?? week.events.length,
    }));
  }, [events, visibleEvents, monthWindow]);

  if (!parsed) {
    return <div>Invalid date format</div>;
  }

  const canonicalSlug = monthSlug(parsed);
  const prev = shiftMonth(parsed, -1);
  const next = shiftMonth(parsed, 1);
  const monthDisplayName = monthName(parsed);
  const canonicalUrl = `${BRAND.baseUrl}/events/${canonicalSlug}`;

  const pageTitle = `${monthDisplayName} Events in Des Moines - Complete Calendar`;
  const pageDescription = `Complete list of events happening in ${monthDisplayName} in Des Moines and suburbs. Concerts, festivals, community events, and entertainment activities with dates, times, and details.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: monthDisplayName, url: `/events/${canonicalSlug}` },
  ];

  // No live count in these answers: FAQSection emits FAQPage JSON, and a
  // count makes the loading and loaded renders disagree (WEB-SEO-008).
  const faqData = [
    {
      question: `What events are happening in ${monthDisplayName} in Des Moines?`,
      answer: `This page lists the events on our calendar for ${monthDisplayName}, Central time, in Des Moines and surrounding areas, grouped by week, with dates, times and venues.`,
    },
    {
      question: "How often is the monthly calendar updated?",
      answer: EVENTS_UPDATE_ANSWER,
    },
    {
      question: "Do you include events in Des Moines suburbs?",
      answer: "Yes. The calendar includes events across the Des Moines metro, including West Des Moines, Ankeny, Urbandale, Johnston and other nearby communities.",
    },
    {
      question: "Can I filter events by category or type?",
      answer: "Yes. The category buttons on this page narrow the month to one category.",
    },
  ];

  let cardIndex = 0;

  const monthNav = (
    <div className="flex flex-wrap justify-between items-center gap-3">
      <Button asChild variant="outline" className="min-h-11">
        <Link to={`/events/${monthSlug(prev)}`} rel="prev">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {monthName(prev)}
        </Link>
      </Button>
      <Button asChild variant="outline" className="min-h-11">
        <Link to={`/events/${monthSlug(next)}`} rel="next">
          {monthName(next)}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={canonicalUrl}
        pageType="website"
        breadcrumbs={breadcrumbs}
        isTimeSensitive={true}
      />
      {/* The schema describes what the page shows: the capped list. */}
      <EventListJsonLd
        events={visibleEvents}
        maxItems={VISIBLE_EVENTS}
        listName={pageTitle}
        listDescription={pageDescription}
        listUrl={canonicalUrl}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: monthDisplayName },
          ]}
        />

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <SpriteIcon name="calendar" className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">{monthDisplayName} Events</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
            <div className="flex items-center gap-1">
              <SpriteIcon name="clock" className="h-4 w-4" />
              <span>{formatCount(events.length, "event")} this month</span>
            </div>
          </div>
          <ListFreshness rows={allEvents} className="mb-4" />
          {monthNav}
        </div>

        <p className="text-lg text-muted-foreground mb-8 max-w-3xl">
          Events in {monthDisplayName} across Des Moines and the suburbs, week by
          week. All times are Central.
        </p>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">{events.length}</div>
                <div className="text-sm text-muted-foreground">Total Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{countFree(events)}</div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{categories.length}</div>
                <div className="text-sm text-muted-foreground">Event Categories</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{countStartingAfter5pm(events)}</div>
                <div className="text-sm text-muted-foreground">Starting after 5 PM</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {categories.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle id="month-category-label">Filter by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div role="group" aria-labelledby="month-category-label" className="flex flex-wrap gap-2">
                {[ALL, ...categories].map((category) => (
                  <Button
                    key={category}
                    type="button"
                    size="sm"
                    className="min-h-11"
                    variant={selectedCategory === category ? "default" : "outline"}
                    aria-pressed={selectedCategory === category}
                    onClick={() => setParam("category", category, { def: ALL })}
                  >
                    {category === ALL ? "All Events" : category}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <SkeletonGroup
            label={`Loading ${monthDisplayName} events...`}
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
        ) : events.length > 0 ? (
          <>
            {weeks.map((week) => (
              <section key={week.id} aria-labelledby={week.id} className="mb-10">
                <h2 id={week.id} className="text-2xl font-bold mb-4">
                  {week.label}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    ({formatCount(week.total, "event")})
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {week.events.map((event) => {
                    const index = cardIndex++;
                    // The first row is the LCP candidate and must not be lazy (WEB-SEO-032).
                    return (
                      <EventCard
                        key={event.id}
                        event={event}
                        onViewDetails={() => {}}
                        priority={index < 3}
                      />
                    );
                  })}
                </div>
              </section>
            ))}

            {events.length > VISIBLE_EVENTS && (
              <div className="mb-12 text-center">
                <p className="text-muted-foreground mb-3">
                  Showing {VISIBLE_EVENTS} of {formatCount(events.length, "event")} in{" "}
                  {monthDisplayName}.
                </p>
                <Button asChild variant="outline">
                  <Link to="/events">Browse all events</Link>
                </Button>
              </div>
            )}

            <Card className="mb-8">
              <CardContent className="pt-6">{monthNav}</CardContent>
            </Card>
          </>
        ) : isError ? (
          // WEB-QA-031: a failed fetch must not claim the month is empty.
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <Card className="text-center py-12">
            <CardContent>
              <SpriteIcon name="calendar" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Events Found for {monthDisplayName}</h2>
              <p className="text-muted-foreground mb-4">
                {selectedCategory !== ALL
                  ? `No ${selectedCategory.toLowerCase()} events found for this month. Try viewing all categories.`
                  : "No events are currently scheduled for this month. Check back later or browse other months."}
              </p>
              <div className="flex justify-center gap-4">
                {selectedCategory !== ALL && (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setParam("category", ALL, { def: ALL })}
                  >
                    Show All Categories
                  </Button>
                )}
                <Button asChild className="min-h-11">
                  <Link to="/events">Browse All Events</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <FAQSection
          faqs={faqData}
          title="Monthly Events Questions"
          description={`Common questions about ${monthDisplayName} events in Des Moines`}
        />
      </div>

      <Footer />
    </div>
  );
}
