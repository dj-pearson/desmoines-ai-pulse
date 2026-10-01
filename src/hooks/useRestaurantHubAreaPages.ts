import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hubAreaPages, type HubAreaPage, type HubPseoPageRow } from "@/pseo/restaurantAreaPages";

/**
 * The indexable cuisine x area pSEO pages the /restaurants hub links to
 * (SEO-038). One read of the published category-location rows; hubAreaPages
 * keeps the ones the SEO-041 coverage rule left indexable. Nothing is
 * hard-coded, so a page SEO-060/064 noindexes or pulls drops off the hub at
 * the next render.
 */
export function useRestaurantHubAreaPages() {
  return useQuery({
    queryKey: ["pseo-pages", "restaurant-hub-areas"],
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<HubAreaPage[]> => {
      const { data, error } = await supabase
        .from("pseo_pages")
        .select("slug, page_type_id, is_published, seo, dimensions")
        // content-location carries the /restaurants/<area> pages (SEO-065);
        // hubAreaPages drops the /things-to-do/<area> ones it also returns.
        .in("page_type_id", ["category-location", "content-location"])
        .eq("is_published", true)
        .order("slug");
      if (error) throw error;
      return hubAreaPages((data ?? []) as unknown as HubPseoPageRow[]);
    },
  });
}
