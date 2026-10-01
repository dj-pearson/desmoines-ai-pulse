import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WEEKEND_ARTICLE_SLUG_PREFIX } from "@/lib/weekendArticle";

export interface LatestWeekendArticle {
  slug: string;
  title: string;
  published_at: string | null;
}

/**
 * SEO-035: the newest published "This Weekend in Des Moines" article, so
 * /events/this-weekend can link to it (and it links back). Matched by slug
 * prefix, which scripts/publish-weekend-article.ts always writes.
 *
 * Returns null when there is none; the hub then renders no link rather than a
 * broken one.
 */
export function useLatestWeekendArticle() {
  return useQuery({
    queryKey: ["latest-weekend-article"],
    queryFn: async (): Promise<LatestWeekendArticle | null> => {
      const { data, error } = await supabase
        .from("articles")
        .select("slug, title, published_at")
        .eq("status", "published")
        .like("slug", `${WEEKEND_ARTICLE_SLUG_PREFIX}%`)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30 * 60 * 1000,
  });
}
