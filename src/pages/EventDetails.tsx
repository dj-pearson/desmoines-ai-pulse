import { useParams, Link, useNavigate, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Helmet } from "react-helmet-async";
import { useEventBySlug } from "@/hooks/useEventBySlug";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ShareDialog from "@/components/ShareDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { RouteCanonical } from "@/components/RouteCanonical";
import EnhancedEventSEO from "@/components/EnhancedEventSEO";
import AIWriteup from "@/components/AIWriteup";
import EventCard from "@/components/EventCard";
import EventHotelCallout from "@/components/EventHotelCallout";
import { LazySection } from "@/components/LazySection";
import {
  centralDateOf,
  centralHour,
  centralWeekday,
  createEventSlugWithCentralTime,
  formatEventDate,
  formatEventPart,
  formatInCentralTime,
} from "@/lib/timezone";
import { ArrowLeft, Tag, ChevronRight, Navigation, RotateCw } from "lucide-react";
import { AddToCalendarButton } from "@/components/AddToCalendarButton";
import { useCalendarExport } from "@/hooks/use-calendar-export";
import { toIcsEvent } from "@/lib/icsEvent";
import { FavoriteButton } from "@/components/FavoriteButton";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { useContentTracking } from "@/hooks/useContentTracking";
import { useRecordRecentView } from "@/hooks/useRecentlyViewedFeed";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { LastUpdatedBadge } from "@/components/LastUpdatedBadge";
import { DinnerBeforeShow, NearbyContent } from "@/components/NearbyContent";
import { LazyLocationMap } from "@/components/LazyLocationMap";
import { eventSummary } from "@/lib/eventMeta";
import { readGeoFaq } from "@/lib/restaurantMeta";
import { FAQSection } from "@/components/FAQSection";
import { matchVenue, formatMiles } from "@/lib/venuePages";
import { useVenueMatchRows } from "@/hooks/useVenues";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { useRelatedEvents, useSameNightNearby, useEventSeries } from "@/hooks/useRelatedEvents";
import { useDinnerBeforeShow } from "@/hooks/useDinnerBeforeShow";
import {
  eventRunLabel,
  eventTimeLabel,
  eventTiming,
  type EventTimingTone,
} from "@/lib/eventTiming";
import { eventOutboundLink } from "@/lib/eventSchema";
import { eventPriceLabel, isFreePrice } from "@/lib/eventPrice";
import { findEventArea, isInBBox } from "@/lib/eventAreas";
import { handleError } from "@/lib/errorHandler";
import { EVENING_START_HOUR, type TonightEvent } from "@/lib/tonightPairings";
import { EventProvenance } from "@/components/events/EventProvenance";
import { AIDisclosureBadge } from "@/components/AIDisclosureBadge";

// Below-the-fold widgets that each fire their own requests on mount. React.lazy
// defers the chunk; LazySection defers the mount until the reader scrolls near
// them (events plan WP8 item 9).
const EventCheckIn = lazy(() =>
  import("@/components/EventCheckIn").then((m) => ({ default: m.EventCheckIn }))
);
const RatingSystem = lazy(() =>
  import("@/components/RatingSystem").then((m) => ({ default: m.RatingSystem }))
);
const EventReminderSettings = lazy(() =>
  import("@/components/EventReminderSettings").then((m) => ({ default: m.EventReminderSettings }))
);

/**
 * Badge fills. White text needs a -700 shade to clear 4.5:1; the -500 fills
 * this page used (orange, emerald, amber) all failed axe.
 */
const TONE_CLASS: Record<EventTimingTone, string> = {
  now: "bg-emerald-700 text-white",
  today: "bg-red-700 text-white",
  soon: "bg-orange-700 text-white",
  later: "bg-indigo-700 text-white",
  past: "",
};

/** Venues whose visitors want the parking and transit page. */
const GETTING_AROUND_AREAS = ["downtown", "east-village"];

function toCoord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/**
 * A location string that is only a city and state ("Des Moines, IA"), which
 * the Where row already prints on its own line (events-pass2 WP4 item 15).
 */
function isCityOnly(location: string | null | undefined, city: string | null | undefined): boolean {
  const loc = (location ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!loc) return true;
  if (city && loc === city.trim().toLowerCase()) return true;
  // One place name, then the state: no street number, no second comma.
  return /^[a-z .'-]+,? (ia|iowa)( \d{5})?$/.test(loc);
}

/** "a Music event" / "an Outdoor event" / "an event". */
function withArticle(category: string | null): string {
  if (!category) return "an event";
  return `${/^[aeiou]/i.test(category) ? "an" : "a"} ${category} event`;
}

interface DeferredWidgetProps {
  minHeight: number;
  label: string;
  children: ReactNode;
}

/** Fixed-height box until mounted, so the deferred widgets add no layout shift. */
function DeferredWidget({ minHeight, label, children }: DeferredWidgetProps) {
  const reserve = <div style={{ minHeight }} aria-hidden="true" />;
  return (
    <LazySection minHeight={minHeight} label={label} placeholder={reserve}>
      <Suspense fallback={reserve}>{children}</Suspense>
    </LazySection>
  );
}

interface FactRowProps {
  term: string;
  children: ReactNode;
}

function FactRow({ term, children }: FactRowProps) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm font-semibold text-foreground">{term}</dt>
      <dd className="text-sm text-muted-foreground">{children}</dd>
    </div>
  );
}

function EventLoadingState({ slug }: { slug: string | undefined }) {
  return (
    <div className="min-h-screen bg-background">
      {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
      <RouteCanonical path={`/events/${slug}`} />
      <Header />
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-muted rounded w-1/4" />
          <div className="h-72 md:h-96 bg-muted rounded-2xl" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-10 bg-muted rounded w-3/4" />
              <div className="h-6 bg-muted rounded w-1/2" />
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded" />
                <div className="h-4 bg-muted rounded w-5/6" />
                <div className="h-4 bg-muted rounded w-4/6" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-48 bg-muted rounded-xl" />
              <div className="h-32 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function EventDetails() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  // The hero is dropped entirely when its image fails, rather than hidden by
  // mutating the DOM from an onError handler (WEB-PERF-037).
  const [heroFailed, setHeroFailed] = useState(false);
  const now = new Date();
  // Targeted, date-windowed lookup - see useEventBySlug for why the old
  // fetch-everything-then-Array.find approach 404'd listed events (WEB-QA-002).
  // It also resolves a bare UUID and a stale slug; the canonical redirect is
  // below (events plan WP8 item 2).
  // `archived`: the archive sweep retired the row; it renders as a past event
  // with noindex (events-pass2 WP4 item 11). A merged duplicate arrives here
  // as its survivor and is redirected below.
  const { event, archived, isLoading, error, refetch, isFetching } = useEventBySlug(slug);
  // Used by the sticky action bar below; the inline control uses
  // AddToCalendarButton, which owns its own export handlers.
  const { downloadIcsFile } = useCalendarExport();
  // SEO-018: the venue page this event links to, when its venue is a known one.
  // Six columns, not select('*') (events-pass2 WP4 item 16).
  const { data: venueRows } = useVenueMatchRows();

  // A client-side move to another event reuses this component; a failed hero
  // on the last one must not hide this one's (events-pass2 WP4 item 15).
  useEffect(() => {
    setHeroFailed(false);
  }, [event?.id]);

  // Track page view and content interactions
  const { trackShare, trackClick } = useContentTracking(event?.id, 'event');

  const venuePage = event ? matchVenue(event.venue || event.location, venueRows ?? []) : null;
  // Event coordinates first, then the matched venue's (WP8 item 8).
  const latitude = toCoord(event?.latitude) ?? toCoord(venuePage?.latitude);
  const longitude = toCoord(event?.longitude) ?? toCoord(venuePage?.longitude);

  const timing = event ? eventTiming(event, now) : null;
  const isUpcoming = timing ? !timing.isOver && !archived : false;

  // The rails wait for the event (WP8 item 7). Each hook takes null until then.
  const { events: relatedEvents } = useRelatedEvents(event);
  const { events: sameNight } = useSameNightNearby(isUpcoming ? event : null, latitude, longitude, now);
  // Other dates of the same event (events-pass2 WP4 item 13).
  const { events: seriesDates } = useEventSeries(event);

  const dinnerEvent = useMemo<TonightEvent | null>(
    () =>
      event
        ? {
            id: event.id,
            title: event.title,
            date: event.date,
            event_start_utc: event.event_start_utc,
            event_start_local: event.event_start_local,
            time_tbd: (event as { time_tbd?: boolean | null }).time_tbd ?? null,
            latitude,
            longitude,
          }
        : null,
    [event, latitude, longitude]
  );
  const { picks: dinnerPicks } = useDinnerBeforeShow(dinnerEvent);

  // Record into the unified recently-viewed feed (WEB-FEAT-007).
  useRecordRecentView(
    event
      ? {
          id: event.id,
          type: "event",
          title: event.title,
          href: `/events/${createEventSlugWithCentralTime(event.title, event)}`,
          image_url: event.image_url,
          subtitle: event.venue || event.location || event.category,
        }
      : null,
  );

  // A failed request is reported, not dressed up as a 404 (WP8 item 3).
  useEffect(() => {
    if (error) handleError(error, { component: "EventDetails", action: "load event" });
  }, [error]);

  if (isLoading) return <EventLoadingState slug={slug} />;

  if (error && !event) {
    return (
      <div className="min-h-screen bg-background">
        {/* No robots meta. The event may exist; a noindex here would drop a
            live page from the index because the backend blinked. */}
        <RouteCanonical path={`/events/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-16">
          <div className="text-center space-y-4 max-w-md mx-auto" role="alert">
            <h1 className="text-2xl font-bold">We couldn't load this event</h1>
            <p className="text-muted-foreground">
              Something went wrong on our side while fetching it. Try again in a moment.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => void refetch()} disabled={isFetching}>
                <RotateCw className="h-4 w-4 mr-2" aria-hidden="true" />
                {isFetching ? "Retrying..." : "Retry"}
              </Button>
              <Button onClick={() => navigate("/events")} variant="outline">
                Browse Events
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!event) {
    return (
      <>
        {/* NO SEOHead HERE (WEB-SEO-040). It emits
            robots="index, follow, max-image-preview:large, ..." unconditionally,
            so this branch published TWO conflicting robots metas - one asking
            for indexing and one refusing it - on the same page. Google resolves
            a conflict by taking the most restrictive, so the outcome happened to
            be right, but publishing both is a coin toss dressed as a decision.
            A page that does not exist needs the refusal and nothing else.
            Only a successful empty answer reaches here; errors render above. */}
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <div className="min-h-screen bg-background">
          <Header />
          <div className="container mx-auto px-4 py-16">
            <div className="text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <SpriteIcon name="calendar" className="h-8 w-8 text-muted-foreground" />
              </div>
              <h1 className="text-2xl font-bold">Event Not Found</h1>
              <p className="text-muted-foreground">
                This event may have ended or been removed. Browse our latest events to find something new.
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigate("/events")} variant="default">
                  Browse Events
                </Button>
                <Button onClick={() => navigate("/")} variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </>
    );
  }

  const eventSlug = createEventSlugWithCentralTime(event.title, event);
  // /events/<uuid> and stale slugs land here; send them to the one URL that
  // is canonical, so shares and bookmarks converge (WP8 item 2).
  if (slug && slug !== eventSlug) {
    return <Navigate replace to={`/events/${eventSlug}`} />;
  }

  // One guarded link for every CTA: http(s) only, not flagged broken by the
  // link checker (WP8 item 5). "Get tickets" only for a paid price on a
  // ticketing host; otherwise the button names where it goes, "Event listing
  // on catchdesmoines.com" (events-pass2 WP4 item 5). The sticky bar uses the
  // same value.
  const outbound = eventOutboundLink(event);
  const ticketUrl = outbound?.href ?? null;
  const free = isFreePrice(event.price);
  const category = event.category?.trim() || null;
  const eventUrl = `${BRAND.baseUrl}/events/${eventSlug}`;
  const showTime = timing?.hasTime ?? false;
  // "Aug 13 - Aug 23", "7:00 - 10:00 PM CT" or "Runs through Sun, Aug 23"
  // whenever end_date is at or after the start (events-pass2 WP4 item 7).
  const runLabel = eventRunLabel(event, now);
  // Evening or daytime, on the Central clock. An untimed row's hour is a
  // placeholder, so it counts as neither: no dinner advice, "that day".
  const startHour = timing?.hasTime && timing.start ? centralHour(timing.start) : null;
  const isEvening = startHour !== null && startHour >= EVENING_START_HOUR;
  // Dinner advice whose time has passed isn't advice (events-pass2 WP4 item 8).
  const freshDinnerPicks = isUpcoming && isEvening
    ? dinnerPicks.filter((pick) => pick.dinnerAt.getTime() > now.getTime())
    : [];
  // Hotels when someone would book one (events-pass2 WP4 item 17): a run over
  // more than one Central day, a Friday or Saturday night, or a venue with a
  // recorded capacity. Anything else gets a single link.
  const startDay = timing?.start ? centralDateOf(timing.start) : null;
  const endMs = event.end_date ? Date.parse(event.end_date) : NaN;
  const multiDay =
    startDay !== null &&
    Number.isFinite(endMs) &&
    endMs >= (timing?.start?.getTime() ?? Infinity) &&
    centralDateOf(new Date(endMs)) > startDay;
  const weekendNight = startDay !== null && [5, 6].includes(centralWeekday(startDay));
  const bigVenue = (venuePage?.capacity ?? 0) > 0;
  const showHotelList = multiDay || weekendNight || bigVenue;
  const otherDates = seriesDates.filter((d) => d.id !== event.id);
  const aboutFallback = `${event.title} is ${withArticle(category)}${
    event.venue ? ` at ${event.venue}` : ""
  } in ${event.city?.trim() || `the ${BRAND.city} area`}.`;
  // UTC first; `date` is also an instant. event_start_local carries no offset.
  const dateSource = event.event_start_utc || event.date;
  const fullDate = formatEventDate(event);
  const monthDay = formatInCentralTime(dateSource, 'EEEE, MMMM d, yyyy');
  const hasCoords = latitude !== null && longitude !== null;
  const directionsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [event.venue, event.location, `${event.city || BRAND.city}, IA`].filter(Boolean).join(", ")
      )}`;
  const inGettingAroundArea =
    hasCoords &&
    GETTING_AROUND_AREAS.some((slugName) => {
      const area = findEventArea(slugName);
      return area?.kind === "bbox" && isInBBox(latitude, longitude, area.bbox);
    });
  const venueAddress =
    venuePage?.address && venuePage.address !== event.location ? venuePage.address : null;
  const addToCalendar = () => downloadIcsFile(toIcsEvent(event));

  return (
    <>
      <EnhancedEventSEO
        event={event}
        viewMode="detail"
        latitude={latitude}
        longitude={longitude}
        noindex={archived}
      />

      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl },
          { name: "Events", url: getCanonicalUrl('/events') },
          { name: event.title, url: eventUrl },
        ]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Image Section */}
        {event.image_url && !heroFailed && (
          <div className="relative h-48 sm:h-64 md:h-80 lg:h-96 overflow-hidden bg-slate-900">
            {/* WEB-PERF-037. State, not a DOM mutation from onError. */}
            <OptimizedImage
              src={event.image_url}
              alt={`${event.title} - ${category ? `${category} event` : "event"} in ${event.city || 'Des Moines'}, Iowa`}
              className="object-cover opacity-60"
              containerClassName="absolute inset-0"
              priority
              sizes="(max-width: 768px) 100vw, 1024px"
              onError={() => setHeroFailed(true)}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>
        )}

        <div className="container mx-auto px-4">
          {/* Content starts overlapping hero image */}
          <div className={event.image_url ? '-mt-32 relative z-10' : 'pt-8'}>
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Events", href: "/events" },
                ...(category
                  ? [{ label: category, href: `/events?category=${encodeURIComponent(category)}` }]
                  : []),
                { label: event.title }
              ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
              {/* Main Content Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* NO MICRODATA HERE. The JSON-LD node from EnhancedEventSEO is
                    the one Event on this page; an itemScope Event here was
                    counted as a second, incomplete one. */}
                <article className="bg-card rounded-2xl shadow-lg overflow-hidden">
                  <div className="p-6 md:p-8">
                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {timing?.label && timing.tone === "past" && (
                        <Badge variant="secondary">Past event</Badge>
                      )}
                      {timing?.label && timing.tone && timing.tone !== "past" && (
                        <Badge className={`${TONE_CLASS[timing.tone]} border-0`}>{timing.label}</Badge>
                      )}
                      {category && <Badge variant="outline">{category}</Badge>}
                      {event.is_featured && (
                        <Badge className="bg-amber-700 text-white border-0">
                          <SpriteIcon name="sparkles" className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                      )}
                      {free === true && (
                        <Badge className="bg-emerald-700 text-white border-0">Free</Badge>
                      )}
                    </div>

                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-foreground mb-4 leading-tight">
                      {event.title}
                    </h1>

                    {/* The answer-first sentence: what, when, where, price, from
                        the row alone (src/lib/eventMeta.ts). The Speakable node
                        points at it by id. */}
                    <p id="event-summary" className="text-base text-muted-foreground mb-5 max-w-prose">
                      {eventSummary({ ...event, source_url: ticketUrl ?? undefined }, now)}
                    </p>

                    {/* One fact list (WP8 item 10). This replaced an icon-tile
                        grid and a "Things To Know" section that said the same
                        four things twice. */}
                    <dl className="mb-6 divide-y rounded-xl bg-muted/50 p-4">
                      <FactRow term="When">
                        {showTime ? (
                          <>{fullDate} CT</>
                        ) : (
                          <>
                            {monthDay}
                            {/* "Time not listed", or "All day" for a dated run. */}
                            <span className="block">{eventTimeLabel(event)}</span>
                          </>
                        )}
                        {runLabel && <span className="block">{runLabel}</span>}
                        <EventProvenance event={event} className="mt-1 block text-xs text-muted-foreground" />
                      </FactRow>
                      <FactRow term="Where">
                        {event.venue && (
                          <span className="block font-medium text-foreground">
                            {venuePage ? (
                              <Link to={`/music/venues/${venuePage.slug}`} className="hover:underline">
                                {event.venue}
                              </Link>
                            ) : (
                              event.venue
                            )}
                          </span>
                        )}
                        {event.location && event.location !== event.venue && !isCityOnly(event.location, event.city) && (
                          <span className="block">{event.location}</span>
                        )}
                        {venueAddress && <span className="block">{venueAddress}</span>}
                        <span className="block">{event.city || BRAND.city}, Iowa</span>
                        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          <a
                            href={directionsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 items-center text-primary hover:underline"
                          >
                            {hasCoords ? "Directions" : "Find it on Google Maps"}
                          </a>
                          {inGettingAroundArea && (
                            <Link to="/getting-around" className="inline-flex min-h-11 items-center text-primary hover:underline">
                              Parking and transit downtown
                            </Link>
                          )}
                          {venuePage && (
                            <Link
                              to={`/music/venues/${venuePage.slug}`}
                              className="inline-flex min-h-11 items-center text-primary hover:underline"
                            >
                              More events at {venuePage.name}
                            </Link>
                          )}
                        </span>
                      </FactRow>
                      <FactRow term="Price">{eventPriceLabel(event.price)}</FactRow>
                      {category && (
                        <FactRow term="Category">
                          <Link
                            to={`/events?category=${encodeURIComponent(category)}`}
                            className="text-primary hover:underline"
                          >
                            {category} events
                          </Link>
                        </FactRow>
                      )}
                    </dl>

                    {/* Quick Actions Row */}
                    <div className="flex flex-wrap gap-2 pb-2">
                      {outbound && (
                        <Button asChild size="sm">
                          <a
                            href={outbound.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={trackClick}
                          >
                            <SpriteIcon name="external-link" className="h-4 w-4 mr-2" />
                            {outbound.label}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </Button>
                      )}
                      {isUpcoming && (
                        // WEB-FEAT-026: Google, Outlook and Apple, with correct UTC.
                        <AddToCalendarButton event={event} variant="outline" size="sm" />
                      )}
                      <FavoriteButton eventId={event.id} size="sm" variant="outline" />
                      <ShareDialog
                        title={event.title}
                        description={event.enhanced_description || event.original_description || `Check out ${event.title} in Des Moines`}
                        url={eventUrl}
                        onShare={trackShare}
                      />
                    </div>

                    {/* Other dates of the same event (events-pass2 WP4 item 13,
                        bet 4). On a past event's page this is where the next
                        one is (WP8 item 12). */}
                    {otherDates.length > 0 && (
                      <p className="mt-4 text-sm text-muted-foreground">
                        {timing?.isOver || archived ? "Next dates" : "Other dates"}:{" "}
                        {otherDates.map((d, i) => (
                          <span key={d.id}>
                            {i > 0 && ", "}
                            <Link
                              to={`/events/${createEventSlugWithCentralTime(d.title, d)}`}
                              className="inline-flex min-h-11 items-center font-medium text-primary hover:underline"
                            >
                              {formatEventPart(d, "EEE MMM d")}
                            </Link>
                          </span>
                        ))}
                      </p>
                    )}

                    {/* Bet 4: restaurants open before a timed, upcoming evening
                        show, with picks whose dinner time has passed dropped.
                        A daytime event gets the plain nearby list below instead;
                        "Dinner before the show" is the component's heading. */}
                    {freshDinnerPicks.length > 0 && (
                      <DinnerBeforeShow picks={freshDinnerPicks} startsAt={timing?.start ?? null} />
                    )}
                  </div>
                </article>

                {/* About This Event */}
                <section className="bg-card rounded-2xl border p-6 md:p-8">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">About This Event</h2>
                    {event.is_enhanced && event.enhanced_description && (
                      <AIDisclosureBadge
                        label="AI-assisted"
                        tooltip="This description was rewritten or expanded with AI from the source listing. Check times and prices with the source."
                      />
                    )}
                  </div>
                  <div className="prose prose-slate max-w-none">
                    <p className="text-muted-foreground leading-relaxed text-base">
                      {event.enhanced_description || event.original_description || aboutFallback}
                    </p>
                  </div>

                  {event.ai_writeup && (
                    <div className="mt-6 pt-6 border-t">
                      <AIWriteup
                        writeup={event.ai_writeup}
                        generatedAt={event.writeup_generated_at}
                        prompt={event.writeup_prompt_used}
                      />
                    </div>
                  )}
                </section>

                {/* GEO fields: the FAQ is shown AND marked up, which is the
                    condition EnhancedEventSEO's removed FAQPage never met
                    (WEB-SEO-022). */}
                {(event.geo_summary || (event.geo_key_facts?.length ?? 0) > 0) && (
                  <section className="bg-card rounded-2xl border p-6 md:p-8">
                    <h2 className="text-xl font-bold mb-4">Quick Facts</h2>
                    {event.geo_summary && (
                      <p className="text-muted-foreground leading-relaxed">{event.geo_summary}</p>
                    )}
                    {(event.geo_key_facts?.length ?? 0) > 0 && (
                      <ul className="mt-4 list-disc pl-5 space-y-1 text-muted-foreground">
                        {event.geo_key_facts.map((fact, i) => (
                          <li key={i}>{fact}</li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                {readGeoFaq(event.geo_faq).length > 0 && (
                  <section className="bg-card rounded-2xl border overflow-hidden">
                    <FAQSection
                      title={`${event.title}: Questions and Answers`}
                      faqs={readGeoFaq(event.geo_faq)}
                      showSchema={true}
                      className="border-0"
                    />
                  </section>
                )}

                {/* Community widgets, deferred until scrolled near. Check-in is
                    only for events that have not ended. The photo uploader is
                    gone from this page: uploads were stored and never shown
                    here (WP8 item 11). */}
                {isUpcoming && (
                  <DeferredWidget minHeight={320} label="Event check-in">
                    <EventCheckIn eventId={event.id} eventTitle={event.title} />
                  </DeferredWidget>
                )}
                {/* Ratings only once someone could have been there (events-pass2
                    WP4 item 15). */}
                {(timing?.isHappeningNow || timing?.isOver || archived) && (
                  <DeferredWidget minHeight={240} label="Ratings and reviews">
                    <RatingSystem contentType="event" contentId={event.id} showReviews={true} />
                  </DeferredWidget>
                )}
              </div>

              {/* Sidebar */}
              <aside className="space-y-5">
                {/* Map: event coordinates, else the matched venue's (WP8 item 8). */}
                {hasCoords && (
                  <Card className="overflow-hidden shadow-none">
                    <div className="h-48 overflow-hidden">
                      <LazyLocationMap
                        latitude={latitude}
                        longitude={longitude}
                        venue={event.venue}
                        location={event.location}
                        className="h-48 w-full"
                      />
                    </div>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium mb-2">{event.venue || event.location}</p>
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
                          <Navigation className="h-4 w-4 mr-2" />
                          Get Directions
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {isUpcoming && (
                  <DeferredWidget minHeight={160} label="Event reminders">
                    <EventReminderSettings eventId={event.id} eventTitle={event.title} />
                  </DeferredWidget>
                )}

                {/* Explore More Links - Internal Linking for SEO */}
                <Card className="shadow-none">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Explore Des Moines Events</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 p-4 pt-0">
                    <Link
                      to="/events/today"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <SpriteIcon name="clock" className="h-4 w-4 text-muted-foreground" />
                        Events Today
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link
                      to="/events/this-weekend"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <SpriteIcon name="calendar" className="h-4 w-4 text-muted-foreground" />
                        This Weekend
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link
                      to="/events/free"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <SpriteIcon name="ticket" className="h-4 w-4 text-muted-foreground" />
                        Free Events
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    {category && (
                      <Link
                        to={`/events?category=${encodeURIComponent(category)}`}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-muted-foreground" />
                          More {category}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    )}
                    <Link
                      to="/events"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                        All Events
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </CardContent>
                </Card>
              </aside>
            </div>

            {/* One hotel section, upcoming events only: linked hotels, else
                NearbyHotels by distance (WP8 item 9). */}
            {isUpcoming && (
              <EventHotelCallout
                eventId={event.id}
                latitude={latitude}
                longitude={longitude}
                placeName={event.venue || "this event"}
                nearSlug={venuePage?.slug ?? null}
                showList={showHotelList}
              />
            )}

            {/* Same category, upcoming, its own bounded query (WP8 item 7). */}
            {category && relatedEvents.length > 0 && (
              <section className="mt-12 pt-8 border-t">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">More {category} Events</h2>
                    <p className="text-sm text-muted-foreground mt-1">Coming up in the Des Moines area</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/events?category=${encodeURIComponent(category)}`)}
                  >
                    View All
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" onClick={trackClick}>
                  {relatedEvents.map((relatedEvent) => (
                    <EventCard
                      key={relatedEvent.id}
                      event={relatedEvent}
                      onViewDetails={() => {
                        navigate(`/events/${createEventSlugWithCentralTime(relatedEvent.title, relatedEvent)}`);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Same Central day, within two miles, not over, starting no
                earlier than three hours before this one (events-pass2 WP4
                item 14). "Night" only for an evening start. */}
            {sameNight.length > 0 && (
              <section className="mt-12 pt-8 border-t" aria-labelledby="same-night-heading">
                <h2 id="same-night-heading" className="text-2xl font-bold">
                  {isEvening ? "Also that night nearby" : "Also that day nearby"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Same day, within two miles of {event.venue || "this venue"}, straight-line distance
                </p>
                <ul className="mt-4 divide-y rounded-xl border">
                  {sameNight.map(({ item, miles }) => (
                    <li key={item.id}>
                      <Link
                        to={`/events/${createEventSlugWithCentralTime(item.title, item)}`}
                        className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{item.title}</span>
                          <span className="block truncate text-muted-foreground">
                            {[eventTimeLabel(item), item.venue].filter(Boolean).join(" - ")}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{formatMiles(miles)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Distance-only restaurants: the fallback when "Dinner before the
                show" has nothing to say (untimed, daytime, past, or nothing
                open). */}
            {freshDinnerPicks.length === 0 && (
              <NearbyContent
                variant="restaurants-near-event"
                city={event.city || "Des Moines"}
                excludeId={event.id}
                latitude={latitude}
                longitude={longitude}
              />
            )}
          </div>

          <LastUpdatedBadge updatedAt={event.updated_at} className="mt-6 justify-center" />
        </div>

        <Footer />
      </div>

      {/* The sticky bar's link takes no onClick, so outbound clicks are
          counted here as they bubble (consent-gated in useContentTracking). */}
      <div
        className="contents"
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("a[href^='http']")) trackClick();
        }}
      >
      <StickyMobileCTA
        variant="event"
        primaryAction={
          outbound
            ? {
                label: outbound.label,
                href: outbound.href,
                icon: "external",
                isExternal: true,
              }
            : isUpcoming
            ? {
                label: "Add to Calendar",
                onClick: addToCalendar,
                icon: "calendar",
              }
            : undefined
        }
        secondaryAction={
          outbound && isUpcoming
            ? {
                label: "Add to Calendar",
                onClick: addToCalendar,
                icon: "calendar",
              }
            : undefined
        }
      />
      </div>
    </>
  );
}
