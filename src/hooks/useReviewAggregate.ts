import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { handleError } from "@/lib/errorHandler";
import { isPrerender } from "@/lib/isPrerender";

type ContentType = Database["public"]["Enums"]["content_type"];

export interface ReviewAggregate {
  average_rating: number;
  total_ratings: number;
}

/**
 * The first-party review average and count for one piece of content, from
 * content_rating_aggregates. This is the only rating a detail-page hero may
 * show: columns like playgrounds.rating hold a number a model read off a
 * crawled page with no record of whose rating it was (WEB-SEO-055/056).
 *
 * Only these two columns: RatingSystem fetches the reviews themselves, and the
 * hero needs nothing else. Null when nobody has reviewed it, or when the read
 * fails, in which case the hero shows no rating rather than a wrong one. Not
 * fetched during prerender, so static HTML never freezes a review count.
 */
export function useReviewAggregate(
  contentType: ContentType,
  contentId: string | undefined,
  component: string,
) {
  return useQuery({
    queryKey: ["content-rating-aggregate", contentType, contentId],
    queryFn: async (): Promise<ReviewAggregate | null> => {
      const { data, error } = await supabase
        .from("content_rating_aggregates")
        .select("average_rating, total_ratings")
        .eq("content_type", contentType)
        .eq("content_id", contentId ?? "")
        .maybeSingle();
      if (error) {
        handleError(error, { component, action: "loadReviewAggregate" });
        return null;
      }
      return data && data.total_ratings > 0 ? data : null;
    },
    enabled: Boolean(contentId) && !isPrerender(),
    staleTime: 5 * 60 * 1000,
  });
}
