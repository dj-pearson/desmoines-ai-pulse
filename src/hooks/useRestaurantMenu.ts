import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/lib/errorHandler';

export interface MenuItemRow {
  id: string;
  section_name: string;
  section_sort_order: number;
  item_name: string;
  item_description: string | null;
  price: string | null;
  price_numeric: number | null;
  dietary_tags: string[];
  is_popular: boolean;
  sort_order: number;
}

export interface MenuVersion {
  id: string;
  restaurant_id: string;
  version: number;
  is_current: boolean;
  source_type: string;
  source_url: string | null;
  captured_at: string;
  notes: string | null;
  created_at: string;
}

export interface MenuSection {
  name: string;
  items: MenuItemRow[];
}

export interface RestaurantMenuData {
  menu: MenuVersion | null;
  sections: MenuSection[];
  totalItems: number;
  versions: MenuVersion[];
}

const EMPTY_MENU: RestaurantMenuData = { menu: null, sections: [], totalItems: 0, versions: [] };

/**
 * The columns the page reads. Not `*`: restaurant_menus.raw_text is the whole
 * scraped page, and the detail page never shows it.
 */
const MENU_COLUMNS =
  'id, restaurant_id, version, is_current, source_type, source_url, captured_at, notes, created_at';

type MenuRowWithItems = MenuVersion & { restaurant_menu_items: MenuItemRow[] | null };

/** Group items into sections, both in their stored sort order. Pure. */
export function groupMenuItems(items: readonly MenuItemRow[]): MenuSection[] {
  const sorted = [...items].sort(
    (a, b) =>
      (a.section_sort_order ?? 0) - (b.section_sort_order ?? 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const sections = new Map<string, MenuItemRow[]>();
  for (const raw of sorted) {
    // dietary_tags is nullable in the table; the section renders `.length`.
    const item = { ...raw, dietary_tags: raw.dietary_tags ?? [] };
    const list = sections.get(item.section_name);
    if (list) list.push(item);
    else sections.set(item.section_name, [item]);
  }
  return Array.from(sections.entries()).map(([name, sectionItems]) => ({ name, items: sectionItems }));
}

/**
 * The current menu for a restaurant, with its items in one request
 * (eat-drink pass 2, WP3.11): the items are embedded through the
 * restaurant_menu_items.menu_id foreign key, maybeSingle() makes "no menu" an
 * empty answer instead of a PGRST116 error, and version history is its own
 * query that runs only when someone opens it (useRestaurantMenuVersions).
 *
 * `includeVersions` defaults to true for the admin viewer
 * (RestaurantMenuManager), which shows history straight away. The public page
 * passes false and gets `versions: []`.
 */
export function useRestaurantMenu(
  restaurantId: string | undefined,
  { includeVersions = true }: { includeVersions?: boolean } = {},
) {
  return useQuery({
    queryKey: ['restaurant-menu', restaurantId, includeVersions ? 'with-versions' : 'current'],
    queryFn: async (): Promise<RestaurantMenuData> => {
      if (!restaurantId) return EMPTY_MENU;

      const versions: Promise<MenuVersion[]> = includeVersions ? fetchMenuVersions(restaurantId) : Promise.resolve([]);
      const { data, error } = await supabase
        .from('restaurant_menus')
        .select(`${MENU_COLUMNS}, restaurant_menu_items(*)`)
        .eq('restaurant_id', restaurantId)
        .eq('is_current', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // A menu that fails to load must not take the page down with it; the
        // section renders the link to their own menu instead.
        handleError(error, { component: 'useRestaurantMenu', action: 'fetchMenu', metadata: { restaurantId } });
        return { ...EMPTY_MENU, versions: await versions };
      }
      if (!data) return { ...EMPTY_MENU, versions: await versions };

      const { restaurant_menu_items: items, ...menu } = data as unknown as MenuRowWithItems;
      const sections = groupMenuItems(items ?? []);
      return { menu, sections, totalItems: items?.length ?? 0, versions: await versions };
    },
    enabled: !!restaurantId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

async function fetchMenuVersions(restaurantId: string): Promise<MenuVersion[]> {
  const { data, error } = await supabase
    .from('restaurant_menus')
    .select(MENU_COLUMNS)
    .eq('restaurant_id', restaurantId)
    .order('version', { ascending: false })
    .limit(10);
  if (error) {
    handleError(error, { component: 'useRestaurantMenu', action: 'fetchVersions', metadata: { restaurantId } });
    return [];
  }
  return (data ?? []) as unknown as MenuVersion[];
}

/** Past versions of a restaurant's menu, newest first. Pass enabled=false until History is opened. */
export function useRestaurantMenuVersions(restaurantId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['restaurant-menu-versions', restaurantId],
    enabled: !!restaurantId && enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: () => fetchMenuVersions(restaurantId as string),
  });
}

/**
 * Search menu items across all restaurants
 */
export function useMenuSearch(query: string, maxPrice?: number, dietaryFilter?: string[]) {
  return useQuery({
    queryKey: ['menu-search', query, maxPrice, dietaryFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_menu_items', {
        search_query: query || null,
        max_price: maxPrice || null,
        dietary_filter: dietaryFilter?.length ? dietaryFilter : null,
        result_limit: 50,
      });

      if (error) {
        handleError(error, { component: 'useMenuSearch', action: 'searchMenuItems', metadata: { query } });
        return [];
      }

      return data || [];
    },
    enabled: !!query && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
