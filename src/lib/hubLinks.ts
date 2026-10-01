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
import { NEIGHBORHOODS } from '@/lib/neighborhoods';
import { LANDING_LIGHT_COLUMNS, type EventLandingOptions } from '@/hooks/useEventLanding';
import { RESTAURANT_PRESETS } from '@/lib/restaurantPresets';

/** The Brunch preset's cuisines, so the hub chip opens the same set the preset does. */
const BRUNCH_CUISINES: readonly string[] =
  RESTAURANT_PRESETS.find((p) => p.id === 'brunch')?.filters.cuisine ?? ['Cafe', 'Brunch', 'Breakfast'];

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
 * (src/components/header/navigationConfig.ts) plus the hub itself, the
 * visitor guide and the trip planner. ExploreSectionLinks renders this row on
 * every Explore page with aria-current on the page it is on, which is why the
 * hub is in it (explore pass 2 WP1 item 6).
 */
export const HUB_EXPLORE_LINKS: readonly HubTextLink[] = [
  { href: '/things-to-do', label: 'Things to do' },
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

/** The hub's "Open now" block links exactly this (WP3 adds the ?open=now filter). */
export const HUB_OPEN_NOW_HREF = '/attractions?open=now';

/** Deals live at this minute, the same filter /deals applies for ?when=now. */
export const HUB_DEALS_NOW_HREF = '/deals?when=now';

/**
 * ONE URL PER INTENT (explore pass 2 WP1 item 3). A pSEO upgrade is kept only
 * where no first-party page answers the intent: the areas, festivals and
 * brunch. Today, this weekend, date night, families, budget, foodies and the
 * three activities that duplicated the Explore row used to swap to a
 * self-canonical /things-to-do/<slug> the moment that page was published, so
 * the hero chip and the card under it pointed at two different pages for the
 * same question. hubLinks.test.ts fails if an item whose fallback is a route
 * in src/App.tsx carries a pseoSlug again.
 */

/**
 * The areas, from NEIGHBORHOODS (all eight, their own descriptions), not a
 * hand-copied six with a generic "Events, dining and attractions" fallback.
 * /neighborhoods/<slug> is a dynamic route, so the published pSEO area page
 * may still upgrade the href.
 */
export const HUB_AREAS: readonly FixedHubItem[] = NEIGHBORHOODS.map((n) => ({
  key: n.slug,
  pseoSlug: n.slug,
  name: n.name,
  description: n.description,
  fallback: { href: `/neighborhoods/${n.slug}` },
}));

export const HUB_ALL_AREAS_HREF = '/neighborhoods';

export const HUB_AUDIENCES: readonly FixedHubItem[] = [
  { key: 'families', name: 'Families', description: 'Upcoming kids and family events', fallback: { href: '/events/kids' } },
  { key: 'foodies', name: 'Foodies', description: 'The Des Moines restaurant guide', fallback: { href: '/restaurants' } },
  { key: 'budget', name: 'On a budget', description: 'Every free event on the calendar', fallback: { href: '/events/free' } },
  // The visitor guide is canonical at /visitors-guide. /things-to-do/tourists
  // 301s there in public/_redirects, but a client-side <Link> never reaches
  // _redirects, so resolving the pSEO path rendered the duplicate in the SPA.
  { key: 'visitors', name: 'Visitors', description: 'First trip here: what to see and how to get around', fallback: { href: '/visitors-guide' } },
];

/** The hero's Today and This Weekend chips. First-party landings, no pSEO swap. */
export const HUB_WHEN_FIXED: readonly FixedHubItem[] = [
  { key: 'today', name: 'Today', description: 'Everything on the calendar today', fallback: { href: '/events/today' } },
  { key: 'this-weekend', name: 'This Weekend', description: 'Friday through Sunday, every event', fallback: { href: '/events/this-weekend' } },
];

/**
 * The fixed card in the "When" row. The row adds to the hero chips rather
 * than repeating them (WP1 item 8): State Fair in its window, this month, next
 * season, and Date night, which moved here from "Who's going?" so it is on the
 * page once.
 */
export const HUB_DATE_NIGHT: FixedHubItem = {
  key: 'date-night',
  name: 'Date night',
  description: 'Evening plans for two',
  fallback: { href: '/events/date-night' },
};

/**
 * Activities that go somewhere the Explore row does not (WP1 item 9). Live
 * Music, Parks & Outdoors and Arts & Museums linked /music, /outdoors and
 * /attractions, the same three links a few lines up.
 */
export const HUB_ACTIVITIES: readonly FixedHubItem[] = [
  { key: 'festivals', pseoSlug: 'festivals', name: 'Festivals', fallback: { href: '/events?category=Festival' } },
  // The Brunch preset's cuisines (src/lib/restaurantPresets.ts), comma-joined
  // the way /restaurants reads ?cuisine=.
  { key: 'brunch', pseoSlug: 'brunch', name: 'Brunch', fallback: { href: `/restaurants?cuisine=${BRUNCH_CUISINES.join(',')}` } },
];

/**
 * The weekend line's query options, identical to what /events/this-weekend
 * passes (EventsThisWeekend.tsx). Every field is part of the TanStack key, so
 * matching them is what makes the hub's number the landing's number and the
 * hub's request the landing's cache entry.
 */
export const HUB_WEEKEND_LANDING = {
  key: { landing: 'this-weekend' },
  window: 'this-weekend',
  limit: 500,
  includeOngoing: true,
  columns: LANDING_LIGHT_COLUMNS,
} as const satisfies EventLandingOptions;

/** "M free" on the weekend line opens this: the weekend preset with the free filter. */
export const HUB_WEEKEND_FREE_HREF = '/events?preset=this-weekend&price=free';

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
