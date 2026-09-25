import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SocialEventCard } from "@/components/SocialEventCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { EventListJsonLd } from "@/components/schema/EventListJsonLd";
import RelatedContent from "@/components/RelatedContent";
import { FAQSection } from "@/components/FAQSection";
import { ListFreshness } from "@/components/ListFreshness";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonGroup } from "@/components/ui/skeleton";
import { useBatchEventSocial } from "@/hooks/useBatchEventSocial";
import {
  useEventLanding,
  countLabel,
  countStartingAfter5pm,
  type LandingEvent,
} from "@/hooks/useEventLanding";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { FREE_PRICE_FILTER } from "@/lib/eventPrice";
import { formatCount } from "@/lib/pluralize";
import { EVENTS_UPDATE_ANSWER } from "@/content/eventsCopy";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { EventsLandingLinks } from "@/components/events/EventsLandingLinks";

const FETCH_LIMIT = 100;
/** Same render cap as the other landings (WEB-PERF-023); the rest are a link away. */
const VISIBLE_EVENTS = 36;

/** Stable empty array so memos keyed on the rows don't refire every render. */
const EMPTY: LandingEvent[] = [];

export default function FreeEvents() {
  /*
   * WEB-SEO-031: a useQuery (via useEventLanding) so the prerenderer waits for
   * the rows instead of capturing a skeleton.
   *
   * "Free" is FREE_PRICE_FILTER, which has no `price.is.null`: this page used
   * to list every event with no price as free, so a reader could turn up to a
   * $40 door. The floor is the start of today Central (it was `now`, which
   * dropped an event the minute it started) and the merged / hidden /
   * archived predicates apply, which this page used to skip.
   */
  const {
    data: freeEvents = EMPTY,
    isLoading,
    error: loadError,
    refetch,
  } = useEventLanding({ key: { landing: "free" }, or: FREE_PRICE_FILTER, limit: FETCH_LIMIT });

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of freeEvents) {
      const cat = event.category || "Other";
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([, a], [, b]) => b - a);
  }, [freeEvents]);

  const visibleEvents = useMemo(() => freeEvents.slice(0, VISIBLE_EVENTS), [freeEvents]);
  // At the cap, the breakdown covers the soonest FETCH_LIMIT, not every free
  // event on the calendar, and says so (WP3 item 11).
  const capped = freeEvents.length >= FETCH_LIMIT;

  // WEB-SEO-002: under 60 characters, current brand.
  const pageTitle = `Free Events in Des Moines | ${BRAND.name}`;
  const pageDescription =
    "Upcoming events in Des Moines and the suburbs whose admission is listed as free, with dates, times and venues. Collected daily.";

  const breadcrumbs = [
    { name: "Events", url: "/events" },
    { name: "Free Events", url: "/events/free" },
  ];

  // Every answer describes this page or a link on it. The old answers quoted
  // "Des Moines Parks & Recreation" for a figure with no source in this repo
  // and promised "verified free admission" that nobody verifies. Static text
  // on purpose (WEB-SEO-008).
  const faqData = [
    {
      question: "What free events are happening in Des Moines?",
      answer:
        "This page lists upcoming events in Des Moines and nearby suburbs whose listed price says free or $0, with the date, time and venue on each card.",
    },
    {
      question: "Are these events really free?",
      answer:
        "They are listed as free by the venue or organizer. Food, parking and add-ons can still cost money, and organizers do change prices, so check the event's own page before you go. Events with no listed price are left off this page rather than assumed free.",
    },
    {
      question: "What types of free events are available?",
      answer:
        "It depends on the calendar. The category breakdown on this page counts the free events in each category right now.",
    },
    {
      question: "How do I find family-friendly free events?",
      answer:
        "The Kids & Family events page lists family events and marks the free ones, and the playgrounds guide covers parks and play areas across the metro.",
    },
    {
      question: "Do I need to register for free events?",
      answer:
        "Some free events ask you to register, especially workshops and anything with limited space. The event's own page says whether it does.",
    },
    {
      question: "How often is this list updated?",
      answer: EVENTS_UPDATE_ANSWER,
    },
  ];

  // WEB-PERF-030: one batch query per table for the rendered cards.
  const batchSocialIds = useMemo(() => visibleEvents.map((e) => e.id), [visibleEvents]);
  const { data: batchSocialData, isPending: batchSocialPending } =
    useBatchEventSocial(batchSocialIds);

  return (
    <div className="min-h-screen bg-background">
      {/* A failed first query has not answered the page (WP3 item 12). */}
      {loadError && freeEvents.length === 0 && <NoIndexMeta />}
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl("/events/free")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
        keywords={[
          "free events Des Moines",
          "no cost activities Des Moines",
          "free things to do Des Moines",
          "free family events Iowa",
          "free concerts Des Moines",
          "community events Des Moines",
          "free entertainment Des Moines",
          "budget friendly Des Moines",
        ]}
      />
      <EventListJsonLd
        events={visibleEvents}
        maxItems={VISIBLE_EVENTS}
        listName="Free Events in Des Moines, Iowa"
        listDescription={pageDescription}
        listUrl={getCanonicalUrl('/events/free')}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          className="mb-4"
          items={[
            { label: "Home", href: "/" },
            { label: "Events", href: "/events" },
            { label: "Free Events" },
          ]}
        />
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-3xl font-bold">Free Events in Des Moines</h1>
          </div>

          <ListFreshness rows={freeEvents} className="mb-4" />

          <p className="text-lg text-muted-foreground max-w-3xl mb-4">
            Upcoming events in Des Moines and the suburbs whose admission is
            listed as free. An event is only listed here when its price says free
            or $0; one with no listed price is left out rather than guessed at.
          </p>

          <p className="text-base text-muted-foreground max-w-3xl">
            Food, parking and extras can still cost money, so check the event's
            own page before you go.
          </p>
        </div>

        <Card className="mb-8 bg-primary/5 border-primary/15 shadow-none">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {countLabel(freeEvents.length, FETCH_LIMIT)}
                </div>
                <div className="text-sm text-muted-foreground">Free Events</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{categoryCounts.length}</div>
                <div className="text-sm text-muted-foreground">Categories</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {countStartingAfter5pm(freeEvents)}
                </div>
                <div className="text-sm text-muted-foreground">Starting after 5 PM</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {categoryCounts.length > 0 && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4">
                Free Events by Category
                {capped && (
                  <span className="block text-sm font-normal text-muted-foreground mt-1">
                    Of the next {FETCH_LIMIT} free events
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {categoryCounts.map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">{category}</span>
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && loadError ? (
          <ErrorState error={loadError} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <SkeletonGroup label="Loading free events..." className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-48 bg-muted rounded-lg mb-4"></div>
                <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            ))}
          </SkeletonGroup>
        ) : freeEvents.length > 0 ? (
          <>
            <h2 className="text-2xl font-bold mb-6">
              Upcoming Free Events ({countLabel(freeEvents.length, FETCH_LIMIT)})
            </h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visibleEvents.map((event, index) => (
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
            {freeEvents.length > visibleEvents.length && (
              <div className="mt-8 text-center">
                <p className="text-muted-foreground mb-3">
                  Showing the {visibleEvents.length} soonest of{" "}
                  {formatCount(freeEvents.length, "free event")}.
                </p>
                <Button asChild variant="outline">
                  <Link to="/events?price=free">See every free event</Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center">
              <SpriteIcon name="calendar" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold mb-2">No Free Events Found</h2>
              <p className="text-muted-foreground mb-4">
                Nothing on the calendar is listed as free right now. New events are
                collected daily.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Advice that holds whatever the event. The old tips promised free
            street parking after 6 PM and named venues and practices nobody
            here checked. */}
        <Card className="mt-8">
          <CardContent className="pt-6">
            <h2 className="text-xl font-semibold mb-4">Tips for Free Events in Des Moines</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Check the event page first</h3>
                <p className="text-sm text-muted-foreground">
                  Prices and times change. Each card links to the event's own page, which links to the organizer.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Plan for parking and food</h3>
                <p className="text-sm text-muted-foreground">
                  Free entry doesn't always mean free parking or free food. The event page usually says what to expect.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Bringing kids?</h3>
                <p className="text-sm text-muted-foreground">
                  The <Link to="/events/kids" className="text-primary hover:underline font-semibold">kids and family events</Link> page lists family events and marks the free ones.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Arrive early for popular events</h3>
                <p className="text-sm text-muted-foreground">
                  Free events with limited space fill up. If the event page mentions a capacity or registration, plan for it.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <EventsLandingLinks current="/events/free" className="mt-8 mb-8" />

        {/* The single FAQPage emitter (EnhancedLocalSEO no longer emits one). */}
        <FAQSection
          faqs={faqData}
          title="Free Events in Des Moines FAQ"
          description="Common questions about free activities and events in the Des Moines metro area"
        />

        <RelatedContent
          currentPath="/events/free"
          title="Discover More Des Moines Activities"
        />
      </div>

      <Footer />
    </div>
  );
}
