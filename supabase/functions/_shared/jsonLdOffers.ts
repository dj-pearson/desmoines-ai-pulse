/**
 * schema.org `offers` -> the events.price text every ingest path writes
 * (WEB-BE-049 AC3, the ld+json slice).
 *
 * Three copies of this lived in the ingest code and each lost data:
 *
 *   - catchdesmoinesParse ignored `offers` entirely and wrote "See website"
 *     for every Catch Des Moines event, the largest source we have.
 *   - vibrantmusichall skipped any offer priced 0, so a free show became
 *     "See website", and it read lowPrice only, so "$35-$85" became "From $35".
 *   - jsonLdEvents stripped every non-digit from the first offer, so a
 *     string price of "10-20" was stored as "1020", and it dropped the "$"
 *     whenever priceCurrency was absent.
 *
 * The output is written for the readers in src/lib: isFreePrice
 * (src/lib/eventPrice.ts) and parseEventPrice (src/lib/eventOffers.ts).
 * "Free" reads as free; "$25" as one price; "$25-$60" as a range; and
 * "Free - $20" as a range with a free tier, which isFreePrice correctly calls
 * NOT free because somebody pays. The test pins each string against those
 * rules, so a format change here cannot silently flip the free filter.
 *
 * Unknown stays unknown: no readable amount and no isAccessibleForFree flag
 * returns undefined, and the caller keeps its "See website" default. A guess
 * in either direction is worse than none (WEB-SEO-018).
 */

/** Above this we assume we matched a year, a phone number or an id. */
const MAX_PLAUSIBLE_PRICE = 100_000;

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * One schema.org amount: a number, or a string that is a number once a
 * leading "$" and thousands commas are removed ("25", "$25.00", "1,250").
 * Anything with prose or a second number in it ("10-20", "Varies") is not an
 * amount, because stripping it down to digits invents a price.
 */
function readAmount(raw: unknown): number | null {
  let value: number;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string") {
    const text = raw.trim().replace(/^\$\s*/, "").replace(/,/g, "");
    if (!/^[0-9]+(?:\.[0-9]+)?$/.test(text)) return null;
    value = Number(text);
  } else {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > MAX_PLAUSIBLE_PRICE) return null;
  return value;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Every amount an offer states: price, lowPrice, highPrice, priceSpecification.price. */
function offerAmounts(offer: unknown): number[] {
  if (!offer || typeof offer !== "object") return [];
  const obj = offer as Record<string, unknown>;
  // A price in another currency is not a dollar price. Absent means USD:
  // every source we ingest is a US venue and most omit the field.
  const currency = obj.priceCurrency;
  if (typeof currency === "string" && currency.trim() && currency.trim().toUpperCase() !== "USD") {
    return [];
  }
  const out: number[] = [];
  for (const key of ["price", "lowPrice", "highPrice"]) {
    const amount = readAmount(obj[key]);
    if (amount !== null) out.push(amount);
  }
  for (const spec of asArray(obj.priceSpecification)) {
    if (spec && typeof spec === "object") {
      const amount = readAmount((spec as Record<string, unknown>).price);
      if (amount !== null) out.push(amount);
    }
  }
  // AggregateOffer can nest its tiers under `offers`.
  for (const nested of asArray(obj.offers)) {
    if (nested !== offer) out.push(...offerAmounts(nested));
  }
  return out;
}

function saysFree(flag: unknown): boolean {
  return flag === true || (typeof flag === "string" && flag.trim().toLowerCase() === "true");
}

/**
 * The events.price text for a schema.org Event's `offers` and
 * `isAccessibleForFree`, or undefined when neither says anything readable.
 *
 * An explicit amount outranks the free flag: an event marked accessible for
 * free that also lists a $40 ticket is a paid event with free entry somewhere,
 * and calling it "Free" is the exact error src/lib/eventPrice.ts guards
 * against on the read side.
 */
export function priceFromOffers(
  offers: unknown,
  isAccessibleForFree?: unknown,
): string | undefined {
  const amounts = asArray(offers).flatMap(offerAmounts);
  if (amounts.length === 0) {
    return saysFree(isAccessibleForFree) ? "Free" : undefined;
  }
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  if (high === 0) return "Free";
  if (low === 0) return `Free - $${formatAmount(high)}`;
  if (low === high) return `$${formatAmount(low)}`;
  return `$${formatAmount(low)}-$${formatAmount(high)}`;
}
