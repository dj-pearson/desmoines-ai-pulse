import { businessStatusLabel, isPermanentlyClosedRestaurant } from '@/lib/restaurantHours';

/**
 * Restaurant rows in a typeahead (SearchAutocomplete on /restaurants and the
 * hero box's useEntitySuggestions), WEB-FEAT-048.
 *
 * Decision: a place closed for good STAYS in suggestions, labelled
 * "Permanently closed", and ranks below every place you can still go to.
 * Browse lists hide those rows because nobody asked for them. A typeahead is
 * different: the visitor typed the name, so they are asking about that one
 * place, and its page (kept by SEO-059) says it closed and points at what is
 * open nearby. Hiding it answers "we have never heard of it", which is wrong,
 * and sends them to a text search that hides it too.
 *
 * The label replaces the cuisine. "Mexican" under a closed taqueria reads as
 * a recommendation; the status is what decides whether the click is worth it.
 * A temporary closure (Google's CLOSED_TEMPORARILY, the only place it is
 * recorded) is labelled the same way but keeps its rank: it will reopen.
 */

/**
 * Rows to ask for when the typeahead shows `shown`. Twice as many, so a closed
 * place matched by the name cannot take the slot of an open one: the closed
 * rows are moved to the end before the list is cut.
 */
export function restaurantSuggestionScanRows(shown: number): number {
  return shown * 2;
}

export interface RestaurantSuggestionRow {
  cuisine?: string | null;
  status?: string | null;
  business_status?: string | null;
}

/** The line under the name: the closure, if there is one, else the cuisine. */
export function restaurantSuggestionSubtitle(row: RestaurantSuggestionRow): string | null {
  if (isPermanentlyClosedRestaurant(row)) return 'Permanently closed';
  return businessStatusLabel(row.business_status) ?? (row.cuisine?.trim() || null);
}

/**
 * Places closed for good after every other match, otherwise in the order the
 * server returned them, cut to `shown`.
 */
export function orderRestaurantSuggestions<T extends RestaurantSuggestionRow>(
  rows: ReadonlyArray<T>,
  shown: number,
): T[] {
  const open = rows.filter((r) => !isPermanentlyClosedRestaurant(r));
  const closed = rows.filter((r) => isPermanentlyClosedRestaurant(r));
  return [...open, ...closed].slice(0, shown);
}
