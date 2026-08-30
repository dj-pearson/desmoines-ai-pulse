/**
 * schema.org Offer construction for events (WEB-SEO-018).
 *
 * Five emitters each carried their own copy of
 * `event.price.replace(/[^0-9.]/g, '') || "0"`, which is wrong on every price
 * string that is not a single bare amount:
 *
 *   "$54.40-$89.40"  ->  "54.4089.40"   a nonsense number
 *   "Varies"         ->  "0"            a free event that costs money
 *   "$1,250"         ->  "1250"         (the one case it got right)
 *
 * `price` on an Offer must be a single number. A span needs an AggregateOffer
 * with lowPrice/highPrice, and an unparseable price needs no offers node at
 * all. Omitting it says "we don't know"; "0" says "free". Only one of those
 * is honest.
 *
 * Everything here is pure and string-in/JSON-out so the emitters stay dumb.
 */

/** All prices in the database are USD; there is no multi-currency surface. */
export const EVENT_PRICE_CURRENCY = "USD";

/** Sanity ceiling. Above this we assume we matched a year or a phone number. */
const MAX_PLAUSIBLE_PRICE = 100_000;

/** Trailing markers that turn a single amount into an open-ended floor. */
const OPEN_ENDED = /(\+|\band up\b|\bor more\b|\bstarting at\b|\bstarts at\b|\bfrom\b)/i;

const FREE_WORD = /\b(free|no charge|no cost|complimentary)\b/i;

export interface EventOfferNode {
  "@type": "Offer";
  price: string;
  priceCurrency: string;
  availability: string;
}

export interface EventAggregateOfferNode {
  "@type": "AggregateOffer";
  lowPrice: string;
  highPrice?: string;
  priceCurrency: string;
  availability: string;
}

export type ParsedEventPrice =
  /** Admission is free. Emit a 0 Offer and isAccessibleForFree: true. */
  | { kind: "free" }
  /** One known amount. Emit an Offer. */
  | { kind: "fixed"; price: string }
  /** A span, or several tiers. Emit an AggregateOffer. */
  | { kind: "range"; low: string; high?: string; free: boolean }
  /** "Varies", "TBD", "See website", empty. Emit nothing. */
  | { kind: "unknown" };

/** Format a parsed amount the way schema.org wants it: plain, no symbols. */
function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Pull every plausible dollar amount out of a price string.
 *
 * Only trusts a number when it is prefixed with `$` or when the whole string
 * is numeric, so "Summer 2026 Pass" does not become a $2,026 ticket.
 */
function extractAmounts(raw: string): number[] {
  const amounts: number[] = [];

  const dollarTagged = raw.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g);
  for (const match of dollarTagged) {
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value <= MAX_PLAUSIBLE_PRICE) amounts.push(value);
  }
  if (amounts.length > 0) return amounts;

  // No currency symbol: accept only a string that is entirely a number, or
  // entirely a numeric range. Anything with prose in it is not a price.
  const bare = raw.trim().replace(/,/g, "");
  if (/^[0-9]+(?:\.[0-9]{1,2})?$/.test(bare)) {
    const value = Number(bare);
    if (value <= MAX_PLAUSIBLE_PRICE) amounts.push(value);
    return amounts;
  }
  const range = bare.match(/^([0-9]+(?:\.[0-9]{1,2})?)\s*[-\u2010-\u2015]\s*([0-9]+(?:\.[0-9]{1,2})?)$/);
  if (range) {
    for (const part of [range[1], range[2]]) {
      const value = Number(part);
      if (value <= MAX_PLAUSIBLE_PRICE) amounts.push(value);
    }
  }
  return amounts;
}

/**
 * Classify a raw price string from the `events.price` column.
 *
 * Never throws and never guesses: anything it cannot read comes back as
 * `unknown` so the caller can omit the offers node entirely.
 */
export function parseEventPrice(raw: string | null | undefined): ParsedEventPrice {
  if (raw == null) return { kind: "free" };
  const text = raw.trim();
  if (!text) return { kind: "free" };

  const amounts = extractAmounts(text);
  const saysFree = FREE_WORD.test(text);

  if (amounts.length === 0) {
    // "Free", "Free admission", "No charge".
    if (saysFree) return { kind: "free" };
    // "Varies", "TBD", "See website", "Donation".
    return { kind: "unknown" };
  }

  const low = Math.min(...amounts);
  const high = Math.max(...amounts);

  // "$0" and "Free - $0" are free, whatever the wording.
  if (high === 0) return { kind: "free" };

  // "Free - $20": a free tier exists alongside paid ones.
  if (saysFree) {
    return { kind: "range", low: "0", high: formatAmount(high), free: true };
  }

  if (low === high) {
    // "$10+", "From $20": the amount is a floor, not the price.
    if (OPEN_ENDED.test(text)) {
      return { kind: "range", low: formatAmount(low), free: false };
    }
    return { kind: "fixed", price: formatAmount(low) };
  }

  return { kind: "range", low: formatAmount(low), high: formatAmount(high), free: false };
}

/**
 * The `offers` value for an Event node, or `undefined` when the price is
 * unreadable. Omitting is correct there: a missing offers node is a gap, a
 * fabricated "0" is a lie that Google surfaces as a free-event rich result.
 */
export function buildEventOffers(
  raw: string | null | undefined,
  availability = "https://schema.org/InStock",
): EventOfferNode | EventAggregateOfferNode | undefined {
  const parsed = parseEventPrice(raw);
  switch (parsed.kind) {
    case "free":
      return { "@type": "Offer", price: "0", priceCurrency: EVENT_PRICE_CURRENCY, availability };
    case "fixed":
      return { "@type": "Offer", price: parsed.price, priceCurrency: EVENT_PRICE_CURRENCY, availability };
    case "range":
      return {
        "@type": "AggregateOffer",
        lowPrice: parsed.low,
        ...(parsed.high !== undefined && { highPrice: parsed.high }),
        priceCurrency: EVENT_PRICE_CURRENCY,
        availability,
      };
    case "unknown":
      return undefined;
  }
}

/**
 * `isAccessibleForFree`, or `undefined` when the price is unreadable so the
 * caller can leave the property off rather than assert a paid event.
 */
export function isEventAccessibleForFree(raw: string | null | undefined): boolean | undefined {
  const parsed = parseEventPrice(raw);
  if (parsed.kind === "free") return true;
  if (parsed.kind === "range") return parsed.free;
  if (parsed.kind === "fixed") return false;
  return undefined;
}

/**
 * The value for a microdata `<span itemprop="price" content="...">`, or
 * `undefined` when there is no single number to put there. Microdata `price`
 * has the same one-number rule as JSON-LD, so a range has no valid content
 * attribute and the caller should drop the Offer scope instead.
 */
export function eventPriceContent(raw: string | null | undefined): string | undefined {
  const parsed = parseEventPrice(raw);
  if (parsed.kind === "free") return "0";
  if (parsed.kind === "fixed") return parsed.price;
  return undefined;
}

/**
 * The `offers` + `isAccessibleForFree` pair, ready to spread into an Event
 * node. Either key is absent when we cannot state it truthfully, which is the
 * whole point of this module.
 */
export function eventOfferProperties(
  raw: string | null | undefined,
  availability?: string,
): {
  offers?: EventOfferNode | EventAggregateOfferNode;
  isAccessibleForFree?: boolean;
} {
  const offers = buildEventOffers(raw, availability);
  const free = isEventAccessibleForFree(raw);
  return {
    ...(offers && { offers }),
    ...(free !== undefined && { isAccessibleForFree: free }),
  };
}
