/**
 * Where a /things-to-do hub card should point (SEO-012).
 *
 * The hub linked about forty /things-to-do/* paths and four of them were
 * published pSEO pages. The rest render a 404 in the browser and, at the
 * edge, the shell at 200 with a self-canonical - so the site's "things to do"
 * hub spent most of its links on pages that do not exist. A card now points at
 * its pSEO page when that page is published, at the real page that answers the
 * same intent when it is not, and is left out when neither exists.
 */
export interface HubFallback {
  href: string;
  /** Replaces the card's pSEO-flavoured blurb, which describes a page that is not there. */
  description?: string;
}

export interface ResolvedHubLink {
  href: string;
  description?: string;
  published: boolean;
}

export function resolveHubLink(
  pseoPath: string,
  published: ReadonlySet<string>,
  fallback?: HubFallback,
  description?: string,
): ResolvedHubLink | null {
  if (published.has(pseoPath)) return { href: pseoPath, description, published: true };
  if (fallback) return { href: fallback.href, description: fallback.description ?? description, published: false };
  return null;
}

// ---------------------------------------------------------------------------
// The hub's link data (explore plan WP1).
//
// Split in two on purpose. Every item in the top sections has a real
// destination (a fallback or a fixed route), so the published-slug query can
// only change an href from the fallback to the pSEO path; it can never add or
// remove a card. Items with no destination except a pSEO page live in
// HUB_MORE_GUIDES, which the page renders at the bottom and only once the
// query has succeeded. Before this split, eleven cards popped in after load or
// vanished for the session when the query failed.
// ---------------------------------------------------------------------------

/** A top-section item. `fallback` is required, which is the whole guarantee. */
export interface FixedHubItem {
  key: string;
  name: string;
  description?: string;
  /** Set when a published /things-to-do/<pseoSlug> page may upgrade the href. */
  pseoSlug?: string;
  fallback: HubFallback;
}

export interface HubTextLink {
  href: string;
  label: string;
}

/** Resolve a top-section item. Never null: the fallback is always there. */
export function resolveFixedItem(
  item: FixedHubItem,
  published: ReadonlySet<string>,
): { href: string; description?: string; published: boolean } {
  if (!item.pseoSlug) {
    return { href: item.fallback.href, description: item.fallback.description ?? item.description, published: false };
  }
  return (
    resolveHubLink(`/things-to-do/${item.pseoSlug}`, published, item.fallback, item.description) ?? {
      href: item.fallback.href,
      description: item.fallback.description ?? item.description,
      published: false,
    }
  );
}

/**
 * The Explore sections, as plain links. Deliberately outside the pSEO
 * resolution so no query state can hide one. Mirrors the Explore nav group
 * (src/components/header/navigationConfig.ts) plus the visitor guide and the
 * trip planner.
 */
export const HUB_EXPLORE_LINKS: readonly HubTextLink[] = [
  { href: '/map', label: 'Map' },
  { href: '/playgrounds', label: 'Playgrounds' },
  { href: '/attractions', label: 'Attractions' },
  { href: '/outdoors', label: 'Trails & Outdoors' },
  { href: '/music', label: 'Live Music' },
  { href: '/sports', label: 'Sports' },
  { href: '/deals', label: 'Deals' },
  { href: '/visitors-guide', label: 'Visitor guide' },
  { href: '/trip-planner', label: 'Plan my day' },
];

/** The map with the playground layer on (the ?layers= param ships with the map work). */
export const HUB_PLAYGROUND_MAP_HREF = '/map?layers=playground';

export const HUB_AREAS: readonly FixedHubItem[] = [
  { key: 'east-village', pseoSlug: 'east-village', name: 'East Village', description: 'Boutiques, brunch and bars east of the river', fallback: { href: '/neighborhoods/east-village', description: 'Events, dining and attractions' } },
  { key: 'west-des-moines', pseoSlug: 'west-des-moines', name: 'West Des Moines', description: 'Jordan Creek and local spots in the suburbs', fallback: { href: '/neighborhoods/west-des-moines', description: 'Events, dining and attractions' } },
  { key: 'ankeny', pseoSlug: 'ankeny', name: 'Ankeny', description: 'The fast-growing north metro', fallback: { href: '/neighborhoods/ankeny', description: 'Events, dining and attractions' } },
  { key: 'urbandale', pseoSlug: 'urbandale', name: 'Urbandale', description: 'Living History Farms, parks and local dining', fallback: { href: '/neighborhoods/urbandale', description: 'Events, dining and attractions' } },
  { key: 'waukee', pseoSlug: 'waukee', name: 'Waukee', description: 'Kettlestone and the Raccoon River Valley Trail', fallback: { href: '/neighborhoods/waukee', description: 'Events, dining and attractions' } },
  { key: 'altoona', pseoSlug: 'altoona', name: 'Altoona', description: 'Adventureland, Prairie Meadows and local eats', fallback: { href: '/neighborhoods/altoona', description: 'Events, dining and attractions' } },
];

export const HUB_AUDIENCES: readonly FixedHubItem[] = [
  { key: 'families', pseoSlug: 'families', name: 'Families', description: 'Kid-friendly picks with stroller and age notes', fallback: { href: '/events/kids', description: 'Upcoming kids and family events' } },
  { key: 'date-night', pseoSlug: 'date-night', name: 'Date night', description: 'Evening plans for two', fallback: { href: '/events/date-night', description: 'Date night events across the metro' } },
  { key: 'foodies', pseoSlug: 'foodies', name: 'Foodies', description: 'Dish-specific recommendations', fallback: { href: '/restaurants', description: 'The Des Moines restaurant guide' } },
  { key: 'budget', pseoSlug: 'budget', name: 'On a budget', description: 'Free events, happy hours, cheap eats', fallback: { href: '/events/free', description: 'Every free event on the calendar' } },
  // The visitor guide is canonical at /visitors-guide. /things-to-do/tourists
  // 301s there in public/_redirects, but a client-side <Link> never reaches
  // _redirects, so resolving the pSEO path rendered the duplicate in the SPA.
  { key: 'visitors', name: 'Visitors', description: 'First trip here: what to see and how to get around', fallback: { href: '/visitors-guide' } },
];

/** Today and This Weekend; the season cards are computed (src/lib/hubSeason.ts). */
export const HUB_WHEN_FIXED: readonly FixedHubItem[] = [
  { key: 'today', pseoSlug: 'today', name: 'Today', description: 'Everything on the calendar today', fallback: { href: '/events/today' } },
  { key: 'this-weekend', pseoSlug: 'this-weekend', name: 'This Weekend', description: 'Friday through Sunday, every event', fallback: { href: '/events/this-weekend' } },
];

export const HUB_ACTIVITIES: readonly FixedHubItem[] = [
  { key: 'live-music', pseoSlug: 'live-music', name: 'Live Music', fallback: { href: '/music' } },
  { key: 'festivals', pseoSlug: 'festivals', name: 'Festivals', fallback: { href: '/guides' } },
  { key: 'arts-culture', pseoSlug: 'arts-culture', name: 'Arts & Museums', fallback: { href: '/attractions' } },
  { key: 'outdoors', pseoSlug: 'outdoors', name: 'Parks & Outdoors', fallback: { href: '/outdoors' } },
  { key: 'brunch', pseoSlug: 'brunch', name: 'Brunch', fallback: { href: '/restaurants' } },
];

/**
 * pSEO pages with no other destination. Shown only when published, and only
 * at the bottom of the page after the query settles, so their arrival moves
 * nothing a reader is looking at.
 */
export const HUB_MORE_GUIDES: readonly HubTextLink[] = [
  { href: '/things-to-do/downtown', label: 'Downtown' },
  { href: '/things-to-do/valley-junction', label: 'Valley Junction' },
  { href: '/things-to-do/drake', label: 'Drake' },
  { href: '/things-to-do/beaverdale', label: 'Beaverdale' },
  { href: '/things-to-do/ingersoll', label: 'Ingersoll' },
  { href: '/things-to-do/sherman-hill', label: 'Sherman Hill' },
  { href: '/things-to-do/pet-friendly', label: 'Pet-friendly' },
  { href: '/things-to-do/groups', label: 'Groups' },
  { href: '/things-to-do/couples', label: 'Couples' },
  { href: '/things-to-do/spring', label: 'Spring' },
  { href: '/things-to-do/coffee', label: 'Coffee and cafes' },
  { href: '/things-to-do/museums', label: 'Museums' },
  { href: '/things-to-do/parks', label: 'Parks and nature' },
  { href: '/things-to-do/downtown/families', label: 'Family-friendly downtown' },
  { href: '/things-to-do/east-village/date-night', label: 'Date night in the East Village' },
  { href: '/things-to-do/downtown/budget', label: 'Free things to do downtown' },
  { href: '/things-to-do/ankeny/families', label: 'Family activities in Ankeny' },
];
