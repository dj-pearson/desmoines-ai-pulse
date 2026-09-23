/**
 * Title, description and address for a restaurant page - one builder for the
 * React page (RestaurantDetails.tsx) and the edge shell (functions/_middleware.ts),
 * so a crawler that misses the prerender and a browser that runs the app are
 * handed the same <title>.
 *
 * RELATIVE IMPORTS ONLY, and only of modules that have none themselves: the
 * Pages Functions bundle imports this file by relative path and does not read
 * the app's "@/" alias, so a module it cannot resolve fails the deploy.
 *
 * Why these templates (GSC, 12 months to 2026-09-23):
 *  - 33 restaurant pages rank better than position 12 with CTR under 1%, 84k
 *    impressions between them. Their titles came from seo_title, which never
 *    says "menu" or "hours".
 *  - Queries carrying "menu" drew 11,180 impressions at 0.55% CTR; "reviews"
 *    and "photos" another 5,841 at about 0.5%.
 *  - The suburb-qualified lookup is the common shape ("bonchon west des
 *    moines", "atlas cafe west des moines", "marvs norwalk"). The `city` column
 *    says "Des Moines" for rows whose address is in West Des Moines, so the
 *    suburb is read from the address first.
 */

import { titleNamesCity } from "./seoTitleLocation";

export interface RestaurantMetaInput {
  name: string;
  city?: string | null;
  location?: string | null;
  cuisine?: string | null;
  price_range?: string | null;
  seo_description?: string | null;
  description?: string | null;
}

export interface ParsedAddress {
  streetAddress: string;
  addressLocality: string;
  postalCode?: string;
}

export const RESTAURANT_TITLE_BUDGET = 60;
export const RESTAURANT_DESCRIPTION_BUDGET = 155;

/**
 * "6880 EP True Pkwy Unit 104, West Des Moines, IA 50266, USA" ->
 * { streetAddress: "6880 EP True Pkwy Unit 104", addressLocality: "West Des Moines", postalCode: "50266" }
 *
 * Only Iowa addresses in the "street, city, IA zip" shape parse. Anything else
 * returns null so the caller falls back to the row's own fields rather than a
 * guess.
 */
export function parseIowaAddress(location: string | null | undefined): ParsedAddress | null {
  const parts = (location ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length && /^(usa|us|united states)$/i.test(parts[parts.length - 1])) parts.pop();
  if (parts.length < 3) return null;

  const stateZip = parts[parts.length - 1].match(/^(?:IA|Iowa)(?:\s+(\d{5})(?:-\d{4})?)?$/i);
  if (!stateZip) return null;
  const locality = parts[parts.length - 2];
  if (!/^[A-Za-z .'-]+$/.test(locality)) return null;

  return {
    streetAddress: parts.slice(0, -2).join(", "),
    addressLocality: locality,
    ...(stateZip[1] ? { postalCode: stateZip[1] } : {}),
  };
}

/** The suburb a searcher would type: the address's city first, the `city` column second. */
export function restaurantLocality(r: Pick<RestaurantMetaInput, "city" | "location">): string | null {
  return parseIowaAddress(r.location)?.addressLocality || (r.city ?? "").trim() || null;
}

/**
 * Copy written before a restaurant opened and never revisited. Measured in
 * production 2026-09-23: Bonchon (the most-impressed URL on the site) said
 * "opening soon", Atlas Cafe said "Coming soon!", Yard House said plans "still
 * need to be approved" - all three have been open for months.
 */
export function isStaleOpeningCopy(text: string | null | undefined): boolean {
  return /\b(coming soon|opening soon|will (soon )?open|set to open|plans to open|opens? (this|next|in|on)\b|still need to be approved|grand opening (is )?(set|planned|scheduled))/i.test(
    text ?? "",
  );
}

/**
 * "{Name} {Suburb} - Menu, Hours & Reviews", shortened until it fits 60
 * characters. The brand suffix is appended later by SEOHead and may be cut off
 * in a result; the name, the suburb and "menu" are what must survive.
 */
export function restaurantPageTitle(r: RestaurantMetaInput): string {
  const name = r.name.trim();
  const loc = restaurantLocality(r);
  const where = loc && !titleNamesCity(name, loc) ? `${name} ${loc}` : name;
  const candidates = [
    `${where} - Menu, Hours & Reviews`,
    `${where} - Menu & Hours`,
    `${where} Menu`,
    `${name} - Menu, Hours & Reviews`,
    `${name} - Menu & Hours`,
    where,
  ];
  return candidates.find((c) => c.length <= RESTAURANT_TITLE_BUDGET) ?? name;
}

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * geo_faq as stored by generate-seo-content: a JSON array of
 * { question, answer }. The column is AI-written and untyped, so anything that
 * is not that shape is dropped rather than rendered as "[object Object]".
 */
export function readGeoFaq(json: unknown): FaqItem[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    const q = typeof item?.question === "string" ? item.question.trim() : "";
    const a = typeof item?.answer === "string" ? item.answer.trim() : "";
    return q && a ? [{ question: q, answer: a }] : [];
  });
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 3);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > n / 2 ? lastSpace : cut.length).replace(/[,.;:\s]+$/, "")}...`;
}

const PRICE_WORDS: Record<string, string> = {
  $: "Under $15 a person",
  $$: "$15-30 a person",
  $$$: "$30-50 a person",
  $$$$: "Over $50 a person",
};

/**
 * The meta description. A hand-written seo_description wins unless it is stale
 * pre-opening copy; otherwise it is built from facts on the row, leading with
 * what the searcher asked (where, what kind, what it costs).
 */
export function restaurantMetaDescription(r: RestaurantMetaInput): string {
  const own = (r.seo_description ?? "").trim();
  if (own && !isStaleOpeningCopy(own)) return clip(own, RESTAURANT_DESCRIPTION_BUDGET);

  const addr = parseIowaAddress(r.location);
  const loc = restaurantLocality(r) || "Des Moines";
  const kind = r.cuisine ? `${r.cuisine} restaurant` : "restaurant";
  const at = addr?.streetAddress ? ` at ${addr.streetAddress}` : "";
  const price = r.price_range && PRICE_WORDS[r.price_range] ? ` ${PRICE_WORDS[r.price_range]}.` : "";
  return clip(
    `${r.name} is a ${kind}${at} in ${loc}, Iowa.${price} Menu, hours, phone, map and directions.`,
    RESTAURANT_DESCRIPTION_BUDGET,
  );
}
