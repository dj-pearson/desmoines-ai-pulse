import { useMemo } from "react";
import { Link, useParams, useLocation as useRouterLocation } from "react-router-dom";
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
import { Card, CardContent } from "@/components/ui/card";
import NoIndexMeta from "@/components/schema/NoIndexMeta";
import { EventsLandingLinks } from "@/components/events/EventsLandingLinks";
import { DIRECTORY_PILL } from "@/components/seo/MonthLinks";
import { notOverFilter } from "@/components/events/eventsHubQuery";
import { BRAND } from "@/lib/brandConfig";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { RESTAURANT_LIST_COLUMNS } from "@/lib/listColumns";
import { ErrorState } from "@/components/ui/error-state";
import { SUBURBS, type SuburbSlug } from "@/lib/suburbs";
import { PlaceCrossLinks } from "@/components/PlaceCrossLinks";
import { applyEventVisibility } from "@/lib/eventQuery";
import { eventAreaOrFilter, findEventArea } from "@/lib/eventAreas";
import { isFreePrice } from "@/lib/eventPrice";

/** Rows fetched for one suburb. The page renders 24; the rest feed the counts. */
const MAX_EVENTS = 500;

/**
 * The suburb as a place (events-pass2 WP5 items 5 and 6): eventAreas' group
 * for the suburb's city area, the same one the hub's `?location=<slug>`
 * sends. `city` first; a row with no city only through a location that ends
 * in the suburb's name, so "Urbandale Ave, Des Moines" is not an Urbandale
 * event. Restaurants have the same two columns and use the same group.
 */
function suburbPlaceFilter(slug: string | null): string | null {
  const area = findEventArea(slug);
  return area ? eventAreaOrFilter(area) : null;
}

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


  interface EventItem {
    id: string;
    title: string;
    date: string;
    end_date?: string | null;
    latitude?: number | null;
    longitude?: number | null;
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

  const placeFilter = suburbPlaceFilter(slug);

  // Filtered in the query, not in the browser (events plan WP6 item 8). The
  // floor is the hub's not-over rule, nested with the place group in ONE
  // `or=` (a second .or() is a second param, and the codebase does not rely
  // on how PostgREST combines those). It replaced a start-of-today floor plus
  // a client isAfter(date) that dropped a festival still running and kept an
  // 8 AM class at 9 PM.
  const {
    data: events = [],
    isLoading,
    isSuccess: eventsLoaded,
    error: loadError,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ["events-by-location", slug],
    enabled: !!suburbInfo && !!placeFilter,
    queryFn: async (): Promise<EventItem[]> => {
      if (!suburbInfo || !placeFilter) return [];
      const { data, error } = await applyEventVisibility(
        supabase
          .from("events")
          // NOTE: `time` and `status` are not columns on public.events (see the
          // warning on EVENT_LIST_COLUMNS in src/lib/listColumns.ts). Naming them
          // made PostgREST reject the whole projection with 42703, so this page
          // rendered zero events on every load. Neither field was read downstream.
          .select("id, title, date, end_date, location, venue, price, category, enhanced_description, original_description, image_url, event_start_utc, city, latitude, longitude")
      )
        .or(`and(or(${placeFilter}),or(${notOverFilter(new Date())}))`)
        .order("date", { ascending: true })
        .order("id", { ascending: true })
        .limit(MAX_EVENTS);
      if (error) {
        log.error("fetchEvents", "Error fetching events", { error });
        throw error;
      }
      return (data ?? []) as EventItem[];
    },
  });

  // A count, not the length of a six-card sample (WP5 item 4): the tile said
  // "Local Restaurants: 6" for every suburb with six or more.
  const restaurantQuery = (columns: string, head = false) =>
    supabase
      .from("restaurants")
      .select(columns, head ? { count: "exact", head: true } : undefined)
      .eq("status", "active")
      .neq("is_merged", true)
      .or(placeFilter ?? "id.is.null");

  const { data: restaurants } = useQuery({
    queryKey: ["restaurants-by-location", slug],
    queryFn: async () => {
      const { data, error } = await restaurantQuery(RESTAURANT_LIST_COLUMNS)
        .order("name", { ascending: true })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        slug: string | null;
        name: string;
        cuisine: string | null;
        location: string | null;
        city: string | null;
      }>;
    },
    enabled: !!suburbInfo && !!placeFilter,
  });

  const { data: restaurantCount } = useQuery({
    queryKey: ["restaurants-by-location-count", slug],
    queryFn: async () => {
      const { count, error } = await restaurantQuery("id", true);
      if (error) throw error;
      return count ?? null;
    },
    enabled: !!suburbInfo && !!placeFilter,
  });

  // Moved above the early return below (WEB-PERF-030): it depends only on
  // the events query, and the hooks that follow it must run on every render.
  // Two full rows of the lg:grid-cols-3 grid below. This route prerendered
  // 4,077 elements inside #root against a median of 496 across all 35 routes,
  // and Lighthouse flags above ~1,500 - a cost paid in HTML parse, DOM memory
  // and hydration, all main-thread (WEB-PERF-023).
  //
  // ONLY THE RENDERED LIST IS CAPPED. The stat block and the "Showing the
  // first 24 of N" line read upcomingEvents.length; the JSON-LD ItemList reads
  // the 24 rendered cards, so it never lists an event the page doesn't show.
  const VISIBLE_EVENTS = 24;

  // The server applied the not-over rule; nothing is re-filtered here.
  const upcomingEvents = events;
  const eventsCapped = events.length >= MAX_EVENTS;
  const freeCount = upcomingEvents.filter((e) => isFreePrice(e.price) === true).length;

  const visibleEvents = upcomingEvents.slice(0, VISIBLE_EVENTS);

  // null value = not known yet; the tile keeps its place but prints nothing.
  const statTiles: Array<{ label: string; value: string | null }> = eventsLoaded
    ? [
        { label: "Upcoming events", value: `${upcomingEvents.length}${eventsCapped ? "+" : ""}` },
        { label: "Listed as free", value: String(freeCount) },
        ...(restaurantCount != null
          ? [{ label: "Restaurants listed", value: String(restaurantCount) }]
          : []),
      ]
    : [
        { label: "Upcoming events", value: null },
        { label: "Listed as free", value: null },
        { label: "Restaurants listed", value: null },
      ];

  const nearbySuburbs = (suburbInfo?.nearby ?? [])
    .filter((near): near is SuburbSlug => near in SUBURBS)
    .map((near) => ({ slug: near, name: SUBURBS[near].name }));
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
                <Link to="/events" className="text-primary hover:underline ml-1">
                  Browse all events
                </Link>
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
      {/* A failed first read would otherwise be captured as an empty page. */}
      {loadError && !eventsLoaded && <NoIndexMeta />}
      <EventListJsonLd
        // The rendered cards, not every loaded row (WP5 item 7).
        events={visibleEvents}
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

          {/* Only numbers the page has (WP5 item 4). Until the events read
              succeeds the tiles hold an invisible placeholder in the same
              markup, so the block keeps its height and nobody sees a "0"
              that means "still loading". The restaurant tile is a count
              query's answer or nothing. */}
          <dl
            className={`mb-6 grid grid-cols-1 gap-4 rounded-xl border bg-card p-6 text-center ${
              !eventsLoaded || restaurantCount != null ? "sm:grid-cols-3" : "sm:grid-cols-2"
            }`}
            aria-busy={!eventsLoaded}
          >
            {statTiles.map((tile) => (
              <div key={tile.label} className="flex flex-col-reverse">
                <dt className="text-sm text-muted-foreground">{tile.label}</dt>
                <dd className="text-2xl font-bold text-primary">
                  {tile.value ?? <span className="invisible">0</span>}
                </dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link to={`/events/near-me?from=${slug}`} className={DIRECTORY_PILL}>
              Events by distance from {suburbInfo.name}
            </Link>
            {nearbySuburbs.length > 0 && (
              <nav aria-labelledby="nearby-suburbs" className="flex flex-wrap items-center gap-2">
                <span id="nearby-suburbs" className="text-sm text-muted-foreground">
                  Events in nearby suburbs:
                </span>
                {nearbySuburbs.map((near) => (
                  <Link key={near.slug} to={`/events/${near.slug}`} className={DIRECTORY_PILL}>
                    {near.name}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </div>

        {/* Events List */}
        {!isLoading && loadError ? (
          <ErrorState error={loadError} onRetry={() => void refetchEvents()} />
        ) : isLoading ? (
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
                <Link to="/events" className="text-primary hover:underline">
                  All Des Moines Events
                </Link>
                <Link
                  to="/events/this-weekend"
                  className="text-primary hover:underline"
                >
                  This Weekend's Events
                </Link>
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
                    <div className="mt-3">
                      <Link
                        to={`/restaurants/${restaurant.slug ?? restaurant.id}`}
                        className="text-primary hover:underline text-sm"
                      >
                        View Details
                      </Link>
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
        <EventsLandingLinks current={`/events/${slug}`} className="mb-10" />

        <FAQSection faqs={faqData} title={`About ${suburbInfo.name}`} />

        {/* WEB-SEO-036 AC5. /events/ankeny and /neighborhoods/ankeny are both
            pages about Ankeny and neither linked to the other. */}
        <PlaceCrossLinks slug={slug ?? ""} from="events" />
      </div>

      <Footer />
    </div>
  );
}
