/**
 * schema.org offer fields for an Event, derived from the free-text `price`
 * column on the `events` table.
 *
 * WHY THIS EXISTS
 *
 * Five schema emitters each carried their own copy of
 * `event.price.replace(/[^0-9.]/g, '') || "0"`, and that expression is wrong in
 * two directions at once. Measured against the live /events page on 2026-08-18,
 * all 30 Event nodes shipped a broken `offers` block:
 *
 *   - 25 of 30 emitted `price: "0"` alongside `isAccessibleForFree: false`.
 *     Those events carry a non-numeric price string ("Varies", "See website"),
 *     the regex strips it to the empty string, and `|| "0"` turns an UNKNOWN
 *     price into a published claim that the event is free. The node then
 *     contradicts itself in the next key.
 *   - 5 of 30 carry a price RANGE. `$54.40-$89.40` loses its separator and
 *     ships as `price: "54.4089.40"`, which is not a number in any currency.
 *
 * So the rule here: a price we cannot read is OMITTED, never coerced to zero.
 * `offers` is a recommended property for Google Events rich results, not a
 * required one (name, startDate and location are the required three), so
 * leaving it out costs eligibility nothing and stops us publishing a price
 * nobody set. A real free event still ships a real "0", which is the
 * counter-assertion that matters: this fix must not turn honest zeros into
 * gaps either.
 */

const FREE = /\b(free|no charge|no cost|complimentary|donation)\b/i;

/** Numbers with optional cents, after thousands separators are removed. */
const NUMBER = /\d+(?:\.\d{1,2})?/g;

export interface EventOfferFields {
  offers?: Record<string, unknown>;
  isAccessibleForFree?: boolean;
}

export interface EventOfferOptions {
  /** Where a buyer completes the purchase. Omitted from the offer when absent. */
  url?: string | null;
  /** schema.org Offer.validFrom, when the caller has a real timestamp for it. */
  validFrom?: string | null;
  /** schema.org Offer.seller name, when the caller has one. */
  sellerName?: string | null;
}

/**
 * Returns the `offers` / `isAccessibleForFree` pair to spread into an Event
 * node. An empty object means the price is unknown and BOTH keys are omitted:
 * an absent `isAccessibleForFree` says nothing, while `false` beside a zero
 * price says two contradictory things.
 */
export function buildEventOffers(
  price?: string | null,
  options: EventOfferOptions = {},
): EventOfferFields {
  const raw = (price ?? '').trim();
  if (!raw) return {};

  const saysFree = FREE.test(raw);
  const numbers = (raw.replace(/,/g, '').match(NUMBER) ?? [])
    .map(Number)
    .filter((n) => Number.isFinite(n));

  // "Varies", "See website", "Tickets at door": readable by a person, not by a
  // parser. Publishing "0" here is the fabricated zero this module exists to
  // prevent.
  if (!saysFree && numbers.length === 0) return {};

  const base: Record<string, unknown> = {
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  };
  if (options.url) base.url = options.url;
  if (options.validFrom) base.validFrom = options.validFrom;
  if (options.sellerName) {
    base.seller = { '@type': 'Organization', name: options.sellerName };
  }

  const low = numbers.length ? Math.min(...numbers) : 0;
  const high = numbers.length ? Math.max(...numbers) : 0;

  // "Free" with no number attached, or a stated zero.
  if (saysFree && (numbers.length === 0 || high === 0)) {
    return {
      offers: { '@type': 'Offer', price: '0', ...base },
      isAccessibleForFree: true,
    };
  }

  // "Free - $20": there is a way in at no cost and a paid tier above it.
  // AggregateOffer is the type that can say both.
  const lowPrice = saysFree ? 0 : low;

  if (lowPrice !== high) {
    return {
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: money(lowPrice),
        highPrice: money(high),
        offerCount: 1,
        ...base,
      },
      isAccessibleForFree: saysFree,
    };
  }

  return {
    offers: { '@type': 'Offer', price: money(high), ...base },
    isAccessibleForFree: high === 0,
  };
}

/** schema.org wants a plain decimal string, no currency symbol and no comma. */
function money(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export default buildEventOffers;
