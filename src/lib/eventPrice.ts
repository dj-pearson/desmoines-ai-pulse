/**
 * One definition of "free" for events (docs/page-plans/events.md WP0 item 2).
 *
 * events.price is free text from the scrapers: "Free", "FREE admission",
 * "$15", "$0-$25", "See website", or nothing at all. Three surfaces treated a
 * missing price as free - the hub badge (SocialEventCard), the hub filter
 * (`price.is.null` in EventsPage) and /events/free - so an event with no
 * listed price was advertised as free and a reader turned up to a $40 door.
 *
 * Unknown is its own answer. `isFreePrice` returns null for it, and callers
 * print "Price not listed" rather than guessing either way.
 */

/**
 * PostgREST `.or()` filter for rows whose price says free. Mirrors
 * `isFreePrice` exactly: the ilike is the substring test, the two `eq`s are the
 * bare-zero forms. There is deliberately no `price.is.null` here.
 */
export const FREE_PRICE_FILTER = "price.ilike.%free%,price.eq.$0,price.eq.0";

const ZERO_RE = /^\$?0(\.0+)?$/;

/**
 * true when the price text says free, false when it names something else,
 * null when there is no price to read.
 *
 * "Free" matches case-insensitively anywhere in the text, the same test the
 * server filter's `ilike %free%` applies, so the badge and the filter never
 * disagree about a row. A range that starts at zero ("$0-$25") is not free.
 */
export function isFreePrice(price: string | null | undefined): boolean | null {
  if (price === null || price === undefined) return null;
  const text = price.trim();
  if (!text) return null;
  if (/free/i.test(text)) return true;
  return ZERO_RE.test(text);
}

export const PRICE_NOT_LISTED = "Price not listed";

/** Display label: "Free", the price as written, or "Price not listed". */
export function eventPriceLabel(price: string | null | undefined): string {
  const free = isFreePrice(price);
  if (free === null) return PRICE_NOT_LISTED;
  if (free) return "Free";
  return (price ?? "").trim();
}
