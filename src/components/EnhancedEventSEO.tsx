import { Helmet } from "react-helmet-async";
import { Event } from "@/lib/types";
import { createEventSlugWithCentralTime, hasSpecificTime, formatEventDate, formatInCentralTime } from "@/lib/timezone";
import { BRAND } from "@/lib/brandConfig";
import { ogImageUrl } from "@/lib/ogImage";

interface EnhancedEventSEOProps {
  event: Event;
  isUpcoming?: boolean;
  viewMode?: "list" | "detail";
}

export default function EnhancedEventSEO({
  event,
  isUpcoming = true,
  viewMode = "detail"
}: EnhancedEventSEOProps) {

  const getOptimizedTitle = () => {
    const showTime = hasSpecificTime(event);
    const dateStr = formatInCentralTime(
      event.event_start_local || event.event_start_utc || event.date,
      showTime ? "EEEE, MMMM d 'at' h:mm a" : "EEEE, MMMM d, yyyy"
    );

    if (viewMode === "list") {
      return `${event.title} - ${dateStr} | ${BRAND.city} Events`;
    }

    const venue = event.venue ? ` at ${event.venue}` : '';
    return `${event.title}${venue} - ${dateStr} | ${BRAND.city}, ${BRAND.state} Events`;
  };

  const getGEODescription = () => {
    const description = event.enhanced_description || event.original_description || '';
    const venue = event.venue || event.location || BRAND.city;
    const dateStr = formatEventDate(event);
    const price = event.price ? ` Tickets: ${event.price}.` : ' Free admission.';
    const category = event.category?.toLowerCase() || 'event';

    if (description.length > 50) {
      return `${event.title} is a ${category} happening ${dateStr} at ${venue} in ${BRAND.city}, ${BRAND.state}. ${description.substring(0, 150).trim()}...${price} Find local ${BRAND.city} events and activities.`;
    }

    return `Join ${event.title}, a ${category} event happening ${dateStr} at ${venue} in ${BRAND.city}, ${BRAND.state}.${price} Discover what's happening in ${BRAND.city} this week.`;
  };

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
      event.event_start_local || event.event_start_utc || event.date,
      "MMMM"
    );
    const year = formatInCentralTime(
      event.event_start_local || event.event_start_utc || event.date,
      "yyyy"
    );
    const dayOfWeek = formatInCentralTime(
      event.event_start_local || event.event_start_utc || event.date,
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

  // Use actual event description for schema (Google penalizes keyword-stuffed descriptions)
  const schemaDescription = event.enhanced_description || event.original_description || `${event.title} - ${event.category} event in ${event.city || BRAND.city}, ${BRAND.state}`;

  const isFree = !event.price || event.price.toLowerCase().includes('free') || event.price === '$0' || event.price === '0';

  // Primary Event Schema - Google Events compliant
  // Required: name, startDate, location
  // Recommended: endDate, eventStatus, eventAttendanceMode, image, description, offers, organizer, performer
  const startDateISO = event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString());
  // Estimate endDate as startDate + 3 hours if no explicit end_date
  const startMs = new Date(startDateISO).getTime();
  const endDateISO = event.end_date
    ? event.end_date
    : new Date(startMs + 3 * 60 * 60 * 1000).toISOString();

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

  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": eventUrl,
    "name": event.title,
    "description": schemaDescription,
    "startDate": startDateISO,
    "endDate": endDateISO,
    // WEB-SEO-009: this used to emit EventPostponed for anything not upcoming.
    // EventPostponed means "moved to a date not yet announced" — a concluded
    // event is not postponed, it happened. schema.org expresses "this is over"
    // as EventScheduled with a past endDate, which is what we now do. Asserting
    // a false status on every past event (hundreds of URLs, all left
    // index,follow) undermines trust in all of our Event markup.
    // Real postponements/cancellations should come from event data, not from
    // whether the date has passed; there is no such field today, so we do not
    // guess.
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
    "location": {
      "@type": "Place",
      "name": event.venue || event.location || `${BRAND.city} Area`,
      "address": {
        "@type": "PostalAddress",
        "streetAddress": event.location || "",
        "addressLocality": event.city || BRAND.city,
        "addressRegion": BRAND.state,
        "addressCountry": BRAND.country,
      },
      ...(event.latitude && event.longitude && {
        "geo": {
          "@type": "GeoCoordinates",
          "latitude": event.latitude,
          "longitude": event.longitude
        }
      }),
    },
    // WEB-SEO-010: organizer and performer are deliberately omitted.
    //
    // This block used to hardcode Des Moines Insider as the organizer of every
    // event and, when a venue was known, name the VENUE as the performer —
    // so a touring Broadway show was published as organized by us and
    // performed by the building it played in. Both are false. We are an
    // aggregator: the `events` table has no organizer, performer, artist or
    // promoter column, so there is no truthful value to emit here.
    //
    // Neither field is required by Google's Event structured data guidance,
    // and omitting a field is strictly better than fabricating one — an
    // aggregator inserting itself as organizer is a recognisable
    // scraped-content spam signal. The venue is already correctly expressed as
    // the Place in `location` above.
    //
    // If organizer/performer are ever captured during ingestion, add them back
    // conditionally — never with a fallback.
    "image": event.image_url
      ? [event.image_url]
      : [`${BRAND.baseUrl}${BRAND.ogImage}`],
    "url": eventUrl,
    "offers": {
      "@type": "Offer",
      "price": isFree ? "0" : (event.price?.replace(/[^0-9.]/g, '') || "0"),
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock",
      "url": event.source_url || eventUrl,
      "validFrom": event.created_at || new Date().toISOString(),
    },
    "isAccessibleForFree": isFree,
    "inLanguage": "en-US",
    "mainEntityOfPage": { "@type": "WebPage", "@id": eventUrl },
  };

  // FAQ Schema for Voice Search & AI Chatbots
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": `When is ${event.title}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} takes place ${formatEventDate(event)} at ${event.venue || event.location || BRAND.city} in ${BRAND.city}, ${BRAND.state}.`
        }
      },
      {
        "@type": "Question",
        "name": `Where is ${event.title} located?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} is held at ${event.venue || event.location || BRAND.city}, ${event.city || BRAND.city}, ${BRAND.state}.${event.latitude && event.longitude ? ` The venue is located at coordinates ${event.latitude}, ${event.longitude}. You can get directions via Google Maps.` : ''}`
        }
      },
      {
        "@type": "Question",
        "name": `How much does ${event.title} cost?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": (!event.price || event.price.toLowerCase().includes('free'))
            ? `${event.title} is a free event in ${BRAND.city}, ${BRAND.state}. No ticket purchase is required.`
            : `Tickets for ${event.title} are ${event.price}. Visit the official event page for ticket information and availability.`
        }
      },
      {
        "@type": "Question",
        "name": `What type of event is ${event.title}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} is a ${event.category.toLowerCase()} event in ${BRAND.city}, ${BRAND.state}. It's part of the vibrant ${event.category.toLowerCase()} scene in the ${BRAND.region}.`
        }
      },
      {
        "@type": "Question",
        "name": `How do I get to ${event.title}?`,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": `${event.title} is located at ${event.venue || event.location || BRAND.city} in ${event.city || BRAND.city}, ${BRAND.state}. ${BRAND.city} is easily accessible by car via I-235 and I-80. Downtown parking is available in public garages and street parking. Public transit via DART bus routes also serves the area.`
        }
      }
    ]
  };

  // Speakable Schema for Voice Assistants (Google Assistant, Alexa, Siri)
  const speakableSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": eventUrl,
    "name": getOptimizedTitle(),
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": ["article h1", "article [itemprop='description']", "article [itemprop='startDate']", "article [itemprop='location']"]
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
      <meta property="og:image:alt" content={`${event.title} - ${event.category} event in ${BRAND.city}`} />
      <meta property="og:url" content={eventUrl} />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={getOptimizedTitle()} />
      <meta name="twitter:description" content={getGEODescription()} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content={BRAND.twitter} />

      {/* Structured Data - Event Schema (primary for Google Events indexing) */}
      <script type="application/ld+json">{JSON.stringify(eventSchema)}</script>
      <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      <script type="application/ld+json">{JSON.stringify(speakableSchema)}</script>
    </Helmet>
  );
}
