/**
 * The /restaurants hub's filter state, as the URL carries it.
 *
 * Lived in src/components/RestaurantFilters.tsx, a filter panel nothing
 * rendered (WEB-FEAT-082). That panel kept an Open Now switch, a badge and a
 * filter count for a field useRestaurants never read, so the type moved here
 * and `openNow` left it: wiring an open-now control back in is now a type
 * error instead of a switch that quietly filters nothing. A real open-now
 * filter belongs at /restaurants/open-now, which evaluates hours_json.
 */
export type RestaurantSortBy =
  | "popularity"
  | "rating"
  | "newest"
  | "alphabetical"
  | "price_low"
  | "price_high";

export interface RestaurantFilterOptions {
  search: string;
  cuisine: string[];
  priceRange: string[];
  rating: number[];
  location: string[];
  sortBy: RestaurantSortBy;
  featuredOnly: boolean;
  tags: string[];
}
