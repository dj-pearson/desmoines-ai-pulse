import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FAQSection } from "@/components/FAQSection";
import { SocialEventCard } from "@/components/SocialEventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import RelatedContent from "@/components/RelatedContent";
import { ListFreshness } from "@/components/ListFreshness";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import {
  useEventLanding,
  countFree,
  countLabel,
  isEveningStart,
  DATE_NIGHT_FILTER,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { formatCount } from "@/lib/pluralize";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";

const FETCH_LIMIT = 100;

/**
 * WEB-PERF-027. Uncapped, this page filled its limit(100) and weighed 756 KB
 * of prerendered HTML with 734 inline SVGs, 8x the main hub; it was also the
 * page that most often lost the prerenderer's Helmet-commit race. Capped to
 * match /events.
 */
const VISIBLE_EVENT_LIMIT = 40;

const EMPTY: LandingEvent[] = [];

/** `?time=all` shows every time; the default (no param) is evening only. */
const TIME_PARAM = "time";
const EVENING = "evening";
const ALL_TIMES = "all";

export default function DateNightEvents() {
  const { getStr, setParam } = useUrlFilters();
  const eveningOnly = getStr(TIME_PARAM, EVENING) !== ALL_TIMES;

  /**
   * WEB-SEO-031: this was a useState/useEffect fetch, which PrerenderSignal
   * cannot see, so the prerendered page was a skeleton. It is a TanStack query
   * now. The filter is DATE_NIGHT_FILTER: canonical categories plus
   * word-boundary title matches, with the bare "night" match removed.
   */
  const {
    data: events = EMPTY,
    isLoading,
    error: loadError,
    refetch,
  } = useEventLanding({ key: { landing: "date-night" }, or: DATE_NIGHT_FILTER, limit: FETCH_LIMIT });

  /**
   * "Evening" is read in Central (isEveningStart), not in the browser's zone:
   * getHours() put a 7:30 PM show at 5:30 PM for a reader in Los Angeles and
   * the prerenderer ran in UTC. Rows with no start time are not evening rows.
   */
  const matchingEvents = useMemo(
    () => (eveningOnly ? events.filter(isEveningStart) : events),
    [events, eveningOnly]
  );
  const dateEvents = useMemo(() => matchingEvents.slice(0, VISIBLE_EVENT_LIMIT), [matchingEvents]);
  const hiddenEventCount = matchingEvents.length - dateEvents.length;

  const eveningCount = useMemo(() => events.filter(isEveningStart).length, [events]);
  const venueCount = useMemo(
    () => new Set(events.map((e) => (e.venue || "").trim()).filter(Boolean)).size,
    [events]
  );

  const pageTitle = `Date Night Events in Des Moines | ${BRAND.name}`;
  const pageDescription =
    "Date night events in Des Moines: live music, comedy, wine tastings, dinner events and other evenings out, with times in Central and venues on every listing.";

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Date Night", url: "/events/date-night" },
  ];

  // Every answer describes this page. The old answers credited "Des Moines
  // Tourism" and "Des Moines Cityview" with figures that have no source here,
  // and quoted budgets and venue details nobody checked. Static on purpose
  // (WEB-SEO-008).
  const faqData = [
    {
      question: "What counts as a date night event here?",
      answer:
        "Music, comedy and arts events, plus events whose titles mention concerts, live music, wine, tastings, dinner, comedy or jazz.",
    },
    {
      question: "What does Evening only show?",
      answer:
        "Events that start between 5 PM and 2 AM, Central time. Events without a listed start time are left out of that view; switch to All times to see them.",
    },
    {
      question: "Are there free date night events?",
      answer:
        "Some. Events whose listed price says free are marked Free on their cards. An event with no listed price says so rather than being counted as free.",
    },
    {
      question: "Where can we eat before the show?",
      answer:
        "The Restaurants Open Now page shows which restaurants are open at the moment, and each event page names its venue.",
    },
    {
      question: "How often is this list updated?",
      answer: EVENTS_UPDATE_ANSWER,
    },
  ];

  // WEB-PERF-030: one batch query per table for the rendered cards.
  const batchSocialIds = useMemo(() => dateEvents.map((e) => e.id), [dateEvents]);
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocial(batchSocialIds);

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/events/date-night")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        keywords={[
          "date night Des Moines",
          "romantic things to do Des Moines",
          "couples activities Des Moines",
          "Des Moines nightlife",
          "live music Des Moines",
          "wine tasting Des Moines",
          "dinner and a show Des Moines",
          "date ideas Iowa",
        ]}
      />
      <EventListJsonLd
        events={dateEvents}
        maxItems={VISIBLE_EVENT_LIMIT}
        listName="Date Night Events in Des Moines, Iowa"
        listDescription={pageDescription}
        listUrl={getCanonicalUrl('/events/date-night')}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: "Date Night" },
          ]}
        />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Heart className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-3xl font-bold">Date Night Events in Des Moines</h1>
          </div>

          <ListFreshness rows={events} className="mb-4" />

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            Live music, comedy, arts, wine and dinner events in Des Moines and the
            suburbs. The list starts with evening events, 5 PM or later Central
            time; switch to All times for matinees and daytime tastings.
          </p>
        </div>

        <Card className="mb-8 bg-primary/5 border-primary/15 shadow-none">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {countLabel(events.length, FETCH_LIMIT)}
                </div>
                <div className="text-sm text-muted-foreground">Date Night Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{eveningCount}</div>
                <div className="text-sm text-muted-foreground">Evening Starts</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{venueCount}</div>
                <div className="text-sm text-muted-foreground">Venues</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{countFree(events)}</div>
                <div className="text-sm text-muted-foreground">Listed as Free</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Links to pages that answer "what else tonight" from data. This was
            a "Top Date Night Venues" card with capacities, founding years and
            quotes credited to the Register and Cityview, none sourced. */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Plan the Rest of the Night</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Link to="/restaurants/open-now" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">Restaurants open now</h3>
                <p className="text-sm text-muted-foreground">Somewhere for dinner before the show or a drink after.</p>
              </Link>
              <Link to="/events/this-weekend" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">This weekend</h3>
                <p className="text-sm text-muted-foreground">Everything on the calendar from Friday through Sunday.</p>
              </Link>
              <Link to="/events/free" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">Free events</h3>
                <p className="text-sm text-muted-foreground">Events whose admission is listed as free.</p>
              </Link>
              <Link to="/attractions" className="p-4 bg-muted rounded-lg hover:bg-muted/70">
                <h3 className="font-semibold mb-1">Attractions</h3>
                <p className="text-sm text-muted-foreground">Museums, gardens and landmarks, with hours from each listing.</p>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Backed by the URL so the choice survives Back and can be shared. */}
        <div role="group" aria-label="Start time" className="flex flex-wrap items-center gap-3 mb-6">
          <Button
            type="button"
            variant={eveningOnly ? "default" : "outline"}
            size="sm"
            className="min-h-11"
            aria-pressed={eveningOnly}
            onClick={() => setParam(TIME_PARAM, EVENING, { def: EVENING })}
          >
            <SpriteIcon name="clock" className="h-4 w-4 mr-1" />
            Evening only (5 PM+)
          </Button>
          <Button
            type="button"
            variant={!eveningOnly ? "default" : "outline"}
            size="sm"
            className="min-h-11"
            aria-pressed={!eveningOnly}
            onClick={() => setParam(TIME_PARAM, ALL_TIMES, { def: EVENING })}
          >
            All times
          </Button>
        </div>

        {!isLoading && loadError ? (
          <ErrorState error={loadError} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonGroup label="Loading date night events..." className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-lg mb-4"></div>
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </SkeletonGroup>
        ) : matchingEvents.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6">
              Upcoming Date Night Events ({matchingEvents.length})
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {dateEvents.map((event, index) => (
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
            {hiddenEventCount > 0 && (
              // Say what was left out. A capped list that looks complete is how
              // "we only have 40 date-night events" becomes received wisdom.
              <div className="mt-8 text-center">
                <p className="text-muted-foreground mb-3">
                  Showing the {VISIBLE_EVENT_LIMIT} soonest of{" "}
                  {formatCount(matchingEvents.length, "date night event")}.
                </p>
                <Button asChild variant="outline">
                  <Link to="/events?category=Music">Browse all music events</Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <SpriteIcon name="calendar" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold mb-2">No Date Night Events Found</h2>
              <p className="text-muted-foreground mb-4">
                {eveningOnly && events.length > 0
                  ? "Nothing with a listed evening start right now. Try All times."
                  : "Nothing matches right now. New events are collected daily."}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Advice that holds whatever the venue. The old tips named specific
            classes, ramps and rates nobody here checked. */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Planning a Date Night in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Work back from the start time</h3>
                <p className="text-sm text-muted-foreground">
                  Every card shows the start time in Central. Leave time for dinner and parking; <Link to="/restaurants/open-now" className="text-primary hover:underline font-semibold">restaurants open now</Link> shows what is serving.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Check the event page</h3>
                <p className="text-sm text-muted-foreground">
                  Prices, age limits and door times are on the organizer's page, which each event links to.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Think past Saturday</h3>
                <p className="text-sm text-muted-foreground">
                  The <Link to="/events/this-weekend" className="text-primary hover:underline">this weekend</Link> list runs Friday through Sunday, and the full <Link to="/events" className="text-primary hover:underline">events calendar</Link> covers weeknights.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Keep it free</h3>
                <p className="text-sm text-muted-foreground">
                  See <Link to="/events/free" className="text-primary hover:underline">free events</Link> for evenings that cost nothing to get in.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SEO-003: FAQSection renders the questions and emits the single
            FAQPage block. */}
        <FAQSection faqs={faqData} />

        <RelatedContent
          currentPath="/events/date-night"
          title="More Des Moines Experiences"
        />
      </div>

      <Footer />
    </div>
  );
}
