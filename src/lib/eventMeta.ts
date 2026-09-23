/**
 * The title, meta description and visible summary of an event detail page.
 *
 * WHY THESE ARE PURE AND LIVE HERE. EnhancedEventSEO built all three inline,
 * and three things were wrong with them on every event page:
 *
 *   1. THE TITLE'S SHOWTIME WAS FIVE HOURS EARLY IN THE PRERENDERED HTML. It
 *      formatted event_start_local first. That column is TIMESTAMP WITHOUT
 *      TIME ZONE, so PostgREST returns "2026-09-27T19:00:00" with no offset,
 *      and parseISO reads an offset-less string in the RUNTIME'S zone. In a
 *      browser in Iowa that is Central, which is why nobody saw it. The
 *      prerender's Chromium runs on the build host in UTC, so 19:00 became
 *      19:00Z and the <title> - the line a search result and an AI citation
 *      quote - read "2:00 PM" for a 7:00 PM show. The page body was right
 *      because it reads event_start_utc first. Everything here goes through
 *      formatEventPart / formatEventDate, which do the same.
 *
 *   2. THE TITLE RAN 90-120 CHARACTERS. "{title} at {venue} - Saturday,
 *      September 27 at 7:00 PM | Des Moines, Iowa Events" is cut at roughly 60
 *      in a result, so the venue and the time - the two things that decide a
 *      click on an event - were the parts that fell off. The title now keeps
 *      name and date first and adds venue and city only while they fit.
 *
 *   3. THE DESCRIPTION SAID "Des Moines" FOR EVERY EVENT, and "Free admission"
 *      whenever the price was unreadable. It read BRAND.city rather than the
 *      row's city - the SEO-007 locality bug that eventSchema.ts removed from
 *      the JSON-LD, surviving in the meta tag - and "See website" fell into
 *      the free branch because the string was truthy but was never parsed.
 *
 * NOTHING HERE IS GENERATED. Every clause comes from a column, and a clause
 * whose column is empty is dropped rather than filled. The summary is the
 * sentence an assistant lifts when asked what is on in Des Moines this
 * weekend, so a wrong word in it is repeated to people as fact.
 */
import { BRAND } from "@/lib/brandConfig";
import { parseEventPrice } from "@/lib/eventOffers";
import { formatEventPart, hasSpecificTime } from "@/lib/timezone";
import type { Event } from "@/lib/types";

/** Roughly where a desktop result truncates a title. */
export const EVENT_TITLE_BUDGET = 60;

/** Roughly where a result truncates a meta description. */
export const EVENT_DESCRIPTION_BUDGET = 155;

type EventLike = Pick<
  Event,
  | "title"
  | "date"
  | "location"
  | "venue"
  | "category"
  | "price"
  | "city"
  | "event_start_utc"
  | "event_start_local"
  | "time_tbd"
  | "enhanced_description"
  | "original_description"
  | "source_url"
>;

/** Whole words up to `max` characters, with "..." when anything was cut. */
function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const room = max - 3;
  const cut = t.slice(0, room);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > room * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,;:.-]+$/, "")}...`;
}

/** The row's own city, or null. Never the brand city: see SEO-007. */
function eventCity(event: EventLike): string | null {
  return event.city?.trim() || null;
}

/** "in Waukee, Iowa", or "in the Des Moines area" when the row has no city. */
function inPlace(event: EventLike): string {
  const city = eventCity(event);
  return city ? `in ${city}, ${BRAND.state}` : `in the ${BRAND.city} area`;
}

function venueName(event: EventLike): string | null {
  return event.venue?.trim() || event.location?.trim() || null;
}

/** "$25", "$20-$45", "from $20", "free", or null when the price is unreadable. */
function priceFragment(event: EventLike): { free: boolean; text: string } | null {
  const parsed = parseEventPrice(event.price);
  switch (parsed.kind) {
    case "free":
      return { free: true, text: "free" };
    case "fixed":
      return { free: false, text: `$${parsed.price}` };
    case "range":
      if (parsed.high === undefined) return { free: false, text: `from $${parsed.low}` };
      return { free: false, text: parsed.free ? `free to $${parsed.high}` : `$${parsed.low}-$${parsed.high}` };
    case "unknown":
      return null;
  }
}

/** "Sat, Sep 27" in Central, or null when the row has no usable start. */
function shortDate(event: EventLike): string | null {
  return formatEventPart(event, "EEE, MMM d");
}

/** "Saturday, September 27, 2026", in Central. */
function longDate(event: EventLike): string | null {
  return formatEventPart(event, "EEEE, MMMM d, yyyy");
}

/** "7:00 PM", in Central, or null when no specific time was announced. */
function startTime(event: EventLike): string | null {
  return hasSpecificTime(event) ? formatEventPart(event, "h:mm a") : null;
}

/**
 * `<title>` for an event page: name and date first, then venue and city while
 * they fit in EVENT_TITLE_BUDGET. No brand suffix - a result shows the site
 * name on its own line, and here it would only push the venue out of view.
 */
export function eventPageTitle(event: EventLike): string {
  const title = event.title.trim();
  const date = shortDate(event);
  const venue = venueName(event);
  const city = eventCity(event);
  const head = date ? `${title} - ${date}` : title;

  const venueHasCity = !!(venue && city && venue.toLowerCase().includes(city.toLowerCase()));
  const candidates = [
    venue && city && !venueHasCity ? `${head} | ${venue}, ${city}` : null,
    venue ? `${head} | ${venue}` : null,
    city ? `${head} | ${city}` : null,
    head,
  ].filter((c): c is string => !!c);

  const fits = candidates.find((c) => c.length <= EVENT_TITLE_BUDGET);
  if (fits) return fits;

  // The name alone is too long. Keep the date, which is what separates this
  // page from last year's edition of the same event, and clip the name.
  if (!date) return clip(title, EVENT_TITLE_BUDGET);
  const suffix = ` - ${date}`;
  return `${clip(title, EVENT_TITLE_BUDGET - suffix.length)}${suffix}`;
}

/**
 * Meta description: when, where and what it costs first, which is what a
 * searcher is scanning for, then as much of the event's own description as
 * fits in EVENT_DESCRIPTION_BUDGET.
 */
export function eventMetaDescription(event: EventLike): string {
  const date = longDate(event);
  const time = startTime(event);
  const venue = venueName(event);

  const when = date ? `${date}${time ? ` at ${time}` : ""}` : null;
  const where = venue ? `at ${venue} ${inPlace(event)}` : inPlace(event);
  const lead = when ? `${when}, ${where}.` : `${event.title.trim()}, ${where}.`;

  const price = priceFragment(event);
  const priceText = price ? (price.free ? " Free admission." : ` Tickets ${price.text}.`) : "";

  const about = (event.enhanced_description || event.original_description || "").trim();
  const head = `${lead}${priceText}`;
  if (!about) return clip(head, EVENT_DESCRIPTION_BUDGET);

  const room = EVENT_DESCRIPTION_BUDGET - head.length - 1;
  if (room < 30) return clip(head, EVENT_DESCRIPTION_BUDGET);
  return `${head} ${clip(about, room)}`;
}

/**
 * The visible answer-first summary under the H1: one sentence of what, when
 * and where, and one of price. Tense follows `now`, so a page read after the
 * event does not still promise it.
 */
export function eventSummary(event: EventLike, now: Date = new Date()): string {
  const title = event.title.trim();
  const date = longDate(event);
  const time = startTime(event);
  const venue = venueName(event);

  const source = event.event_start_utc || (typeof event.date === "string" ? event.date : event.date?.toISOString());
  const startMs = source ? Date.parse(source) : NaN;
  const past = Number.isFinite(startMs) && startMs < now.getTime();

  const verb = past ? "took place" : "takes place";
  const when = date ? ` on ${date}${time ? ` at ${time} Central` : ""}` : "";
  const where = venue ? ` at ${venue} ${inPlace(event)}` : ` ${inPlace(event)}`;
  const first = `${title} ${verb}${when}${where}.`;

  if (past) return first;

  const price = priceFragment(event);
  let second = "";
  if (price?.free) second = " Admission is free.";
  else if (price) second = ` Tickets are ${price.text}.`;
  else if (event.source_url) second = " Ticket prices are listed on the official event page.";

  return `${first}${second}`;
}
