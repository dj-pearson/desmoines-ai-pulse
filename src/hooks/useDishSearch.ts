import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ErrorSeverity, handleError } from "@/lib/errorHandler";

/**
 * "Who serves pho", on /restaurants/open-now (Eat & Drink pass 2 WP4.5).
 *
 * search_menu_items is in production (scripts/db-snapshot.json functions;
 * 20260317000001_create_restaurant_menus.sql:140-186). It reads current menus
 * only and returns the restaurant id, slug, item name and price text.
 *
 * The RPC does not know about merged or closed rows, so the caller passes the
 * ids it is willing to show (the open-now rows, which already exclude both)
 * and anything else is dropped here. A failed search goes to handleError and
 * comes back empty: this is an extra on the page, and its failure must not
 * read as "nobody serves pho".
 *
 * This is the one caller of search_menu_items. useRestaurantMenu's
 * useMenuSearch was a second wrapper over the same RPC that nothing rendered,
 * and it passed every row through unfiltered; it was removed (WEB-FEAT-097).
 */

export const DISH_SEARCH_MIN_LENGTH = 3;
export const DISH_SEARCH_DEBOUNCE_MS = 400;
export const DISH_SEARCH_LIMIT = 50;

export interface DishMatch {
  item_id: string;
  restaurant_id: string;
  restaurant_name: string | null;
  restaurant_slug: string | null;
  item_name: string;
  price: string | null;
}

/** The term as sent: trimmed, or null when too short to search. */
export function dishSearchTerm(raw: string | null | undefined): string | null {
  const term = (raw ?? "").trim().replace(/\s+/g, " ");
  return term.length >= DISH_SEARCH_MIN_LENGTH ? term.slice(0, 80) : null;
}

/** Only rows whose restaurant is in `allowedIds`, first match per item. */
export function keepAllowedDishes(rows: readonly DishMatch[], allowedIds: ReadonlySet<string>): DishMatch[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!allowedIds.has(row.restaurant_id) || seen.has(row.item_id)) return false;
    seen.add(row.item_id);
    return true;
  });
}

/** Where a dish hit goes: the restaurant page's Menu section (RestaurantMenuSection, id="menu"). */
export function dishMenuHref(restaurant: { slug?: string | null; id: string }): string {
  return `/restaurants/${restaurant.slug || restaurant.id}#menu`;
}

/**
 * One match per restaurant, in the RPC's order (name hits first, then
 * popularity), at most `limit`. Used when no place serving the dish is open:
 * the visitor still learns where it is and can read that menu.
 */
export function firstDishPerPlace(rows: readonly DishMatch[], limit: number): DishMatch[] {
  const seen = new Set<string>();
  const out: DishMatch[] = [];
  for (const row of rows) {
    if (seen.has(row.restaurant_id)) continue;
    seen.add(row.restaurant_id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Menu items matching `raw`, limited to `allowedIds`. `isSearching` is true
 * while the debounce or the request is in flight for a searchable term.
 */
export function useDishSearch(raw: string, allowedIds: ReadonlySet<string>) {
  const term = dishSearchTerm(useDebounced(raw, DISH_SEARCH_DEBOUNCE_MS));
  const query = useQuery({
    queryKey: ["menu-search", "open-now", term],
    enabled: term !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<DishMatch[]> => {
      if (!term) return [];
      // max_price and dietary_filter are left out: both default to NULL.
      const { data, error } = await supabase.rpc("search_menu_items", {
        search_query: term,
        result_limit: DISH_SEARCH_LIMIT,
      });
      if (error) {
        handleError(error, { component: "useDishSearch", action: "search_menu_items" }, ErrorSeverity.WARNING);
        return [];
      }
      return (data ?? []) as DishMatch[];
    },
  });
  const pendingTerm = dishSearchTerm(raw);
  return {
    term,
    matches: term && query.data ? keepAllowedDishes(query.data, allowedIds) : [],
    isSearching: pendingTerm !== null && (pendingTerm !== term || query.isFetching),
  };
}
