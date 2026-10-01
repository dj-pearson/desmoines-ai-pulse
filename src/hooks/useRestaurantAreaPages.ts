import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  areaPageCandidates,
  areaPageLabel,
  isIndexablePseoPage,
  type PseoPageState,
} from "@/pseo/restaurantAreaPages";
import type { CoverageRestaurantRow } from "@/pseo/coverageRule";
import type { AreaLink } from "@/lib/restaurantAtAGlance";

/**
 * The published, indexable cuisine x area pSEO pages that list this
 * restaurant (SEO-034). One small read of pseo_pages by slug; no query at all
 * when the restaurant belongs on none.
 *
 * Throws on error so TanStack Query retries; the caller renders no links
 * while it has none, which for an optional "more nearby" line is the honest
 * empty state.
 */
export function useRestaurantAreaPages(row: CoverageRestaurantRow | null | undefined) {
  const candidates = row ? areaPageCandidates(row) : [];
  return useQuery({
    queryKey: ["restaurant-area-pages", candidates],
    enabled: candidates.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<AreaLink[]> => {
      const { data, error } = await supabase
        .from("pseo_pages")
        .select("slug, is_published, seo, dimensions")
        .in("slug", candidates)
        .eq("is_published", true)
        .order("slug");
      if (error) throw error;
      return ((data ?? []) as unknown as PseoPageState[])
        .filter(isIndexablePseoPage)
        .map((page) => ({ href: page.slug, label: areaPageLabel(page) }));
    },
  });
}
