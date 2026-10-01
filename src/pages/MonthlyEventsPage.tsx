import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SocialEventCard } from "@/components/SocialEventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { FAQSection } from "@/components/FAQSection";
import { ListFreshness } from "@/components/ListFreshness";
import { EventsLandingLinks } from "@/components/events/EventsLandingLinks";
import { MonthCalendarGrid } from "@/components/events/MonthCalendarGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import {
  useEventLanding,
  useLandingCards,
  groupByWeek,
  splitAtToday,
  countByCentralDay,
  countFree,
  countLabel,
  countStartingAfter5pm,
  LANDING_LIGHT_COLUMNS,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import { BRAND } from "@/lib/brandConfig";
import { centralDateOf } from "@/lib/timezone";
import {
  centralMonthOf,
  isCurrentMonth,
  isIndexableMonth,
  isMonthInRange,
  isYearInRange,
  monthName,
  monthSlug,
  parseMonthSlug,
  shiftMonth,
  type MonthRef,
} from "@/lib/monthPages";
import { formatCount } from "@/lib/pluralize";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";

/**
 * WEB-PERF-023. The grid rendered every event in the month, which measured
 * 14,857 DOM elements on /events/august-2026 (268 events), the worst route on
 * the site. 36 is twelve full rows of the lg:grid-cols-3 grid. The calendar
 * grid above the cards covers every day of the month and links each one to
 * the hub, so the cap hides nothing that isn't a click away.
 */
const VISIBLE_EVENTS = 36;

/** Row cap for the month window. Counts at the cap read "1000+". */
const FETCH_LIMIT = 1000;

const EMPTY: LandingEvent[] = [];
const ALL = "all";

/** The not-found state for a month outside the range's years (WP3 item 6). */
function MonthNotFound({ label }: { label: string | null }) {
  const current = centralMonthOf(new Date());
  return (
    <div className="min-h-screen bg-background">
      <NoIndexMeta />
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
        <SpriteIcon name="calendar" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-3">
          {label ? `No calendar for ${label}` : "No calendar for that month"}
        </h1>
        <p className="text-muted-foreground mb-6">
          Month pages cover last month through twelve months ahead.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="min-h-11">
            <Link to={`/events/${monthSlug(current)}`}>{monthName(current)} events</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/events">All upcoming events</Link>
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function MonthlyEventsPage() {
  const { slug } = useParams<{ slug: string }>();
  const parsed = parseMonthSlug(slug);
  const now = new Date();
  const renderable = parsed !== null && isYearInRange(parsed.year, now);
  // A fallback month keeps the hook order stable; the query is disabled when
  // the slug is not renderable, and the page renders the not-found state.
  const target: MonthRef = parsed ?? { year: 2000, month: 1 };

  const { getStr, setParam } = useUrlFilters();
  const selectedCategory = getStr("category", ALL);

  /**
   * The window is centralWindow(month). Light rows for the whole month (WP3
   * item 7): the grid, the week totals and the stats read only these. Full
   * card rows are fetched for the 36 rendered, by id, below.
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
    limit: FETCH_LIMIT,
    enabled: renderable,
    columns: LANDING_LIGHT_COLUMNS,
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

  const today = centralDateOf(now);
  const current = renderable && isCurrentMonth(target, now);

  /**
   * The current month starts today (WP3 item 5): days already over fold into
   * "Earlier this month", and the 36-card cap fills from today forward.
   * Other months list from the 1st.
   */
  const { earlier, upcoming } = useMemo(
    () => (current ? splitAtToday(events, today) : { earlier: EMPTY, upcoming: events }),
    [current, events, today]
  );

  const visibleRows = useMemo(() => upcoming.slice(0, VISIBLE_EVENTS), [upcoming]);

  /** Earlier weeks the reader opened; closed, they render no cards. */
  const [earlierOpen, setEarlierOpen] = useState(false);
  const earlierRows = useMemo(
    () => (earlierOpen ? earlier.slice(0, VISIBLE_EVENTS) : EMPTY),
    [earlierOpen, earlier]
  );

  const renderedRows = useMemo(() => [...visibleRows, ...earlierRows], [visibleRows, earlierRows]);
  const { cards, isPending: cardsPending } = useLandingCards(renderedRows, renderable);
  const cardById = useMemo(() => new Map(cards.map((row) => [row.id, row])), [cards]);
  const card = (event: LandingEvent): LandingEvent => cardById.get(event.id) ?? event;
  const visibleCards = useMemo(
    () => visibleRows.map((event) => cardById.get(event.id) ?? event),
    [visibleRows, cardById]
  );

  /** Week headings over the capped list; each heading counts its whole week. */
  const weeks = useMemo(() => {
    if (!monthWindow) return [];
    const carryTo = current ? today : undefined;
    const totals = new Map(
      groupByWeek(upcoming, monthWindow.startDay, monthWindow.endDay, carryTo).map((w) => [
        w.id,
        w.events.length,
      ])
    );
    return groupByWeek(visibleRows, monthWindow.startDay, monthWindow.endDay, carryTo).map(
      (week) => ({ ...week, total: totals.get(week.id) ?? week.events.length })
    );
  }, [upcoming, visibleRows, monthWindow, current, today]);

  const earlierWeeks = useMemo(
    () => (monthWindow ? groupByWeek(earlierRows, monthWindow.startDay, monthWindow.endDay) : []),
    [earlierRows, monthWindow]
  );

  const dayCounts = useMemo(() => countByCentralDay(events), [events]);

  // WEB-PERF-030: one batch query per table for the cards actually rendered.
  const socialIds = useMemo(() => renderedRows.map((e) => e.id), [renderedRows]);
  const { data: batchSocialData, isPending: batchSocialPending } = useBatchEventSocial(socialIds);

  if (!parsed || !renderable) {
    return <MonthNotFound label={parsed ? monthName(parsed) : null} />;
  }

  const canonicalSlug = monthSlug(parsed);
  const prev = shiftMonth(parsed, -1);
  const next = shiftMonth(parsed, 1);
  const monthDisplayName = monthName(parsed);
  const canonicalUrl = `${BRAND.baseUrl}/events/${canonicalSlug}`;

  const loaded = !isLoading && !isError;
  const inRange = isMonthInRange(parsed, now);
  // Indexable: in range with at least MIN_EVENTS_PER_MONTH events, the
  // sitemap's floor. Decided on the unfiltered month once it has loaded, so
  // the loading render doesn't flip the robots tag.
  const indexable = loaded && isIndexableMonth(parsed, allEvents.length, now);
  const noindex = (isError && allEvents.length === 0) || (loaded && !indexable);

  const pageTitle = `${monthDisplayName} Events in Des Moines, Central Time | ${BRAND.name}`;
  const pageDescription = `Events in ${monthDisplayName} in Des Moines and the suburbs, by day and by week, with dates, times and venues in Central time.`;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: monthDisplayName, url: `/events/${canonicalSlug}` },
  ];

  // No live count in these answers: FAQSection emits FAQPage JSON, and a
  // count makes the loading and loaded renders disagree (WEB-SEO-008).
  const faqData = [
    {
      question: `What events are happening in ${monthDisplayName} in Des Moines?`,
      answer: `This page lists the events on our calendar for ${monthDisplayName}, Central time, in Des Moines and surrounding areas: a calendar with the count for each day, then the events week by week, with dates, times and venues.`,
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
      answer: "Yes. The category buttons on this page narrow the month to one category, and each day in the calendar opens that day on the events page.",
    },
  ];

  // Overflow opens the rest of the month on the hub (WP3 item 10): from today
  // (or the 1st, for a month that hasn't started or is over) to the last day.
  const overflowFrom =
    monthWindow && today > monthWindow.startDay && today <= monthWindow.endDay
      ? today
      : monthWindow?.startDay ?? "";
  const overflowParams = new URLSearchParams({
    from: overflowFrom,
    to: monthWindow?.endDay ?? "",
  });
  if (selectedCategory !== ALL) overflowParams.set("category", selectedCategory);
  const overflowHref = `/events?${overflowParams.toString()}`;

  // Neighbours outside the range get no link at all, so a crawler can't walk
  // from one empty month to the next. rel=prev/next only on an indexable page.
  const prevInRange = isMonthInRange(prev, now);
  const nextInRange = isMonthInRange(next, now);
  const thisMonth = centralMonthOf(now);

  let cardIndex = 0;

  const monthNav = (
    <nav aria-label="Other months" className="flex flex-wrap justify-between items-center gap-3">
      {prevInRange ? (
        <Button asChild variant="outline" className="min-h-11">
          <Link to={`/events/${monthSlug(prev)}`} rel={indexable ? "prev" : undefined}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {monthName(prev)}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      {!inRange && (
        <Button asChild variant="outline" className="min-h-11">
          <Link to={`/events/${monthSlug(thisMonth)}`}>{monthName(thisMonth)}</Link>
        </Button>
      )}
      {nextInRange ? (
        <Button asChild variant="outline" className="min-h-11">
          <Link to={`/events/${monthSlug(next)}`} rel={indexable ? "next" : undefined}>
            {monthName(next)}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );


  return (
    <div className="min-h-screen bg-background">
      {noindex && <NoIndexMeta />}
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
        events={visibleCards}
        maxItems={VISIBLE_EVENTS}
        listName={`${monthDisplayName} Events in Des Moines`}
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
            <h1 className="text-3xl font-bold">{monthDisplayName} Events in Des Moines</h1>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <SpriteIcon name="map-pin" className="h-4 w-4" />
              <span>Des Moines Metro Area</span>
            </div>
            {loaded && (
              <div className="flex items-center gap-1">
                <SpriteIcon name="clock" className="h-4 w-4" />
                <span>
                  {countLabel(events.length, FETCH_LIMIT)}{" "}
                  {events.length === 1 ? "event" : "events"} this month, Central time
                </span>
              </div>
            )}
          </div>
          <ListFreshness rows={allEvents} className="mb-4" />
          {monthNav}
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {countLabel(events.length, FETCH_LIMIT)}
                </div>
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

        {isLoading || (cardsPending && !isError) ? (
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
        ) : events.length > 0 && monthWindow ? (
          <>
            <h2 className="text-2xl font-bold mb-4">{monthDisplayName} by day</h2>
            <MonthCalendarGrid
              startDay={monthWindow.startDay}
              endDay={monthWindow.endDay}
              today={today}
              counts={dayCounts}
              linkParams={selectedCategory !== ALL ? { category: selectedCategory } : undefined}
              label={`${monthDisplayName}, events per day`}
              className="mb-10"
            />

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
                      <SocialEventCard
                        key={event.id}
                        event={card(event)}
                        socialData={batchSocialData?.[event.id]}
                        socialDataPending={batchSocialPending}
                        onViewDetails={() => {}}
                        priority={index < 3}
                      />
                    );
                  })}
                </div>
              </section>
            ))}

            {upcoming.length === 0 && (
              <p className="mb-8 text-muted-foreground">
                Nothing else is listed for the rest of {monthDisplayName}.
              </p>
            )}

            {upcoming.length > VISIBLE_EVENTS && (
              <div className="mb-12 text-center">
                <p className="text-muted-foreground mb-3">
                  Showing the {VISIBLE_EVENTS} soonest of{" "}
                  {formatCount(upcoming.length, "event")}
                  {current ? " from today" : ""} in {monthDisplayName}.
                </p>
                <Button asChild variant="outline" className="min-h-11">
                  <Link to={overflowHref}>See the rest of {monthDisplayName} on the events page</Link>
                </Button>
              </div>
            )}

            {earlier.length > 0 && (
              <section aria-labelledby="month-earlier" className="mb-10">
                <h2 id="month-earlier" className="text-2xl font-bold mb-2">
                  Earlier this month
                </h2>
                <details
                  data-month-earlier
                  onToggle={(e) => setEarlierOpen(e.currentTarget.open)}
                >
                  <summary className="flex min-h-11 cursor-pointer items-center text-muted-foreground">
                    Already over. Show {formatCount(earlier.length, "event")}
                  </summary>
                  {earlierOpen &&
                    earlierWeeks.map((week) => (
                      <div key={week.id} className="mt-6">
                        <h3 className="text-lg font-semibold mb-3">{week.label}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {week.events.map((event) => (
                            <SocialEventCard
                              key={event.id}
                              event={card(event)}
                              socialData={batchSocialData?.[event.id]}
                              socialDataPending={batchSocialPending}
                              onViewDetails={() => {}}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  {earlierOpen && earlier.length > VISIBLE_EVENTS && (
                    <p className="mt-4 text-muted-foreground">
                      Showing the first {VISIBLE_EVENTS} of {formatCount(earlier.length, "event")}.
                    </p>
                  )}
                </details>
              </section>
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

        <EventsLandingLinks current={`/events/${canonicalSlug}`} className="mb-8" />

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
