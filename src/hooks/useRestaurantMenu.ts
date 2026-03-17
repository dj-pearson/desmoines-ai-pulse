import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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

/**
 * Fetch the current menu for a restaurant, with structured sections
 */
export function useRestaurantMenu(restaurantId: string | undefined) {
  return useQuery({
    queryKey: ['restaurant-menu', restaurantId],
    queryFn: async (): Promise<RestaurantMenuData> => {
      if (!restaurantId) {
        return { menu: null, sections: [], totalItems: 0, versions: [] };
      }

      // Fetch current menu version
      const { data: menu, error: menuError } = await supabase
        .from('restaurant_menus')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_current', true)
        .single();

      if (menuError || !menu) {
        // Fetch version history even if no current menu
        const { data: versions } = await supabase
          .from('restaurant_menus')
          .select('id, restaurant_id, version, is_current, source_type, source_url, captured_at, notes, created_at')
          .eq('restaurant_id', restaurantId)
          .order('version', { ascending: false })
          .limit(10);

        return { menu: null, sections: [], totalItems: 0, versions: versions || [] };
      }

      // Fetch menu items
      const { data: items, error: itemsError } = await supabase
        .from('restaurant_menu_items')
        .select('*')
        .eq('menu_id', menu.id)
        .order('section_sort_order', { ascending: true })
        .order('sort_order', { ascending: true });

      if (itemsError) {
        console.error('Error fetching menu items:', itemsError);
        return { menu, sections: [], totalItems: 0, versions: [] };
      }

      // Group items by section
      const sectionMap = new Map<string, MenuItemRow[]>();
      const sectionOrder = new Map<string, number>();

      for (const item of items || []) {
        const key = item.section_name;
        if (!sectionMap.has(key)) {
          sectionMap.set(key, []);
          sectionOrder.set(key, item.section_sort_order);
        }
        sectionMap.get(key)!.push(item);
      }

      // Sort sections by their sort_order
      const sections: MenuSection[] = Array.from(sectionMap.entries())
        .sort((a, b) => (sectionOrder.get(a[0]) || 0) - (sectionOrder.get(b[0]) || 0))
        .map(([name, sectionItems]) => ({ name, items: sectionItems }));

      // Fetch version history
      const { data: versions } = await supabase
        .from('restaurant_menus')
        .select('id, restaurant_id, version, is_current, source_type, source_url, captured_at, notes, created_at')
        .eq('restaurant_id', restaurantId)
        .order('version', { ascending: false })
        .limit(10);

      return {
        menu,
        sections,
        totalItems: items?.length || 0,
        versions: versions || [],
      };
    },
    enabled: !!restaurantId,
    staleTime: 10 * 60 * 1000, // 10 minutes
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
        console.error('Menu search error:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!query && query.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
