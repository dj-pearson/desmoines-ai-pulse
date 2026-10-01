import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime } from "@/lib/timezone";
import { BRAND } from "@/lib/brandConfig";
import { ogImageUrl } from "@/lib/ogImage";
import { buildEventJsonLd, eventStartIso } from "@/lib/eventSchema";
import { toJsonLd } from "@/lib/jsonLd";
import {
  eventImageAlt,
  eventKeywords,
  eventMetaDescription,
  eventPageTitle,
  isStaleEvent,
} from "@/lib/eventMeta";

interface EnhancedEventSEOProps {
  event: Event;
  // `isUpcoming` was removed in WEB-SEO-009. It only ever drove the
  // EventScheduled/EventPostponed switch, which was itself the bug — a
  // concluded event is not postponed. Staleness for the robots directive is
  // now derived from the event's own start date below, so the component no
  // longer depends on the caller computing it correctly.
  viewMode?: "list" | "detail";
  /**
   * The coordinates the page itself uses: the event's, else its matched
   * venue's. geo.position and ICBM are omitted when there are none, rather
   * than claiming downtown Des Moines for a Waukee event (events-pass2 WP4
   * item 9).
   */
  latitude?: number | null;
  longitude?: number | null;
  /** Archived rows render as past events and ask to leave the index. */
  noindex?: boolean;
}

function coord(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export default function EnhancedEventSEO({
  event,
  viewMode = "detail",
  latitude,
  longitude,
  noindex = false,
}: EnhancedEventSEOProps) {

  // Both live in src/lib/eventMeta.ts, which records why: the title read the
  // offset-less event_start_local first and so carried a showtime five hours
  // early in the UTC prerender, and the description said "Des Moines" and
  // "Free admission" for rows that were neither.
  const getOptimizedTitle = () =>
    viewMode === "list" ? `${event.title} | ${BRAND.city} Events` : eventPageTitle(event);

  const getGEODescription = () => eventMetaDescription(event);

  // Absolute words only, and no crash on a null category (eventMeta.ts).
  const keywords = eventKeywords(event);

  const eventUrl = `${BRAND.baseUrl}/events/${createEventSlugWithCentralTime(event.title, event)}`;
  // Branded dynamic OG card (WEB-FEAT-008); falls back to the item photo / default.
  const ogImage = ogImageUrl("event", event.id) || event.image_url || `${BRAND.baseUrl}${BRAND.ogImage}`;

  // WEB-SEO-009: retire long-past events from the index instead of accumulating
  // them forever. Measured from the event's END since events-pass2 WP4 item
  // 12, so a two-month exhibit is not dropped while it is still open; see
  // isStaleEvent in eventMeta.ts. Keep "follow" throughout so the internal
  // links on the page continue to pass.
  const isStale = noindex || isStaleEvent(event);
  const lat = coord(latitude) ?? coord(event.latitude);
  const lng = coord(longitude) ?? coord(event.longitude);
  const hasGeo = lat !== null && lng !== null;
  const city = event.city?.trim() || null;
  const robotsDirective = isStale
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
      <meta name="keywords" content={keywords.join(", ")} />
      <link rel="canonical" href={eventUrl} />

      {/* Geographic Meta for Local SEO */}
      <meta name="geo.region" content={`US-${BRAND.stateAbbr}`} />
      {city && <meta name="geo.placename" content={`${city}, ${BRAND.state}`} />}
      {hasGeo && <meta name="geo.position" content={`${lat};${lng}`} />}
      {hasGeo && <meta name="ICBM" content={`${lat}, ${lng}`} />}
      <meta name="DC.title" content={getOptimizedTitle()} />

      {/* Event-Specific Meta for AI Parsers (ChatGPT, Perplexity, Google AI) */}
      <meta name="event:title" content={event.title} />
      <meta name="event:description" content={getGEODescription()} />
      {/* Same value as the JSON-LD startDate: a date only when no time was published. */}
      <meta name="event:start_time" content={eventStartIso(event)} />
      <meta name="event:location" content={event.venue || event.location || `${BRAND.city}, ${BRAND.state}`} />
      {event.category && <meta name="event:category" content={event.category} />}
      {city && <meta name="event:city" content={city} />}
      <meta name="event:state" content={BRAND.state} />
      <meta name="event:country" content="United States" />
      {event.image_url && <meta name="event:image" content={event.image_url} />}
      {event.price && <meta name="event:price" content={event.price} />}

      {/* AI Search Engine Optimization Meta.
          robotsDirective flips to noindex,follow once the event is long past
          (WEB-SEO-009). */}
      <meta name="robots" content={robotsDirective} />
      <meta name="googlebot" content={isStale ? "noindex, follow" : "index, follow"} />
      <meta name="bingbot" content={isStale ? "noindex, follow" : "index, follow"} />

      {/* Open Graph for Social + AI */}
      <meta property="og:type" content="event" />
      <meta property="og:title" content={getOptimizedTitle()} />
      <meta property="og:description" content={getGEODescription()} />
      {city && <meta property="og:locality" content={city} />}
      <meta property="og:region" content={BRAND.state} />
      <meta property="og:country-name" content="United States" />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={eventImageAlt(event)} />
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
