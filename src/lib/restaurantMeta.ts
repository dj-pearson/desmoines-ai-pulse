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
  /** The free-text hours. Present when the row carries it; decides "Hours" unless hasHours says otherwise. */
  opening?: string | null;
  phone?: string | null;
  menu_url?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  /**
   * What the page actually shows (WP3.5, eat-drink pass 2). The detail page
   * passes these; the edge shell passes the row, and they are derived from
   * opening, menu_url and phone, so both callers follow one rule: the title
   * says "Menu" or "Hours" only when there is one to show.
   */
  hasMenu?: boolean;
  hasHours?: boolean;
  hasPhone?: boolean;
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

/** A link a page could actually render: present and not a script scheme. */
function usableLink(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  return t.length > 0 && !/^(javascript|data|vbscript):/i.test(t);
}

function hasText(v: string | null | undefined): boolean {
  return (v ?? "").trim().length > 0;
}

interface Facets {
  menu: boolean;
  hours: boolean;
  phone: boolean;
}

function facetsOf(r: RestaurantMetaInput): Facets {
  return {
    menu: r.hasMenu ?? usableLink(r.menu_url),
    hours: r.hasHours ?? hasText(r.opening),
    phone: r.hasPhone ?? hasText(r.phone),
  };
}

/** ["Menu", "Hours", "Reviews"] -> "Menu, Hours & Reviews". */
function joinWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`;
}

/**
 * "{Name} {Suburb} - Menu, Hours & Reviews", shortened until it fits 60
 * characters. "Menu" and "Hours" appear only when the page has them (WP3.5,
 * eat-drink pass 2): a title that promises a menu the page doesn't carry is
 * the click that bounces. "Reviews" stays, because every detail page carries
 * the ratings block. The brand suffix is appended later by SEOHead and may be
 * cut off in a result; the name, the suburb and "menu" are what must survive.
 */
export function restaurantPageTitle(r: RestaurantMetaInput): string {
  const name = r.name.trim();
  const loc = restaurantLocality(r);
  const where = loc && !titleNamesCity(name, loc) ? `${name} ${loc}` : name;
  const f = facetsOf(r);
  const facts = [f.menu ? "Menu" : null, f.hours ? "Hours" : null].filter((w): w is string => !!w);
  const withReviews = joinWords([...facts, "Reviews"]);
  const short = facts.length > 0 ? joinWords(facts) : null;
  const candidates = [
    `${where} - ${withReviews}`,
    short ? `${where} - ${short}` : null,
    f.menu ? `${where} Menu` : null,
    `${name} - ${withReviews}`,
    short ? `${name} - ${short}` : null,
    where,
  ].filter((c): c is string => !!c);
  return candidates.find((c) => c.length <= RESTAURANT_TITLE_BUDGET) ?? name;
}

/**
 * The description to show, or null when the row's copy was written before
 * the place opened and it has opened since (WP3.4, eat-drink pass 2). Used by
 * the About block, the Restaurant JSON-LD and the share text, so none of them
 * tells a visitor that a place open for a year is "coming soon".
 */
export function currentDescription(r: {
  description?: string | null;
  status?: string | null;
}): string | null {
  const text = (r.description ?? "").trim();
  if (!text) return null;
  const upcoming = r.status === "opening_soon" || r.status === "announced";
  return isStaleOpeningCopy(text) && !upcoming ? null : text;
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

/** "$" to "$$$$" only. Anything else ("Moderate", "$10-20") is not a tier. */
export function priceTier(price: string | null | undefined): string | null {
  const t = (price ?? "").trim();
  return /^\${1,4}$/.test(t) ? t : null;
}

function hasCoordinates(r: RestaurantMetaInput): boolean {
  if (r.latitude == null || r.longitude == null || r.latitude === "" || r.longitude === "") return false;
  const lat = Number(r.latitude);
  const lng = Number(r.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
}

/**
 * The meta description. A hand-written seo_description wins unless it is stale
 * pre-opening copy; otherwise it is built from facts on the row, leading with
 * what the searcher asked (where, what kind, what it costs). The price is the
 * tier as Google lists it, not a dollar band we made up (WP3.5), and the
 * closing list names only what the page has.
 */
export function restaurantMetaDescription(r: RestaurantMetaInput): string {
  const own = (r.seo_description ?? "").trim();
  if (own && !isStaleOpeningCopy(own)) return clip(own, RESTAURANT_DESCRIPTION_BUDGET);

  const addr = parseIowaAddress(r.location);
  const loc = restaurantLocality(r) || "Des Moines";
  const kind = r.cuisine ? `${r.cuisine} restaurant` : "restaurant";
  const at = addr?.streetAddress ? ` at ${addr.streetAddress}` : "";
  const tier = priceTier(r.price_range);
  const price = tier ? ` ${tier} on Google.` : "";
  const f = facetsOf(r);
  const has = [
    f.menu ? "menu" : null,
    f.hours ? "hours" : null,
    f.phone ? "phone" : null,
    hasCoordinates(r) ? "map" : null,
    hasText(r.location) ? "directions" : null,
  ].filter((w): w is string => !!w);
  const list = has.length > 1 ? `${has.slice(0, -1).join(", ")} and ${has[has.length - 1]}` : has.join("");
  const tail = list ? ` ${list.charAt(0).toUpperCase()}${list.slice(1)}.` : "";
  return clip(`${r.name} is a ${kind}${at} in ${loc}, Iowa.${price}${tail}`, RESTAURANT_DESCRIPTION_BUDGET);
}

/** What buildRestaurantSchema needs besides the row, resolved by the caller. */
export interface RestaurantSchemaContext {
  /** Canonical URL of this page; also the node's @id. */
  url: string;
  description: string;
  locality: string;
  /** Already through safeWebUrl. */
  website: string | null;
  /** Already through safeWebUrl. */
  menuUrl: string | null;
  /**
   * A captured menu renders its own Menu node (MenuSchema), so the Restaurant
   * node does not also point at their site's menu.
   */
  hasCapturedMenu: boolean;
  /** From resolveOpeningHoursSpecification, or null. */
  openingHoursSpecification: unknown[] | null;
  /** False for closed, temporarily closed and not-open-yet rows: no hours for those. */
  openForBusiness: boolean;
}

export interface RestaurantSchemaRow {
  name: string;
  cuisine?: string | null;
  location?: string | null;
  phone?: string | null;
  price_range?: string | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * The Restaurant JSON-LD node for the detail page (WP3.14), pure so it can be
 * tested. Every property is a fact from the row, or left out:
 *  - priceRange only as a "$" to "$$$$" tier;
 *  - openingHoursSpecification only for a place open for business;
 *  - hasMenu only when no captured menu is on the page (MenuSchema owns it then);
 *  - geo only from real coordinates (WEB-SEO-024: no downtown fallback pin);
 *  - no review count, no paymentAccepted: no column backs either.
 */
export function buildRestaurantSchema(row: RestaurantSchemaRow, ctx: RestaurantSchemaContext) {
  const addr = parseIowaAddress(row.location);
  const tier = priceTier(row.price_range);
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": ctx.url,
    name: row.name,
    description: ctx.description,
    ...(row.cuisine ? { servesCuisine: row.cuisine } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress: addr?.streetAddress || row.location || undefined,
      addressLocality: ctx.locality,
      addressRegion: "IA",
      ...(addr?.postalCode ? { postalCode: addr.postalCode } : {}),
      addressCountry: "US",
    },
    ...(row.phone ? { telephone: row.phone } : {}),
    url: ctx.url,
    ...(ctx.website ? { sameAs: [ctx.website] } : {}),
    ...(ctx.menuUrl && !ctx.hasCapturedMenu ? { hasMenu: ctx.menuUrl } : {}),
    ...(tier ? { priceRange: tier } : {}),
    ...(row.image_url ? { image: [row.image_url] } : {}),
    ...(row.latitude != null && row.longitude != null
      ? { geo: { "@type": "GeoCoordinates", latitude: row.latitude, longitude: row.longitude } }
      : {}),
    ...(ctx.openForBusiness && ctx.openingHoursSpecification && ctx.openingHoursSpecification.length > 0
      ? { openingHoursSpecification: ctx.openingHoursSpecification }
      : {}),
    // Every restaurant in Des Moines takes dollars: a safe default, not an invented fact.
    currenciesAccepted: "USD",
    areaServed: {
      "@type": "City",
      name: "Des Moines",
      containedInPlace: { "@type": "State", name: "Iowa" },
    },
  };
}
