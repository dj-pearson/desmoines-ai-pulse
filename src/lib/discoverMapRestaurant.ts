import {
  businessStatusLabel,
  formatOpenStatusLine,
  hoursTextOf,
  isPermanentlyClosedRestaurant,
  resolveOpenStatus,
  type RestaurantOpenResult,
  type StoredOpeningHours,
} from '@/lib/restaurantHours';

/** Statuses that are never a place to go, as useOpenNowRestaurants reads them. */
const UNVISITABLE_RESTAURANT_STATUSES: ReadonlySet<string> = new Set(['closed', 'opening_soon', 'announced']);

/** What the /discover-map restaurant layer reads from a row to decide whether to draw it. */
export interface DiscoverMapRestaurantLifecycle {
  status?: string | null;
  business_status?: string | null;
  is_merged?: boolean | null;
}

/**
 * Does this restaurant get a pin at all? Not when it was merged into another
 * row, is not open yet, or has closed for good, by our status or by Google's
 * CLOSED_PERMANENTLY. A CLOSED_TEMPORARILY place keeps its pin, labelled by
 * discoverMapRestaurantStatus.
 */
export function isDiscoverMapRestaurantListed(row: DiscoverMapRestaurantLifecycle): boolean {
  if (row.is_merged === true) return false;
  if (row.status && UNVISITABLE_RESTAURANT_STATUSES.has(row.status)) return false;
  return !isPermanentlyClosedRestaurant(row);
}

/** The hours a /discover-map restaurant pin is evaluated from. Untrusted row data. */
export interface DiscoverMapRestaurantHours {
  opening?: unknown;
  hours_json?: unknown;
  business_status?: string | null;
}

export interface DiscoverMapPlaceStatus {
  result: RestaurantOpenResult;
  /** The popup and list line, or null when there is nothing honest to print. */
  label: string | null;
}

const NOT_SERVING: RestaurantOpenResult = {
  status: 'closed',
  isOpen: false,
  closingSoon: false,
  closesAt: null,
  nextOpensAt: null,
  nextOpensInMinutes: null,
};

/**
 * A restaurant pin's open state at `at` (WEB-FEAT-053). The call open-now, the
 * restaurant map pins and Brewery Trail make: hours_json first, then `opening`
 * only through hoursTextOf, because production stores a date there. Google's
 * temporary closure wins over the weekly hours it keeps publishing, so a
 * renovating place reads closed under Now and Tonight and its line says why.
 */
export function discoverMapRestaurantStatus(row: DiscoverMapRestaurantHours, at: Date): DiscoverMapPlaceStatus {
  const closure = businessStatusLabel(row.business_status);
  if (closure) return { result: NOT_SERVING, label: closure };
  const hours = (row.hours_json ?? null) as StoredOpeningHours | null;
  const result = resolveOpenStatus(hours, hoursTextOf(row.opening), at);
  return { result, label: formatOpenStatusLine(result) };
}
