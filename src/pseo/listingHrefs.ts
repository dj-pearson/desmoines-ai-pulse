import { createSlug } from '@/lib/slug';
import { createEventSlugWithCentralTime } from '@/lib/timezone';

/**
 * Canonical detail links for pSEO listing cards.
 *
 * The cards used to build `slug ?? id`, but the events and attractions selects
 * never fetched a slug, so every card linked by UUID. /attractions/<uuid>
 * resolves by slug or name and never by id, so those were 404s; /events/<uuid>
 * resolved only through a client-side redirect, which leaves the prerendered
 * HTML linking to a non-canonical URL. These are the same builders the main
 * list pages use.
 */
export function eventListingHref(event: {
  title: string | null;
  date?: string | null;
  event_start_utc?: string | null;
}): string {
  return `/events/${createEventSlugWithCentralTime(event.title, event)}`;
}

/** RestaurantDetails resolves by the slug column, or by id when the param is a UUID. */
export function restaurantListingHref(restaurant: { id: string; slug?: string | null }): string {
  return `/restaurants/${restaurant.slug || restaurant.id}`;
}

export function attractionListingHref(attraction: { name: string }): string {
  return `/attractions/${createSlug(attraction.name)}`;
}
