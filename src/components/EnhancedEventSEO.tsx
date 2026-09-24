import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime, formatInCentralTime } from "@/lib/timezone";
import { BRAND } from "@/lib/brandConfig";
import { ogImageUrl } from "@/lib/ogImage";
import { buildEventJsonLd } from "@/lib/eventSchema";
import { toJsonLd } from "@/lib/jsonLd";
import { eventMetaDescription, eventPageTitle } from "@/lib/eventMeta";

interface EnhancedEventSEOProps {
  event: Event;
  // `isUpcoming` was removed in WEB-SEO-009. It only ever drove the
  // EventScheduled/EventPostponed switch, which was itself the bug — a
  // concluded event is not postponed. Staleness for the robots directive is
  // now derived from the event's own start date below, so the component no
  // longer depends on the caller computing it correctly.
  viewMode?: "list" | "detail";
}

export default function EnhancedEventSEO({
  event,
  viewMode = "detail"
}: EnhancedEventSEOProps) {

  // Both live in src/lib/eventMeta.ts, which records why: the title read the
  // offset-less event_start_local first and so carried a showtime five hours
  // early in the UTC prerender, and the description said "Des Moines" and
  // "Free admission" for rows that were neither.
  const getOptimizedTitle = () =>
    viewMode === "list" ? `${event.title} | ${BRAND.city} Events` : eventPageTitle(event);

  const getGEODescription = () => eventMetaDescription(event);

  const getLocalKeywords = () => {
    const base = [
      event.title,
      `${event.title} ${BRAND.city}`,
      `${BRAND.city} ${event.category}`,
      `${event.category} events ${BRAND.city}`,
      `${BRAND.city} events`,
      `things to do ${BRAND.city}`,
      `things to do in ${BRAND.city} ${BRAND.state}`,
      `${BRAND.state} events`,
      `${BRAND.region} events`,
      `${BRAND.city} activities`,
      `events near me ${BRAND.city}`,
      `what to do in ${BRAND.city}`,
      `${BRAND.city} ${BRAND.state} events today`,
      `${BRAND.city} weekend events`,
    ];

    if (event.venue) {
      base.push(`${event.venue} events`, `${event.venue} ${BRAND.city}`, `events at ${event.venue}`);
    }

    if (event.location && !event.location.includes(BRAND.city)) {
      base.push(`${event.location} events`);
    }

    if (event.city && event.city !== BRAND.city) {
      base.push(`${event.city} events`, `things to do ${event.city} Iowa`);
    }

    const month = formatInCentralTime(
      event.event_start_utc || event.event_start_local || event.date,
      "MMMM"
    );
    const year = formatInCentralTime(
      event.event_start_utc || event.event_start_local || event.date,
      "yyyy"
    );
    const dayOfWeek = formatInCentralTime(
      event.event_start_utc || event.event_start_local || event.date,
      "EEEE"
    );

    base.push(
      `${BRAND.city} events ${month} ${year}`,
      `${dayOfWeek} events ${BRAND.city}`,
      `this weekend ${BRAND.city}`,
      `tonight ${BRAND.city}`,
      `${event.category.toLowerCase()} ${BRAND.city} ${month}`,
    );

    return base.filter(Boolean);
  };

  const eventUrl = `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`;
  // Branded dynamic OG card (WEB-FEAT-008); falls back to the item photo / default.
  const ogImage = ogImageUrl("event", event.id) || event.image_url || `${BRAND.baseUrl}${BRAND.ogImage}`;

  // startMs only drives the stale-event robots directive below. The schema's
  // description, offers and endDate come from buildEventJsonLd; the locals
  // that used to duplicate them here were never read.
  const startDateISO = event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString());
  const startMs = new Date(startDateISO).getTime();

  // WEB-SEO-009: retire long-past events from the index instead of accumulating
  // them forever. Previously every event page emitted an unconditional
  // "index, follow", so concluded listings never aged out.
  //
  // The 30-day threshold is deliberately LATER than the 7-day GRACE_DAYS in
  // scripts/generate-dynamic-sitemaps.ts. Between day 7 and day 30 an event is
  // still indexable but no longer submitted — it keeps ranking for
  // "did X happen" style queries and for recurring-event research while it is
  // still plausibly useful, then drops out. Keep "follow" throughout so the
  // internal links on the page continue to pass.
  const STALE_EVENT_NOINDEX_DAYS = 30;
  const daysSinceEvent = Number.isFinite(startMs)
    ? (Date.now() - startMs) / 86_400_000
    : 0;
  const isStaleEvent = daysSinceEvent > STALE_EVENT_NOINDEX_DAYS;
  const robotsDirective = isStaleEvent
    ? "noindex, follow"
    : "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";

  // WEB-SEO-021. This built its OWN Event node, a second one, and it had
  // drifted: addressLocality was `event.city || BRAND.city`, so a Waukee
  // trivia night published as taking place in Des Moines on its detail page
  // while the list pages had it right. That is the SEO-007 locality bug,
  // reintroduced on roughly 525 URLs by a copy nobody remembered was a copy.
  //
  // src/lib/eventSchema.ts documents itself as "the single Event JSON-LD
  // builder" (SEO-002/007). It is now the only one. Everything the old block
  // explained in comments lives there and applies to every surface at once:
  //   SEO-009  a concluded event is EventScheduled with a past endDate, never
  //            EventPostponed
  //   SEO-010  organizer and performer are omitted rather than fabricated -- we
  //            are an aggregator and the table has no such column
  //   SEO-018  a price range becomes an AggregateOffer, and an unreadable price
  //            drops the property instead of asserting zero
  //
  // inLanguage and mainEntityOfPage are added here rather than in the builder
  // because they describe THIS PAGE, and the builder is also used to produce
  // nodes nested inside an ItemList, where a mainEntityOfPage pointing at the
  // list would be wrong.
  const eventJsonLd = buildEventJsonLd(event, { withContext: true });
  const eventSchema = {
    ...eventJsonLd,
    inLanguage: "en-US",
    mainEntityOfPage: { "@type": "WebPage", "@id": eventJsonLd.url },
  };

  // WEB-SEO-022. A FIVE-QUESTION FAQPage USED TO BE BUILT HERE AND IT IS GONE.
  //
  // Nothing on the page ever showed it. EventDetails renders no FAQSection, so
  // the markup existed only in the head -- and Google's structured-data policy
  // requires FAQ content to be visible on the page it is emitted from.
  // EnhancedLocalSEO.tsx:277-305 already records why this pattern was removed
  // from every other surface; event pages were the copy that survived.
  //
  // The answers were also not true of the events they described. Every one of
  // roughly 525 event pages asserted the same directions -- two named
  // interstates, downtown parking, a bus route -- for a barn dance in Waukee as
  // readily as for a show downtown, and one question quoted raw latitude and
  // longitude at the reader. That is fabricated content in a format search
  // engines read as a factual claim by the site.
  //
  // NOT REPLACED WITH A VISIBLE SECTION, though AC2 allows it. The only fields
  // that could honestly answer these questions -- date, venue, price -- are
  // already on the page, already in the Event JSON-LD, and already in the meta
  // description. A visible FAQ restating them would exist to carry the markup
  // rather than to answer anything, which is the same defect with a <details>
  // element around it.

  // Speakable Schema for Voice Assistants (Google Assistant, Alexa, Siri)
  const speakableSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": eventUrl,
    "name": getOptimizedTitle(),
    "speakable": {
      "@type": "SpeakableSpecification",
      // #event-summary is the one sentence that answers what, when, where and
      // price. The old selectors named microdata attributes, and one of them
      // (description) sat outside the <article> it was scoped to, so it
      // matched nothing.
      "cssSelector": ["article h1", "#event-summary"]
    },
    "url": eventUrl
  };

  return (
    <Helmet>
      {/* Core Meta */}
      <title>{getOptimizedTitle()}</title>
      <meta name="description" content={getGEODescription()} />
      <meta name="keywords" content={getLocalKeywords().join(", ")} />
      <link rel="canonical" href={eventUrl} />

      {/* Geographic Meta for Local SEO */}
      <meta name="geo.region" content={`US-${BRAND.stateAbbr}`} />
      <meta name="geo.placename" content={`${BRAND.city}, ${BRAND.state}`} />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />
      <meta name="DC.title" content={getOptimizedTitle()} />

      {/* Event-Specific Meta for AI Parsers (ChatGPT, Perplexity, Google AI) */}
      <meta name="event:title" content={event.title} />
      <meta name="event:description" content={getGEODescription()} />
      <meta name="event:start_time" content={event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString())} />
      <meta name="event:location" content={event.venue || event.location || `${BRAND.city}, ${BRAND.state}`} />
      <meta name="event:category" content={event.category} />
      <meta name="event:city" content={event.city || BRAND.city} />
      <meta name="event:state" content={BRAND.state} />
      <meta name="event:country" content="United States" />
      {event.image_url && <meta name="event:image" content={event.image_url} />}
      {event.price && <meta name="event:price" content={event.price} />}

      {/* AI Search Engine Optimization Meta.
          robotsDirective flips to noindex,follow once the event is long past
          (WEB-SEO-009). */}
      <meta name="robots" content={robotsDirective} />
      <meta name="googlebot" content={isStaleEvent ? "noindex, follow" : "index, follow"} />
      <meta name="bingbot" content={isStaleEvent ? "noindex, follow" : "index, follow"} />

      {/* Open Graph for Social + AI */}
      <meta property="og:type" content="event" />
      <meta property="og:title" content={getOptimizedTitle()} />
      <meta property="og:description" content={getGEODescription()} />
      <meta property="og:locality" content={event.city || BRAND.city} />
      <meta property="og:region" content={BRAND.state} />
      <meta property="og:country-name" content="United States" />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={`${event.title} - ${event.category} event in ${event.city || BRAND.city}`} />
      <meta property="og:url" content={eventUrl} />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data - Event Schema (primary for Google Events indexing) */}
      <script type="application/ld+json">{toJsonLd(eventSchema)}</script>
      <script type="application/ld+json">{toJsonLd(speakableSchema)}</script>
    </Helmet>
  );
}
