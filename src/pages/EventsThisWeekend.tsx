import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Filter } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ListFreshness } from "@/components/ListFreshness";
import { MonthLinks } from "@/components/seo/MonthLinks";
import { FAQSection } from "@/components/FAQSection";
import { SocialEventCard } from "@/components/SocialEventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import { WeatherNotice } from "@/components/WeatherNotice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import { useWeather, reorderForWeather } from "@/hooks/useWeather";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import {
  useEventLanding,
  useLandingCards,
  useWindowIndoorFlags,
  groupByCentralDay,
  countFree,
  countLabel,
  countStartingAfter5pm,
  dayPhase,
  formatCentralDate,
  landingPicks,
  LANDING_LIGHT_COLUMNS,
  STILL_RUNNING_CAP,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { EventsLandingLinks } from "@/components/events/EventsLandingLinks";
import { EVENT_AREAS } from "@/lib/eventAreas";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import {
  centralDateOf,
  centralWindow,
  createEventSlugWithCentralTime,
  formatEventDateShort,
} from "@/lib/timezone";
import { formatCount } from "@/lib/pluralize";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";

/**
 * WEB-PERF-023. Rendering the whole weekend measured 4,374 DOM elements. The
 * cap is now per day, 12 cards each (36 in all, twelve full rows of the
 * lg:grid-cols-3 grid, as before), so a packed Saturday cannot push Sunday off
 * the page. Each day that overflows links to the hub's weekend view, where
 * every event is reachable.
 */
const VISIBLE_PER_DAY = 12;

/** Row cap for the weekend window. Counts at the cap read "500+". */
const FETCH_LIMIT = 500;

/**
 * The hub's `location` value for a city chip: the EVENT_AREAS slug whose city
 * matches, so "See the whole weekend" opens the same place the chip picked.
 * null for a city the hub has no area for (the link then drops the location
 * rather than opening a filter the hub would ignore).
 */
function areaSlugForCity(city: string): string | null {
  const wanted = city.trim().toLowerCase();
  const area = EVENT_AREAS.find((a) => a.kind === "city" && a.city.toLowerCase() === wanted);
  return area ? area.slug : null;
}

const EMPTY: LandingEvent[] = [];
const ALL = "all";

/**
 * The city an event is in, for the Location chips. It was the first part of
 * the venue string, which gave one chip per venue ("Wooly's", "Wooly's Des
 * Moines", "Woolys") and no way to say "just West Des Moines".
 */
function placeOf(event: LandingEvent): string {
  return (event.city ?? "").trim();
}

interface ChipGroupProps {
  label: string;
  allLabel: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}

/** A single-choice chip row. role="group" plus aria-pressed, 44px targets. */
function ChipGroup({ label, allLabel, options, selected, onSelect }: ChipGroupProps) {
  const labelId = `weekend-filter-${label.toLowerCase()}`;
  return (
    <div>
      <p id={labelId} className="text-sm font-medium mb-2">
        {label}
      </p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {[ALL, ...options].map((value) => (
          <Button
            key={value}
            type="button"
            variant={selected === value ? "default" : "outline"}
            size="sm"
            className="min-h-11"
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
          >
            {value === ALL ? allLabel : value}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function EventsThisWeekend() {
  // Filters live in the URL (WEB-UX-001), so a filtered weekend is shareable
  // and survives Back.
  const { getStr, setParam, setMany } = useUrlFilters();
  const selectedCategory = getStr("category", ALL);
  const selectedLocation = getStr("location", ALL);

  /**
   * Friday 00:00 to Sunday 23:59 Central, from centralWindow - the same set the
   * hub's "This weekend" preset returns. The key sits under
   * queryKeys.events.list, so an admin edit reaches this page (it was
   * ['events-weekend'], outside the events prefix).
   */
  const {
    data: events = EMPTY,
    isLoading,
    isError,
    error,
    refetch,
    window: weekend,
  } = useEventLanding({
    key: { landing: "this-weekend" },
    window: "this-weekend",
    limit: FETCH_LIMIT,
    includeOngoing: true,
    // Light rows for the whole window (WP3 item 7); full rows only for the
    // cards rendered, via useLandingCards below.
    columns: LANDING_LIGHT_COLUMNS,
  });

  // Friday to Sunday, today is one of the weekend days; Monday to Thursday
  // the window is the coming weekend and no day is "today".
  const today = centralDateOf(new Date());
  const todayInWeekend = !!weekend && today >= weekend.startDay && today <= weekend.endDay;

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const categoryMatch = selectedCategory === ALL || event.category === selectedCategory;
        const locationMatch = selectedLocation === ALL || placeOf(event) === selectedLocation;
        return categoryMatch && locationMatch;
      }),
    [events, selectedCategory, selectedLocation]
  );

  const { weather, hasVerdict } = useWeather();
  /**
   * The weather verdict is the current NWS hour. It says nothing about
   * Sunday when it is Friday, so it reorders today's group only, and only
   * while today is a weekend day (plan-stay hand-off; per-day weather is D8).
   * The flags come by today's bounds, not as a list of up to 500 ids.
   */
  const todayWindow = useMemo(
    () => (todayInWeekend ? centralWindow({ kind: "single", date: today }) : null),
    [todayInWeekend, today]
  );
  const indoorFlags = useWindowIndoorFlags(todayWindow, hasVerdict);

  /**
   * One group per day, capped at 12. Today's group is weather-ordered before
   * the cap, so on a wet afternoon the indoor options are the ones inside
   * today's 12. Reordering never filters. Days already over are collapsed.
   */
  const days = useMemo(() => {
    if (!weekend) return [];
    const carryTo = todayInWeekend ? today : weekend.startDay;
    return groupByCentralDay(filteredEvents, weekend.startDay, weekend.endDay, carryTo).map(
      (day) => {
        const phase = dayPhase(day.id, today);
        const order = (rows: LandingEvent[]) =>
          phase === "today"
            ? reorderForWeather(rows, (event) => indoorFlags[event.id], weather)
            : rows;
        const ordered = order(day.events);
        const running = order(day.running);
        return {
          ...day,
          phase,
          anchor: `weekend-${formatCentralDate(day.id, "EEEE").toLowerCase()}`,
          shortLabel: formatCentralDate(day.id, "EEEE"),
          total: ordered.length + running.length,
          startsTotal: ordered.length,
          events: ordered.slice(0, VISIBLE_PER_DAY),
          // Carried festivals follow the day's own starts, three at most
          // (WP3 item 8), so they can't crowd out the day.
          runningTotal: running.length,
          running: running.slice(0, STILL_RUNNING_CAP),
        };
      }
    );
  }, [filteredEvents, weekend, today, todayInWeekend, indoorFlags, weather]);

  const picks = useMemo(() => landingPicks(events), [events]);

  /** Past days the reader opened. Closed ones render no cards at all. */
  const [openPast, setOpenPast] = useState<ReadonlySet<string>>(() => new Set());
  const togglePast = (dayId: string, open: boolean) =>
    setOpenPast((prev) => {
      if (prev.has(dayId) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(dayId);
      else next.delete(dayId);
      return next;
    });

  // Past days are collapsed, so their cards are not rendered (or put in the
  // schema) until someone opens them.
  const renderedEvents = useMemo(
    () =>
      days
        .filter((day) => day.phase !== "past" || openPast.has(day.id))
        .flatMap((day) => [...day.events, ...day.running]),
    [days, openPast]
  );

  // Full card rows for what is rendered; the window query carried light rows.
  const { cards: renderedCards, isPending: cardsPending } = useLandingCards(renderedEvents);
  const cardById = useMemo(
    () => new Map(renderedCards.map((row) => [row.id, row])),
    [renderedCards]
  );
  const card = (event: LandingEvent): LandingEvent => cardById.get(event.id) ?? event;

  // The schema describes what shows without a click: the days not over.
  const visibleEvents = useMemo(
    () =>
      days
        .filter((day) => day.phase !== "past")
        .flatMap((day) => [...day.events, ...day.running])
        .map((event) => cardById.get(event.id) ?? event),
    [days, cardById]
  );

  const categories = useMemo(
    () => [...new Set(events.map((e) => e.category).filter(Boolean))].sort(),
    [events]
  );
  const locations = useMemo(
    () => [...new Set(events.map(placeOf).filter(Boolean))].sort(),
    [events]
  );
  const familyCount = events.filter((e) => e.category === "Family").length;

  // The overflow link opens the same set the page is showing (WP3 item 10):
  // the weekend, the category chip, and the location chip as an area slug.
  const hubParams = new URLSearchParams({ preset: "this-weekend" });
  if (selectedCategory !== ALL) hubParams.set("category", selectedCategory);
  const areaSlug = selectedLocation !== ALL ? areaSlugForCity(selectedLocation) : null;
  if (areaSlug) hubParams.set("location", areaSlug);
  const hubLink = `/events?${hubParams.toString()}`;

  /**
   * WEB-SEO-031: the title and description stay date-free; the prerender froze
   * a build-time date into them. The weekend's dates are in the body, from the
   * same window the rows were fetched for, and only once those rows are here.
   */
  const pageTitle = `Des Moines Events This Weekend | ${BRAND.name}`;
  const pageDescription = `Find the best events happening this weekend in Des Moines and suburbs. See dates, times, maps and tips for the weekend's activities.`;
  const weekendLabel =
    weekend && !isLoading && !isError
      ? `${formatCentralDate(weekend.startDay, "EEEE, MMMM d")} - ${formatCentralDate(weekend.endDay, "EEEE, MMMM d, yyyy")}`
      : null;

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "This Weekend", url: "/events/this-weekend" },
  ];

  // Static answers (WEB-SEO-008: an interpolated count makes the loading and
  // loaded renders emit different FAQPage JSON, and the prerender kept both).
  const faqData = [
    {
      question: "What's happening this weekend in Des Moines?",
      answer:
        "This page lists every event on our calendar from Friday 12:00 AM through Sunday 11:59 PM, Central time, in Des Moines and the surrounding suburbs, grouped by day.",
    },
    {
      question: "Are there kid-friendly events this weekend?",
      answer:
        "Events in the Family category are counted above and can be picked with the category filter. The Kids & Family page lists family events for every date.",
    },
    {
      question: "How do I find free events?",
      answer:
        "Events whose listed price says free carry a Free tag on their cards, and the Free Events page lists them all. An event with no listed price is not counted as free.",
    },
    {
      question: "How often is this list updated?",
      answer: EVENTS_UPDATE_ANSWER,
    },
  ];

  // WEB-PERF-030: one batch query per table for the cards actually rendered.
  const batchSocialIds = useMemo(() => renderedEvents.map((e) => e.id), [renderedEvents]);
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocial(batchSocialIds);

  const hasFilters = selectedCategory !== ALL || selectedLocation !== ALL;
  let cardIndex = 0;

  return (
    <div className="min-h-screen bg-background">
      {isError && events.length === 0 && <NoIndexMeta />}
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl('/events/this-weekend')}
        pageType="website"
        breadcrumbs={breadcrumbs}
        // SEO-003: FAQSection below is the single FAQPage emitter; this prop
        // only records that the page has an FAQ.
        faqData={faqData}
        isTimeSensitive={true}
      />
      {/* The schema describes what the page shows: the capped days. */}
      <EventListJsonLd
        events={visibleEvents}
        maxItems={VISIBLE_PER_DAY * 3}
        listName="Des Moines Weekend Events"
        listDescription={pageDescription}
        listUrl={getCanonicalUrl('/events/this-weekend')}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: "This Weekend" },
          ]}
        />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <SpriteIcon name="calendar" className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">This Weekend in Des Moines</h1>
          </div>
          {weekendLabel && <p className="text-lg text-muted-foreground mb-2">{weekendLabel}</p>}

          {/* SEO-009: a visible, absolute freshness date from the rows. */}
          <ListFreshness rows={events} className="mb-4" />

          {/* SEO-016: the month pages are linked from here so crawlers find them. */}
          <MonthLinks className="mb-6" />

          <p className="text-lg text-muted-foreground max-w-3xl">
            Friday through Sunday in Des Moines and the suburbs, a day at a time.
            All times are Central.
          </p>
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {countLabel(events.length, FETCH_LIMIT)}
                </div>
                <div className="text-sm text-muted-foreground">Weekend Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{countFree(events)}</div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{familyCount}</div>
                <div className="text-sm text-muted-foreground">Family category</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {countStartingAfter5pm(events)}
                </div>
                <div className="text-sm text-muted-foreground">Starting after 5 PM</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {(categories.length > 0 || locations.length > 0) && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" aria-hidden="true" />
                Filter Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                {categories.length > 0 && (
                  <ChipGroup
                    label="Category"
                    allLabel="All"
                    options={categories}
                    selected={selectedCategory}
                    onSelect={(value) => setParam("category", value, { def: ALL })}
                  />
                )}
                {locations.length > 0 && (
                  <ChipGroup
                    label="Location"
                    allLabel="All Areas"
                    options={locations}
                    selected={selectedLocation}
                    onSelect={(value) => setParam("location", value, { def: ALL })}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading || (cardsPending && !isError) ? (
          /* WEB-SEO-031: SkeletonGroup carries aria-busy for the prerender gate. */
          <SkeletonGroup
            label="Loading this weekend's events..."
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
        ) : filteredEvents.length > 0 ? (
          <>
            {picks.length > 0 && weekend && (
              <section aria-labelledby="weekend-picks" className="mb-8">
                <h2 id="weekend-picks" className="text-2xl font-bold mb-3">
                  Our weekend picks
                </h2>
                <ul className="divide-y rounded-xl border">
                  {picks.map((event) => (
                    <li key={event.id} className="p-4">
                      <Link
                        to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {event.title}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {[formatEventDateShort(event), event.venue || event.location]
                          .filter(Boolean)
                          .join(" - ")}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-sm">
                  Visiting?{" "}
                  <Link
                    to={`/trip-planner?from=${weekend.startDay < today ? today : weekend.startDay}&to=${weekend.endDay}`}
                    className="text-primary hover:underline font-medium"
                  >
                    Plan this weekend
                  </Link>{" "}
                  with events by day and hotels near them.
                </p>
              </section>
            )}

            <nav aria-label="Jump to a day" className="mb-6 flex flex-wrap gap-2">
              {days.map((day) => (
                <Button key={day.id} asChild variant="outline" size="sm" className="min-h-11">
                  <a href={`#${day.anchor}`}>
                    {day.shortLabel} ({day.total})
                  </a>
                </Button>
              ))}
            </nav>

            {days.map((day) => {
              const heading = (
                <h2 id={day.anchor} className="text-2xl font-bold">
                  {day.label}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    ({formatCount(day.total, "event")})
                  </span>
                </h2>
              );
              if (day.phase === "past") {
                // Already over: the heading stays a heading (it used to sit
                // inside <summary>, which strips its role for some screen
                // readers), and the cards open on demand.
                return (
                  <section key={day.id} aria-labelledby={day.anchor} className="mb-6 scroll-mt-24">
                    <div className="mb-2">{heading}</div>
                    <details
                      data-weekend-day={day.id}
                      data-day-phase="past"
                      onToggle={(e) => togglePast(day.id, e.currentTarget.open)}
                    >
                      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">
                        Already over. Show {day.shortLabel}&apos;s {formatCount(day.total, "event")}
                      </summary>
                      {openPast.has(day.id) && day.events.length > 0 && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {day.events.map((event) => (
                            <SocialEventCard
                              key={event.id}
                              event={card(event)}
                              socialData={batchSocialData?.[event.id]}
                              socialDataPending={batchSocialPending}
                              onViewDetails={() => {}}
                            />
                          ))}
                        </div>
                      )}
                    </details>
                  </section>
                );
              }
              const runningHeadingId = `${day.anchor}-running`;
              return (
              <section
                key={day.id}
                aria-labelledby={day.anchor}
                data-weekend-day={day.id}
                data-day-phase={day.phase}
                className="mb-10 scroll-mt-24"
              >
                <div className="mb-4">{heading}</div>
                {day.phase === "today" && (
                  <WeatherNotice weather={weather} hasVerdict={hasVerdict} className="mb-4" />
                )}
                {day.events.length === 0 && day.running.length === 0 ? (
                  <p className="text-muted-foreground">
                    Nothing on our calendar for {day.shortLabel}
                    {hasFilters ? " with these filters" : ""} yet.
                  </p>
                ) : day.events.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {day.events.map((event) => {
                      const index = cardIndex++;
                      return (
                        <SocialEventCard
                          priority={index < 3}
                          key={event.id}
                          event={card(event)}
                          socialData={batchSocialData?.[event.id]}
                          socialDataPending={batchSocialPending}
                          onViewDetails={() => {}}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Nothing new starts on {day.shortLabel}
                    {hasFilters ? " with these filters" : ""}.
                  </p>
                )}
                {day.startsTotal > day.events.length && (
                  <p className="mt-4 text-muted-foreground">
                    Showing {day.events.length} of {formatCount(day.startsTotal, "event")} starting
                    on {day.shortLabel}.{" "}
                    <Link to={hubLink} className="text-primary hover:underline font-medium">
                      See the whole weekend on the events page
                    </Link>
                  </p>
                )}
                {day.running.length > 0 && (
                  <div className="mt-8" data-still-running={day.id}>
                    <h3 id={runningHeadingId} className="text-lg font-semibold mb-3">
                      Still running{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        (started earlier)
                      </span>
                    </h3>
                    <div
                      role="list"
                      aria-labelledby={runningHeadingId}
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    >
                      {day.running.map((event) => (
                        <div role="listitem" key={event.id}>
                          <SocialEventCard
                            event={card(event)}
                            socialData={batchSocialData?.[event.id]}
                            socialDataPending={batchSocialPending}
                            onViewDetails={() => {}}
                          />
                        </div>
                      ))}
                    </div>
                    {day.runningTotal > day.running.length && (
                      <p className="mt-4 text-muted-foreground">
                        And {day.runningTotal - day.running.length} more running.{" "}
                        <Link to={hubLink} className="text-primary hover:underline font-medium">
                          See them on the events page
                        </Link>
                      </p>
                    )}
                  </div>
                )}
              </section>
              );
            })}
          </>
        ) : isError ? (
          // WEB-QA-031: a failed fetch has not answered "what's on".
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <SpriteIcon name="calendar" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Weekend Events Found</h2>
              <p className="text-muted-foreground mb-4">
                {hasFilters
                  ? "Try adjusting your filters to see more events."
                  : "No events are scheduled for this weekend. Check back later or browse upcoming events."}
              </p>
              <div className="flex justify-center gap-4">
                {hasFilters && (
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() =>
                      setMany({ category: null, location: null }, { replace: false })
                    }
                  >
                    Clear Filters
                  </Button>
                )}
                <Link to="/events" className="text-primary hover:underline self-center">
                  Browse All Events
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Out of the non-empty branch (WP3 item 12): an empty or failed
            weekend still gets somewhere to go and the FAQ. */}
        <Card className="mt-8 mb-8">
          <CardHeader>
            <CardTitle>More Weekend Ideas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                to="/restaurants"
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">Weekend Dining</h3>
                <p className="text-sm text-muted-foreground">
                  Restaurants across the metro, with hours and menus
                </p>
              </Link>
              <Link
                to="/attractions"
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">Places to Visit</h3>
                <p className="text-sm text-muted-foreground">
                  Parks, museums, and attractions
                </p>
              </Link>
              <Link
                to="/playgrounds"
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <h3 className="font-semibold mb-2">Family Fun</h3>
                <p className="text-sm text-muted-foreground">
                  Playgrounds across the metro
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>

        <EventsLandingLinks current="/events/this-weekend" className="mb-8" />

        {/* SEO-003: FAQSection renders the questions and emits the single
            FAQPage block, so schema only ships with a visible FAQ. */}
        <FAQSection faqs={faqData} />
      </div>

      <Footer />
    </div>
  );
}
